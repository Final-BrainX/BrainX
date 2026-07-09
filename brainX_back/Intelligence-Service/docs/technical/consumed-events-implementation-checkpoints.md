# 소비 이벤트 구현 체크포인트

이 문서는 최소 체크리스트만 남겨둔 서비스 로컬 메모입니다.

## 기본 listener에서 구현·구독 중

### Workspace note lifecycle

- `NoteCreated`: projection을 만들고 snapshot index를 시도하며, snapshot을 읽지 못하면 provisional chunk를 만든다.
- `NoteContentSaved`: 기존 summary를 지우고 snapshot 재색인 및 summary generation을 요청한다.
- `NoteMetadataChanged`: projection metadata를 저장하고 필요하면 재색인하거나 index를 제거한다.
- `NoteTagsChanged`: payload에 version이 없으므로 최신 Workspace snapshot의 tag를 읽어 재색인한다.
- `NoteTrashed`: projection을 trash 처리하고 index를 제거한다.
- `NoteDeleted`: projection, index, summary를 삭제 상태로 정리한다.

### 기타 처리 event

- `CaptureReceived`
- `NoteLinkCreated`
- `NoteLinkDeleted`
- `FolderCreated`
- `FolderChanged`
- `FolderDeleted`
- `UserDeletionRequested`

현재 기본 consumer topic과 handler는 위 13개 event를 대상으로 합니다.

## 실패 처리

- retryable 오류는 설정된 횟수만큼 재시도한 뒤 원본 partition과 같은 `<topic>.dlq`로 보낸다.
- invalid envelope, invalid payload, 미등록 handler 같은 non-retryable 오류는 즉시 DLQ로 보낸다.
- DLQ publish 실패는 recover 성공으로 처리하지 않아 원본 offset이 조용히 소실되지 않게 한다.

## 계약에는 있으나 현재 기본 listener 범위 밖

다음 event는 local AsyncAPI slice에 Intelligence-Service consumer로 포함되지만, 현재 `BrainxEventConsumerProperties` 기본 topic과 `BrainxEventHandler` 구현에는 없습니다. 구현됨으로 간주하지 말고, 실제 구독이 필요할 때 contract·owner·idempotency를 다시 확인합니다.

- `AiModelSettingsChanged`
- `AiSuggestionDecisionRecorded`
- `ClusterJobRequested`
- `InsightReportRequested`
- `UserStyleProfileChanged`

## 아직 남은 일

- note link에 대한 그래프 갱신 / 이웃 캐시 무효화
- folder 하위 경로 전파 처리
- user deletion에 따른 AI 관련 projection과 cache 일괄 정리

## 참고

작업 기준이 되는 요약 문서는 아래입니다.

- [brainX_back/KAFKA_IMPLEMENTATION_SUMMARY.md](../../../KAFKA_IMPLEMENTATION_SUMMARY.md)
