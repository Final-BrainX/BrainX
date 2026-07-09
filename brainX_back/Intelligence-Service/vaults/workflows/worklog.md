# Worklog Workflow

## 언제 기록하는가

code, 설정, 계약, 문서, 테스트, build artifact를 실질적으로 바꾼 작업을 마칠 때 기록합니다. 단순 질의 응답이나 변경 없는 조사에는 남기지 않습니다.

## 기록 위치

1. 작업에 연결된 worklog 채널이 있으면 완료 요약을 먼저 게시합니다.
2. 채널이 없으면 `vaults/worklogs/YYYY-MM.md`에 현재 로컬 시간 기준으로 파일 끝에 append합니다.
3. final response에는 변경 요약, 검증 결과, worklog 위치를 함께 남깁니다.

과거 항목을 시간순으로 재정렬하거나 현재 작업과 무관한 기록을 보정하지 않습니다. 새 항목만 append해 기록 흐름을 유지합니다.

## 파일 기록 형식

PowerShell에서는 `Get-Date -Format "yyyy-MM-dd HH:mm"`으로 분 단위 로컬 시간을 확인합니다.

```md
## YYYY-MM-DD HH:mm - <짧은 제목>

완료: <무엇을 왜 바꿨는지>

아티팩트: `<핵심 파일>`, <PR 또는 문서 링크>

검증: <실행한 command와 결과, 또는 문서 전용 변경이라 생략한 이유>
```

- `아티팩트`에는 현재 저장소 밖의 결과물이 있으면 경로 또는 링크만 남기고 그 파일을 이 저장소로 복사하지 않습니다.
- API 또는 이벤트 계약에 영향이 있으면 완료/검증에 SSOT 변경 여부와 extraction 실행 여부를 명시합니다.
- secret, token, cookie, 개인 정보, 실제 credential 값은 worklog와 final response에 기록하지 않습니다.

## Decision과 Durable Improvement

- 단발성 작업 상태와 검증 결과는 worklog에 남깁니다.
- 같은 agent-process correction이 반복되면 `vaults/durable/INDEX.md`의 규칙에 따라 durable improvement로 승격합니다.
- 실제 장기 설계 결정이 필요한 경우에만 `vaults/decisions/YYYY-MM-DD-<slug>.md`를 만들고, context/decision/consequences/links를 기록한 뒤 `vaults/INDEX.md`에 라우팅합니다. 결정이 없으면 빈 디렉터리나 빈 decision note를 만들지 않습니다.
