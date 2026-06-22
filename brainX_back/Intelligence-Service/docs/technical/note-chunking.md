# Note Chunking

이 문서는 Workspace note markdown을 Qdrant vector index에 넣기 전에 `MarkdownNoteChunker`가 어떻게 chunk로 나누는지 설명한다. 공개 API 계약은 chunk를 노출하지 않는다. chunk는 Intelligence-Service 내부 검색/RAG 입력 단위다.

## 목적

- 긴 노트의 앞부분만 임베딩되는 문제를 피한다.
- heading과 paragraph 경계를 가능한 보존해 의미 단위가 깨지지 않게 한다.
- Qdrant에는 chunk 단위로 저장하되, 공개 semantic search 응답은 기존처럼 note 단위로 유지한다.

## 입력과 출력

입력은 Workspace snapshot API에서 받은 note snapshot이다.

- `userId`
- `documentGroupId`: 문서 그룹/RAG 격리 키. Workspace payload나 snapshot에 없으면 `default`로 normalize한다.
- `noteId`
- `title`
- `markdown`
- `tags`
- `markdownHash`
- `version`

출력은 `List<NoteSearchDocument>`이다. 각 chunk는 다음 값을 갖는다.

- `chunkId`: `noteId::chunkIndex`
- `chunkIndex`: 0부터 시작하는 chunk 순서
- `documentGroupId`: 검색/RAG 격리 키
- `chunkText`: 실제 embedding 대상 텍스트
- `excerpt`: semantic search 응답에 사용할 짧은 preview
- `keywordIds`: 현재는 note tag 목록
- `markdownHash`, `version`: 재색인 대상 추적용 metadata
- `sourcePath`, `sourceFilename`: sample RAG처럼 원본 파일 출처가 있는 경우에만 채우는 optional metadata

Qdrant 내부 point id는 `userId::documentGroupId::noteId::chunkIndex`에서 만든 deterministic UUID를 사용한다. 사람이 읽는 logical chunk id는 payload `chunkId`에 `noteId::chunkIndex` 형태로 저장한다.

## Document Group 격리

`documentGroupId`는 Intelligence-Service 안에서 RAG/search 범위를 나누는 논리적 격리 키다. Obsidian의 vault처럼 한 사용자의 노트라도 서로 다른 문서 그룹이면 semantic search, RAG context 조회, note 단위 index 교체/삭제가 섞이지 않아야 한다.

- 기본값은 `default`다.
- Workspace event payload나 snapshot에 `documentGroupId`가 있으면 해당 값을 사용한다.
- Workspace가 아직 group을 보내지 않으면 모든 projection과 vector payload는 `default` group으로 처리한다.
- `NoteProjection` 조회 key는 `userId + documentGroupId + noteId`다. 같은 `userId/noteId`라도 group이 다르면 별도 projection으로 저장한다.
- Qdrant payload에는 `documentGroupId`를 저장하고, 검색/삭제 filter는 항상 `userId AND documentGroupId`를 포함한다. note 교체/삭제는 여기에 `noteId`를 추가한다.

기존 Qdrant collection의 point에는 `documentGroupId` payload가 없을 수 있다. group filter가 강제되면 이런 기존 point는 검색에서 누락될 수 있으므로, 이 변경 이후에는 note 재ingest가 필요하다.

## 기본값

현재 기본값은 코드에 고정되어 있다.

| 값 | 기본값 | 의미 |
| --- | ---: | --- |
| `maxChunkLength` | `1200` | title prefix를 포함한 chunk text 최대 문자 길이 |
| `overlapLength` | `150` | 긴 block을 자를 때 다음 chunk와 겹치는 문자 수 |
| `maxChunks` | `80` | 한 note에서 만들 수 있는 최대 chunk 수 |
| `excerptLength` | `240` | 검색 응답 preview 최대 문자 길이 |

문자 기준이다. 모델 tokenizer 기준 분할은 아직 사용하지 않는다.

## 처리 순서

1. `title`을 normalize한다.
2. `markdown`을 line 단위로 읽는다.
3. 빈 줄을 만나면 현재 paragraph block을 flush한다.
4. `#`로 시작하는 line은 heading block으로 분리한다.
5. 일반 line은 현재 paragraph block에 이어 붙인다.
6. 각 block은 `#`, `>`, `*`, `_`, `` ` ``, `[`, `]`, `(`, `)` 문자를 공백으로 바꾸고 연속 whitespace를 하나로 줄인다.
7. block들을 순서대로 합치되 `title + "\n\n" + body`가 `maxChunkLength`를 넘지 않으면 같은 chunk에 넣는다.
8. block 하나가 너무 길면 문자 길이 기준으로 쪼개고, 다음 조각은 이전 조각 끝부분 `overlapLength`만큼을 겹치게 시작한다.
9. markdown이 비어 있거나 유효 block이 없으면 title-only chunk 1개를 만든다.
10. `maxChunks`에 도달하면 남은 markdown은 index하지 않는다.

## Title Prefix

각 chunk의 embedding text에는 제목을 prefix로 붙인다.

```text
<title>

<chunk body>
```

이유는 chunk가 독립적으로 검색될 때 원래 note의 주제를 잃지 않게 하기 위해서다. body가 비어 있거나 body가 title과 같으면 title만 저장한다.

## 색인 흐름

`WorkspaceNoteEventHandler`가 snapshot을 가져온 뒤 chunker를 호출한다.

- `NoteCreated`: snapshot이 있으면 snapshot markdown으로 chunk index를 만든다. snapshot이 없으면 title-only provisional chunk 1개를 만든다.
- `NoteContentSaved`: `version + markdownHash`가 기존 projection과 같으면 재색인을 건너뛴다. 다르면 snapshot markdown을 chunk로 나눠 전체 교체한다.
- `NoteMetadataChanged`, `NoteTagsChanged`: metadata 일관성을 위해 snapshot 기반 chunk replace를 수행한다.
- `NoteTrashed`, `NoteDeleted`: note의 모든 chunk를 삭제한다.

Qdrant 교체는 `NoteSearchIndexPort.replaceNoteChunks(userId, documentGroupId, noteId, chunks)`를 통해 수행한다. adapter는 먼저 `userId + documentGroupId + noteId` filter로 기존 chunk를 삭제하고 새 chunk들을 추가한다.

## Projection Version/Hash와 Indexed Version/Hash

`intelligence_note_projections`는 Workspace 기준 최신 노트 상태와 search index 반영 상태를 분리해서 저장한다.

- `version`: Workspace 이벤트 또는 snapshot으로 알게 된 최신 note version이다.
- `markdownHash`: 최신 `NoteContentSaved` 이벤트가 목표로 하는 본문 hash다.
- `indexedVersion`: search index에 마지막으로 성공 반영된 snapshot version이다.
- `indexedMarkdownHash`: search index에 마지막으로 성공 반영된 markdown hash다.
- `indexedAt`: 마지막 성공 반영 시각이다.

`version`/`markdownHash`와 `indexedVersion`/`indexedMarkdownHash`가 다르면 projection은 최신 노트를 알고 있지만 Qdrant chunk index는 아직 이전 상태일 수 있다. 이 차이는 `searchIndexStatus`로 표현한다.

| 상태 | 의미 |
| --- | --- |
| `NOT_INDEXED` | 아직 search index에 적용된 적이 없다. |
| `PROVISIONAL` | `NoteCreated`에서 snapshot을 못 가져와 title-only chunk만 임시 반영했다. |
| `STALE` | projection이 가리키는 목표 version/hash 또는 metadata가 search index보다 최신이다. |
| `INDEXED` | `indexedVersion`/`indexedMarkdownHash`가 현재 projection 목표와 일치한다. |
| `FAILED` | index replace/delete 중 예외가 발생했고, event retry 또는 후속 복구가 필요하다. |
| `REMOVED` | archived/trashed/deleted 상태 때문에 search index에서 의도적으로 제거됐다. |

운영 DB는 Hibernate `ddl-auto=validate`를 사용하므로 `document_group_id`, `search_index_status`, `indexed_version`, `indexed_markdown_hash`, `indexed_at` 컬럼을 별도 migration으로 추가해야 한다. 기존 row의 `document_group_id`는 `default`로 backfill하고, 가능하면 `projection_id`도 `user_id::default::note_id` 형태로 갱신해야 한다. `local`과 `test` profile은 H2 `create-drop`이므로 자동으로 새 컬럼을 만든다.

## 검색 결과 매핑

Qdrant 검색은 chunk 단위로 수행한다. 하지만 공개 `POST /api/v1/intelligence/semantic-search` 응답은 note 단위 계약을 유지한다.

- 요청 limit보다 크게 조회한다.
- `topK = min(80, max(10, limit * 4))`
- 같은 `noteId`의 chunk hit가 여러 개면 가장 높은 score chunk만 남긴다.
- dedupe 후 score 내림차순으로 정렬하고 요청 limit만큼 반환한다.
- 반환 `excerpt`는 best chunk의 excerpt다.

따라서 public response에는 `chunkId`, `chunkIndex`가 없다. RAG 채팅에서 chunk 단위 citation이나 context 구성이 필요하면 별도 retrieval port를 추가해야 한다.

## RAG Context 선택

`sample_notes` 개발용 RAG CLI는 public semantic search와 달리 chunk hit를 context로 직접 사용한다. 기본 정책은 다음과 같다.

- `score < 0.35`인 chunk는 관련 근거가 없다고 보고 context에서 제외한다.
- 같은 `noteId`에서는 최대 2개 chunk까지만 context에 넣는다.
- 필터 후 context가 비면 LLM을 호출하지 않고 관련 chunk 없음으로 응답한다.

이 값은 `brainx.dev.sample-rag.min-score`, `brainx.dev.sample-rag.max-chunks-per-note`로 조정한다. Qdrant adapter의 raw chunk search는 dedupe나 threshold를 적용하지 않고, RAG context 조립 단계에서만 이 정책을 적용한다.

## 현재 한계

- tokenizer 기준이 아니라 문자 기준이므로 모델별 token limit과 정확히 일치하지 않는다.
- markdown table, code block, list 구조를 별도 semantic block으로 보존하지 않는다.
- `maxChunks=80`을 넘는 매우 긴 note의 뒤쪽 내용은 색인되지 않는다.
- `NotesMoved`는 projection folderId만 갱신하고 Qdrant chunk metadata의 folder field는 아직 없다.
- public semantic search는 note 단위 dedupe만 제공하므로, chunk 단위 결과 디버깅 API는 없다.

## 관련 코드

- `MarkdownNoteChunker`: markdown을 chunk-aware `NoteSearchDocument` 목록으로 변환한다.
- `WorkspaceNoteEventHandler`: note event를 받아 snapshot 조회와 chunk replace를 orchestration한다.
- `QdrantNoteSearchIndexAdapter`: Voyage embedding 호출, chunk payload 저장, note 단위 chunk 삭제, search result dedupe, embedding usage 기록을 담당한다.
