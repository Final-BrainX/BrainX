# Workspace Policies

> BrainX Workspace 정책 정의 문서
>
> Version: 1.0
>
> Status: Draft (1차 정책 확정)

---

# 1. 목적

본 문서는 Workspace 기능 구현 시 반드시 지켜야 하는 정책을 정의합니다.

Architecture 문서가 시스템 구조를 설명한다면,

본 문서는

- 어떤 동작을 허용하는지
- 어떤 동작을 금지하는지
- 예외 상황은 어떻게 처리하는지

를 정의합니다.

---

# 2. Workspace 생성 정책

## 지원 여부

✅ 지원 (1차)

회원은 여러 Workspace를 생성할 수 있습니다.

Guest는 Workspace를 생성할 수 없습니다.

---

## 생성 위치

Workspace는

- Home
- Notes

두 화면 모두에서 생성할 수 있습니다.

---

## 생성 결과

생성이 완료되면

1. Workspace 목록을 다시 조회합니다.
2. 생성한 Workspace를 현재 Workspace로 선택합니다.
3. 현재 화면을 새 Workspace 기준으로 다시 표시합니다.

예시)

Home

Workspace 생성

↓

새 Workspace Home

Notes

Workspace 생성

↓

새 Workspace Welcome Board

---

## 기본 이름

기본 이름은

```
새 Workspace
```

또는 UX에서 정의한 기본 이름을 사용합니다.

---

## 이름 변경

생성 직후 이름 변경이 가능합니다.

---

# 3. Workspace 이름 정책

## 지원 여부

✅ 지원 (1차)

Workspace 이름은 변경할 수 있습니다.

---

## 변경 가능한 항목

변경 가능한 것은

- 이름(name)

뿐입니다.

Workspace ID(documentGroupId)는 변경되지 않습니다.

---

## 이름 규칙

Workspace 이름은

- 빈 문자열 불가
- 공백만 입력 불가
- 최대 길이는 서비스 정책을 따릅니다.

---

## 중복 정책

동일 사용자 내에서는

동일한 Workspace 이름을 허용하지 않습니다.

예시

```
Project A
Project A
```

불가

---

# 4. Workspace 삭제 정책

## 지원 여부

❌ 미지원 (2차)

Workspace 삭제 기능은 1차에서 구현하지 않습니다.

삭제 API도 제공하지 않습니다.

삭제 정책은 추후 별도 문서에서 정의합니다.

---

# 5. Default Workspace 정책

모든 회원은 반드시 하나의 Default Workspace를 가집니다.

회원가입 시 자동 생성됩니다.

---

## Default Workspace 특징

- 항상 하나 존재
- 자동 생성
- 삭제 불가
- documentGroupId 변경 불가

---

# 6. Guest 정책

Guest는 Workspace를 가지지 않습니다.

Guest는

- Workspace 생성
- Workspace 변경
- Workspace 저장

을 수행할 수 없습니다.

Guest는 Redis Draft만 사용합니다.

---

## 로그인/회원가입

Guest가 로그인 또는 회원가입하면

Redis Draft는

회원의 Default Workspace로 Claim됩니다.

---

# 7. Workspace 선택 정책

현재 선택된 Workspace는

프론트 Context에서 관리합니다.

---

## 서버 저장

현재 선택된 Workspace를

서버에 저장하지 않습니다.

Selection API는 제공하지 않습니다.

---

## API 호출

모든 API는

현재 Workspace(documentGroupId)를 기준으로 조회합니다.

---

# 8. Note 정책

## 생성

모든 Note는

반드시 하나의 Workspace에 속해야 합니다.

documentGroupId는 필수입니다.

---

## 이동

Workspace 간 이동 가능합니다.

---

### 이동 규칙

Workspace를 변경하면

folderId는 null로 변경됩니다.

즉,

항상 대상 Workspace Root에 배치됩니다.

---

## 중복 검사

같은

- User
- Workspace
- Folder

안에서는

동일한 Note 이름을 그대로 저장하지 않습니다.

단, 즉시 생성되는 빈 노트 등 UX상 흔한 충돌을 막지 않기 위해

에러로 거부하는 대신 "이름", "이름 2", "이름 3"... 형태로 자동으로 구분합니다.

---

# 9. Folder 정책

Folder 역시

Workspace에 반드시 소속됩니다.

---

## 이동

Workspace 간 이동은

1차에서 지원하지 않습니다.

---

## 중복 검사

같은

- User
- Workspace
- Parent Folder

안에서는

동일한 Folder 이름을 그대로 저장하지 않습니다.

Note와 동일하게 에러로 거부하는 대신

"이름", "이름 2", "이름 3"... 형태로 자동으로 구분합니다.

---

# 10. AI 정책

AI는

현재 Workspace 기준으로만 동작합니다.

---

## documentGroupId

기존

"default"

문자열은 사용하지 않습니다.

항상

현재 Workspace의 documentGroupId를 전달합니다.

---

## AI 범위

Workspace A의 AI는

Workspace B의 Note를 참조하지 않습니다.

---

# 11. Graph 정책

Graph 역시

Workspace 단위로 분리됩니다.

Workspace A에서는

Workspace B의 Node를 표시하지 않습니다.

---

# 12. Search 정책

검색은

현재 Workspace 내부에서만 수행합니다.

다른 Workspace의 Note는 검색하지 않습니다.

---

# 13. WikiLink 정책

WikiLink는

같은 Workspace 안에서만 연결됩니다.

다른 Workspace의 Note를 자동 연결하지 않습니다.

---

# 14. 데이터 무결성

Workspace는

최상위 소속입니다.

따라서

모든 Note와 Folder는

반드시 하나의 Workspace에만 속합니다.

Workspace를 넘는 참조는 허용하지 않습니다.

---

# 15. 1차 구현 범위

## 포함

- Workspace 생성
- Workspace 목록 조회
- Workspace 이름 변경
- Workspace 전환
- Note Workspace 이동
- Default Workspace 자동 생성
- Guest Draft Claim
- AI documentGroup 적용

---

## 제외

- Workspace 삭제
- Folder Workspace 이동
- Workspace 공유
- Workspace 권한
- Workspace별 split/tabs 복원
- 로그인 직후 Workspace 선택
- 기본 Workspace 변경
- Workspace 색상/아이콘
- Workspace 즐겨찾기

---

# 16. 변경 원칙

Workspace는 BrainX의 최상위 도메인입니다.

향후 기능이 추가되더라도

본 정책을 우선 기준으로 설계합니다.
