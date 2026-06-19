# Note Chunking

이 문서는 Workspace note markdown을 Qdrant vector index에 넣기 전에 `MarkdownNoteChunker`가 어떻게 chunk로 나누는지 설명한다. 공개 API 계약은 chunk를 노출하지 않는다. chunk는 Intelligence-Service 내부 검색/RAG 입력 단위다.

## 목적

- 긴 노트의 앞부분만 임베딩되는 문제를 피한다.
- heading과 paragraph 경계를 가능한 보존해 의미 단위가 깨지지 않게 한다.
- Qdrant에는 chunk 단위로 저장하되, 공개 semantic search 응답은 기존처럼 note 단위로 유지한다.

## 입력과 출력

입력은 Workspace snapshot API에서 받은 note snapshot이다.

- `userId`
- `noteId`
- `title`
- `markdown`
- `tags`
- `markdownHash`
- `version`

출력은 `List<NoteSearchDocument>`이다. 각 chunk는 다음 값을 갖는다.

- `chunkId`: `noteId::chunkIndex`
- `chunkIndex`: 0부터 시작하는 chunk 순서
- `chunkText`: 실제 embedding 대상 텍스트
- `excerpt`: semantic search 응답에 사용할 짧은 preview
- `keywordIds`: 현재는 note tag 목록
- `markdownHash`, `version`: 재색인 대상 추적용 metadata

Qdrant document id는 adapter에서 `userId::noteId::chunkIndex`로 만든다.

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

Qdrant 교체는 `NoteSearchIndexPort.replaceNoteChunks(userId, noteId, chunks)`를 통해 수행한다. adapter는 먼저 `userId + noteId` filter로 기존 chunk를 삭제하고 새 chunk들을 추가한다.

## 검색 결과 매핑

Qdrant 검색은 chunk 단위로 수행한다. 하지만 공개 `POST /api/v1/intelligence/semantic-search` 응답은 note 단위 계약을 유지한다.

- 요청 limit보다 크게 조회한다.
- `topK = min(80, max(10, limit * 4))`
- 같은 `noteId`의 chunk hit가 여러 개면 가장 높은 score chunk만 남긴다.
- dedupe 후 score 내림차순으로 정렬하고 요청 limit만큼 반환한다.
- 반환 `excerpt`는 best chunk의 excerpt다.

따라서 public response에는 `chunkId`, `chunkIndex`가 없다. RAG 채팅에서 chunk 단위 citation이나 context 구성이 필요하면 별도 retrieval port를 추가해야 한다.

## 현재 한계

- tokenizer 기준이 아니라 문자 기준이므로 모델별 token limit과 정확히 일치하지 않는다.
- markdown table, code block, list 구조를 별도 semantic block으로 보존하지 않는다.
- `maxChunks=80`을 넘는 매우 긴 note의 뒤쪽 내용은 색인되지 않는다.
- `NotesMoved`는 projection folderId만 갱신하고 Qdrant chunk metadata의 folder field는 아직 없다.
- public semantic search는 note 단위 dedupe만 제공하므로, chunk 단위 결과 디버깅 API는 없다.

## 관련 코드

- `MarkdownNoteChunker`: markdown을 chunk-aware `NoteSearchDocument` 목록으로 변환한다.
- `WorkspaceNoteEventHandler`: note event를 받아 snapshot 조회와 chunk replace를 orchestration한다.
- `QdrantNoteSearchIndexAdapter`: chunk metadata 저장, note 단위 chunk 삭제, search result dedupe를 담당한다.
