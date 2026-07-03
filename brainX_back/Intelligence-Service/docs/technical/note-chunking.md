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

- `chunkId`: `noteId::sha256(chunkText)::duplicateOrdinal`
- `chunkIndex`: 0부터 시작하는 chunk 순서
- `documentGroupId`: 검색/RAG 격리 키
- `chunkText`: 실제 embedding 대상 텍스트
- `excerpt`: semantic search 응답에 사용할 짧은 preview
- `keywordIds`: 현재는 note tag 목록
- `markdownHash`, `version`: 재색인 대상 추적용 metadata
- `sourcePath`, `sourceFilename`: sample RAG처럼 원본 파일 출처가 있는 경우에만 채우는 optional metadata

Qdrant 내부 point id는 `userId::documentGroupId::chunkId`에서 만든 deterministic UUID를 사용한다. 사람이 읽는 logical chunk id는 payload `chunkId`에 저장한다. `chunkIndex`는 검색 결과 정렬과 citation 표시를 위한 순서 metadata이며 point identity로 사용하지 않는다.

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
| `chunkerVersion` | `1` | manifest와 chunk 생성 규칙 호환성 판단 값 |

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

## Stable Chunk ID

각 chunk의 logical id는 실제 embedding input인 `chunkText`의 SHA-256 hash를 사용한다.

```text
<noteId>::<sha256(chunkText)>::<duplicateOrdinal>
```

같은 note 안에 동일한 `chunkText`가 여러 번 나오면 `duplicateOrdinal`을 0부터 증가시켜 point를 분리한다. 이 방식은 문서 앞부분에 paragraph가 삽입되어도 뒤쪽의 동일한 chunk가 같은 id를 유지하게 해, 불필요한 재임베딩을 줄인다.

제목은 여전히 `chunkText` prefix에 포함된다. 따라서 제목이 바뀌면 모든 chunk의 embedding input이 바뀐 것으로 보고 full replace/full re-embedding을 수행한다.

## 색인 흐름

`WorkspaceNoteEventHandler`가 snapshot을 가져온 뒤 chunker를 호출한다.

- `NoteCreated`: snapshot이 있으면 snapshot markdown으로 chunk index를 만든다. snapshot이 없으면 title-only provisional chunk 1개를 만든다.
- `NoteContentSaved`: `version + markdownHash`가 기존 projection과 같으면 재색인을 건너뛴다. 다르면 snapshot markdown을 chunk로 나누고 기존 chunk manifest와 비교한다.
- `NoteMetadataChanged`: title이 바뀌면 full replace한다. title이 그대로인 folder/archive 변경은 필요한 projection/index 상태만 갱신한다.
- `NoteTagsChanged`: chunk text가 그대로이면 embedding을 재사용하고 Qdrant payload의 `keywordIds`, `version`, `markdownHash`만 갱신한다.
- `NoteTrashed`, `NoteDeleted`: note의 모든 Qdrant chunk와 DB chunk manifest를 삭제한다.

Qdrant full replace는 `NoteSearchIndexPort.replaceNoteChunks(userId, documentGroupId, noteId, chunks)`를 통해 수행한다. adapter는 먼저 `userId + documentGroupId + noteId` filter로 기존 chunk를 삭제하고 새 chunk들을 추가한다.

부분 갱신은 `NoteSearchIndexPort.applyNoteChunkDelta(...)`를 통해 수행한다.

- 새 chunk 또는 `embeddingTextHash`가 달라진 chunk만 Voyage embedding을 호출하고 upsert한다.
- 사라진 chunk는 stable `chunkId`로 만든 point id만 삭제한다.
- 본문은 같고 `chunkIndex`, `keywordIds`, `version`, `markdownHash` 같은 payload만 달라진 chunk는 Qdrant payload overwrite만 수행한다.
- delta가 없으면 Qdrant mutation 없이 projection과 manifest 상태만 최신화한다.

다음 조건에서는 delta 대신 full replace를 수행한다.

- 기존 manifest가 없다.
- 이전 index가 `NOT_INDEXED`, `PROVISIONAL`, `FAILED` 상태다.
- 기존 manifest의 `chunkerVersion`이 현재 chunker와 다르다.
- title이 바뀌었다.
- `(upsert chunk 수 + delete chunk 수) / max(old chunk 수, new chunk 수) > 0.5`다.

Qdrant mutation 성공 후에만 `intelligence_note_index_chunks` manifest를 새 목록으로 교체하고 projection을 `INDEXED`로 표시한다. 실패하면 projection을 `FAILED`로 표시하고 manifest는 이전 상태로 둔다. 이후 retry는 이전 manifest 기준으로 다시 idempotent mutation을 수행한다.

## Chunk Manifest

`intelligence_note_index_chunks`는 Qdrant에 성공적으로 반영된 note chunk manifest다. Intelligence-Service가 소유하는 내부 index 상태이며 공개 API에는 노출하지 않는다.

| Column | 의미 |
| --- | --- |
| `manifest_id` | `userId::documentGroupId::noteId::chunkId` 기반 primary key |
| `user_id`, `document_group_id`, `note_id` | note와 document group 격리 key |
| `chunk_id`, `chunk_index` | stable logical id와 현재 표시 순서 |
| `embedding_text_hash` | `chunkText` SHA-256 hash |
| `payload_hash` | Qdrant payload field들로 만든 SHA-256 hash |
| `chunker_version` | chunker 규칙 호환성 판단 값 |
| `indexed_version`, `indexed_markdown_hash`, `indexed_at` | manifest가 반영한 Workspace version/hash와 시각 |

## Projection Version/Hash와 Indexed Version/Hash

`intelligence_note_projections`는 Workspace 기준 최신 노트 상태와 search index 반영 상태를 분리해서 저장한다.

- `version`: Workspace 이벤트 또는 snapshot으로 알게 된 최신 note version이다.
- `markdownHash`: 최신 `NoteContentSaved` 이벤트가 목표로 하는 본문 hash다.
- `indexedVersion`: search index에 마지막으로 성공 반영된 snapshot version이다.
- `indexedMarkdownHash`: search index에 마지막으로 성공 반영된 markdown hash다.
- `indexedAt`: 마지막 성공 반영 시각이다.
- `lastIndexAttemptAt`: scheduled retry worker가 마지막으로 재색인을 시도한 시각이다.
- `nextIndexRetryAt`: 다음 자동 재색인이 가능한 시각이다.
- `indexAttemptCount`: 연속 재색인 실패 횟수다. 성공하면 0으로 초기화한다.
- `lastIndexErrorCode`, `lastIndexErrorMessage`: 마지막 재색인 실패 원인이다. public API에는 노출하지 않는다.

`version`/`markdownHash`와 `indexedVersion`/`indexedMarkdownHash`가 다르면 projection은 최신 노트를 알고 있지만 Qdrant chunk index는 아직 이전 상태일 수 있다. 이 차이는 `searchIndexStatus`로 표현한다.

| 상태 | 의미 |
| --- | --- |
| `NOT_INDEXED` | 아직 search index에 적용된 적이 없다. |
| `PROVISIONAL` | `NoteCreated`에서 snapshot을 못 가져와 title-only chunk만 임시 반영했다. |
| `STALE` | projection이 가리키는 목표 version/hash 또는 metadata가 search index보다 최신이다. |
| `INDEXED` | `indexedVersion`/`indexedMarkdownHash`가 현재 projection 목표와 일치한다. |
| `FAILED` | index replace/delete 중 예외가 발생했고, event retry 또는 후속 복구가 필요하다. |
| `REMOVED` | archived/trashed/deleted 상태 때문에 search index에서 의도적으로 제거됐다. |

운영 DB는 Flyway migration으로 `document_group_id`, `search_index_status`, `indexed_version`, `indexed_markdown_hash`, `indexed_at`, retry metadata 컬럼과 `idx_note_projection_index_retry` 인덱스를 적용한다. 기존 row의 `document_group_id`는 migration에서 `default`로 backfill한다. `local`과 `test` profile은 H2 `create-drop`이므로 자동으로 새 컬럼을 만든다.

## Scheduled Reindex Retry

`ScheduledNoteReindexWorker`는 public API 호출 없이 Intelligence-Service 내부에서만 동작한다. 기본 설정은 `brainx.note-index.retry.enabled=true`, `fixed-delay=PT5M`, `batch-size=20`, `max-attempts=10`이다.

대상 projection은 archived/trashed/deleted가 아니고 `searchIndexStatus in (NOT_INDEXED, PROVISIONAL, STALE, FAILED)`이거나 `contentPending=true`인 row 중 `nextIndexRetryAt is null or <= now`인 row다. 정렬은 `nextIndexRetryAt nulls first`, `nextIndexRetryAt asc`, `updatedAt desc`다.

worker는 Workspace snapshot을 다시 조회하고 `NoteIndexingService`를 통해 기존 event handler와 같은 chunking, Qdrant replace/delta, manifest 저장, projection `INDEXED` 전환 로직을 사용한다. snapshot unavailable/stale는 기존 상태를 유지한 채 retry metadata만 갱신하고, Qdrant 또는 embedding provider 계열 실패는 `FAILED`로 저장한다.

Backoff는 실패 횟수 기준 1m, 5m, 15m, 1h, 이후 6h cap이다. `max-attempts` 이상이면 상태를 `FAILED`로 유지하고 `nextIndexRetryAt`을 기본 24h 뒤로 둔다. 성공하면 retry metadata는 초기화된다.

부분 재색인을 쓰려면 운영 PostgreSQL에 chunk manifest table도 추가해야 한다.

```sql
create table intelligence_note_index_chunks (
    manifest_id varchar(620) primary key,
    user_id varchar(120) not null,
    document_group_id varchar(120) not null,
    note_id varchar(120) not null,
    chunk_id varchar(260) not null,
    chunk_index integer not null,
    embedding_text_hash varchar(64) not null,
    payload_hash varchar(64) not null,
    chunker_version integer not null,
    indexed_version integer,
    indexed_markdown_hash varchar(160),
    indexed_at timestamp with time zone not null
);

create index idx_intelligence_note_index_chunks_note
    on intelligence_note_index_chunks (user_id, document_group_id, note_id, chunk_index);
```

기존 Qdrant collection은 `chunkIndex` 기반 point id를 사용했을 수 있다. manifest가 없는 note는 첫 재색인 때 full replace를 수행하므로, note별로 새 stable point id와 manifest가 생성된다.

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
- `FolderDeleted` cascade 삭제는 Workspace가 보낸 `noteIds`를 `default` document group에서 제거한다. Workspace가 `documentGroupId`를 보내기 전까지 다른 group projection은 이 이벤트만으로 정리되지 않는다.
- identical duplicate chunk 앞에 같은 내용이 추가되면 `duplicateOrdinal`이 밀릴 수 있어 해당 duplicate 구간은 재색인될 수 있다.
- public semantic search는 note 단위 dedupe만 제공하므로, chunk 단위 결과 디버깅 API는 없다.
- 검색용 Qdrant chunk는 정규화된 `doc_content`를 저장하므로 raw markdown offset을 보존하지 않는다. 유사 노트 자동 연결의 anchor 위치는 `intelligence_note_projections.markdown` read model에서 계산한다.

## 관련 코드

- `MarkdownNoteChunker`: markdown을 chunk-aware `NoteSearchDocument` 목록으로 변환한다.
- `NoteIndexingService`: snapshot 기반 chunking, Qdrant 반영, manifest 저장, projection index 상태 갱신을 담당한다.
- `WorkspaceNoteEventHandler`: note event를 받아 projection update와 `NoteIndexingService` 호출을 orchestration한다.
- `ScheduledNoteReindexWorker`: retry metadata와 backoff 기준으로 실패/대기 projection을 자동 재색인한다.
- `QdrantNoteSearchIndexAdapter`: Voyage embedding 호출, chunk payload 저장, note 단위 chunk 삭제, search result dedupe, embedding usage 기록을 담당한다.
