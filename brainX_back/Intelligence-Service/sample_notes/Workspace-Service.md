**작업 순서**

1. **Workspace-Service 계약/구조 확정**
    
    먼저 현재 만든 Workspace-Service의 MVC 구조와 SSOT 계약을 다시 맞춥니다.  
    노트, 폴더, 링크, 그래프, 공유, 내부 API가 어떤 책임을 갖는지 확정해야 이후 프론트, Kafka, Redis, Graph DB가 흔들리지 않습니다.
    
2. **Workspace-Service 기본 CRUD 완성 및 테스트**
    
    노트 생성/조회/수정/삭제, 폴더, 태그, 링크, 그래프 조회 API를 먼저 안정화합니다.  
    프론트나 Kafka를 붙이기 전에 백엔드 단독으로 계약대로 응답하는지 확인해야 디버깅 범위가 작아집니다.
    
3. **프론트와 백 API 맞추기**
    
    그 다음 `brainx-next`의 노트/홈/그래프 화면 API 클라이언트를 Workspace-Service에 연결합니다.  
    이 단계에서는 mock/localStorage 흐름을 실제 API 호출로 바꾸고, 응답 필드명과 에러 처리 방식을 맞추면 됩니다.
    
4. **Redis 자동저장 인메모리 설계**
    
    프론트와 백 연결이 된 뒤 자동저장을 붙이는 게 좋습니다.  
    Redis는 “작성 중 임시 상태”를 저장하고, 최종 저장은 Workspace DB 원장에 반영하는 구조가 안전합니다.  
    예: `autosave:{userId}:{noteId}` 키에 markdown, baseVersion, savedAt 저장.
    
5. **자동저장 API 추가**
    
    Redis 설계 후에 자동저장용 API를 추가합니다.  
    추천 흐름은:
    
    - `PUT /api/v1/notes/{noteId}/draft` → Redis에 임시 저장
    - `GET /api/v1/notes/{noteId}/draft` → 임시 저장 복구
    - `POST /api/v1/notes/{noteId}/draft/commit` → DB 정식 저장
    
    이렇게 하면 자동저장과 정식 저장의 책임이 섞이지 않습니다.
    
6. **Kafka로 User-Service ↔ Workspace-Service 통신**
    
    Redis 자동저장보다 Kafka를 먼저 해도 되지만, 저는 이 순서를 추천합니다.  
    Workspace 기본 기능과 프론트 연결이 된 다음 Kafka를 붙이면 이벤트가 실제 비즈니스 흐름 위에서 검증됩니다.
    
    주요 이벤트는:
    
    - User-Service → Workspace-Service: `UserRegistered`, `UserDeleted`, `UserProfileUpdated`
    - Workspace-Service → User/Admin/AI: `NoteCreated`, `NoteContentSaved`, `NoteDeleted`, `NoteViewed`
    
    User-Service가 유저 생성 이벤트를 발행하면 Workspace-Service가 기본 워크스페이스나 루트 폴더를 준비하는 식으로 연결하면 좋습니다.
    
7. **Kafka Outbox/Idempotency 적용**
    
    단순 Kafka 발행부터 바로 운영형으로 가기보다, outbox 테이블과 중복 처리 키를 붙이는 순서가 좋습니다.  
    이벤트 기반 통신은 “한 번만 처리”보다 “여러 번 와도 결과가 같음”이 중요합니다.
    
8. **Graph DB 모델링**
    
    그래프 DB는 마지막에 틀을 잡는 게 좋습니다.  
    이유는 그래프의 노드/엣지 기준이 Workspace 원장에서 나와야 하기 때문입니다.
    
    기본 모델은:
    
    - Node: `User`, `Note`, `Folder`, `Tag`
    - Edge: `OWNS`, `CONTAINS`, `TAGGED_WITH`, `LINKS_TO`, `VIEWED`
    
    처음부터 모든 그래프 기능을 Graph DB에 넣기보다, Workspace DB를 원장으로 두고 Graph DB는 projection/read model로 두는 게 맞습니다.
    
9. **Workspace 이벤트 기반 Graph Projection**
    
    Graph DB는 Workspace-Service가 직접 동기 저장하지 말고, Kafka 이벤트를 받아 projection worker가 갱신하는 구조가 좋습니다.
    
    예:
    
    - `NoteCreated` → Note 노드 생성
    - `NoteLinkCreated` → `LINKS_TO` 엣지 생성
    - `NoteTagsChanged` → Tag 노드/엣지 갱신
    - `NoteDeleted` → 노드 비활성화 또는 삭제
10. **통합 테스트 및 시나리오 검증**
    

마지막에 전체 흐름을 검증합니다.

예시 시나리오:

1. 회원가입
2. User-Service가 `UserRegistered` 발행
3. Workspace-Service가 기본 워크스페이스 생성
4. 프론트에서 노트 작성
5. Redis 자동저장
6. 정식 저장
7. Kafka로 `NoteContentSaved` 발행
8. Graph DB projection 갱신
9. 프론트 그래프 화면에서 관계 확인

**추천 우선순위 요약**

가장 올바른 순서는:

```
Workspace-Service 구조/계약 안정화
→ Workspace 기본 API 완성
→ 프론트 API 연결
→ Redis 자동저장
→ Kafka user-workspace 이벤트 연결
→ Kafka outbox/idempotency 보강
→ Graph DB 모델링
→ Graph projection worker
→ 통합 테스트
```

핵심 이유는 단순합니다.  
Workspace-Service가 노트 원장이기 때문에, 원장을 먼저 안정화해야 프론트, Redis, Kafka, Graph DB가 모두 같은 기준을 바라볼 수 있습니다.


---
# 이후 할 일
- [ ] User-Service 개인정보 동의 약관 (노션, 옵시디언 등 참고)
- [ ] User-Service mockMVC 만들기
- [ ] Admin-Service 프로젝트 만들기 및 구현
- [ ] Admin페이지 구현 (Front)
- [ ] Admin-Service mockMVC 만들기
- [ ] User <-> Admin kafka 통신
- [ ] User-Service 노트 사용 통계 구현
- [ ] 
