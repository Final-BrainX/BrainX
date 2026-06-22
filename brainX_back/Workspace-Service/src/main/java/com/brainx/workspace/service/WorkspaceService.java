package com.brainx.workspace.service;

import com.brainx.workspace.dto.WorkspaceDtos.*;
import com.brainx.workspace.entity.*;
import com.brainx.workspace.event.WorkspaceEventPublisher;
import com.brainx.workspace.exception.WorkspaceException;
import com.brainx.workspace.repository.*;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.time.temporal.ChronoUnit;
import java.util.*;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
@Transactional
public class WorkspaceService {
    private final NoteRepository noteRepository;
    private final NoteVersionRepository noteVersionRepository;
    private final FolderRepository folderRepository;
    private final NoteLinkRepository noteLinkRepository;
    private final FavoriteRepository favoriteRepository;
    private final RecentActivityRepository recentActivityRepository;
    private final GraphLayoutRepository graphLayoutRepository;
    private final ShareLinkRepository shareLinkRepository;
    private final WorkspaceEventPublisher eventPublisher;
    private final ObjectMapper objectMapper;

    @Value("${brainx.public-base-url}")
    private String publicBaseUrl;

    @Transactional(readOnly = true)
    public WorkspaceSyncData syncWorkspace(String userId, String cursor, boolean includeDeleted) {
        List<Note> notes = includeDeleted
                ? noteRepository.findByUserIdOrderByUpdatedAtDesc(userId)
                : noteRepository.findByUserIdAndDeletedFalseOrderByUpdatedAtDesc(userId);
        return new WorkspaceSyncData(
                String.valueOf(Instant.now().toEpochMilli()),
                notes.stream().map(this::noteMap).toList(),
                folderRepository.findByUserIdOrderByNameAsc(userId).stream().map(this::folderMap).toList(),
                tagSuggestions(userId, "").tags().stream().map(tag -> Map.<String, Object>of(
                        "tagId", tag.tagId(),
                        "name", tag.name(),
                        "usageCount", tag.usageCount()
                )).toList(),
                noteLinkRepository.findByUserId(userId).stream().map(this::linkMap).toList(),
                favoriteRepository.findByUserId(userId).stream().map(this::favoriteMap).toList(),
                recentActivities(userId, 20).items().stream().map(item -> Map.<String, Object>of(
                        "noteId", item.noteId(),
                        "title", item.title(),
                        "activityType", item.activityType(),
                        "activityAt", item.activityAt()
                )).toList()
        );
    }

    @Transactional(readOnly = true)
    public NoteListData listNotes(String userId, String folderId, String tag, String q, boolean includeDeleted) {
        String query = q == null ? null : q.trim().toLowerCase(Locale.ROOT);
        List<Map<String, Object>> notes = (includeDeleted
                ? noteRepository.findByUserIdOrderByUpdatedAtDesc(userId)
                : noteRepository.findByUserIdAndDeletedFalseOrderByUpdatedAtDesc(userId)).stream()
                .filter(note -> folderId == null || Objects.equals(folderId, note.getFolderId()))
                .filter(note -> tag == null || note.getTags().contains(tag))
                .filter(note -> query == null || query.isBlank()
                        || note.getTitle().toLowerCase(Locale.ROOT).contains(query)
                        || note.getMarkdown().toLowerCase(Locale.ROOT).contains(query)
                        || note.getTags().stream().anyMatch(noteTag -> noteTag.toLowerCase(Locale.ROOT).contains(query)))
                .map(this::noteMap)
                .toList();
        return new NoteListData(notes, notes.size());
    }

    public NoteCreatedData createNote(String userId, NoteCreateRequest request) {
        Instant now = Instant.now();
        Note note = new Note(Ids.note(), userId, request.title(), request.markdown(), request.folderId(), request.tags(), now);
        noteRepository.save(note);
        snapshot(note, now);
        activity(userId, note, "created", now);
        eventPublisher.publish("NoteCreated", userId, payload(
                "noteId", note.getNoteId(),
                "userId", userId,
                "title", note.getTitle(),
                "folderId", note.getFolderId(),
                "tags", note.getTags(),
                "version", note.getVersion()
        ));
        return new NoteCreatedData(note.getNoteId(), note.getTitle(), note.getFolderId(), note.getVersion(), note.getCreatedAt());
    }

    @Transactional(readOnly = true)
    public NoteDetailData getNote(String userId, String noteId) {
        Note note = note(userId, noteId);
        FolderRef folder = folderRef(userId, note.getFolderId());
        // tags는 지연 로딩 컬렉션이라 트랜잭션 안에서 복사해 둬야 세션이 닫힌 뒤 직렬화할 때
        // LazyInitializationException이 나지 않는다.
        List<String> tags = new ArrayList<>(note.getTags());
        return new NoteDetailData(note.getNoteId(), note.getTitle(), note.getMarkdown(), folder, tags, note.getVersion(),
                note.getCreatedAt(), note.getUpdatedAt(), new Permissions(true, true), typography(note));
    }

    public DeleteNoteData deleteNote(String userId, String noteId, String mode) {
        if (!"trash".equalsIgnoreCase(mode) && !"permanent".equalsIgnoreCase(mode)) {
            throw new WorkspaceException(HttpStatus.BAD_REQUEST, "INVALID_DELETE_MODE", "Delete mode must be trash or permanent.");
        }
        Note note = note(userId, noteId);
        Instant now = Instant.now();
        if ("permanent".equalsIgnoreCase(mode)) {
            noteRepository.delete(note);
            eventPublisher.publish("NoteDeleted", userId, Map.of("noteId", noteId, "userId", userId, "deletedAt", now, "permanent", true));
            return new DeleteNoteData(noteId, now, null);
        }
        note.trash(now);
        eventPublisher.publish("NoteTrashed", userId, Map.of(
                "noteId", noteId,
                "userId", userId,
                "deletedAt", now,
                "purgeAt", now.plus(30, ChronoUnit.DAYS)
        ));
        return new DeleteNoteData(noteId, now, now.plus(30, ChronoUnit.DAYS));
    }

    public NoteContentSaveData saveContent(String userId, String noteId, NoteContentSaveRequest request) {
        Note note = note(userId, noteId);
        if (note.getVersion() != request.baseVersion()) {
            throw new WorkspaceException(HttpStatus.CONFLICT, "NOTE_VERSION_CONFLICT", "The note was changed by another device.",
                    Map.of("serverVersion", note.getVersion(), "clientBaseVersion", request.baseVersion()));
        }
        Instant now = Instant.now();
        note.saveContent(request.markdown(), now);
        snapshot(note, now);
        activity(userId, note, "updated", now);
        eventPublisher.publish("NoteContentSaved", userId, Map.of(
                "noteId", noteId,
                "userId", userId,
                "version", note.getVersion(),
                "markdownHash", sha256(note.getMarkdown()),
                "savedAt", now
        ));
        return new NoteContentSaveData(noteId, note.getVersion(), now, "SAVED", null);
    }

    public NoteMetadataData patchMetadata(String userId, String noteId, NoteMetadataPatchRequest request) {
        Note note = note(userId, noteId);
        Instant now = Instant.now();
        note.patchMetadata(request.title(), request.folderId(), request.tags(), request.archived(), typographyJson(request.typography()), now);
        snapshot(note, now);
        activity(userId, note, "updated", now);
        eventPublisher.publish("NoteMetadataChanged", userId, payload(
                "noteId", noteId,
                "userId", userId,
                "title", request.title(),
                "folderId", request.folderId(),
                "tags", request.tags(),
                "archived", request.archived(),
                "typography", request.typography(),
                "version", note.getVersion()
        ));
        return new NoteMetadataData(noteId, note.getTitle(), note.getFolderId(), note.getTags(), note.getVersion(), typography(note), null);
    }

    @Transactional(readOnly = true)
    public NoteVersionsData versions(String userId, String noteId) {
        return new NoteVersionsData(noteVersionRepository.findByNoteIdAndUserIdOrderByVersionDesc(noteId, userId).stream()
                .map(version -> new NoteVersionItem(version.getVersionId(), version.getVersion(), version.getSavedAt()))
                .toList());
    }

    public VersionRestoreData restoreVersion(String userId, String noteId, String versionId) {
        Note note = note(userId, noteId);
        NoteVersion version = noteVersionRepository.findByVersionIdAndNoteIdAndUserId(versionId, noteId, userId)
                .orElseThrow(() -> notFound("NOTE_VERSION_NOT_FOUND", "Note version not found."));
        Instant now = Instant.now();
        note.saveContent(version.getMarkdown(), now);
        snapshot(note, now);
        eventPublisher.publish("NoteContentSaved", userId, Map.of(
                "noteId", noteId,
                "userId", userId,
                "version", note.getVersion(),
                "markdownHash", sha256(note.getMarkdown()),
                "savedAt", now
        ));
        return new VersionRestoreData(note.getVersion());
    }

    public Void recordView(String userId, String noteId, NoteViewRequest request) {
        Note note = note(userId, noteId);
        note.recordView(request.viewedAt());
        activity(userId, note, "viewed", request.viewedAt());
        eventPublisher.publish("NoteViewed", userId, Map.of("noteId", noteId, "userId", userId, "viewedAt", request.viewedAt()));
        return null;
    }

    @Transactional(readOnly = true)
    public RecentActivitiesData recentActivities(String userId, int limit) {
        return new RecentActivitiesData(recentActivityRepository.findByUserIdOrderByActivityAtDesc(userId, PageRequest.of(0, Math.max(1, limit))).stream()
                .map(item -> new RecentActivityItem(item.getNoteId(), item.getTitle(), item.getActivityType(), item.getActivityAt()))
                .toList());
    }

    public FolderData createFolder(String userId, FolderCreateRequest request) {
        Instant now = Instant.now();
        Folder folder = new Folder(Ids.folder(), userId, request.name(), request.parentFolderId(), now);
        folderRepository.save(folder);
        eventPublisher.publish("FolderCreated", userId, payload(
                "folderId", folder.getFolderId(), "userId", userId, "name", folder.getName(), "parentFolderId", folder.getParentFolderId()
        ));
        return folderData(folder);
    }

    @Transactional(readOnly = true)
    public FolderTreeData folderTree(String userId) {
        return new FolderTreeData(folderRepository.findByUserIdOrderByNameAsc(userId).stream().map(this::folderMap).toList());
    }

    public FolderData patchFolder(String userId, String folderId, FolderPatchRequest request) {
        Folder folder = folder(userId, folderId);
        folder.patch(request.name(), request.parentFolderId(), Instant.now());
        eventPublisher.publish("FolderChanged", userId, payload(
                "folderId", folderId, "userId", userId, "name", request.name(), "parentFolderId", request.parentFolderId()
        ));
        return folderData(folder);
    }

    public Void deleteFolder(String userId, String folderId, FolderDeleteRequest request) {
        if (!"MOVE".equalsIgnoreCase(request.childNoteAction()) && !"TRASH".equalsIgnoreCase(request.childNoteAction())) {
            throw new WorkspaceException(HttpStatus.BAD_REQUEST, "INVALID_CHILD_NOTE_ACTION", "childNoteAction must be MOVE or TRASH.");
        }
        folder(userId, folderId);
        List<Note> children = noteRepository.findByUserIdAndFolderIdAndDeletedFalse(userId, folderId);
        if ("TRASH".equalsIgnoreCase(request.childNoteAction())) {
            children.forEach(note -> note.trash(Instant.now()));
        } else {
            children.forEach(note -> note.moveToFolder(request.targetFolderId(), Instant.now()));
        }
        folderRepository.deleteById(folderId);
        eventPublisher.publish("FolderDeleted", userId, payload(
                "folderId", folderId,
                "userId", userId,
                "childNoteAction", request.childNoteAction(),
                "targetFolderId", request.targetFolderId()
        ));
        if (!children.isEmpty()) {
            eventPublisher.publish("NotesMoved", userId, payload(
                    "userId", userId,
                    "noteIds", children.stream().map(Note::getNoteId).toList(),
                    "sourceFolderId", folderId,
                    "targetFolderId", request.targetFolderId()
            ));
        }
        return null;
    }

    @Transactional(readOnly = true)
    public TagsSuggestionData tagSuggestions(String userId, String query) {
        Map<String, Long> counts = noteRepository.findByUserIdAndDeletedFalseOrderByUpdatedAtDesc(userId).stream()
                .flatMap(note -> note.getTags().stream())
                .filter(tag -> query == null || query.isBlank() || tag.toLowerCase(Locale.ROOT).contains(query.toLowerCase(Locale.ROOT)))
                .collect(Collectors.groupingBy(tag -> tag, Collectors.counting()));
        return new TagsSuggestionData(counts.entrySet().stream()
                .sorted(Map.Entry.<String, Long>comparingByValue().reversed())
                .map(entry -> new TagSuggestionItem("tag_" + entry.getKey(), entry.getKey(), entry.getValue().intValue()))
                .toList());
    }

    public NoteTagsData putTags(String userId, String noteId, NoteTagsPutRequest request) {
        Note note = note(userId, noteId);
        note.replaceTags(request.tagNames(), Instant.now());
        eventPublisher.publish("NoteTagsChanged", userId, Map.of("noteId", noteId, "userId", userId, "tags", note.getTags()));
        return new NoteTagsData(noteId, note.getTags());
    }

    public FavoriteData putFavorite(String userId, String targetType, String targetId, FavoritePutRequest request) {
        if (!"NOTE".equals(targetType) && !"FOLDER".equals(targetType)) {
            throw new WorkspaceException(HttpStatus.BAD_REQUEST, "INVALID_FAVORITE_TARGET_TYPE", "targetType must be NOTE or FOLDER.");
        }
        Instant now = Instant.now();
        Favorite favorite = favoriteRepository.findByUserIdAndTargetTypeAndTargetId(userId, targetType, targetId)
                .orElseGet(() -> new Favorite(Ids.favorite(userId, targetType, targetId), userId, targetType, targetId, request.enabled(), now));
        favorite.setEnabled(request.enabled(), now);
        favoriteRepository.save(favorite);
        eventPublisher.publish("FavoriteChanged", userId, Map.of("userId", userId, "targetType", targetType, "targetId", targetId, "enabled", request.enabled()));
        return new FavoriteData(targetType, targetId, request.enabled());
    }

    public NoteLinkData createLink(String userId, String sourceNoteId, NoteLinkCreateRequest request) {
        Note source = note(userId, sourceNoteId);
        if (request.targetNoteId() == null && (request.targetTitle() == null || request.targetTitle().isBlank())) {
            throw new WorkspaceException(HttpStatus.BAD_REQUEST, "TARGET_NOTE_REQUIRED", "targetNoteId or targetTitle is required.");
        }
        boolean[] createdTarget = {false};
        Note target = request.targetNoteId() == null
                ? noteRepository.findFirstByUserIdAndTitleAndDeletedFalse(userId, request.targetTitle().trim())
                .orElseGet(() -> {
                    if (!request.createIfMissing()) {
                        return null;
                    }
                    createdTarget[0] = true;
                    return new Note(Ids.note(), userId, request.targetTitle().trim(), "", null, List.of(), Instant.now());
                })
                : note(userId, request.targetNoteId());
        if (target == null) {
            throw notFound("TARGET_NOTE_NOT_FOUND", "Target note not found.");
        }
        if (createdTarget[0]) {
            noteRepository.save(target);
            snapshot(target, Instant.now());
            eventPublisher.publish("NoteCreated", userId, payload(
                    "noteId", target.getNoteId(),
                    "userId", userId,
                    "title", target.getTitle(),
                    "folderId", null,
                    "tags", target.getTags(),
                    "version", target.getVersion()
            ));
        }
        NoteLink link = new NoteLink(Ids.link(), userId, source.getNoteId(), target.getNoteId(), target.getTitle(), Instant.now());
        noteLinkRepository.save(link);
        eventPublisher.publish("NoteLinkCreated", userId, Map.of(
                "linkId", link.getLinkId(), "userId", userId, "sourceNoteId", source.getNoteId(), "targetNoteId", target.getNoteId(), "linkType", "MANUAL"
        ));
        return new NoteLinkData(link.getLinkId(), link.getSourceNoteId(), link.getTargetNoteId(), link.getTargetTitle());
    }

    public Void deleteLink(String userId, String noteId, String linkId) {
        NoteLink link = noteLinkRepository.findByLinkIdAndSourceNoteIdAndUserId(linkId, noteId, userId)
                .orElseThrow(() -> notFound("NOTE_LINK_NOT_FOUND", "Note link not found."));
        noteLinkRepository.delete(link);
        eventPublisher.publish("NoteLinkDeleted", userId, Map.of(
                "linkId", linkId, "userId", userId, "sourceNoteId", link.getSourceNoteId(), "targetNoteId", link.getTargetNoteId()
        ));
        return null;
    }

    @Transactional(readOnly = true)
    public BacklinksData backlinks(String userId, String noteId) {
        return new BacklinksData(noteLinkRepository.findByTargetNoteIdAndUserId(noteId, userId).stream()
                .map(link -> {
                    Note source = note(userId, link.getSourceNoteId());
                    return new BacklinkItem(source.getNoteId(), source.getTitle(), link.getTargetTitle(), link.getCreatedAt());
                })
                .toList());
    }

    @Transactional(readOnly = true)
    public GraphData graph(String userId, String folderId, String tag, LocalDate since, LocalDate until) {
        Instant sinceInstant = since == null ? null : since.atStartOfDay().toInstant(ZoneOffset.UTC);
        Instant untilInstant = until == null ? null : until.plusDays(1).atStartOfDay().toInstant(ZoneOffset.UTC);
        List<Note> notes = noteRepository.findByUserIdAndDeletedFalseOrderByUpdatedAtDesc(userId).stream()
                .filter(note -> folderId == null || Objects.equals(folderId, note.getFolderId()))
                .filter(note -> tag == null || note.getTags().contains(tag))
                .filter(note -> sinceInstant == null || !note.getUpdatedAt().isBefore(sinceInstant))
                .filter(note -> untilInstant == null || note.getUpdatedAt().isBefore(untilInstant))
                .toList();
        Set<String> noteIds = notes.stream().map(Note::getNoteId).collect(Collectors.toSet());
        List<Map<String, Object>> nodes = notes.stream().map(note -> payload(
                "id", note.getNoteId(),
                "noteId", note.getNoteId(),
                "title", note.getTitle(),
                "tags", note.getTags(),
                "folderId", note.getFolderId()
        )).toList();
        List<Map<String, Object>> edges = noteLinkRepository.findByUserId(userId).stream()
                .filter(link -> noteIds.contains(link.getSourceNoteId()) && noteIds.contains(link.getTargetNoteId()))
                .map(link -> Map.<String, Object>of("id", link.getLinkId(), "source", link.getSourceNoteId(), "target", link.getTargetNoteId()))
                .toList();
        return new GraphData(nodes, edges, Map.of("noteCount", nodes.size(), "edgeCount", edges.size()), null);
    }

    public GraphLayoutData saveGraphLayout(String userId, String layoutId, GraphLayoutPutRequest request) {
        if (request.quality() != null && !Set.of("LOW", "MEDIUM", "HIGH").contains(request.quality())) {
            throw new WorkspaceException(HttpStatus.BAD_REQUEST, "INVALID_GRAPH_LAYOUT_QUALITY", "quality must be LOW, MEDIUM, or HIGH.");
        }
        Instant now = Instant.now();
        GraphLayout layout = graphLayoutRepository.findByLayoutIdAndUserId(layoutId, userId)
                .orElseGet(() -> new GraphLayout(layoutId, userId, "[]", request.quality(), now));
        layout.update(toJson(request.nodePositions()), request.quality(), now);
        graphLayoutRepository.save(layout);
        eventPublisher.publish("GraphLayoutSaved", userId, payload(
                "layoutId", layoutId, "userId", userId, "quality", request.quality(), "nodeCount", request.nodePositions().size()
        ));
        return new GraphLayoutData(layoutId, now);
    }

    public ShareLinkData createShareLink(String userId, ShareLinkCreateRequest request) {
        if (!Set.of("READ", "EDIT").contains(request.permission())) {
            throw new WorkspaceException(HttpStatus.BAD_REQUEST, "INVALID_SHARE_PERMISSION", "permission must be READ or EDIT.");
        }
        note(userId, request.noteId());
        Instant now = Instant.now();
        ShareLink shareLink = new ShareLink(Ids.share(), userId, request.noteId(), request.permission(), request.expiresAt(), now);
        shareLinkRepository.save(shareLink);
        eventPublisher.publish("ShareLinkCreated", userId, Map.of(
                "shareId", shareLink.getShareId(), "userId", userId, "noteId", request.noteId(), "permission", request.permission(), "expiresAt", request.expiresAt()
        ));
        return shareData(shareLink);
    }

    @Transactional(readOnly = true)
    public PublicSharedNoteData publicShare(String shareId) {
        ShareLink share = shareLinkRepository.findById(shareId)
                .orElseThrow(() -> notFound("SHARE_LINK_NOT_FOUND", "Share link not found."));
        if (share.isRevoked() || share.getExpiresAt().isBefore(Instant.now())) {
            throw new WorkspaceException(HttpStatus.GONE, "SHARE_LINK_EXPIRED", "Share link is not available.");
        }
        Note note = noteRepository.findById(share.getNoteId()).orElseThrow(() -> notFound("NOTE_NOT_FOUND", "Note not found."));
        return new PublicSharedNoteData(shareId, note.getNoteId(), note.getTitle(), note.getMarkdown(), new ShareAuthor("BrainX user"),
                share.getPermission(), share.getExpiresAt());
    }

    public ShareLinkData patchShareLink(String userId, String shareId, ShareLinkPatchRequest request) {
        ShareLink share = shareLinkRepository.findByShareIdAndUserId(shareId, userId)
                .orElseThrow(() -> notFound("SHARE_LINK_NOT_FOUND", "Share link not found."));
        share.patch(request.expiresAt(), request.revoked());
        eventPublisher.publish("ShareLinkChanged", userId, payload(
                "shareId", shareId, "userId", userId, "noteId", share.getNoteId(), "expiresAt", request.expiresAt(), "revoked", request.revoked()
        ));
        return shareData(share);
    }

    public InternalNoteBulkCreateData bulkCreate(InternalNoteBulkCreateRequest request) {
        List<InternalCreatedNote> created = new ArrayList<>();
        for (InternalNoteCreateItem item : request.notes()) {
            NoteCreatedData data = createNote(request.userId(), new NoteCreateRequest(item.title(), item.markdown(), request.targetFolderId(), item.tags()));
            created.add(new InternalCreatedNote(item.externalId(), data.noteId(), data.version()));
        }
        return new InternalNoteBulkCreateData(created, List.of());
    }

    @Transactional(readOnly = true)
    public InternalNoteSnapshotData snapshot(String noteId) {
        Note note = noteRepository.findById(noteId).orElseThrow(() -> notFound("NOTE_NOT_FOUND", "Note not found."));
        return new InternalNoteSnapshotData(note.getNoteId(), note.getTitle(), note.getMarkdown(), note.getTags(), note.getFolderId(),
                note.getVersion(), note.getUpdatedAt());
    }

    public NoteContentSaveData patchContentInternal(String noteId, InternalNoteContentPatchRequest request) {
        Note note = noteRepository.findById(noteId).orElseThrow(() -> notFound("NOTE_NOT_FOUND", "Note not found."));
        Map<String, Object> patch = request.patch() == null ? Map.of() : request.patch();
        String markdown = switch (request.patchType()) {
            case "APPEND" -> note.getMarkdown() + String.valueOf(patch.getOrDefault("text", ""));
            case "REPLACE_ALL", "APPLY_AI_SUGGESTION" -> String.valueOf(patch.getOrDefault("markdown", note.getMarkdown()));
            default -> String.valueOf(patch.getOrDefault("markdown", note.getMarkdown()));
        };
        return saveContent(note.getUserId(), noteId, new NoteContentSaveRequest(request.baseVersion(), markdown, Instant.now()));
    }

    private void snapshot(Note note, Instant now) {
        noteVersionRepository.save(new NoteVersion(Ids.version(note.getNoteId(), note.getVersion()), note, now));
    }

    private void activity(String userId, Note note, String type, Instant at) {
        recentActivityRepository.save(new RecentActivity(Ids.activity(), userId, note.getNoteId(), note.getTitle(), type, at));
    }

    private Note note(String userId, String noteId) {
        return noteRepository.findByNoteIdAndUserId(noteId, userId)
                .orElseThrow(() -> notFound("NOTE_NOT_FOUND", "Note not found."));
    }

    private Folder folder(String userId, String folderId) {
        return folderRepository.findByFolderIdAndUserId(folderId, userId)
                .orElseThrow(() -> notFound("FOLDER_NOT_FOUND", "Folder not found."));
    }

    private WorkspaceException notFound(String code, String message) {
        return new WorkspaceException(HttpStatus.NOT_FOUND, code, message);
    }

    private FolderRef folderRef(String userId, String folderId) {
        if (folderId == null) {
            return new FolderRef(null, null);
        }
        return folderRepository.findByFolderIdAndUserId(folderId, userId)
                .map(folder -> new FolderRef(folder.getFolderId(), folder.getName()))
                .orElse(new FolderRef(folderId, null));
    }

    private FolderData folderData(Folder folder) {
        return new FolderData(folder.getFolderId(), folder.getName(), folder.getParentFolderId(), folder.getParentFolderId() == null ? 0 : 1);
    }

    private ShareLinkData shareData(ShareLink share) {
        return new ShareLinkData(share.getShareId(), publicBaseUrl + "/share/" + share.getShareId(), share.getPermission(), share.getExpiresAt(), share.isRevoked());
    }

    private Map<String, Object> noteMap(Note note) {
        return payload("noteId", note.getNoteId(), "title", note.getTitle(), "markdown", note.getMarkdown(), "folderId", note.getFolderId(),
                "tags", new ArrayList<>(note.getTags()), "version", note.getVersion(), "createdAt", note.getCreatedAt(), "updatedAt", note.getUpdatedAt(),
                "deleted", note.isDeleted(), "typography", typography(note));
    }

    private Map<String, Object> folderMap(Folder folder) {
        return payload("folderId", folder.getFolderId(), "name", folder.getName(), "parentFolderId", folder.getParentFolderId(), "depth", folderData(folder).depth());
    }

    private Map<String, Object> linkMap(NoteLink link) {
        return Map.of("linkId", link.getLinkId(), "sourceNoteId", link.getSourceNoteId(), "targetNoteId", link.getTargetNoteId(), "targetTitle", link.getTargetTitle());
    }

    private Map<String, Object> favoriteMap(Favorite favorite) {
        return Map.of("targetType", favorite.getTargetType(), "targetId", favorite.getTargetId(), "enabled", favorite.isEnabled());
    }

    private Object nullable(Object value) {
        return value;
    }

    private Map<String, Object> payload(Object... keyValues) {
        Map<String, Object> result = new LinkedHashMap<>();
        for (int i = 0; i < keyValues.length; i += 2) {
            result.put((String) keyValues[i], keyValues[i + 1]);
        }
        return result;
    }

    private String toJson(Object value) {
        try {
            return objectMapper.writeValueAsString(value);
        } catch (JsonProcessingException exception) {
            throw new IllegalStateException("Failed to serialize JSON.", exception);
        }
    }

    private String typographyJson(NoteTypography typography) {
        return typography == null ? null : toJson(typography);
    }

    private NoteTypography typography(Note note) {
        String typographyJson = note.getTypographyJson();
        if (typographyJson == null || typographyJson.isBlank()) {
            return null;
        }
        try {
            return objectMapper.readValue(typographyJson, NoteTypography.class);
        } catch (JsonProcessingException exception) {
            return null;
        }
    }

    private String sha256(String value) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] hash = digest.digest(value.getBytes(StandardCharsets.UTF_8));
            StringBuilder builder = new StringBuilder();
            for (byte b : hash) {
                builder.append(String.format("%02x", b));
            }
            return builder.toString();
        } catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException("SHA-256 is not available.", exception);
        }
    }
}
