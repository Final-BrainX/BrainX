# Intelligence Service 문서

이 디렉터리는 사람이 읽는 서비스 지식과 구현 배경을 보관합니다. agent의 항상 적용 규칙과 작업 handoff는 `AGENTS.md`, `vaults/INDEX.md`에서 관리하므로 이 문서에 중복하지 않습니다.

## 문서 찾기

- [도메인 문서](domain/README.md): 도메인 흐름, 데이터 소유권, 소비 이벤트의 도메인 의미, `StyleProfile` UX처럼 제품·설계 맥락을 확인할 때 읽습니다.
- [기술 문서](technical/README.md): API 연동, 이벤트 처리, AI 기능, search/index, 운영 DB, 품질 평가와 개발용 CLI처럼 구현·운영 맥락을 확인할 때 읽습니다.
- [계약 슬라이스 안내](../src/main/resources/contracts/README.md): 이 서비스가 제공·소비하는 OpenAPI/AsyncAPI 사본의 범위와 재생성 방법을 확인할 때 읽습니다.

## 작성 경계

- 사람이 재사용할 설계 사실, trade-off, 조사 결과, 운영·품질 지식은 `domain/` 또는 `technical/`의 적절한 index에 연결합니다.
- 진행 상태, artifact, 검증 결과는 `vaults/worklogs/`에 기록합니다.
- 반복되는 agent-process 개선은 `vaults/durable/`에 기록합니다.
