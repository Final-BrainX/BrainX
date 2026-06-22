# BrainX 도메인 기준 MSA / API / 이벤트 계약

## 작성 기준

원본: `BrainX_기능_상세_명세서.docx`

검증 기준:

- 원문 표에서 기능 46개를 추출했다.
- `MCP 서버`는 원문에 기능명은 있으나 기능 ID, 우선순위, 유형이 비어 있다. 이 문서에서는 추적을 위해 `5.5.1 제안`으로 표기한다.
- 서비스는 기술 레이어가 아니라 도메인 책임, 데이터 소유권, 변경 단위 기준으로 나눴다.
- 5개 서비스 제한 때문에 일부 운영/분석 기능은 한 서비스에 묶었다. 이 부분은 아래 검증 섹션에 분리 후보로 표시했다.

커버리지 검증 결과:

- 추출 기능 수: 46개
- 산출물 내 기능 ID/기능명 누락: 0개
- 검증 방식: `work/brainx_features.csv`의 원문 기능 ID/기능명을 이 문서 본문과 대조

## 최종 5개 도메인 서비스

| 서비스 | 도메인 이름                                 | 핵심 책임                                        | 담당           |
| --- | -------------------------------------- | -------------------------------------------- | ------------ |
| 1   | Identity & Access Service              | 사용자 신원, 인증, 계정 보안, 동의, 관리자, 마이페이지,           | 채영           |
| 2   | Knowledge Workspace Service            | **노트** 원장, 폴더, 태그, 링크, **그래프**, 공유           | 진주, 예진, 채..? |
| 3   | Content Ingestion & Publishing Service | 파일, 변환, 가져오기, 내보내기, 외부 연동                    | 환유           |
| 4   | **Knowledge Intelligence Service**     | 시맨틱 검색, RAG, LLM, AI 추천, 요약, 토큰 사용량(service) | 영진           |
| 5   | 결제                                     | 플랜, 결제                                       | 환유           |






## 공통 API 계약

### 공통 규칙

- 모든 API는 `/v1` prefix를 사용한다.
- 내부 ID는 UUID v7 또는 ULID를 권장한다.
- 변경 API는 `Idempotency-Key` 헤더를 받는다.
- 사용자 인증은 Access Token + Refresh Token 구조를 사용한다.
- 웹은 HttpOnly Secure Cookie 기반 세션을 우선한다.
- Electron/Extension/MCP/API client는 Bearer token 또는 scoped API key를 사용한다.
- 목록 API는 cursor pagination을 사용한다.
- 스트리밍 AI 응답은 SSE를 기본으로 한다.
- 서비스 간 DB 직접 조회는 금지한다. 소유 서비스 API 또는 이벤트 기반 read model만 사용한다.

### 공통 에러 응답

```json
{
  "error": {
    "code": "NOTE_VERSION_CONFLICT",
    "message": "The note was changed by another device.",
    "traceId": "trc_01J...",
    "details": {
      "serverVersion": 17,
      "clientBaseVersion": 16
    }
  }
}
```

### 공통 이벤트 envelope

```json
{
  "eventId": "evt_01J...",
  "eventType": "NoteContentSaved",
  "eventVersion": 1,
  "occurredAt": "2026-06-05T08:00:00Z",
  "producer": "knowledge-workspace",
  "tenantId": "ten_...",
  "userId": "usr_...",
  "correlationId": "req_...",
  "payload": {}
}
```

권장 메시징:

- 즉시 사용자 응답이 필요한 기능: 동기 HTTP
- 인덱싱, 임베딩, 변환, 요약, 알림, 집계: 이벤트/큐
- 이벤트 전달 보장: Outbox pattern + at-least-once delivery
- 소비자는 멱등 처리 필수

## 1. Identity & Access Service

### 도메인 책임

사용자 신원, 로그인 수단, 계정 보안, 개인정보 동의 이력을 소유한다.

포함 기능:

- `1.1.1` 이메일 회원가입
- `1.2.1` 소셜 로그인 (카카오/구글/애플)
- `1.3.1` 온보딩 정보 수집
- `8.2.1` 계정 및 보안
- `14.1` 사용자 정보 수집 동의

클라이언트 책임:

- 회원가입/로그인 화면
- 소셜 로그인 버튼
- OTP 입력 UI
- 온보딩 입력 UI
- 계정/보안 설정 화면
- 동의 체크박스 표시

소유 데이터:

- `users`
- `user_profiles`
- `auth_credentials`
- `oauth_accounts`
- `sessions`
- `refresh_tokens`
- `email_verifications`
- `security_settings`
- `consent_records`
- `deletion_requests`

### API 계약

| Method | Path                                      | 요청                                                                                 | 응답                                                          | 이벤트                                    |                              |                               |     |
| ------ | ----------------------------------------- | ---------------------------------------------------------------------------------- | ----------------------------------------------------------- | -------------------------------------- | ---------------------------- | ----------------------------- | --- |
| POST   | `/v1/auth/email-verifications`            | `{ email, purpose: "signup"                                                        | "passwordChange" }`                                         | `{ verificationId, expiresAt }`        | `EmailVerificationRequested` |                               |     |
| POST   | `/v1/auth/email-signups`                  | `{ email, code, password, consents }`                                              | `{ userId, accessToken, refreshToken, next: "onboarding" }` | `UserRegistered`, `ConsentRecorded`    |                              |                               |     |
| POST   | `/v1/auth/login`                          | `{ email, password }`                                                              | `{ accessToken, refreshToken, requires2fa }`                | `UserLoggedIn`                         |                              |                               |     |
| POST   | `/v1/auth/logout`                         | `{ sessionId }`                                                                    | `{ ok: true }`                                              | `UserLoggedOut`                        |                              |                               |     |
| GET    | `/v1/auth/oauth/{provider}/authorize`     | provider: `kakao                                                                   | google                                                      | apple                                  | naver`                       | `{ authorizationUrl, state }` | 없음  |
| POST   | `/v1/auth/oauth/{provider}/callback`      | `{ code, state }`                                                                  | `{ userId, accessToken, refreshToken, accountLinked }`      | `OAuthAccountLinked`, `UserRegistered` |                              |                               |     |
| GET    | `/v1/users/me`                            | 없음                                                                                 | `{ userId, email, profile, security, consents }`            | 없음                                     |                              |                               |     |
| PATCH  | `/v1/users/me/profile`                    | `{ nickname, profileImageAssetId? }`                                               | `{ profile }`                                               | `UserProfileUpdated`                   |                              |                               |     |
| PATCH  | `/v1/users/me/password`                   | `{ currentPassword, newPassword }`                                                 | `{ ok: true }`                                              | `PasswordChanged`                      |                              |                               |     |
| POST   | `/v1/users/me/2fa/email`                  | `{ enabled: true }`                                                                | `{ verificationId }`                                        | `TwoFactorConfigured`                  |                              |                               |     |
| POST   | `/v1/users/me/social-accounts`            | `{ provider, oauthCode }`                                                          | `{ provider, linked: true }`                                | `OAuthAccountLinked`                   |                              |                               |     |
| DELETE | `/v1/users/me/social-accounts/{provider}` | 없음                                                                                 | `{ provider, linked: false }`                               | `OAuthAccountUnlinked`                 |                              |                               |     |
| PUT    | `/v1/users/me/consents`                   | `{ termsRequired, privacyRequired, marketingOptional, behaviorAnalyticsOptional }` | `{ consents }`                                              | `ConsentUpdated`                       |                              |                               |     |
| POST   | `/v1/users/me/deletion-request`           | `{ reason? }`                                                                      | `{ deletionScheduledAt }`                                   | `UserDeletionRequested`                |                              |                               |     |
| DELETE | `/v1/users/me/deletion-request`           | 없음                                                                                 | `{ ok: true }`                                              | `UserDeletionCancelled`                |                              |                               |     |

### 발행 이벤트

- `UserRegistered`
- `UserProfileUpdated`
- `ConsentRecorded`
- `ConsentUpdated`
- `UserDeletionRequested`
- `OAuthAccountLinked`
- `OAuthAccountUnlinked`
- `PasswordChanged`
- `TwoFactorConfigured`

### 구독 이벤트

- `AssetUploaded`: 프로필 이미지가 업로드된 경우 profile image asset 검증
- `PaymentSucceeded`: 사용자 플랜 표시용 read model 갱신 가능

## 2. Knowledge Workspace Service

### 도메인 책임

BrainX의 핵심 도메인이다. 노트 원장, 문서 버전, 폴더, 태그, 즐겨찾기, 최근 활동, 백링크, 마인드맵 그래프 데이터를 소유한다.

포함 기능:

- `2.1.1` 키워드 검색 (클라이언트 구현 )
- `2.2.1` 즐겨찾기 및 최근 활동
- `3.1.1` 마크다운 기반 문서 편집
- `3.2.1` 자동 저장
- `3.4.1` 문서 내 목차 자동 생성
- `3.6.1` 웹 문서 공유
- `4.1.1` 폴더 생성/수정/삭제 및 노트 이동
- `4.2.1` 태그 시스템
- `4.3.1` 노트 연결 및 백링크 중 수동 링크/백링크
- `6.1.1` 2D 마인드맵 데이터
- `6.4.1` 시간별 필터링 데이터
- `6.5.1` 3D 우주 탐사 모드 데이터
- `6.6.1` 타임랩스 데이터

중요 결정:

- `2.1.1` 키워드 검색은 기본적으로 클라이언트 로컬 인덱스에서 처리한다.
- 서버는 "검색 API"를 소유하지 않고, 클라이언트가 로컬 검색 인덱스를 만들 수 있도록 workspace sync API를 제공한다.
- 시맨틱 검색과 RAG 검색은 `Knowledge Intelligence Service`가 맡는다.

클라이언트 책임:

- CodeMirror/ProseMirror 에디터
- WYSIWYG/Raw 모드
- 마크다운 실시간 렌더링
- 목차 생성/스크롤 하이라이트
- IndexedDB 임시 저장
- 키워드 검색 로컬 인덱스
- 폴더 트리/태그 UI
- 마인드맵 2D/3D 렌더링
- 노드 위치 드래그/줌/타임랩스 애니메이션

소유 데이터:

- `notes`
- `note_contents`
- `note_versions`
- `note_conflicts`
- `folders`
- `note_folder_assignments`
- `tags`
- `note_tags`
- `favorites`
- `recent_activities`
- `note_links`
- `backlinks`
- `share_links`
- `graph_layouts`

### API 계약

| Method | Path                                              | 요청                                                 | 응답                                                                     | 이벤트                       |                                |
| ------ | ------------------------------------------------- | -------------------------------------------------- | ---------------------------------------------------------------------- | ------------------------- | ------------------------------ |
| GET    | `/v1/workspace/sync`                              | query: `{ cursor?, includeDeleted? }`              | `{ cursor, notes, folders, tags, links, favorites, recentActivities }` | 없음                        |                                |
| POST   | `/v1/notes`                                       | `{ title, markdown?, folderId?, tags? }`           | `{ noteId, version }`                                                  | `NoteCreated`             |                                |
| GET    | `/v1/notes/{noteId}`                              | 없음                                                 | `{ note, content, version, permissions }`                              | 없음                        |                                |
| PUT    | `/v1/notes/{noteId}/content`                      | `{ baseVersion, markdown, clientSavedAt }`         | `{ version, savedAt, conflict? }`                                      | `NoteContentSaved`        |                                |
| PATCH  | `/v1/notes/{noteId}/metadata`                     | `{ title?, folderId?, tags?, archived? }`          | `{ note, version }`                                                    | `NoteMetadataChanged`     |                                |
| DELETE | `/v1/notes/{noteId}`                              | `{ mode: "trash"                                   | "permanent" }`                                                         | `{ deletedAt, purgeAt? }` | `NoteTrashed` 또는 `NoteDeleted` |
| GET    | `/v1/notes/{noteId}/versions`                     | 없음                                                 | `{ versions }`                                                         | 없음                        |                                |
| POST   | `/v1/notes/{noteId}/versions/{versionId}/restore` | 없음                                                 | `{ version }`                                                          | `NoteContentSaved`        |                                |
| POST   | `/v1/notes/{noteId}/views`                        | `{ viewedAt }`                                     | `{ ok: true }`                                                         | `NoteViewed`              |                                |
| POST   | `/v1/folders`                                     | `{ name, parentFolderId? }`                        | `{ folderId }`                                                         | `FolderCreated`           |                                |
| PATCH  | `/v1/folders/{folderId}`                          | `{ name?, parentFolderId? }`                       | `{ folder }`                                                           | `FolderChanged`           |                                |
| DELETE | `/v1/folders/{folderId}`                          | `{ childNoteAction: "move"                         | "trash", targetFolderId? }`                                            | `{ ok: true }`            | `FolderDeleted`, `NotesMoved`  |
| PUT    | `/v1/notes/{noteId}/tags`                         | `{ tagNames }`                                     | `{ tags }`                                                             | `NoteTagsChanged`         |                                |
| GET    | `/v1/tags/suggestions`                            | query: `{ q }`                                     | `{ tags }`                                                             | 없음                        |                                |
| PUT    | `/v1/favorites/{targetType}/{targetId}`           | `{ enabled }`                                      | `{ enabled }`                                                          | `FavoriteChanged`         |                                |
| GET    | `/v1/recent-activities`                           | query: `{ limit }`                                 | `{ items }`                                                            | 없음                        |                                |
| GET    | `/v1/notes/{noteId}/backlinks`                    | 없음                                                 | `{ backlinks }`                                                        | 없음                        |                                |
| POST   | `/v1/notes/{noteId}/links`                        | `{ targetNoteId?, targetTitle, createIfMissing? }` | `{ linkId, targetNoteId }`                                             | `NoteLinkCreated`         |                                |
| DELETE | `/v1/notes/{noteId}/links/{linkId}`               | 없음                                                 | `{ ok: true }`                                                         | `NoteLinkDeleted`         |                                |
| GET    | `/v1/graph`                                       | query: `{ folderId?, tag?, since?, until? }`       | `{ nodes, edges, summaries, lastViewedAt }`                            | 없음                        |                                |
| PUT    | `/v1/graph/layouts/{layoutId}`                    | `{ nodePositions, quality? }`                      | `{ layoutId, savedAt }`                                                | `GraphLayoutSaved`        |                                |
| POST   | `/v1/share-links`                                 | `{ noteId, permission: "read"                      | "edit", expiresAt }`                                                   | `{ shareId, url }`        | `ShareLinkCreated`             |
| PATCH  | `/v1/share-links/{shareId}`                       | `{ expiresAt?, revoked? }`                         | `{ shareLink }`                                                        | `ShareLinkChanged`        |                                |

### 발행 이벤트

- `NoteCreated`
- `NoteContentSaved`
- `NoteMetadataChanged`
- `NoteTrashed`
- `NoteDeleted`
- `NoteViewed`
- `FolderCreated`
- `FolderChanged`
- `FolderDeleted`
- `NoteTagsChanged`
- `FavoriteChanged`
- `NoteLinkCreated`
- `NoteLinkDeleted`
- `ShareLinkCreated`
- `GraphLayoutSaved`

### 구독 이벤트

- `AssetConverted`: 변환 결과를 새 노트 또는 첨부로 반영
- `ImportJobCompleted`: Notion/Obsidian import 결과를 폴더/노트로 생성
- `AiSuggestionAccepted`: AI 연결 제안, 폴더 정리 제안이 사용자 승인된 경우만 반영
- `UserDeletionRequested`: 사용자 데이터 삭제 예약

## 3. Content Ingestion & Publishing Service

### 도메인 책임

파일 수집, 파일 변환, 원본 파일 저장, 외부 플랫폼 연동, 내보내기/발행을 책임진다.

포함 기능:

- `2.3.1` Notion 가져오기 / 동기화
- `2.3.2` Obsidian Vault 가져오기
- `3.3.1` 파일 첨부 및 업로드
- `3.3.2` 파일 변환 방식 선택
- `3.6.1` 웹 문서 내보내기 중 PDF/txt/md export job
- `3.6.2` 앱 문서 내보내기
- `3.7.1` 블로그 템플릿 제공
- `5.4.1` 크롬 확장 프로그램 저장 API
- `5.5.1 제안` MCP 서버/API 외부 접근

클라이언트 책임:

- 파일 드래그앤드롭
- 업로드 진행률
- 변환 방식 선택 모달
- 첨부 미리보기
- Notion/Obsidian import 화면
- Chrome Extension UI
- Electron 로컬 파일 선택
- 외부 API client 등록 화면

소유 데이터:

- `assets`
- `asset_variants`
- `upload_sessions`
- `conversion_jobs`
- `import_jobs`
- `export_jobs`
- `integration_accounts`
- `sync_states`
- `sync_conflicts`
- `blog_templates`
- `publish_jobs`
- `api_clients`
- `mcp_sessions`

### API 계약

| Method | Path | 요청 | 응답 | 이벤트 |
|---|---|---|---|---|
| POST | `/v1/assets/upload-sessions` | `{ fileName, contentType, sizeBytes, targetNoteId? }` | `{ uploadSessionId, uploadUrl, maxSizeBytes }` | 없음 |
| POST | `/v1/assets/upload-sessions/{id}/complete` | `{ checksum, conversionMode: "keepOriginal"|"markdown" }` | `{ assetId, conversionJobId? }` | `AssetUploaded`, `ConversionJobRequested` |
| GET | `/v1/assets/{assetId}` | 없음 | `{ asset, variants, downloadUrl }` | 없음 |
| POST | `/v1/conversions` | `{ assetId, targetFormat: "markdown"|"text"|"webp" }` | `{ conversionJobId, status }` | `ConversionJobRequested` |
| GET | `/v1/conversions/{jobId}` | 없음 | `{ status, resultAssetId?, error? }` | 없음 |
| POST | `/v1/imports/notion/oauth/authorize` | `{ redirectUri }` | `{ authorizationUrl, state }` | 없음 |
| POST | `/v1/imports/notion/oauth/callback` | `{ code, state }` | `{ integrationAccountId }` | `IntegrationConnected` |
| POST | `/v1/imports/notion/jobs` | `{ integrationAccountId, sourceId, mode: "import"|"fork"|"sync" }` | `{ importJobId }` | `ImportJobRequested` |
| POST | `/v1/imports/obsidian/jobs` | `{ uploadedZipAssetId, targetFolderId? }` | `{ importJobId }` | `ImportJobRequested` |
| GET | `/v1/imports/{importJobId}` | 없음 | `{ status, createdNotes, failedFiles, conflicts }` | 없음 |
| POST | `/v1/exports` | `{ noteId, format: "pdf"|"txt"|"md", clientType: "web"|"app" }` | `{ exportJobId }` | `ExportJobRequested` |
| GET | `/v1/exports/{exportJobId}` | 없음 | `{ status, downloadUrl?, error? }` | 없음 |
| GET | `/v1/blog-templates` | query: `{ category? }` | `{ templates }` | 없음 |
| POST | `/v1/publish-jobs` | `{ noteId, platform: "tistory"|"notion"|"copy", templateId }` | `{ publishJobId, status }` | `PublishJobRequested` |
| POST | `/v1/extension/captures` | `{ url, title, selectedText?, metaDescription?, folderId? }` | `{ noteId }` | `CaptureReceived` |
| POST | `/v1/api-clients` | `{ name, scopes, expiresAt? }` | `{ clientId, clientSecretOnce }` | `ApiClientCreated` |
| GET | `/v1/mcp/tools` | 없음 | `{ tools }` | 없음 |
| POST | `/v1/mcp/tool-calls` | `{ toolName, arguments }` | `{ result }` | `ExternalToolCalled` |

### 발행 이벤트

- `AssetUploaded`
- `ConversionJobRequested`
- `AssetConverted`
- `ImportJobRequested`
- `ImportJobCompleted`
- `ImportJobFailed`
- `ExternalSyncConflictDetected`
- `ExportJobRequested`
- `ExportJobCompleted`
- `PublishJobRequested`
- `PublishJobCompleted`
- `CaptureReceived`
- `ApiClientCreated`
- `ExternalToolCalled`

### 구독 이벤트

- `NoteContentSaved`: Notion 양방향 동기화 대상 노트 변경 감지
- `ShareLinkCreated`: export/publish 권한 확인용 read model 갱신 가능
- `SubscriptionChanged`: 유료 export 기간/기능 제한 반영
- `UserDeletionRequested`: 외부 토큰 폐기 및 파일 삭제 예약

## 4. Knowledge Intelligence Service

### 도메인 책임

지식 탐색과 AI 보조 기능을 책임진다. 원본 노트는 소유하지 않고, 노트 이벤트를 기반으로 임베딩/요약/추천용 read model을 만든다.

포함 기능:

- `2.1.2` 시맨틱 검색 (검색창에 같이 나와) (챗봇)
- `3.5.1` AI 글 작성 / 요약 보조 (인라인 챗)
- `4.1.2` AI 기반 자동 폴더 정리
- `4.3.1` AI 연결 제안
- `5.1.1` RAG 기반 문서 챗봇
- `5.2.1` 다중 LLM 지원
- `5.3.1` AI 유사 노트 추천
- `6.2.1` 노드 마우스오버 요약
- `6.3.2` AI 클러스터링
- `6.3.3` 징검다리 개념 추천
- `7.1.1` AI 인사이트 및 학습 공백 탐지 (브레인스토밍으로 사용)
- `7.4.1` 문체 지정

클라이언트 책임:

- 시맨틱 검색 ON/OFF 토글
- AI 팝업
- 인라인 챗 패널
- AI 응답 스트리밍 표시
- AI 제안 수락/거절/재생성 UI
- 챗봇 UI
- 유사 노트 추천 카드
- 클러스터/징검다리 추천 UI
- 문체 선택 UI

소유 데이터:

- `semantic_documents`
- `vector_embeddings`
- `ai_sessions`
- `chat_threads`
- `chat_messages`
- `prompt_templates`
- `ai_suggestions`
- `note_summary_cache`
- `cluster_results`
- `insight_reports`
- `user_style_profiles`
- `llm_provider_settings`

### API 계약

| Method | Path | 요청 | 응답 | 이벤트 |
|---|---|---|---|---|
| POST | `/v1/intelligence/semantic-search` | `{ query, filters, limit, hybridWithClientKeywordIds? }` | `{ results, tokenEstimate, charged }` | `SemanticSearchPerformed`, `TokenUsageRecordedRequested` |
| POST | `/v1/ai/inline-assists` | `{ noteId, selectedText?, action: "summarize"|"rewrite"|"continue"|"translate"|"spellcheck", language? }` | SSE `{ delta }`, final `{ suggestionId }` | `AiSuggestionCreated`, `TokenUsageRecordedRequested` |
| POST | `/v1/ai/suggestions/{suggestionId}/decision` | `{ decision: "accepted"|"rejected"|"regenerated" }` | `{ ok: true }` | `AiSuggestionAccepted` 또는 `AiSuggestionRejected` |
| POST | `/v1/ai/chat-threads` | `{ title?, modelId? }` | `{ threadId }` | `ChatThreadCreated` |
| POST | `/v1/ai/chat-threads/{threadId}/messages` | `{ message, noteScope?, modelId? }` | SSE `{ delta, citations? }` | `ChatMessageCreated`, `TokenUsageRecordedRequested` |
| GET | `/v1/ai/chat-threads/{threadId}` | 없음 | `{ thread, messages }` | 없음 |
| GET | `/v1/ai/models` | 없음 | `{ models, enabledModels, costInfo }` | 없음 |
| PUT | `/v1/ai/model-settings` | `{ defaultModelId, userApiKeys? }` | `{ settings }` | `AiModelSettingsChanged` |
| GET | `/v1/notes/{noteId}/summary` | 없음 | `{ summary, source: "ai"|"excerpt" }` | 없음 |
| POST | `/v1/ai/folder-organization-proposals` | `{ scope: "all"|"folder", folderId? }` | `{ proposalId, proposedFolders, proposedMoves }` | `AiSuggestionCreated` |
| POST | `/v1/ai/link-suggestions` | `{ noteId }` | `{ suggestions }` | `AiSuggestionCreated` |
| POST | `/v1/ai/clusters` | `{ scope, algorithmOptions? }` | `{ clusterJobId }` | `ClusterJobRequested` |
| GET | `/v1/ai/clusters/{clusterJobId}` | 없음 | `{ status, clusters }` | 없음 |
| POST | `/v1/ai/bridge-concepts` | `{ fromNoteId, toNoteId }` | `{ recommendations }` | `AiSuggestionCreated` |
| POST | `/v1/ai/insight-reports` | `{ scope, includeLearningRecommendations }` | `{ reportJobId }` | `InsightReportRequested` |
| GET | `/v1/ai/insight-reports/{reportId}` | 없음 | `{ report }` | 없음 |
| GET | `/v1/users/me/style-profile` | 없음 | `{ style, detectedFromNotesAt }` | 없음 |
| PUT | `/v1/users/me/style-profile` | `{ style }` | `{ style }` | `UserStyleProfileChanged` |

### 발행 이벤트

- `SemanticSearchPerformed`
- `EmbeddingUpdated`
- `NoteSummaryGenerated`
- `AiSuggestionCreated`
- `AiSuggestionAccepted`
- `AiSuggestionRejected`
- `ChatThreadCreated`
- `ChatMessageCreated`
- `AiModelSettingsChanged`
- `ClusterJobRequested`
- `ClusterGenerated`
- `InsightReportRequested`
- `InsightReportReady`
- `UserStyleProfileChanged`
- `TokenUsageRecordedRequested`

### 구독 이벤트

- `NoteCreated`
- `NoteContentSaved`
- `NoteDeleted`
- `NoteTagsChanged`
- `NoteLinkCreated`
- `NoteViewed`
- `SubscriptionChanged`
- `EntitlementChanged`
- `ConsentUpdated`

## 5. Commerce & Operations Service

### 도메인 책임

상업화, 토큰 사용량, 관리자 운영, 문의, 알림, 사용자 행동/통계 read model을 책임진다.

포함 기능:

- `7.2.1` 워드클라우드
- `7.3.1` 행동 패턴 분석
- `10.1` 관리자: 토큰 사용량 관리
- `11.1` 마이페이지 지식 성장 대시보드
- `12.1` 인덱스/랜딩 페이지 운영 설정
- `13.1` 결제 기능
- `13.2` 문의하기

클라이언트 책임:

- 플랜/결제 화면
- 토큰 사용량 화면
- 관리자 대시보드
- 문의하기 화면
- 개인 통계 차트
- 워드클라우드 렌더링
- 행동 가이드/툴팁 표시
- 랜딩 페이지 UI/SEO 구현

소유 데이터:

- `plans`
- `subscriptions`
- `payments`
- `invoices`
- `entitlements`
- `token_usage_ledger`
- `admin_users`
- `admin_roles`
- `support_tickets`
- `notification_templates`
- `notification_jobs`
- `delivery_logs`
- `user_events`
- `usage_metrics`
- `knowledge_metrics`
- `word_stats`
- `landing_page_config`

### API 계약

| Method | Path | 요청 | 응답 | 이벤트 |
|---|---|---|---|---|
| GET | `/v1/plans` | 없음 | `{ plans }` | 없음 |
| GET | `/v1/users/me/subscription` | 없음 | `{ plan, status, renewalAt, entitlements }` | 없음 |
| POST | `/v1/subscriptions/checkout-sessions` | `{ planId, successUrl, cancelUrl }` | `{ checkoutUrl }` | `CheckoutSessionCreated` |
| POST | `/v1/subscriptions/change` | `{ targetPlanId }` | `{ subscription }` | `SubscriptionChanged` |
| POST | `/v1/subscriptions/cancel` | `{ cancelAtPeriodEnd }` | `{ subscription }` | `SubscriptionChanged` |
| POST | `/v1/payments/webhooks/{provider}` | provider signed body | `{ ok: true }` | `PaymentSucceeded`, `PaymentFailed`, `InvoiceIssued` |
| POST | `/v1/entitlements/check` | `{ capability, quantity? }` | `{ allowed, reason?, remaining? }` | 없음 |
| POST | `/v1/token-usage` | `{ sourceService, featureId, modelId, inputTokens, outputTokens, cost }` | `{ ledgerId, remainingQuota }` | `TokenUsageRecorded` |
| GET | `/v1/users/me/token-usage` | query: `{ from, to, groupBy }` | `{ usage }` | 없음 |
| GET | `/v1/users/me/knowledge-dashboard` | query: `{ period }` | `{ noteCount, nodeCount, streak, trends, topLinkedNotes }` | 없음 |
| GET | `/v1/users/me/wordcloud` | query: `{ folderId?, from?, to? }` | `{ words }` | 없음 |
| POST | `/v1/events/client` | `{ eventName, properties, occurredAt }` | `{ ok: true }` | `ClientEventReceived` |
| GET | `/v1/users/me/guides` | 없음 | `{ guideTriggers }` | 없음 |
| PUT | `/v1/users/me/guides/{guideId}` | `{ dismissed: true }` | `{ ok: true }` | `GuideDismissed` |
| POST | `/v1/support/tickets` | `{ subject, body, attachments? }` | `{ ticketId }` | `SupportTicketCreated`, `NotificationRequested` |
| GET | `/v1/support/tickets` | 없음 | `{ tickets }` | 없음 |
| POST | `/v1/admin/users` | `{ email, role, temporaryPassword? }` | `{ adminUserId }` | `AdminUserCreated` |
| GET | `/v1/admin/token-usage` | query: `{ userId?, modelId?, from, to }` | `{ usage, cost }` | 없음 |
| GET | `/v1/admin/support/tickets` | query: `{ status? }` | `{ tickets }` | 없음 |
| POST | `/v1/admin/support/tickets/{ticketId}/replies` | `{ body, close? }` | `{ replyId }` | `SupportTicketReplied`, `NotificationRequested` |
| GET | `/v1/landing/config` | 없음 | `{ hero, demos, seo }` | 없음 |

### 발행 이벤트

- `CheckoutSessionCreated`
- `PaymentSucceeded`
- `PaymentFailed`
- `InvoiceIssued`
- `SubscriptionChanged`
- `EntitlementChanged`
- `TokenUsageRecorded`
- `ClientEventReceived`
- `KnowledgeMetricsUpdated`
- `WordStatsUpdated`
- `GuideTriggered`
- `SupportTicketCreated`
- `SupportTicketReplied`
- `NotificationRequested`
- `NotificationDelivered`
- `AdminUserCreated`

### 구독 이벤트

- `UserRegistered`
- `UserDeletionRequested`
- `ConsentUpdated`
- `NoteCreated`
- `NoteContentSaved`
- `NoteDeleted`
- `NoteViewed`
- `NoteLinkCreated`
- `SemanticSearchPerformed`
- `TokenUsageRecordedRequested`
- `InsightReportReady`
- `ExportJobCompleted`

## 주요 이벤트 계약

| 이벤트 | 발행 서비스 | 주요 구독 서비스 | payload 핵심 필드 |
|---|---|---|---|
| `UserRegistered` | Identity & Access | Commerce & Operations | `{ userId, email, registeredAt }` |
| `ConsentUpdated` | Identity & Access | Knowledge Intelligence, Commerce & Operations | `{ userId, consents, updatedAt }` |
| `UserDeletionRequested` | Identity & Access | 모든 서비스 | `{ userId, deletionScheduledAt }` |
| `NoteCreated` | Knowledge Workspace | Knowledge Intelligence, Commerce & Operations | `{ noteId, userId, title, folderId, createdAt }` |
| `NoteContentSaved` | Knowledge Workspace | Knowledge Intelligence, Content Ingestion, Commerce & Operations | `{ noteId, version, contentHash, changedAt }` |
| `NoteDeleted` | Knowledge Workspace | Knowledge Intelligence, Content Ingestion, Commerce & Operations | `{ noteId, deletedAt }` |
| `NoteViewed` | Knowledge Workspace | Commerce & Operations, Knowledge Intelligence | `{ noteId, userId, viewedAt }` |
| `NoteTagsChanged` | Knowledge Workspace | Knowledge Intelligence | `{ noteId, tagNames }` |
| `NoteLinkCreated` | Knowledge Workspace | Knowledge Intelligence, Commerce & Operations | `{ sourceNoteId, targetNoteId, linkType }` |
| `ShareLinkCreated` | Knowledge Workspace | Commerce & Operations | `{ shareId, noteId, permission, expiresAt }` |
| `AssetUploaded` | Content Ingestion & Publishing | Knowledge Workspace | `{ assetId, ownerUserId, targetNoteId, contentType, sizeBytes }` |
| `AssetConverted` | Content Ingestion & Publishing | Knowledge Workspace, Knowledge Intelligence | `{ assetId, resultAssetId, targetFormat, extractedTextHash }` |
| `ImportJobCompleted` | Content Ingestion & Publishing | Knowledge Workspace, Commerce & Operations | `{ importJobId, source, createdNotes, failedFiles }` |
| `ExportJobCompleted` | Content Ingestion & Publishing | Commerce & Operations | `{ exportJobId, noteId, format, downloadAssetId }` |
| `ExternalSyncConflictDetected` | Content Ingestion & Publishing | Knowledge Workspace | `{ integrationAccountId, sourceId, noteId, conflictType }` |
| `EmbeddingUpdated` | Knowledge Intelligence | 없음 또는 read model | `{ noteId, embeddingVersion, vectorStoreRef }` |
| `NoteSummaryGenerated` | Knowledge Intelligence | Knowledge Workspace | `{ noteId, summary, sourceVersion }` |
| `AiSuggestionCreated` | Knowledge Intelligence | Commerce & Operations | `{ suggestionId, featureId, noteId?, status: "pending" }` |
| `AiSuggestionAccepted` | Knowledge Intelligence | Knowledge Workspace | `{ suggestionId, actionType, approvedByUserId }` |
| `InsightReportReady` | Knowledge Intelligence | Commerce & Operations | `{ reportId, userId, scope, completedAt }` |
| `TokenUsageRecordedRequested` | Knowledge Intelligence | Commerce & Operations | `{ userId, featureId, modelId, inputTokens, outputTokens }` |
| `TokenUsageRecorded` | Commerce & Operations | Knowledge Intelligence | `{ ledgerId, userId, remainingQuota }` |
| `SubscriptionChanged` | Commerce & Operations | Knowledge Intelligence, Content Ingestion | `{ userId, planId, entitlements }` |
| `NotificationRequested` | Commerce & Operations | Commerce & Operations 내부 worker | `{ templateId, channel, recipientUserId, data }` |

## 핵심 흐름

### 노트 자동 저장

1. Client가 IndexedDB에 먼저 저장한다.
2. Client가 `PUT /v1/notes/{noteId}/content`를 호출한다.
3. Knowledge Workspace가 version conflict를 검사하고 저장한다.
4. Knowledge Workspace가 `NoteContentSaved`를 발행한다.
5. Knowledge Intelligence가 요약/임베딩 갱신 작업을 수행한다.
6. Commerce & Operations가 사용량/스트릭/지표 read model을 갱신한다.

### 키워드 검색

1. Client가 `/v1/workspace/sync`로 자기 노트/폴더/태그 변경분을 동기화한다.
2. Client가 IndexedDB 또는 로컬 검색 라이브러리로 제목/본문/태그 인덱스를 만든다.
3. 검색 입력 300ms debounce 후 클라이언트에서 필터/하이라이트/정렬을 처리한다.
4. 시맨틱 검색 ON이면 `POST /v1/intelligence/semantic-search`를 추가 호출한다.

### RAG 챗봇

1. Client가 `POST /v1/ai/chat-threads/{threadId}/messages`를 호출한다.
2. Knowledge Intelligence가 `POST /v1/entitlements/check`로 사용 가능 여부를 확인한다.
3. Knowledge Intelligence가 벡터 검색으로 후보 노트를 찾는다.
4. 필요한 원문은 Knowledge Workspace API로 조회한다.
5. LLM 응답을 SSE로 스트리밍한다.
6. Knowledge Intelligence가 `TokenUsageRecordedRequested`를 발행한다.
7. Commerce & Operations가 토큰 원장을 기록한다.

### 파일 업로드/변환

1. Client가 `POST /v1/assets/upload-sessions`를 호출한다.
2. Client가 object storage에 직접 업로드한다.
3. Client가 `POST /v1/assets/upload-sessions/{id}/complete`를 호출한다.
4. Content Ingestion이 `AssetUploaded`, 필요 시 `ConversionJobRequested`를 발행한다.
5. 변환 완료 후 `AssetConverted`를 발행한다.
6. Knowledge Workspace가 새 노트 생성 또는 기존 노트 첨부로 반영한다.

## 기능 커버리지 매트릭스

| 기능 ID | 기능명 | 클라이언트 책임 | 백엔드 도메인 | API / 이벤트 |
|---|---|---|---|---|
| `1.1.1` | 이메일 회원가입 | 가입 폼, 인증 코드 입력, 비밀번호 검증 UI | Identity & Access | `/auth/email-verifications`, `/auth/email-signups`, `UserRegistered` |
| `1.2.1` | 소셜 로그인 (카카오/구글/애플) | OAuth 버튼, 계정 연결 안내 팝업 | Identity & Access | `/auth/oauth/{provider}/authorize`, `/auth/oauth/{provider}/callback`, `OAuthAccountLinked` |
| `1.3.1` | 온보딩 정보 수집 | 닉네임/프로필/동의 화면 | Identity & Access | `/users/me/profile`, `/users/me/consents`, `UserProfileUpdated`, `ConsentUpdated` |
| `2.1.1` | 키워드 검색 (클라이언트 구현 ) | 로컬 인덱스, debounce, 하이라이트, 필터, 정렬 | Knowledge Workspace는 sync 제공 | `/workspace/sync`; 서버 검색 API는 MVP 제외 |
| `2.1.2` | 시맨틱 검색 (검색창에 같이 나와) (챗봇) | ON/OFF 토글, 결과 구분 표시 | Knowledge Intelligence | `/intelligence/semantic-search`, `SemanticSearchPerformed`, `TokenUsageRecordedRequested` |
| `2.2.1` | 즐겨찾기 및 최근 활동 | 홈 섹션 UI, 로컬 캐시 | Knowledge Workspace | `/favorites/{targetType}/{targetId}`, `/recent-activities`, `FavoriteChanged`, `NoteViewed` |
| `2.3.1` | Notion 가져오기 / 동기화 | OAuth 연결/진행률/충돌 선택 UI | Content Ingestion & Publishing | `/imports/notion/*`, `ImportJobCompleted`, `ExternalSyncConflictDetected` |
| `2.3.2` | Obsidian Vault 가져오기 | zip/folder 업로드 UI, 실패 목록 표시 | Content Ingestion & Publishing | `/imports/obsidian/jobs`, `ImportJobCompleted` |
| `3.1.1` | 마크다운 기반 문서 편집 | 에디터, 렌더링, 슬래시 명령, 모바일 터치 | Knowledge Workspace | `/notes`, `/notes/{id}`, `/notes/{id}/content` |
| `3.2.1` | 자동 저장 | IndexedDB 선저장, 상태 표시, 재시도 | Knowledge Workspace | `/notes/{id}/content`, `NoteContentSaved` |
| `3.3.1` | 파일 첨부 및 업로드 | 드래그앤드롭, 붙여넣기, 진행률, 미리보기 | Content Ingestion & Publishing | `/assets/upload-sessions`, `AssetUploaded`, `AssetConverted` |
| `3.3.2` | 파일 변환 방식 선택 | 업로드 후 선택 모달, 기본값 설정 UI | Content Ingestion & Publishing | `/conversions`, `ConversionJobRequested`, `AssetConverted` |
| `3.4.1` | 문서 내 목차 자동 생성 | H1/H2/H3 파싱, 앵커 이동, 모바일 오버레이 | 클라이언트 중심, 원본은 Knowledge Workspace | `/notes/{id}` |
| `3.5.1` | AI 글 작성 / 요약 보조 (인라인 챗) | 선택 텍스트 팝업, 인라인 챗, 수락/거절 UI | Knowledge Intelligence | `/ai/inline-assists`, `/ai/suggestions/{id}/decision`, `AiSuggestionCreated` |
| `3.6.1` | 웹: 문서 공유 및 내보내기 | 공유/권한 UI, export 요청 UI | 공유는 Knowledge Workspace, export는 Content Ingestion, 유료 기간은 Commerce | `/share-links`, `/exports`, `/entitlements/check` |
| `3.6.2` | 앱: 문서 내보내기 | 로컬 저장 위치 선택 | Content Ingestion & Publishing | `/exports`, `ExportJobCompleted` |
| `3.7.1` | 블로그 템플릿 제공 | 템플릿 선택/복사/업로드 UI | Content Ingestion & Publishing | `/blog-templates`, `/publish-jobs`, `PublishJobCompleted` |
| `4.1.1` | 폴더 생성·수정·삭제 및 노트 이동 | 폴더 트리, 드래그앤드롭, 일괄 선택 UI | Knowledge Workspace | `/folders`, `/folders/{id}`, `/notes/{id}/metadata`, `FolderChanged` |
| `4.1.2` | AI 기반 자동 폴더 정리 | 제안 미리보기, 수락/거절/Undo UI | 제안은 Knowledge Intelligence, 적용은 Knowledge Workspace | `/ai/folder-organization-proposals`, `AiSuggestionAccepted` |
| `4.2.1` | 태그 시스템 | 태그 입력/자동완성/AND OR 필터 UI | Knowledge Workspace | `/tags/suggestions`, `/notes/{id}/tags`, `NoteTagsChanged` |
| `4.3.1` | 노트 연결 및 백링크 (AI 포함) | `[[ ]]` 자동완성, 백링크 사이드바, AI 제안 승인 UI | 수동 링크는 Knowledge Workspace, AI 제안은 Knowledge Intelligence | `/notes/{id}/links`, `/notes/{id}/backlinks`, `/ai/link-suggestions` |
| `5.1.1` | RAG 기반 문서 챗봇 | 챗봇 UI, 출처 링크 클릭 | Knowledge Intelligence | `/ai/chat-threads`, `/ai/chat-threads/{id}/messages`, `ChatMessageCreated` |
| `5.2.1` | 다중 LLM 지원 | 모델 선택, API 키 입력 UI | Knowledge Intelligence + Commerce | `/ai/models`, `/ai/model-settings`, `/entitlements/check` |
| `5.3.1` | AI 유사 노트 추천 | 추천 카드, 세션별 숨김 | Knowledge Intelligence | `/ai/chat-threads/{id}/messages`, `AiSuggestionCreated` |
| `5.4.1` | 크롬 확장 프로그램 | 확장 UI, 로그인 유지, 저장 후 열기 | Content Ingestion & Publishing | `/extension/captures`, `CaptureReceived` |
| `5.5.1 제안` | MCP 서버 | 외부 agent 연결 설정 UI | Content Ingestion & Publishing | `/api-clients`, `/mcp/tools`, `/mcp/tool-calls`, `ExternalToolCalled` |
| `6.1.1` | 2D 마인드맵 | Cytoscape/d3 렌더링, 노드 드래그/줌 | Knowledge Workspace | `/graph`, `/graph/layouts/{id}`, `GraphLayoutSaved` |
| `6.2.1` | 노드 마우스오버 요약 | 500ms hover 팝업, fallback 표시 | Knowledge Intelligence | `/notes/{id}/summary`, `NoteSummaryGenerated` |
| `6.3.2` | AI 클러스터링 | 클러스터 필터/수동 해제 UI | Knowledge Intelligence | `/ai/clusters`, `ClusterGenerated` |
| `6.3.3` | 징검다리 개념 추천 | 두 노드 선택, 추천 표시/수락 UI | Knowledge Intelligence | `/ai/bridge-concepts`, `AiSuggestionCreated` |
| `6.4.1` | 시간별 필터링 (노드 흐리기) | 슬라이더, 노드 투명도 렌더링 | Knowledge Workspace + Commerce event data | `/graph`, `NoteViewed` |
| `6.5.1` | 3D 우주 탐사 모드 | Three.js 렌더링, 품질 옵션 | Knowledge Workspace | `/graph` |
| `6.6.1` | 타임랩스 애니메이션 | 재생 속도, MP4/GIF export UI | Knowledge Workspace + Content Ingestion export | `/graph`, `/exports` |
| `7.1.1` | AI 인사이트 및 학습 공백 탐지 (브레인스토밍으로 사용) | 리포트 카드 UI, 알림 표시 | Knowledge Intelligence + Commerce Notification | `/ai/insight-reports`, `InsightReportReady`, `NotificationRequested` |
| `7.2.1` | 워드클라우드 | 워드클라우드 렌더링, 단어 클릭 필터 | Commerce & Operations | `/users/me/wordcloud`, `WordStatsUpdated` |
| `7.3.1` | 행동 패턴 분석 (UI 가이드) | 툴팁/하이라이트/다시 안 보기 UI | Commerce & Operations | `/events/client`, `/users/me/guides`, `GuideTriggered` |
| `7.4.1` | 문체 지정 | 문체 선택 UI | Knowledge Intelligence | `/users/me/style-profile`, `UserStyleProfileChanged` |
| `8.2.1` | 계정 및 보안 | 계정 설정 화면 | Identity & Access | `/users/me/password`, `/users/me/2fa/email`, `/users/me/deletion-request` |
| `9.1.1` | 웹 앱 | PWA, 오프라인, 반응형 UI | 백엔드 공통 API 사용 | `/workspace/sync`, 각 도메인 API |
| `9.2.1` | PC 앱 (Electron) | Electron, 로컬 파일 접근, 트레이, 단축키 | 백엔드 공통 API + Content API | `/workspace/sync`, `/assets/*`, `/exports` |
| `10.1` | 관리자: 토큰 사용량 관리 | 관리자 대시보드 | Commerce & Operations | `/admin/token-usage`, `/admin/users`, `/token-usage` |
| `11.1` | 마이페이지: 지식 성장 대시보드 (사용자 개인 통계) | 개인 통계 차트, 프로필 수정 UI | Commerce & Operations + Identity | `/users/me/knowledge-dashboard`, `/users/me/profile`, `/users/me/token-usage` |
| `12.1` | 인덱스(랜딩) 페이지 | 랜딩 UI, SEO, 데모 애니메이션 | Commerce & Operations는 랜딩 설정만 선택적 소유 | `/landing/config` |
| `13.1` | 결제 기능 | 플랜/결제/구독 관리 UI | Commerce & Operations | `/plans`, `/subscriptions/*`, `/payments/webhooks/{provider}` |
| `13.2` | 문의하기 | 문의 작성/내역 UI | Commerce & Operations | `/support/tickets`, `SupportTicketCreated`, `NotificationRequested` |
| `14.1` | 사용자 정보 수집 동의 (보안) | 동의 UI, 철회 UI | Identity & Access | `/users/me/consents`, `ConsentUpdated` |

## 설계 검증 및 개선점

### 1. 키워드 검색을 서버 서비스로 분리하는 것은 현재 요구에는 과하다

원문에는 `2.1.1 키워드 검색`이 클라이언트 구현이라고 명시되어 있다. 사용자가 자기 노트만 검색한다면 서버 전문 검색 서비스는 MVP에서 필요하지 않다.

개선안:

- P0 키워드 검색은 클라이언트 로컬 인덱스에서 처리한다.
- 서버는 `/workspace/sync`로 검색 가능한 자기 노트 데이터를 제공한다.
- 서버 검색은 시맨틱 검색, RAG, 팀/공유 문서 검색이 필요해질 때 분리한다.

### 2. `Knowledge Intelligence`는 5개 제한 때문에 넓다

시맨틱 검색, RAG, AI 글쓰기, 추천, 클러스터링, 인사이트가 모두 묶여 있다. 도메인상 "지식 지능"으로 묶을 수는 있지만, 트래픽과 비용이 커지면 변경 속도가 달라진다.

분리 후보:

- `AI Orchestration Service`: LLM 호출, 프롬프트, 스트리밍
- `Vector Retrieval Service`: 임베딩, 벡터 검색, RAG retrieval
- `Insight Service`: 리포트, 클러스터링, 추천 배치

### 3. `Commerce & Operations`도 넓다

결제, 관리자, 문의, 알림, 행동 분석, 워드클라우드를 한 서비스에 묶었다. 5개 제한에서는 현실적인 선택이지만 장기적으로는 관심사가 섞인다.

분리 후보:

- `Billing & Metering`: 결제, 구독, 토큰 원장
- `Analytics`: 이벤트 수집, 개인 통계, 워드클라우드
- `Notification`: 이메일/푸시/알림 템플릿
- `Support/Admin`: 문의, 운영자 권한, 감사 로그

### 4. `MCP 서버` 기능은 명세 보완이 필요하다

원문에 기능 ID, 우선순위, 유형이 없다. 외부 agent가 BrainX API를 사용하게 하는 기능이라면 보안 영향이 크다.

개선안:

- 기능 ID를 `5.5.1 MCP/API 접근`으로 부여한다.
- 우선순위는 `P2` 또는 `P1` 중 제품 전략에 따라 결정한다.
- OAuth client credentials 또는 scoped API key 기반으로 설계한다.
- scope 예: `notes:read`, `notes:write`, `assets:write`, `ai:chat`, `graph:read`.
- 모든 tool call은 감사 로그를 남긴다.

### 5. 소셜 로그인 제공자 명세가 불일치한다

기능명은 `카카오/구글/애플`인데 상세 설명에는 `카카오·구글·네이버 OAuth`라고 되어 있다.

개선안:

- MVP provider를 명확히 정한다.
- 한국 서비스라면 `카카오`, `구글`, `네이버`를 우선하고 Apple은 iOS 앱 출시 시 필수 여부를 검토한다.

### 6. Notion 양방향 동기화는 P1 치고 구현 난도가 높다

Import, Fork, 양방향 동기화가 한 기능에 섞여 있다. 양방향 동기화는 충돌 처리, rate limit, 블록 타입 mapping 때문에 별도 프로젝트 수준이다.

개선안:

- MVP: Import와 Fork만 지원
- P1 후반: 단방향 재동기화
- P2: 양방향 동기화와 수동 충돌 해결

### 7. AI 제안은 자동 적용하면 안 된다

원문에도 AI 연결 제안은 사용자 승인 없이 자동 생성하지 않는다고 되어 있다. AI 폴더 정리, 링크 제안, 징검다리 추천 모두 같은 정책을 적용해야 한다.

개선안:

- AI는 `AiSuggestionCreated`까지만 발행한다.
- Workspace 변경은 사용자의 `accepted` 이벤트 이후에만 수행한다.
- Undo 가능한 command log를 남긴다.

### 8. 토큰 과금 원장은 AI 서비스가 소유하면 안 된다

AI 기능이 토큰을 쓰지만 결제/정산/권한은 Commerce 도메인의 책임이다.

개선안:

- Knowledge Intelligence는 `TokenUsageRecordedRequested`만 발행한다.
- Commerce & Operations가 `token_usage_ledger`를 소유한다.
- 응답 전 quota check는 동기 API(`/entitlements/check`)로 수행한다.

### 9. 행동 분석은 동의 상태를 반드시 따라야 한다

온보딩과 보안 기능에 행동 데이터 수집 동의가 있다. 행동 패턴 분석과 사용 이벤트 수집은 이 동의와 직접 연결되어야 한다.

개선안:

- Commerce & Operations는 `ConsentUpdated`를 구독한다.
- 선택 동의가 꺼진 사용자는 개인화 행동 분석 이벤트를 저장하지 않거나 비식별 집계만 한다.
- 회원 탈퇴 유예 만료 시 이벤트/AI 캐시/파일도 삭제 대상에 포함한다.

### 10. 공유 링크와 유료 정책은 두 도메인이 함께 필요하다

공유 링크 자체는 노트 접근 권한이므로 Knowledge Workspace가 소유한다. 하지만 7일/30일/무제한 만료 정책은 플랜 권한이다.

개선안:

- 공유 생성 전 Commerce의 `/entitlements/check`를 호출한다.
- 공유 링크 원장은 Knowledge Workspace가 소유한다.
- public read와 login-required edit 권한을 명확히 분리한다.

## 구현 순서 권장

1. `Identity & Access` + `Knowledge Workspace`부터 구현한다.
2. P0 키워드 검색은 클라이언트 로컬 인덱스로 구현한다.
3. 파일 업로드가 붙는 시점에 `Content Ingestion & Publishing`을 추가한다.
4. 시맨틱 검색/RAG/AI 글쓰기를 시작할 때 `Knowledge Intelligence`를 붙인다.
5. 유료 시맨틱 검색 또는 LLM 토큰 제한이 들어가는 순간 `Commerce & Operations`의 entitlement/token ledger를 먼저 만든다.
