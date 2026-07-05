# Workspace API Mapping

> BrainX Workspace API 및 구현 매핑 문서
>
> Version: 1.0
>
> Status: Draft

---

# 1. 목적

본 문서는 Workspace 기능 구현 시

- 어떤 API가 필요한지
- 어느 서비스가 담당하는지
- 어떤 Ticket에서 구현되는지
- 어떤 파일을 수정해야 하는지

를 정리한 문서입니다.

Architecture와 Policies 문서를 기반으로 실제 구현을 연결하는 역할을 합니다.

---

# 2. 담당 서비스

| 기능               | 담당 서비스          |
| ------------------ | -------------------- |
| Workspace CRUD     | Workspace-Service    |
| Note               | Workspace-Service    |
| Folder             | Workspace-Service    |
| Guest Claim        | Workspace-Service    |
| Workspace Context  | brainx-next          |
| Workspace Selector | brainx-next          |
| AI                 | Intelligence-Service |
| Workspace SSOT     | contracts-v2         |

---

# 3. API 목록

## Workspace 목록 조회

```
GET /api/v1/workspaces
```

### 목적

현재 사용자의 Workspace 목록 조회

### Response

- Workspace ID(documentGroupId)
- Name
- isDefault
- createdAt
- updatedAt

### 담당

Workspace-Service

### Ticket

Ticket5

---

## Workspace 생성

```
POST /api/v1/workspaces
```

### Request

```json
{
  "name": "Project A"
}
```

### 담당

Workspace-Service

### Ticket

Ticket5

---

## Workspace 이름 변경

```
PATCH /api/v1/workspaces/{documentGroupId}
```

### Request

```json
{
  "name": "New Workspace"
}
```

### 담당

Workspace-Service

### Ticket

Ticket5

---

## Workspace Sync

```
GET /api/v1/workspaces/{documentGroupId}/sync
```

### 목적

Workspace 전체 동기화

### Ticket

Ticket6

---

## Note Workspace 이동

```
PATCH /api/v1/notes/{noteId}/metadata
```

### Request

```json
{
  "documentGroupId": "..."
}
```

### 규칙

이동 후

```
folderId = null
```

### 담당

Workspace-Service

### Ticket

Ticket10

---

# 4. DTO 변경

Workspace DTO

```
WorkspaceResponse

WorkspaceSummary

WorkspaceListResponse
```

---

Note DTO

추가

```
documentGroupId
```

---

Folder DTO

추가

```
documentGroupId
```

---

Snapshot DTO

추가

```
documentGroupId
```

---

# 5. Frontend Mapping

## Context

WorkspaceContext

관리

```
currentWorkspaceId
```

---

## API

workspace-api.ts

추가

```
listWorkspaces()

createWorkspace()

renameWorkspace()
```

---

## Notes

NotesWorkspace.tsx

수정

- Workspace 변경
- Workspace 생성
- Welcome Board 초기화

---

## Home

Workspace Selector

추가

- Workspace 생성
- Workspace 선택

---

## AI

RightSidebar.tsx

"default"

↓

currentWorkspaceId

---

# 6. Backend Mapping

Workspace-Service

수정

```
WorkspaceController

WorkspaceService

WorkspaceDtos

WorkspaceRepository

Workspace Entity
```

---

Note

수정

```
Note Entity

NoteRepository

NoteService
```

---

Folder

수정

```
Folder Entity

FolderRepository

FolderService
```

---

Guest Claim

수정

```
NoteDraftPersistenceService
```

---

Internal API

수정

```
InternalWorkspaceController
```

---

# 7. Intelligence Mapping

수정

```
documentGroupId
```

현재 Workspace 기준 사용

"default"

사용 금지

---

# 8. Ticket Mapping

| Ticket   | API               |
| -------- | ----------------- |
| Ticket5  | Workspace CRUD    |
| Ticket6  | DTO               |
| Ticket7  | Validation        |
| Ticket8  | Duplicate Check   |
| Ticket9  | Guest Claim       |
| Ticket10 | Note Move         |
| Ticket11 | Context           |
| Ticket12 | Workspace 생성 UI |
| Ticket13 | Home              |
| Ticket14 | Notes             |
| Ticket15 | Login             |
| Ticket16 | AI                |
