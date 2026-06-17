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
- `GET /api/v1/notes/{noteId}`
- `DELETE /api/v1/notes/{noteId}`
- `PUT /api/v1/notes/{noteId}/content`
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
