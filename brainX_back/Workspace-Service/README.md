# Workspace-Service

Workspace-Service is the authoritative ledger for BrainX notes, folders, links, favorites, share links, graph layout data, and workspace synchronization.

## Contract Source

The service follows the SSOT files in `contracts-v2`.

- REST public/internal API: `contracts-v2/brainx-openapi.ssot.yaml`
- Domain/integration events: `contracts-v2/brainx-asyncapi.ssot.yaml`

Public clients call only `/api/v1/**`. Service-to-service callers use `/internal/v1/**` with `X-Service-Token`.

## MVC Package Structure

```text
src/main/java/com/brainx/workspace
├─ controller   # OpenAPI path/method boundary
├─ service      # Workspace use cases and transaction boundary
├─ repository   # JPA repositories owned by Workspace-Service
├─ entity       # Workspace ledger persistence model
├─ dto          # SSOT request/response DTOs
├─ event        # AsyncAPI event envelope/outbox publication
├─ security     # Bearer JWT and internal service-token auth
├─ exception    # SSOT-style error response handling
└─ config       # Spring configuration
```

## Ownership Boundary

Workspace-Service owns:

- Notes: title, markdown, tags, folder membership, version, view state, trash/permanent delete.
- Folders: folder tree commands and folder metadata.
- Links/backlinks: manual note-to-note links and graph edge source data.
- Favorites: note/folder favorite state.
- Graph read model: REST graph response derived from Workspace-owned notes and links.
- Graph layouts: user-saved graph node positions.
- Share links: note share-link lifecycle and public shared note reads.
- Internal note commands: bulk note creation, note snapshots, and content patches from other services.

Workspace-Service does not own:

- User identity, authentication, profile, onboarding, or consent.
- AI summaries, embeddings, semantic search, RAG, or model calls.
- File conversion, asset upload sessions, imports, exports, or external integrations.
- Billing, entitlements, plans, or payments.

## Implemented REST Surface

Public API:

- `GET /api/v1/workspace/sync`
- `POST /api/v1/notes`
- `GET /api/v1/notes`
- `GET /api/v1/notes/{noteId}`
- `DELETE /api/v1/notes/{noteId}`
- `PUT /api/v1/notes/{noteId}/content`
- `GET /api/v1/notes/drafts/list`
- `POST /api/v1/notes/draft-ids`
- `GET /api/v1/notes/{noteId}/draft`
- `PUT /api/v1/notes/{noteId}/draft`
- `PATCH /api/v1/notes/{noteId}/metadata`
- `GET /api/v1/notes/{noteId}/versions`
- `POST /api/v1/notes/{noteId}/versions/{versionId}/restore`
- `POST /api/v1/notes/{noteId}/views`
- `GET /api/v1/recent-activities`
- `POST /api/v1/folders`
- `GET /api/v1/folders/tree`
- `PATCH /api/v1/folders/{folderId}`
- `DELETE /api/v1/folders/{folderId}`
- `GET /api/v1/tags/suggestions`
- `PUT /api/v1/notes/{noteId}/tags`
- `PUT /api/v1/favorites/{targetType}/{targetId}`
- `POST /api/v1/notes/{noteId}/links`
- `DELETE /api/v1/notes/{noteId}/links/{linkId}`
- `GET /api/v1/notes/{noteId}/backlinks`
- `GET /api/v1/graph`
- `PUT /api/v1/graph/layouts/{layoutId}`
- `POST /api/v1/share-links`
- `GET /api/v1/share-links/{shareId}`
- `PATCH /api/v1/share-links/{shareId}`

Internal API:

- `POST /internal/v1/workspace/notes/bulk-create`
- `GET /internal/v1/workspace/notes/{noteId}/snapshot`
- `POST /internal/v1/workspace/notes/{noteId}/content-patches`

## Event Boundary

Commands write an outbox row and publish an in-process `WorkspaceEvent`. The channel names match AsyncAPI so a Kafka adapter can later forward the outbox records without changing service use cases.

Published event types include:

- `NoteCreated`
- `NoteContentSaved`
- `NoteMetadataChanged`
- `NoteTrashed`
- `NoteDeleted`
- `NoteViewed`
- `FolderCreated`
- `FolderChanged`
- `FolderDeleted`
- `NotesMoved`
- `NoteTagsChanged`
- `FavoriteChanged`
- `NoteLinkCreated`
- `NoteLinkDeleted`
- `GraphLayoutSaved`
- `ShareLinkCreated`
- `ShareLinkChanged`

## Version Conflict Rule

`PUT /api/v1/notes/{noteId}/content` requires `baseVersion`. If the client base version differs from the server version, the service returns `409 NOTE_VERSION_CONFLICT` with `serverVersion` and `clientBaseVersion`.

`POST /api/v1/notes/draft-ids` issues a noteId for a new-note autosave flow without inserting a PostgreSQL note row. `PUT /api/v1/notes/{noteId}/draft` stores autosave title and content in Redis only, `GET /api/v1/notes/{noteId}/draft` reads that Redis draft back for restore flows, and `GET /api/v1/notes/drafts/list` lists the current actor's Redis-only drafts so a new note can reappear after refresh. `POST /api/v1/notes/drafts/claim` moves the current guest's Redis drafts into the logged-in USER's PostgreSQL notes, then deletes the claimed guest draft keys. The draft list path stays under `/api/v1/notes/**` for Gateway routing but avoids colliding with `GET /api/v1/notes/{noteId}`. Draft keys are separated by `actorType + actorId`: `workspace:note:draft:user:{userId}:{noteId}` for members and `workspace:note:draft:guest:{guestId}:{noteId}` for guests. The dirty set keys `workspace:note:dirty:user:{userId}` and `workspace:note:dirty:guest:{guestId}` track note IDs that have pending Redis drafts. If no Redis draft exists for the current actor and note, the read endpoint returns `200` with `data: null`.

Guests can use Redis draft autosave, but PostgreSQL note creation/content/metadata save is blocked with `403 GUEST_POSTGRES_SAVE_FORBIDDEN`. Guest draft content is persisted to PostgreSQL only through the signup/login claim flow. Gateway must forward `X-Guest-Id` from the `brainx_guest_id` cookie even when the request also has a valid JWT, so Workspace-Service can know both the USER actor and the guest draft owner.

Autosave timing policy:

- Frontend Redis draft debounce: 1.5 seconds after typing stops.
- PostgreSQL flush scan interval: `WORKSPACE_DRAFT_FLUSH_INTERVAL_SECONDS=30`.
- PostgreSQL flush idle threshold: `WORKSPACE_DRAFT_FLUSH_IDLE_SECONDS=10`.

Only USER drafts are flushed by the scheduler. GUEST drafts remain Redis-only until they are claimed after signup/login.

## Local Docker

The service can run from the root backend compose file:

```powershell
cd C:\Edu\Final\BrainX
Copy-Item .\brainX_back\.env.example .\brainX_back\.env
Copy-Item .\brainX_back\env\workspace-service.env.example .\brainX_back\env\workspace-service.env
.\run.ps1
```

`brainX_back/.env` contains shared backend settings such as PostgreSQL, Redis, JWT, and service-token values. `env/workspace-service.env` contains Workspace-only settings such as `WORKSPACE_DRAFT_TTL_SECONDS`. In Docker Compose, app containers override `REDIS_HOST` to the internal service name `redis`.
