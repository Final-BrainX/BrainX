package com.brainx.workspace.service;

import com.brainx.workspace.dto.WorkspaceDtos.*;
import com.brainx.workspace.entity.*;
import com.brainx.workspace.event.WorkspaceEventPublisher;
import com.brainx.workspace.exception.WorkspaceException;
import com.brainx.workspace.graph.Neo4jGraphProjection;
import com.brainx.workspace.graph.Neo4jGraphQueryService;
import com.brainx.workspace.repository.*;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.time.temporal.ChronoUnit;
import java.util.*;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

@Slf4j
@Service
@RequiredArgsConstructor
@Transactional
public class WorkspaceService {
    private static final ZoneId MONITORING_ZONE = ZoneId.of("Asia/Seoul");
    private static final Pattern HTML_WIKI_LINK_PATTERN = Pattern.compile("<span\\b[^>]*data-wiki-link[^>]*>.*?</span>", Pattern.CASE_INSENSITIVE | Pattern.DOTALL);
    private static final Pattern RAW_WIKI_LINK_PATTERN = Pattern.compile("\\[\\[([^\\[\\]]+)]]");
    private static final Pattern HTML_ATTRIBUTE_PATTERN = Pattern.compile("([\\w:-]+)\\s*=\\s*([\"'])(.*?)\\2", Pattern.CASE_INSENSITIVE | Pattern.DOTALL);
    // Gateway-Service(JwtAuthenticationGlobalFilter)가 발급/검증하는 guest id 형식과 동일하다
    // (gst_[A-Za-z0-9_-]{16,80}). Guest는 Workspace를 가지면 안 되므로 이 prefix로 식별되는
    // userId에 대해서는 default Workspace 자동 생성을 절대 트리거하지 않는다.
    private static final String GUEST_ID_PREFIX = "gst_";

    private final NoteRepository noteRepository;
    private final NoteVersionRepository noteVersionRepository;
    private final FolderRepository folderRepository;
    private final WorkspaceRepository workspaceRepository;
    private final NoteLinkRepository noteLinkRepository;
    private final FavoriteRepository favoriteRepository;
    private final RecentActivityRepository recentActivityRepository;
    private final GraphLayoutRepository graphLayoutRepository;
    private final ShareLinkRepository shareLinkRepository;
    private final WorkspaceEventPublisher eventPublisher;
    private final Neo4jGraphProjection neo4jGraphProjection;
    private final ObjectMapper objectMapper;
    private final Neo4jGraphQueryService neo4jGraphQueryService;

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
    public WorkspaceListData listWorkspaces(String userId) {
        return new WorkspaceListData(workspaceRepository.findByUserIdOrderByDefaultFirst(userId).stream()
                .map(this::workspaceSummaryData)
                .toList());
    }

    @Transactional(readOnly = true)
    public WorkspaceDetailData getWorkspace(String userId, String documentGroupId) {
        return workspaceDetailData(workspace(userId, documentGroupId));
    }

    public WorkspaceDetailData createWorkspace(String userId, WorkspaceCreateRequest request) {
        String name = requireWorkspaceName(request.name());
        if (workspaceRepository.existsByUserIdAndName(userId, name)) {
            throw new WorkspaceException(HttpStatus.CONFLICT, "WORKSPACE_NAME_DUPLICATE",
                    "Workspace name already exists for this user.");
        }

        Workspace workspace = new Workspace(Ids.workspace(), userId, name, false, Instant.now());
        workspaceRepository.save(workspace);
        return workspaceDetailData(workspace);
    }

    public WorkspaceDetailData patchWorkspace(String userId, String documentGroupId, WorkspacePatchRequest request) {
        Workspace workspace = workspace(userId, documentGroupId);
        String name = requireWorkspaceName(request.name());
        if (Objects.equals(workspace.getName(), name)) {
            return workspaceDetailData(workspace);
        }
        if (workspaceRepository.existsByUserIdAndNameAndDocumentGroupIdNot(userId, name, documentGroupId)) {
            throw new WorkspaceException(HttpStatus.CONFLICT, "WORKSPACE_NAME_DUPLICATE",
                    "Workspace name already exists for this user.");
        }

        workspace.rename(name, Instant.now());
        return workspaceDetailData(workspace);
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

    /** 같은 폴더(루트 포함) 안에서 이름/제목이 겹치면 "이름", "이름 2", "이름 3"... 순으로
        자동으로 갈라준다. 즉시 생성되는 빈 노트(기본 제목 "제목 없음")가 가장 흔한 충돌
        케이스라, 막아서 입력을 가로막기보다(Notion/Obsidian과 동일한 정책) 조용히 풀어준다. */
    private String dedupeName(Set<String> takenNames, String desiredName) {
        if (!takenNames.contains(desiredName)) {
            return desiredName;
        }
        int suffix = 2;
        while (takenNames.contains(desiredName + " " + suffix)) {
            suffix += 1;
        }
        return desiredName + " " + suffix;
    }

    private String dedupeFolderName(String userId, String documentGroupId, String parentFolderId, String desiredName, String excludeFolderId) {
        Set<String> taken = folderRepository.findSiblingsByUserIdAndDocumentGroupIdAndParentFolderId(userId, documentGroupId, parentFolderId).stream()
                .filter(folder -> excludeFolderId == null || !folder.getFolderId().equals(excludeFolderId))
                .map(Folder::getName)
                .collect(Collectors.toSet());
        return dedupeName(taken, desiredName);
    }

    private String dedupeNoteTitle(String userId, String documentGroupId, String folderId, String desiredTitle, String excludeNoteId) {
        Set<String> taken = noteRepository.findSiblingsByUserIdAndDocumentGroupIdAndFolderId(userId, documentGroupId, folderId).stream()
                .filter(note -> excludeNoteId == null || !note.getNoteId().equals(excludeNoteId))
                .map(Note::getTitle)
                .collect(Collectors.toSet());
        return dedupeName(taken, desiredTitle);
    }

    public NoteCreatedData createNote(String userId, NoteCreateRequest request) {
        Instant now = Instant.now();
        requireOwnedWorkspaceIfProvided(userId, request.documentGroupId());
        String documentGroupId = resolveDocumentGroupId(userId, request.documentGroupId());
        requireFolderInWorkspace(userId, request.folderId(), documentGroupId,
                "FOLDER_WORKSPACE_MISMATCH", "Folder does not belong to the target Workspace.");
        String title = dedupeNoteTitle(userId, documentGroupId, request.folderId(), request.title(), null);
        Note note = new Note(Ids.note(), userId, documentGroupId, title, request.markdown(), request.folderId(), request.tags(), now);
        noteRepository.save(note);
        syncWikiLinksForNote(note, now);
        syncIncomingWikiLinksForTitle(userId, note.getTitle(), note.getNoteId(), now);
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
        return new NoteCreatedData(note.getNoteId(), note.getDocumentGroupId(), note.getTitle(), note.getFolderId(), note.getVersion(),
                note.getCreatedAt());
    }

    public ClaimedNoteDraft persistDraft(String userId, NoteDraftData draft) {
        Instant now = Instant.now();
        String title = draft.title() == null || draft.title().isBlank() ? "제목 없음" : draft.title();
        String markdown = draft.markdown() == null ? "" : draft.markdown();
        Note note = noteRepository.findByNoteIdAndUserId(draft.noteId(), userId).orElse(null);
        if (note == null) {
            String noteId = noteRepository.existsById(draft.noteId()) ? Ids.note() : draft.noteId();
            // draft가 Postgres에 처음 들어오는 순간(idle flush 또는 guest->user claim) — 이미
            // 같은 폴더에 같은 제목(기본값 "제목 없음" 포함)이 있으면 충돌하므로 새로 생기는
            // 시점에 한 번만 갈라준다(이미 영속화된 노트를 매 flush마다 다시 검사/리네임하지 않음).
            // dedupe가 documentGroupId를 스코프로 쓰므로 반드시 resolve를 먼저 한다.
            String documentGroupId = resolveDocumentGroupId(userId, draft.documentGroupId());
            title = dedupeNoteTitle(userId, documentGroupId, draft.folderId(), title, null);
            note = new Note(noteId, userId, documentGroupId, title, markdown, draft.folderId(), List.of(), now);
            noteRepository.save(note);
            syncWikiLinksForNote(note, now);
            syncIncomingWikiLinksForTitle(userId, note.getTitle(), note.getNoteId(), now);
            eventPublisher.publish("NoteCreated", userId, payload(
                    "noteId", note.getNoteId(),
                    "userId", userId,
                    "title", note.getTitle(),
                    "folderId", note.getFolderId(),
                    "tags", note.getTags(),
                    "version", note.getVersion()
            ));
        } else {
            note.applyDraft(title, markdown, draft.folderId(), now);
            syncWikiLinksForNote(note, now);
            eventPublisher.publish("NoteContentSaved", userId, Map.of(
                    "noteId", note.getNoteId(),
                    "userId", userId,
                    "version", note.getVersion(),
                    "markdownHash", sha256(note.getMarkdown()),
                    "savedAt", now
            ));
        }
        snapshot(note, now);
        activity(userId, note, "updated", now);
        return new ClaimedNoteDraft(note.getNoteId(), draft.noteId(), note.getDocumentGroupId(), note.getTitle(), note.getVersion());
    }

    @Transactional(readOnly = true)
    public NoteDetailData getNote(String userId, String noteId) {
        Note note = note(userId, noteId);
        FolderRef folder = folderRef(userId, note.getFolderId());
        // tags는 지연 로딩 컬렉션이라 트랜잭션 안에서 복사해 둬야 세션이 닫힌 뒤 직렬화할 때
        // LazyInitializationException이 나지 않는다.
        List<String> tags = new ArrayList<>(note.getTags());
        return new NoteDetailData(note.getNoteId(), note.getDocumentGroupId(), note.getTitle(), note.getMarkdown(), folder, tags,
                note.getVersion(), note.getCreatedAt(), note.getUpdatedAt(), new Permissions(true, true), typography(note));
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
        syncWikiLinksForNote(note, now);
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
        String previousTitle = note.getTitle();
        // 제목/폴더 중 바뀌는 쪽만 반영한 "최종" 값 기준으로 같은 폴더 안 중복을 검사해야 한다 —
        // 폴더만 옮기고 제목은 그대로인 이동도 목적지에서 충돌할 수 있다.
        String targetFolderId = request.folderId() != null
                ? (request.folderId().isBlank() ? null : request.folderId())
                : note.getFolderId();
        // documentGroupId 자체는 이 patch로 바꿀 수 없다(요청 스키마에 필드가 없음 — Workspace
        // 간 이동은 Ticket10). 여기서는 folderId가 바뀌는 경우 그 대상 폴더가 노트의 기존
        // documentGroupId와 같은 Workspace에 속하는지만 확인한다.
        if (request.folderId() != null && targetFolderId != null) {
            requireFolderInWorkspace(userId, targetFolderId, note.getDocumentGroupId(),
                    "FOLDER_WORKSPACE_MISMATCH", "Folder does not belong to the note's Workspace.");
        }
        String desiredTitle = (request.title() != null && !request.title().isBlank()) ? request.title() : note.getTitle();
        String finalTitle = dedupeNoteTitle(userId, note.getDocumentGroupId(), targetFolderId, desiredTitle, noteId);
        note.patchMetadata(finalTitle, request.folderId(), request.tags(), request.archived(), typographyJson(request.typography()), now);
        if (!Objects.equals(previousTitle, note.getTitle())) {
            syncIncomingWikiLinksForTitle(userId, previousTitle, noteId, now);
            syncIncomingWikiLinksForTitle(userId, note.getTitle(), noteId, now);
        }
        snapshot(note, now);
        activity(userId, note, "updated", now);
        eventPublisher.publish("NoteMetadataChanged", userId, payload(
                "noteId", noteId,
                "userId", userId,
                "title", note.getTitle(),
                "folderId", request.folderId(),
                "tags", request.tags(),
                "archived", request.archived(),
                "typography", request.typography(),
                "version", note.getVersion()
        ));
        return new NoteMetadataData(noteId, note.getDocumentGroupId(), note.getTitle(), note.getFolderId(), note.getTags(),
                note.getVersion(), typography(note), null);
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
        syncWikiLinksForNote(note, now);
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

    /** guest draft claim 시 폴더 구조도 함께 승계한다 — 노트와 달리 폴더 생성은 actor 제약이
        없어 guest도 Postgres에 폴더를 만들 수 있는데, claim이 Redis note draft만 옮기고 폴더는
        그대로 guestId 소유(documentGroupId=null)로 남아있던 gap을 메운다. 승계된 폴더는 회원의
        default Workspace로 귀속시키고, 그 Workspace 안에서 이미 같은 이름이 있으면 Ticket8의
        dedupeFolderName을 그대로 재사용해 자동 suffix를 적용한다(새 중복 알고리즘을 만들지
        않는다). 폴더를 하나씩 반영해야 뒤에 처리하는 폴더의 dedupe 조회가 앞서 반영된 형제
        폴더의 새 이름/documentGroupId를 실제로(오토플러시를 통해) 보고 중복을 정확히 잡는다. */
    @Transactional
    public int reassignGuestFolders(String fromUserId, String toUserId) {
        List<Folder> folders = folderRepository.findByUserIdOrderByNameAsc(fromUserId);
        if (folders.isEmpty()) {
            return 0;
        }
        Instant now = Instant.now();
        // toUserId는 항상 로그인된 회원이어야 하지만(claimGuestDrafts가 memberUserId()로 보장),
        // Guest id로 절대 default Workspace를 만들지 않도록 한 번 더 방어한다.
        String documentGroupId = isGuestUserId(toUserId) ? null : getOrCreateDefaultWorkspace(toUserId).documentGroupId();
        for (Folder folder : folders) {
            String dedupedName = dedupeFolderName(toUserId, documentGroupId, folder.getParentFolderId(),
                    folder.getName(), folder.getFolderId());
            folder.patch(dedupedName, null, now);
            folder.reassignOwner(toUserId, documentGroupId, now);
        }
        return folders.size();
    }

    /** guest draft claim 시 즐겨찾기도 함께 승계한다 — putFavorite은 USER/GUEST를 가리지 않고
        actor id를 그대로 favoriteId/userId에 써서 저장하므로(WorkspaceController.putFavorite),
        claim이 note/folder만 옮기고 즐겨찾기는 그대로 guestId 소유로 남아있던 gap을 메운다.
        favoriteId가 userId를 포함해 만들어지므로(Ids.favorite) 단순 소유자 필드 변경이 아니라
        새 id로 재생성한다 — 이미 같은 대상으로 회원 즐겨찾기가 있으면(드물지만) 회원 쪽을 그대로
        두고 guest 쪽만 지운다. */
    @Transactional
    public int reassignGuestFavorites(String fromUserId, String toUserId) {
        List<Favorite> guestFavorites = favoriteRepository.findByUserId(fromUserId);
        Instant now = Instant.now();
        int migrated = 0;
        for (Favorite favorite : guestFavorites) {
            boolean alreadyExists = favoriteRepository
                    .findByUserIdAndTargetTypeAndTargetId(toUserId, favorite.getTargetType(), favorite.getTargetId())
                    .isPresent();
            if (!alreadyExists) {
                favoriteRepository.save(new Favorite(
                        Ids.favorite(toUserId, favorite.getTargetType(), favorite.getTargetId()),
                        toUserId, favorite.getTargetType(), favorite.getTargetId(), favorite.isEnabled(), now));
                migrated++;
            }
            favoriteRepository.delete(favorite);
        }
        return migrated;
    }

    public FolderData createFolder(String userId, FolderCreateRequest request) {
        Instant now = Instant.now();
        requireOwnedWorkspaceIfProvided(userId, request.documentGroupId());
        String documentGroupId = resolveDocumentGroupId(userId, request.documentGroupId());
        requireFolderInWorkspace(userId, request.parentFolderId(), documentGroupId,
                "PARENT_FOLDER_WORKSPACE_MISMATCH", "Parent folder does not belong to the target Workspace.");
        String name = dedupeFolderName(userId, documentGroupId, request.parentFolderId(), request.name(), null);
        Folder folder = new Folder(Ids.folder(), userId, documentGroupId, name, request.parentFolderId(), now);
        folderRepository.save(folder);
        eventPublisher.publish("FolderCreated", userId, payload(
                "folderId", folder.getFolderId(), "userId", userId, "name", folder.getName(), "parentFolderId", folder.getParentFolderId()
        ));
        return folderData(folder);
    }

    @Transactional(readOnly = true)
    public FolderTreeData folderTree(String userId) {
        return new FolderTreeData(null, folderRepository.findByUserIdOrderByNameAsc(userId).stream().map(this::folderMap).toList());
    }

    public FolderData patchFolder(String userId, String folderId, FolderPatchRequest request) {
        Folder folder = folder(userId, folderId);
        // rename만 하든 move만 하든(또는 둘 다든) 최종적으로 위치할 부모/이름 기준으로 중복을
        // 검사한다 — 이름은 그대로 두고 옮기기만 해도 목적지에 같은 이름이 있으면 충돌한다.
        String targetParentFolderId = request.parentFolderId() != null
                ? (request.parentFolderId().isBlank() ? null : request.parentFolderId())
                : folder.getParentFolderId();
        // parentFolderId가 바뀌는 경우: 자기 자신/하위 폴더로의 순환 이동을 먼저 막고, 그 다음
        // 대상 부모가 이 폴더와 같은 Workspace에 속하는지 확인한다. Workspace 간 폴더 이동은
        // 정책상 미지원(2차)이라 요청 스키마 자체에 documentGroupId 필드가 없다.
        if (request.parentFolderId() != null && targetParentFolderId != null) {
            if (collectDescendantFolderIds(userId, folderId).contains(targetParentFolderId)) {
                throw new WorkspaceException(HttpStatus.CONFLICT, "FOLDER_CYCLE_NOT_ALLOWED",
                        "Cannot move a folder into itself or one of its own descendants.");
            }
            requireFolderInWorkspace(userId, targetParentFolderId, folder.getDocumentGroupId(),
                    "PARENT_FOLDER_WORKSPACE_MISMATCH", "Parent folder does not belong to the folder's Workspace.");
        }
        String desiredName = (request.name() != null && !request.name().isBlank()) ? request.name() : folder.getName();
        String finalName = dedupeFolderName(userId, folder.getDocumentGroupId(), targetParentFolderId, desiredName, folderId);
        folder.patch(finalName, request.parentFolderId(), Instant.now());
        eventPublisher.publish("FolderChanged", userId, payload(
                "folderId", folderId, "userId", userId, "name", folder.getName(), "parentFolderId", request.parentFolderId()
        ));
        return folderData(folder);
    }

    /** 폴더 삭제는 더 이상 "부모로 승격"하지 않고 하위 폴더/노트를 전부 cascade 삭제한다
        (orphan folder/note를 만들지 않기 위한 정책 변경). mode는 노트 삭제와 동일한 의미:
        trash=복구 가능한 소프트 삭제, permanent=완전 삭제. 폴더 자체는 소프트 삭제 개념이 없어
        항상 행을 지운다. */
    public DeleteFolderData deleteFolder(String userId, String folderId, String mode) {
        if (!"trash".equalsIgnoreCase(mode) && !"permanent".equalsIgnoreCase(mode)) {
            throw new WorkspaceException(HttpStatus.BAD_REQUEST, "INVALID_DELETE_MODE", "Delete mode must be trash or permanent.");
        }
        folder(userId, folderId);
        Set<String> folderIds = collectDescendantFolderIds(userId, folderId);
        List<Note> notes = noteRepository.findByUserIdAndFolderIdIn(userId, folderIds);
        Instant now = Instant.now();
        if ("permanent".equalsIgnoreCase(mode)) {
            noteRepository.deleteAll(notes);
        } else {
            notes.forEach(note -> note.trash(now));
        }
        folderRepository.deleteAllById(folderIds);
        List<String> noteIds = notes.stream().map(Note::getNoteId).toList();
        eventPublisher.publish("FolderDeleted", userId, payload(
                "userId", userId,
                "folderIds", List.copyOf(folderIds),
                "mode", mode,
                "noteIds", noteIds
        ));
        return new DeleteFolderData(List.copyOf(folderIds), noteIds, now);
    }

    /** folderId 자신과 그 모든 하위(중첩 포함) 폴더 id를 모은다. */
    private Set<String> collectDescendantFolderIds(String userId, String folderId) {
        List<Folder> allFolders = folderRepository.findByUserIdOrderByNameAsc(userId);
        Set<String> result = new HashSet<>();
        result.add(folderId);
        boolean changed = true;
        while (changed) {
            changed = false;
            for (Folder candidate : allFolders) {
                if (candidate.getParentFolderId() != null
                        && result.contains(candidate.getParentFolderId())
                        && !result.contains(candidate.getFolderId())) {
                    result.add(candidate.getFolderId());
                    changed = true;
                }
            }
        }
        return result;
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
        Optional<NoteLink> existing = noteLinkRepository.findFirstByUserIdAndSourceNoteIdAndTargetNoteId(userId, source.getNoteId(), target.getNoteId());
        if (existing.isPresent()) {
            NoteLink existingLink = existing.get();
            if (!existingLink.isWikiLink()) {
                return linkData(existingLink);
            }
            deleteProjectedLink(existingLink);
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
        NoteLink link = new NoteLink(
                Ids.link(),
                userId,
                source.getNoteId(),
                target.getNoteId(),
                target.getTitle(),
                NoteLink.TYPE_MANUAL,
                normalizeAnchorText(request.anchorText(), target.getTitle()),
                trimToNull(request.headingAnchor()),
                Instant.now()
        );
        noteLinkRepository.save(link);
        log.info("[WorkspaceService] calling neo4jGraphProjection.upsertManualLink - userId: {}, sourceNoteId: {}, targetNoteId: {}, linkId: {}", 
                userId, source.getNoteId(), target.getNoteId(), link.getLinkId());
        neo4jGraphProjection.upsertManualLink(
                userId,
                source.getNoteId(),
                target.getNoteId(),
                link.getLinkId(),
                link.getLinkType(),
                link.getAnchorText(),
                link.getHeadingAnchor(),
                link.getCreatedAt()
        );
        log.info("[WorkspaceService] finished neo4jGraphProjection.upsertManualLink call");
        publishLinkCreated(link);
        return linkData(link);
    }

    public Void deleteLink(String userId, String noteId, String linkId) {
        NoteLink link = noteLinkRepository.findByLinkIdAndSourceNoteIdAndUserId(linkId, noteId, userId)
                .orElseThrow(() -> notFound("NOTE_LINK_NOT_FOUND", "Note link not found."));
        deleteProjectedLink(link);
        return null;
    }

    @Transactional(readOnly = true)
    public BacklinksData backlinks(String userId, String noteId) {
        return new BacklinksData(noteLinkRepository.findByTargetNoteIdAndUserId(noteId, userId).stream()
                .map(link -> {
                    Note source = note(userId, link.getSourceNoteId());
                    return new BacklinkItem(source.getNoteId(), source.getTitle(), displayLinkedText(link), link.getCreatedAt());
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
                "tags", new ArrayList<>(note.getTags()),
                "folderId", note.getFolderId()
        )).toList();
        List<Map<String, Object>> edges = noteLinkRepository.findByUserId(userId).stream()
                .filter(link -> noteIds.contains(link.getSourceNoteId()) && noteIds.contains(link.getTargetNoteId()))
                .map(link -> Map.<String, Object>of(
                        "id", link.getLinkId(),
                        "linkId", link.getLinkId(),
                        "source", link.getSourceNoteId(),
                        "target", link.getTargetNoteId(),
                        "type", link.getLinkType(),
                        "metadata", payload(
                                "anchorText", link.getAnchorText(),
                                "headingAnchor", link.getHeadingAnchor()
                        )
                ))
                .toList();
        GraphData ledgerGraph = new GraphData(nodes, edges, Map.of("noteCount", nodes.size(), "edgeCount", edges.size(), "source", "workspace-ledger"), null);
        return neo4jGraphQueryService.findGraph(userId, folderId, tag, sinceInstant, untilInstant)
                .map(graph -> preferGraphView(graph, ledgerGraph))
                .orElse(ledgerGraph);
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

    @Transactional(readOnly = true)
    public List<ShareLinkData> listShareLinks(String userId, String noteId) {
        note(userId, noteId);
        return shareLinkRepository.findByNoteIdAndUserId(noteId, userId).stream()
                .map(this::shareData)
                .toList();
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

    private static final java.util.regex.Pattern WIKI_TITLE_RE =
            java.util.regex.Pattern.compile("data-title=\"([^\"]+)\"");
    private static final java.util.regex.Pattern INTERNAL_ID_RE =
            java.util.regex.Pattern.compile("href=\"brainx-note://([^\"]+)\"");
    // plain [[title]] / [[title#heading]] / [[title|alias]] 형태 (HTML로 재저장되기 전 마크다운)
    private static final java.util.regex.Pattern PLAIN_WIKI_RE =
            java.util.regex.Pattern.compile("\\[\\[([^\\[\\]|#\\r\\n]+?)(?:[#|][^\\[\\]]*)?\\]\\]");

    @Transactional(readOnly = true)
    public PublicSharedNoteData publicShare(String shareId) {
        ShareLink share = shareLinkRepository.findById(shareId)
                .orElseThrow(() -> notFound("SHARE_LINK_NOT_FOUND", "Share link not found."));
        if (share.isRevoked() || share.getExpiresAt().isBefore(Instant.now())) {
            throw new WorkspaceException(HttpStatus.GONE, "SHARE_LINK_EXPIRED", "Share link is not available.");
        }
        Note note = noteRepository.findById(share.getNoteId()).orElseThrow(() -> notFound("NOTE_NOT_FOUND", "Note not found."));

        Map<String, String> linkedShares = resolveLinkedShares(shareId, share.getUserId(), note.getMarkdown());

        return new PublicSharedNoteData(shareId, note.getNoteId(), note.getTitle(), note.getMarkdown(),
                new ShareAuthor("BrainX user"), share.getPermission(), share.getExpiresAt(), linkedShares);
    }

    // shareId context로 하위 노트 접근 — 별도 공유 링크 불필요
    @Transactional(readOnly = true)
    public PublicSharedNoteData linkedNoteContent(String shareId, String noteId) {
        ShareLink share = shareLinkRepository.findById(shareId)
                .orElseThrow(() -> notFound("SHARE_LINK_NOT_FOUND", "Share link not found."));
        if (share.isRevoked() || share.getExpiresAt().isBefore(Instant.now())) {
            throw new WorkspaceException(HttpStatus.GONE, "SHARE_LINK_EXPIRED", "Share link is not available.");
        }
        Note note = noteRepository.findById(noteId)
                .filter(n -> n.getUserId().equals(share.getUserId()) && !n.isDeleted())
                .orElseThrow(() -> notFound("NOTE_NOT_FOUND", "Note not found or not accessible."));

        Map<String, String> linkedShares = resolveLinkedShares(shareId, share.getUserId(), note.getMarkdown());
        return new PublicSharedNoteData(shareId, note.getNoteId(), note.getTitle(), note.getMarkdown(),
                new ShareAuthor("BrainX user"), share.getPermission(), share.getExpiresAt(), linkedShares);
    }

    private Map<String, String> resolveLinkedShares(String shareId, String userId, String html) {
        if (html == null || html.isBlank()) return Map.of();
        Map<String, String> result = new java.util.HashMap<>();

        // [[위키 링크]] — data-title 속성으로 noteId 조회 후 /share/{shareId}/note/{noteId} URL 생성
        var wikiMatcher = WIKI_TITLE_RE.matcher(html);
        while (wikiMatcher.find()) {
            String title = wikiMatcher.group(1);
            if (result.containsKey(title)) continue;
            noteRepository.findFirstByUserIdAndTitleIgnoreCaseAndDeletedFalse(userId, title)
                    .ifPresent(n -> result.put(title, publicBaseUrl + "/share/" + shareId + "/note/" + n.getNoteId()));
        }

        // brainx-note://noteId 직접 링크
        var idMatcher = INTERNAL_ID_RE.matcher(html);
        while (idMatcher.find()) {
            String noteId = idMatcher.group(1);
            if (result.containsKey(noteId)) continue;
            noteRepository.findById(noteId)
                    .filter(n -> n.getUserId().equals(userId) && !n.isDeleted())
                    .ifPresent(n -> result.put(noteId, publicBaseUrl + "/share/" + shareId + "/note/" + noteId));
        }

        // plain [[title]] 마크다운 — HTML로 재저장되기 전 노트 대응
        var plainMatcher = PLAIN_WIKI_RE.matcher(html);
        while (plainMatcher.find()) {
            String title = plainMatcher.group(1).trim();
            if (result.containsKey(title)) continue;
            noteRepository.findFirstByUserIdAndTitleIgnoreCaseAndDeletedFalse(userId, title)
                    .ifPresent(n -> result.put(title, publicBaseUrl + "/share/" + shareId + "/note/" + n.getNoteId()));
        }

        return result;
    }

    @Transactional(readOnly = true)
    public ShareLinkData publicShareLinkForNote(String noteId) {
        return shareLinkRepository.findFirstActiveByNoteId(noteId, Instant.now())
                .map(this::shareData)
                .orElseThrow(() -> notFound("SHARE_LINK_NOT_FOUND", "No active share link for this note."));
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
            NoteCreatedData data = createNote(request.userId(),
                    new NoteCreateRequest(null, item.title(), item.markdown(), request.targetFolderId(), item.tags()));
            created.add(new InternalCreatedNote(item.externalId(), data.noteId(), data.version()));
        }
        return new InternalNoteBulkCreateData(created, List.of());
    }

    @Transactional(readOnly = true)
    public InternalNoteSnapshotData snapshot(String noteId) {
        Note note = noteRepository.findById(noteId).orElseThrow(() -> notFound("NOTE_NOT_FOUND", "Note not found."));
        List<String> tags = new ArrayList<>(note.getTags());
        return new InternalNoteSnapshotData(note.getNoteId(), note.getDocumentGroupId(), note.getTitle(), note.getMarkdown(), tags,
                note.getFolderId(),
                note.getVersion(), note.getUpdatedAt());
    }

    @Transactional(readOnly = true)
    public InternalUserWorkspaceStatsData getUserWorkspaceStats(String userId) {
        long noteCount = noteRepository.countByUserIdAndDeletedFalse(userId);
        long storageBytes = noteRepository.findByUserIdAndDeletedFalseOrderByUpdatedAtDesc(userId).stream()
                .mapToLong(note -> note.getMarkdown().getBytes(StandardCharsets.UTF_8).length)
                .sum();
        List<InternalUserActivityDto> activities = noteRepository.findTop5ByUserIdAndDeletedFalseOrderByUpdatedAtDesc(userId).stream()
                .map(note -> new InternalUserActivityDto(
                        note.getNoteId(),
                        note.getVersion() > 1 ? "NOTE_UPDATED" : "NOTE_CREATED",
                        note.getTitle(),
                        note.getUpdatedAt()
                ))
                .toList();
        return new InternalUserWorkspaceStatsData((int) noteCount, storageBytes, activities);
    }

    @Transactional(readOnly = true)
    public InternalWorkspaceMonitoringSummaryData getWorkspaceMonitoringSummary() {
        List<Note> notes = noteRepository.findByDeletedFalseOrderByUpdatedAtDesc();
        long totalStorageBytes = notes.stream()
                .mapToLong(note -> note.getMarkdown().getBytes(StandardCharsets.UTF_8).length)
                .sum();
        LocalDate today = LocalDate.now(MONITORING_ZONE);
        int notesCreatedToday = (int) notes.stream()
                .filter(note -> note.getCreatedAt() != null)
                .filter(note -> note.getCreatedAt().atZone(MONITORING_ZONE).toLocalDate().isEqual(today))
                .count();
        List<InternalWorkspaceActivityDto> recentActivities = recentActivityRepository.findTop10ByOrderByActivityAtDesc().stream()
                .map(activity -> new InternalWorkspaceActivityDto(
                        activity.getActivityId(),
                        activity.getUserId(),
                        activity.getNoteId(),
                        activity.getTitle(),
                        activity.getActivityType(),
                        activity.getActivityAt()
                ))
                .toList();
        return new InternalWorkspaceMonitoringSummaryData(
                safeToInt(noteRepository.countByDeletedFalse()),
                totalStorageBytes,
                notesCreatedToday,
                recentActivities
        );
    }

    public InternalDefaultWorkspaceData getOrCreateDefaultWorkspace(String userId) {
        String normalizedUserId = trimToNull(userId);
        if (normalizedUserId == null) {
            throw new WorkspaceException(HttpStatus.BAD_REQUEST, "USER_ID_REQUIRED", "User id is required.");
        }

        Workspace existingDefault = workspaceRepository.findDefaultWorkspacesByUserId(normalizedUserId).stream()
                .findFirst()
                .orElse(null);
        if (existingDefault != null) {
            return defaultWorkspaceData(existingDefault);
        }

        String documentGroupId = defaultDocumentGroupId(normalizedUserId);
        Workspace existingById = workspaceRepository.findById(documentGroupId).orElse(null);
        if (existingById != null) {
            return defaultWorkspaceData(existingById);
        }

        Instant now = Instant.now();
        try {
            Workspace created = workspaceRepository.save(new Workspace(documentGroupId, normalizedUserId, "Default", true, now));
            return defaultWorkspaceData(created);
        } catch (DataIntegrityViolationException exception) {
            Workspace recovered = workspaceRepository.findById(documentGroupId)
                    .orElseGet(() -> workspaceRepository.findDefaultWorkspacesByUserId(normalizedUserId).stream()
                            .findFirst()
                            .orElseThrow(() -> exception));
            return defaultWorkspaceData(recovered);
        }
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

    private void syncWikiLinksForNote(Note source, Instant occurredAt) {
        List<ParsedWikiLink> parsedLinks = extractWikiLinks(source.getMarkdown());
        List<NoteLink> existingLinks = noteLinkRepository.findBySourceNoteIdAndUserId(source.getNoteId(), source.getUserId());

        Map<String, NoteLink> existingWikiByTarget = existingLinks.stream()
                .filter(NoteLink::isWikiLink)
                .collect(Collectors.toMap(NoteLink::getTargetNoteId, link -> link, (left, right) -> left, LinkedHashMap::new));
        Set<String> protectedTargetIds = existingLinks.stream()
                .filter(link -> !link.isWikiLink())
                .map(NoteLink::getTargetNoteId)
                .collect(Collectors.toSet());
        Map<String, DesiredWikiLink> desiredByTarget = new LinkedHashMap<>();

        for (ParsedWikiLink parsed : parsedLinks) {
            Note target = noteRepository.findFirstByUserIdAndTitleAndDeletedFalse(source.getUserId(), parsed.title())
                    .orElse(null);
            if (target == null || Objects.equals(target.getNoteId(), source.getNoteId())) {
                continue;
            }
            if (protectedTargetIds.contains(target.getNoteId())) {
                continue;
            }
            desiredByTarget.putIfAbsent(target.getNoteId(), new DesiredWikiLink(target, parsed.anchorText(), parsed.headingAnchor()));
        }

        for (Map.Entry<String, NoteLink> entry : existingWikiByTarget.entrySet()) {
            String targetNoteId = entry.getKey();
            NoteLink existing = entry.getValue();
            DesiredWikiLink desired = desiredByTarget.remove(targetNoteId);
            if (desired == null) {
                deleteProjectedLink(existing);
                continue;
            }
            if (!sameWikiProjection(existing, desired)) {
                deleteProjectedLink(existing);
                createWikiLink(source, desired, occurredAt);
            }
        }

        for (DesiredWikiLink desired : desiredByTarget.values()) {
            createWikiLink(source, desired, occurredAt);
        }
    }

    private void syncIncomingWikiLinksForTitle(String userId, String noteTitle, String targetNoteId, Instant occurredAt) {
        String normalizedTitle = trimToNull(noteTitle);
        if (normalizedTitle == null) {
            return;
        }
        noteRepository.findByUserIdAndDeletedFalseOrderByUpdatedAtDesc(userId).stream()
                .filter(note -> !Objects.equals(note.getNoteId(), targetNoteId))
                .filter(note -> noteMayReferenceTitle(note.getMarkdown(), normalizedTitle))
                .forEach(note -> syncWikiLinksForNote(note, occurredAt));
    }

    private void createWikiLink(Note source, DesiredWikiLink desired, Instant occurredAt) {
        NoteLink link = new NoteLink(
                Ids.link(),
                source.getUserId(),
                source.getNoteId(),
                desired.target().getNoteId(),
                desired.target().getTitle(),
                NoteLink.TYPE_WIKI,
                desired.anchorText(),
                desired.headingAnchor(),
                occurredAt
        );
        noteLinkRepository.save(link);
        publishLinkCreated(link);
    }

    private boolean sameWikiProjection(NoteLink existing, DesiredWikiLink desired) {
        return Objects.equals(existing.getTargetTitle(), desired.target().getTitle())
                && Objects.equals(existing.getAnchorText(), desired.anchorText())
                && Objects.equals(existing.getHeadingAnchor(), desired.headingAnchor());
    }

    private void deleteProjectedLink(NoteLink link) {
        noteLinkRepository.delete(link);
        log.info("[WorkspaceService] calling neo4jGraphProjection.deleteManualLink - userId: {}, sourceNoteId: {}, targetNoteId: {}, linkId: {}",
                link.getUserId(), link.getSourceNoteId(), link.getTargetNoteId(), link.getLinkId());
        neo4jGraphProjection.deleteManualLink(link.getUserId(), link.getSourceNoteId(), link.getTargetNoteId(), link.getLinkId());
        log.info("[WorkspaceService] finished neo4jGraphProjection.deleteManualLink call");
        eventPublisher.publish("NoteLinkDeleted", link.getUserId(), Map.of(
                "linkId", link.getLinkId(),
                "userId", link.getUserId(),
                "sourceNoteId", link.getSourceNoteId(),
                "targetNoteId", link.getTargetNoteId()
        ));
    }

    private void publishLinkCreated(NoteLink link) {
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("linkId", link.getLinkId());
        payload.put("userId", link.getUserId());
        payload.put("sourceNoteId", link.getSourceNoteId());
        payload.put("targetNoteId", link.getTargetNoteId());
        payload.put("linkType", link.getLinkType());
        payload.put("anchorText", link.getAnchorText());
        payload.put("headingAnchor", link.getHeadingAnchor());
        eventPublisher.publish("NoteLinkCreated", link.getUserId(), payload);
    }

    private List<ParsedWikiLink> extractWikiLinks(String markdown) {
        if (markdown == null || markdown.isBlank()) {
            return List.of();
        }
        List<ParsedWikiLink> result = new ArrayList<>();
        Matcher htmlMatcher = HTML_WIKI_LINK_PATTERN.matcher(markdown);
        StringBuffer withoutHtmlWikiLinks = new StringBuffer();
        while (htmlMatcher.find()) {
            String span = htmlMatcher.group();
            readHtmlWikiLink(span).ifPresent(result::add);
            htmlMatcher.appendReplacement(withoutHtmlWikiLinks, " ");
        }
        htmlMatcher.appendTail(withoutHtmlWikiLinks);

        Matcher rawMatcher = RAW_WIKI_LINK_PATTERN.matcher(withoutHtmlWikiLinks.toString());
        while (rawMatcher.find()) {
            parseWikiLinkBody(rawMatcher.group(1)).ifPresent(result::add);
        }
        return result;
    }

    private Optional<ParsedWikiLink> readHtmlWikiLink(String html) {
        Map<String, String> attrs = new HashMap<>();
        Matcher matcher = HTML_ATTRIBUTE_PATTERN.matcher(html);
        while (matcher.find()) {
            attrs.put(matcher.group(1).toLowerCase(Locale.ROOT), matcher.group(3));
        }
        String title = trimToNull(attrs.get("data-title"));
        if (title == null) {
            return Optional.empty();
        }
        String anchorText = normalizeAnchorText(attrs.get("data-alias"), title);
        return Optional.of(new ParsedWikiLink(title, anchorText, trimToNull(attrs.get("data-heading"))));
    }

    private Optional<ParsedWikiLink> parseWikiLinkBody(String rawBody) {
        if (rawBody == null || rawBody.isBlank()) {
            return Optional.empty();
        }
        String[] aliasSplit = rawBody.split("\\|", 2);
        String titleAndHeading = aliasSplit[0].trim();
        String alias = aliasSplit.length > 1 ? trimToNull(aliasSplit[1]) : null;
        String[] headingSplit = titleAndHeading.split("#", 2);
        String title = trimToNull(headingSplit[0]);
        if (title == null) {
            return Optional.empty();
        }
        String headingAnchor = headingSplit.length > 1 ? trimToNull(headingSplit[1]) : null;
        return Optional.of(new ParsedWikiLink(title, normalizeAnchorText(alias, title), headingAnchor));
    }

    private boolean noteMayReferenceTitle(String markdown, String noteTitle) {
        if (markdown == null || markdown.isBlank()) {
            return false;
        }
        return markdown.contains(noteTitle);
    }

    private String normalizeAnchorText(String candidate, String fallback) {
        String normalized = trimToNull(candidate);
        return normalized == null ? trimToNull(fallback) : normalized;
    }

    private String trimToNull(String value) {
        if (value == null) {
            return null;
        }
        String trimmed = value.trim();
        return trimmed.isBlank() ? null : trimmed;
    }

    private String displayLinkedText(NoteLink link) {
        return normalizeAnchorText(link.getAnchorText(), link.getTargetTitle());
    }

    private void activity(String userId, Note note, String type, Instant at) {
        recentActivityRepository.save(new RecentActivity(Ids.activity(), userId, note.getNoteId(), note.getTitle(), type, at));
    }

    private int safeToInt(long value) {
        if (value > Integer.MAX_VALUE) {
            return Integer.MAX_VALUE;
        }
        if (value < Integer.MIN_VALUE) {
            return Integer.MIN_VALUE;
        }
        return (int) value;
    }

    private Note note(String userId, String noteId) {
        return noteRepository.findByNoteIdAndUserId(noteId, userId)
                .orElseThrow(() -> notFound("NOTE_NOT_FOUND", "Note not found."));
    }

    private Folder folder(String userId, String folderId) {
        return folderRepository.findByFolderIdAndUserId(folderId, userId)
                .orElseThrow(() -> notFound("FOLDER_NOT_FOUND", "Folder not found."));
    }

    private Workspace workspace(String userId, String documentGroupId) {
        return workspaceRepository.findByDocumentGroupIdAndUserId(documentGroupId, userId)
                .orElseThrow(() -> notFound("WORKSPACE_NOT_FOUND", "Workspace not found."));
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
        return new FolderData(folder.getFolderId(), folder.getDocumentGroupId(), folder.getName(), folder.getParentFolderId(),
                folder.getParentFolderId() == null ? 0 : 1);
    }

    private InternalDefaultWorkspaceData defaultWorkspaceData(Workspace workspace) {
        return new InternalDefaultWorkspaceData(
                workspace.getDocumentGroupId(),
                workspace.getUserId(),
                workspace.getName(),
                workspace.getIsDefault(),
                workspace.getCreatedAt(),
                workspace.getUpdatedAt()
        );
    }

    private WorkspaceSummaryData workspaceSummaryData(Workspace workspace) {
        return new WorkspaceSummaryData(
                workspace.getDocumentGroupId(),
                workspace.getName(),
                workspace.getIsDefault(),
                workspace.getCreatedAt(),
                workspace.getUpdatedAt()
        );
    }

    private WorkspaceDetailData workspaceDetailData(Workspace workspace) {
        return new WorkspaceDetailData(
                workspace.getDocumentGroupId(),
                workspace.getName(),
                workspace.getIsDefault(),
                workspace.getCreatedAt(),
                workspace.getUpdatedAt()
        );
    }

    private String defaultDocumentGroupId(String userId) {
        return "dgrp_default_" + userId;
    }

    private String resolveDocumentGroupId(String userId, String requestedDocumentGroupId) {
        String normalized = trimToNull(requestedDocumentGroupId);
        if (normalized != null) {
            return normalized;
        }
        if (isGuestUserId(userId)) {
            // Guest는 Workspace를 가지지 않는다 — documentGroupId를 생략했다고 해서
            // Guest 세션 id로 default Workspace를 만들어서는 안 된다. Guest가 만든
            // Folder/Note는 documentGroupId=null로 남는다(레거시 데이터와 동일하게 취급).
            return null;
        }
        return getOrCreateDefaultWorkspace(userId).documentGroupId();
    }

    private boolean isGuestUserId(String userId) {
        return userId != null && userId.startsWith(GUEST_ID_PREFIX);
    }

    /** documentGroupId가 요청에 명시적으로 왔을 때만 호출자 소유인지 확인한다(404).
        생략된 경우(null/blank)는 resolveDocumentGroupId의 기본값/Guest 처리에 맡긴다. */
    private void requireOwnedWorkspaceIfProvided(String userId, String requestedDocumentGroupId) {
        String normalized = trimToNull(requestedDocumentGroupId);
        if (normalized != null) {
            workspace(userId, normalized);
        }
    }

    /** targetFolderId가 있을 때만, 그 폴더가 호출자 소유이고(404) documentGroupId가 일치하는지
        확인한다. 대상 폴더 또는 기준 documentGroupId 중 하나라도 null이면(레거시 데이터) 비교를
        건너뛰어 기존 동작을 깨지 않는다. */
    private void requireFolderInWorkspace(String userId, String folderId, String documentGroupId,
                                          String mismatchCode, String mismatchMessage) {
        if (folderId == null || folderId.isBlank()) {
            return;
        }
        Folder target = folder(userId, folderId);
        String targetDocumentGroupId = target.getDocumentGroupId();
        if (targetDocumentGroupId != null && documentGroupId != null && !targetDocumentGroupId.equals(documentGroupId)) {
            throw new WorkspaceException(HttpStatus.BAD_REQUEST, mismatchCode, mismatchMessage);
        }
    }

    private String requireWorkspaceName(String name) {
        String normalized = trimToNull(name);
        if (normalized == null) {
            throw new WorkspaceException(HttpStatus.BAD_REQUEST, "WORKSPACE_NAME_REQUIRED", "Workspace name is required.");
        }
        return normalized;
    }

    private ShareLinkData shareData(ShareLink share) {
        return new ShareLinkData(share.getShareId(), publicBaseUrl + "/share/" + share.getShareId(), share.getPermission(), share.getExpiresAt(), share.isRevoked());
    }

    private Map<String, Object> noteMap(Note note) {
        return payload("noteId", note.getNoteId(), "documentGroupId", note.getDocumentGroupId(), "title", note.getTitle(),
                "markdown", note.getMarkdown(), "folderId", note.getFolderId(),
                "tags", new ArrayList<>(note.getTags()), "version", note.getVersion(), "createdAt", note.getCreatedAt(), "updatedAt", note.getUpdatedAt(),
                "deleted", note.isDeleted(), "typography", typography(note));
    }

    private Map<String, Object> folderMap(Folder folder) {
        return payload("folderId", folder.getFolderId(), "documentGroupId", folder.getDocumentGroupId(), "name", folder.getName(),
                "parentFolderId", folder.getParentFolderId(), "depth", folderData(folder).depth());
    }

    private Map<String, Object> linkMap(NoteLink link) {
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("linkId", link.getLinkId());
        result.put("sourceNoteId", link.getSourceNoteId());
        result.put("targetNoteId", link.getTargetNoteId());
        result.put("targetTitle", link.getTargetTitle());
        result.put("anchorText", link.getAnchorText());
        result.put("headingAnchor", link.getHeadingAnchor());
        return result;
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

    public Map<String, Object> syncGraph() {
        int wikiLinksBackfilled = backfillWikiLinks();
        Map<String, Object> syncResult = new LinkedHashMap<>(neo4jGraphProjection.syncAll());
        syncResult.put("wikiLinksBackfilled", wikiLinksBackfilled);
        return syncResult;
    }

    private int backfillWikiLinks() {
        List<Note> notes = noteRepository.findAll();
        int processed = 0;
        Instant now = Instant.now();
        for (Note note : notes) {
            syncWikiLinksForNote(note, now);
            processed += 1;
        }
        return processed;
    }

    private NoteLinkData linkData(NoteLink link) {
        return new NoteLinkData(
                link.getLinkId(),
                link.getSourceNoteId(),
                link.getTargetNoteId(),
                link.getTargetTitle(),
                link.getLinkType(),
                link.getAnchorText(),
                link.getHeadingAnchor()
        );
    }

    private GraphData preferGraphView(GraphData neo4jGraph, GraphData ledgerGraph) {
        if (neo4jGraph.nodes().isEmpty() && !ledgerGraph.nodes().isEmpty()) {
            return ledgerGraph;
        }
        if (neo4jGraph.edges().isEmpty() && !ledgerGraph.edges().isEmpty()) {
            return ledgerGraph;
        }
        if (neo4jGraph.edges().size() < ledgerGraph.edges().size()) {
            return new GraphData(
                    neo4jGraph.nodes().isEmpty() ? ledgerGraph.nodes() : neo4jGraph.nodes(),
                    ledgerGraph.edges(),
                    Map.of(
                            "noteCount", neo4jGraph.nodes().isEmpty() ? ledgerGraph.nodes().size() : neo4jGraph.nodes().size(),
                            "edgeCount", ledgerGraph.edges().size(),
                            "source", "neo4j+workspace-ledger-edges"
                    ),
                    neo4jGraph.lastViewedAt()
            );
        }
        return neo4jGraph;
    }

    private record ParsedWikiLink(String title, String anchorText, String headingAnchor) {
    }

    private record DesiredWikiLink(Note target, String anchorText, String headingAnchor) {
    }
}
