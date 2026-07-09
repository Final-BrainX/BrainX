# LLM 품질 CLI 평가 보고서 - 2026-06-26

## 요약

2026-06-26 기준 dev-only 품질 CLI로 RAG retrieval/chat, chat router, external search, inline assist, connection 기능을 실제 provider 호출 조건에서 평가했다. 최종 재실행 기준 모든 평가 시나리오는 통과했다.

평가는 public REST/OpenAPI 계약을 변경하지 않는 내부 검증 흐름이다. 결과 원본은 repo에 추적하지 않는 `build/*-captures/` 아래에 남기며, 이 문서는 결과 해석과 다음 개선점을 공유하기 위한 요약 보고서다.

> 현재 적용 시 주의: 이 보고서는 2026-06-26 당시의 실행 기록이다. 현재 public `link-suggestions` 요청은 `documentGroupId`를 필수로 받아 범위를 격리하므로, 아래 Connection 절의 당시 `default` group 언급을 현행 구현 규칙으로 사용하지 않는다.

## 평가 환경

- Profile: `local`
- Corpus: `sample_notes` 21개 문서
- Vector DB: Docker compose Qdrant, gRPC `localhost:6334`
- Provider: 실제 OpenAI chat/web search, Voyage embedding 호출
- 주요 산출물: `build/rag-captures/`, `build/chat-router-captures/`, `build/external-search-captures/`, `build/inline-assist-captures/`, `build/connection-captures/`
- 평가 성격: dev-only quality gate이며 Gradle `check`나 CI에 실제 provider 호출을 묶지 않는다.

## 결과 요약

| 영역 | 최종 runId | 시나리오 | 결과 | 핵심 지표 | 산출물 |
| --- | --- | ---: | --- | --- | --- |
| RAG retrieval | `20260626-rag-retrieval-quality-qdrant` | 12 | 통과 | context count `[5,8,7,8,8,8,4,7,8,8,8,0]` | `build/rag-captures/20260626-rag-retrieval-quality-qdrant/` |
| RAG chat | `20260626-rag-chat-quality` | 12 | 통과 | retrieval과 같은 context count, answer generation 완료 | `build/rag-captures/20260626-rag-chat-quality/` |
| Chat router | `20260626-chat-router-quality` | 5 | 통과 | `NOTE_QA`, `WORKSPACE_SEARCH`, `COMPOSE`, `NOTE_ACTION`, `OUT_OF_SCOPE` 모두 기대 route | `build/chat-router-captures/20260626-chat-router-quality/` |
| External search | `20260626-external-search-quality-timeout60` | 2 | 통과 | 각 query source count 8 | `build/external-search-captures/20260626-external-search-quality-timeout60/` |
| Inline assist | `20260626-inline-assist-quality` | 4 | 통과 | `SUMMARIZE`, `REWRITE`, `CONTINUE`, `TRANSLATE` 모두 nonblank/fence 없음 | `build/inline-assist-captures/20260626-inline-assist-quality/` |
| Connection | `20260626-connection-quality` | 2 | 통과 | link suggestion 1개, bridge recommendation 3개 | `build/connection-captures/20260626-connection-quality/` |

## 영역별 상세 보고서

- `llm-quality-evaluations/rag-quality-evaluation-2026-06-26.md`: RAG 질의별 검색 근거, 답변 의미, 잡음 context를 정리한다.
- `llm-quality-evaluations/chat-router-quality-evaluation-2026-06-26.md`: route별 분류 이유, citation, route-specific prompt 동작을 정리한다.
- `llm-quality-evaluations/external-search-quality-evaluation-2026-06-26.md`: OpenAI `web_search` request 구조, source domain, timeout 관찰을 정리한다.
- `llm-quality-evaluations/inline-assist-quality-evaluation-2026-06-26.md`: action별 입력/출력과 inline prompt scope를 정리한다.
- `llm-quality-evaluations/connection-quality-evaluation-2026-06-26.md`: 실제 추천된 문서 연결, bridge 후보, autolink/bridge prompt 구조를 정리한다.

## 세부 관찰

### RAG retrieval/chat

핵심 5개 질의는 `completed`로 통과했고, 나머지 7개는 아직 불안정하거나 관찰 목적의 `capture_only`로 유지했다. `Kubernetes HPA 설정 파일은 어디에 있어?` 질의는 corpus 외부 질문이므로 context count 0이 정상적인 관찰값이다.

현재 기준으로 내부 노트 검색은 대부분의 BrainX 도메인 질문에서 충분한 context를 회수했다. 다만 `capture_only` 질의는 아직 pass/fail 기준이 약하므로, 실제 사용자 노출 품질 판단에는 query별 expected title/filename 기준을 더 채워야 한다.

### Chat router

5개 route 모두 기대 route로 분류됐다. `NOTE_QA`와 `WORKSPACE_SEARCH`는 citation을 포함했고, `COMPOSE`와 `NOTE_ACTION`은 citation 없이 nonblank 응답을 생성했다. `OUT_OF_SCOPE`는 citation 없이 고정 guard 문구를 반환했다.

특히 `route` event가 첫 이벤트로 나오고 이후 `delta`, `done` 순서가 유지되어 SSE 소비 측면의 기본 계약도 확인됐다.

### External search

OpenAI Responses `web_search`는 최종 60초 timeout 조건에서 2개 시나리오 모두 통과했고 각 8개 source를 반환했다. 첫 실행은 20초 timeout에서 `Read timed out`으로 실패했으므로, 외부 검색 품질 평가와 운영 호출은 일반 chat보다 긴 timeout과 재시도 정책을 별도로 봐야 한다.

도메인 제한이 있는 OpenAI 문서 질의는 OpenAI docs source를 회수했고, 일반 RAG 방식 질의는 IBM, Microsoft Learn 등 외부 reference를 회수했다. source title이 비어 있는 항목이 일부 있어 provider response 정규화 품질은 후속 개선 대상이다.

### Inline assist

작성 보조 4개 action이 모두 구조적 검증을 통과했다. 출력은 nonblank이고 markdown fence나 설명성 prefix 없이 바로 에디터에 넣을 수 있는 형태였다.

이번 검증은 문맥 기반 생성이 "형태상 사용 가능하다"는 수준이다. 맞춤법, 문체 일관성, 선택 영역 보존률 같은 세밀한 품질 기준은 별도 rubric이 필요하다.

### Connection

connection quality CLI는 sample ingest 후 `link-suggestions`, `bridge-concepts`를 실행했고 두 시나리오 모두 통과했다. link suggestion은 1개, bridge recommendation은 3개가 생성됐다.

이는 public controller가 아니라 application usecase를 직접 호출한 당시 품질 확인이다. 당시 시나리오는 `default` document group을 사용했지만, 현재 public contract는 필수 `documentGroupId`로 범위를 격리한다. 이후 quality scenario는 필요한 group별 조건을 명시해 확장한다.

## 실패와 조치

최초 RAG retrieval 평가는 Qdrant gRPC `localhost:6334` 연결 거부로 ingest 단계에서 실패했다. Docker Desktop을 시작하고 `docker compose up -d qdrant`로 Qdrant를 올린 뒤 같은 평가를 재실행해 통과했다.

최초 external search 평가는 20초 timeout에서 OpenAI web search 응답을 받지 못해 실패했다. capture script의 external timeout 기본값을 60초로 올리고 재실행해 통과했다.

두 실패 모두 품질 모델 자체의 실패라기보다 로컬 인프라/외부 provider latency 조건 문제다. 따라서 보고서에는 최종 pass와 별도로 재현 조건으로 남긴다.

## 품질 판단

현재 기본 품질 게이트로 가장 안정적인 영역은 chat router와 RAG retrieval이다. route 분류, citation 요구, out-of-scope guard는 시나리오 기준으로 기대 동작과 일치한다.

External search는 결과 품질보다 latency 편차가 더 큰 리스크다. 운영 연결 전에는 timeout, retry, 사용자 표시용 pending state를 따로 설계해야 한다.

Inline assist와 connection은 구조적 품질 검증은 통과했지만, 아직 사람이 보는 의미 품질까지 충분히 자동화했다고 보기는 어렵다. 특히 connection은 추천 수와 중복 여부뿐 아니라 "사용자가 실제로 링크로 만들 가치가 있는가"를 평가하는 샘플 rubric이 더 필요하다.

## 후속 작업

- RAG `capture_only` 질의에 expected title/filename과 forbidden context 기준을 추가한다.
- RAG chat 답변에 answer factuality rubric과 citation-title 필수 조건을 더한다.
- External search adapter에 timeout/retry/backoff 정책을 운영 설정으로 분리한다.
- Inline assist는 action별 금지/필수 표현뿐 아니라 선택 영역 보존률, 문체 목표, 길이 변화율을 검증한다.
- Connection은 link suggestion의 semantic usefulness를 사람이 재검토한 golden sample로 고정하고, document group contract 확장 시 group별 평가를 추가한다.
- 각 평가 summary에서 token usage와 estimated cost를 공통 집계하는 report aggregator를 추가한다.
