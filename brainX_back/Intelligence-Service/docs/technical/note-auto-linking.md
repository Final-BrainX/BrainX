# Note Auto Linking

이 문서는 유사한 노트를 자동 연결하기 위한 v1 내부 기능을 설명한다. v1은 공개 REST API를 만들거나 노트 본문을 직접 수정하지 않고, 내부 use case와 dev CLI로 두 전략의 품질, 비용, 실행 시간을 비교한다.

## 범위

- 분석 범위는 `userId + documentGroupId` 안의 searchable note다.
- 기본 cap은 50개 note다. cap을 넘으면 provider 호출 없이 `LIMIT_EXCEEDED` 결과를 반환한다.
- 결과는 source note의 anchor 위치와 target note를 가진 제안이다. 실제 링크 삽입은 frontend 또는 Workspace 저장 흐름에서 처리한다.
- public `/api/v1/ai/link-suggestions`는 `connection` feature에서 이 내부 use case의 `VECTOR_LLM` 전략을 재사용한다. public API의 자세한 계약과 제한은 `docs/technical/connection-api.md`를 기준으로 확인한다.

## Markdown Read Model

자동 연결은 raw markdown 안에서 anchor 위치를 찾아야 하므로 `intelligence_note_projections.markdown`에 snapshot markdown을 저장한다.

- snapshot ingest 성공 시 markdown을 저장한다.
- snapshot miss provisional projection은 markdown을 저장하지 않는다.
- trashed/deleted/removed projection은 markdown을 clear한다.
- sample RAG ingest도 sample markdown을 projection에 저장한다.

운영 DB의 `intelligence_note_projections.markdown` CLOB/TEXT 컬럼은 Flyway migration으로 적용한다. local/test H2는 `create-drop`으로 자동 생성한다.

## 전략

`VECTOR_LLM`은 기존 Qdrant chunk index를 1차 필터로 사용한다.

- source note raw markdown을 offset 보존 window로 나눠 query한다.
- same note hit와 `score < 0.35` hit는 제외한다.
- target note별 best chunk만 LLM refine prompt에 넣는다.
- v1 기본 운영 후보 전략이다. 단, LLM refine 후 `confidence`, strong vector score, anchor 품질 필터를 다시 통과해야 한다.
- LLM은 strict JSON으로 `anchorText`, `targetNoteId`, `reason`, `confidence`를 반환한다.

`LLM_ONLY`는 vector 검색 없이 source note와 group note card 목록만 LLM에 전달한다.

- note card는 `noteId`, `title`, `tags`, headings, excerpt로 구성한다.
- note 수가 많을수록 각 source call의 input token이 커진다.
- 비용 비교를 위해 `VECTOR_LLM`과 같은 anchor 검증을 거친다.
- v1에서는 offline 비교와 fallback 진단 용도이며 기본 운영 전략으로 보지 않는다.

두 전략 모두 LLM이 반환한 `anchorText`를 source raw markdown에서 다시 찾는다. 이미 markdown link, wiki link, inline code, fenced code block 안에 있는 anchor는 제외한다.

## Public Connection API와의 관계

`autolink`는 내부 분석/CLI/품질 평가 기능이고, `connection`은 public REST API surface다.

- `POST /api/v1/ai/link-suggestions`는 `NoteAutoLinkUseCase`를 호출하되 `VECTOR_LLM` 결과 중 요청 source note의 suggestion만 반환한다.
- public response는 현재 `targetNoteId`, `targetTitle`, `score`, `reason` 중심이며 raw markdown anchor offset은 노출하지 않는다.
- public request에는 아직 `documentGroupId`가 없어서 `ConnectionService`가 `default` group을 사용한다.
- anchor offset을 프론트 적용에 직접 사용하려면 OpenAPI 계약 확장과 response schema 변경이 필요하다.

## 품질 필터와 Ranking

LLM 응답은 anchor 위치 검증 후에도 바로 노출하지 않고 품질 후처리를 거친다.

- `confidence < 0.75` suggestion은 제외한다.
- `VECTOR_LLM`은 LLM이 고른 target의 best vector score가 `0.60` 미만이면 제외한다.
- `Kafka`, `이벤트`, `MSA`, `랜딩`, `목록`처럼 너무 일반적인 단일 anchor는 제외한다.
- 한글 단일 anchor는 기본 4글자 미만이면 제외한다. 긴 heading 또는 phrase anchor를 우선한다.
- 같은 `sourceNoteId + targetNoteId`는 기본 1개 best suggestion만 유지한다.
- 한 target note로 추천이 과도하게 몰리면 기본 5개까지만 유지한다.
- source title과 target title이 같거나 괄호 부제/구두점/공백만 다른 near-duplicate title이면 제외한다.
- broad architecture/API/contract 문서와 source anchor 문맥의 lexical overlap이 너무 낮으면 weak relation으로 제외한다.
- 애매한 broad relation 후보는 `relation-verifier-enabled=true`일 때 LLM verifier가 `relationType`과 confidence를 판정한다.

CLI JSON의 `filteredInvalidAnchorCount`는 raw markdown에서 찾을 수 없거나 제외 영역에 걸린 anchor 수다. `filteredQualityCount`는 confidence, vector score, 일반 anchor, source-target 중복, target flooding 후처리로 제외된 수다. `filteredDuplicateTitleCount`는 같은 제목/near-duplicate title로 제외된 수이고, `filteredWeakRelationCount`는 broad topic/vendor-name/same-domain 수준의 약한 관계로 제외된 수다.

## Anchor 좌표

좌표는 raw markdown 문자열 기준이다.

- `startOffset`, `endOffset`: Java/JS UTF-16 code unit offset, `endOffset` exclusive
- `startLine`, `startColumn`, `endLine`, `endColumn`: 1-based
- `matchedText`: 실제 raw markdown에서 매칭된 문자열

검색용 Qdrant chunk는 정규화된 `doc_content`를 저장하므로 원문 offset을 보존하지 않는다. 따라서 자동 연결의 anchor 계산은 Qdrant payload가 아니라 projection markdown read model에서 수행한다.

## Usage와 비용

CLI 실행 중 `NoteAutoLinkTokenUsageRecorder`가 strategy별 usage record를 캡처한다.

- `note-auto-link-vector-refine-chat`: `VECTOR_LLM`의 LLM refine call
- `note-auto-link-llm-only-chat`: `LLM_ONLY`의 LLM call
- `note-auto-link-relation-verifier-chat`: 애매한 후보의 relation type을 확인하는 LLM verifier call
- `note-search-query-embedding`: `VECTOR_LLM`의 Qdrant query embedding call

catalog 단가가 있으면 `AiTokenUsageCostEstimator`가 input/cached input/output cost를 계산한다. provider usage가 없으면 cost는 `unknown`으로 남긴다.

## CLI

실행 예:

```powershell
.\gradlew.bat --no-daemon bootRun --args="--spring.profiles.active=local --brainx.dev.note-auto-link.enabled=true --brainx.dev.note-auto-link.strategy=compare --brainx.dev.note-auto-link.document-group-id=default"
```

주요 설정:

- `brainx.note-auto-link.model`
- `brainx.note-auto-link.max-notes`
- `brainx.note-auto-link.vector-top-k`
- `brainx.note-auto-link.min-vector-score`
- `brainx.note-auto-link.min-confidence`
- `brainx.note-auto-link.vector-strong-score`
- `brainx.note-auto-link.min-anchor-korean-chars`
- `brainx.note-auto-link.max-suggestions-per-source-target`
- `brainx.note-auto-link.max-suggestions-per-target-note`
- `brainx.note-auto-link.relation-verifier-enabled`
- `brainx.note-auto-link.min-relation-confidence`
- `brainx.note-auto-link.max-source-windows-per-note`
- `brainx.note-auto-link.max-suggestions-per-note`
- `brainx.dev.note-auto-link.user-id`
- `brainx.dev.note-auto-link.document-group-id`
- `brainx.dev.note-auto-link.strategy`: `COMPARE`, `VECTOR_LLM`, `LLM_ONLY`

출력 JSON에는 strategy별 suggestions, token/cost summary, `elapsedMs`, analyzed note count, filtered count, compare overlap count가 포함된다.
