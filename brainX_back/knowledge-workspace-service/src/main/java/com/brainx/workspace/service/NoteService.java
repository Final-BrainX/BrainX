package com.brainx.workspace.service;

import com.brainx.workspace.dto.request.WorkspaceRequest.*;
import com.brainx.workspace.dto.response.WorkspaceResponse.*;
import com.brainx.workspace.entity.*;
import com.brainx.workspace.exception.BrainXException;
import com.brainx.workspace.repository.*;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;

@Slf4j
@Service
@RequiredArgsConstructor
public class NoteService {

    private final NoteRepository noteRepository;
    private final NoteContentRepository noteContentRepository;
    private final NoteTagRepository noteTagRepository;
    private final TagRepository tagRepository;
    private final FolderRepository folderRepository;
    private final FavoriteRepository favoriteRepository;
    private final RecentActivityRepository recentActivityRepository;
    private final NoteLinkRepository noteLinkRepository;

    @Transactional
    public NoteResponse createNote(String userId, CreateNoteRequest request) {
        Folder folder = null;
        if (request.getFolderId() != null) {
            folder = folderRepository.findByFolderIdAndUserId(request.getFolderId(), userId)
                    .orElseThrow(() -> BrainXException.notFound("폴더를 찾을 수 없습니다"));
        }

        Note note = Note.builder()
                .userId(userId)
                .title(request.getTitle())
                .folder(folder)
                .build();
        noteRepository.save(note);

        NoteContent content = NoteContent.builder()
                .note(note)
                .markdown(request.getMarkdown() != null ? request.getMarkdown() : "")
                .build();
        noteContentRepository.save(content);
        note.setContent(content);

        if (request.getTags() != null && !request.getTags().isEmpty()) {
            applyTags(note, userId, request.getTags());
        }

        log.info("노트 생성: noteId={}, userId={}", note.getNoteId(), userId);
        return NoteResponse.from(note);
    }

    @Transactional(readOnly = true)
    public NoteDetailResponse getNote(String userId, String noteId) {
        Note note = noteRepository.findByNoteIdAndUserIdWithDetails(noteId, userId)
                .orElseThrow(() -> BrainXException.notFound("노트를 찾을 수 없습니다"));
        return NoteDetailResponse.from(note);
    }

    @Transactional
    public NoteSaveResponse saveNoteContent(String userId, String noteId, SaveNoteContentRequest request) {
        Note note = noteRepository.findByNoteIdAndUserId(noteId, userId)
                .orElseThrow(() -> BrainXException.notFound("노트를 찾을 수 없습니다"));

        // 낙관적 락: baseVersion이 현재 version과 다르면 충돌
        if (request.getBaseVersion() != note.getVersion()) {
            return NoteSaveResponse.builder()
                    .version(note.getVersion())
                    .savedAt(LocalDateTime.now())
                    .conflict(true)
                    .build();
        }

        NoteContent content = note.getContent();
        if (content == null) {
            content = NoteContent.builder().note(note).build();
        }
        content.setMarkdown(request.getMarkdown() != null ? request.getMarkdown() : "");
        noteContentRepository.save(content);

        note.setVersion(note.getVersion() + 1);
        noteRepository.save(note);

        return NoteSaveResponse.builder()
                .version(note.getVersion())
                .savedAt(LocalDateTime.now())
                .conflict(false)
                .build();
    }

    @Transactional
    public NoteResponse updateNoteMetadata(String userId, String noteId, UpdateNoteMetadataRequest request) {
        Note note = noteRepository.findByNoteIdAndUserIdWithDetails(noteId, userId)
                .orElseThrow(() -> BrainXException.notFound("노트를 찾을 수 없습니다"));

        if (request.getTitle() != null) {
            note.setTitle(request.getTitle());
        }
        if (request.getFolderId() != null) {
            Folder folder = folderRepository.findByFolderIdAndUserId(request.getFolderId(), userId)
                    .orElseThrow(() -> BrainXException.notFound("폴더를 찾을 수 없습니다"));
            note.setFolder(folder);
        }
        if (request.getTags() != null) {
            applyTags(note, userId, request.getTags());
        }

        note.setVersion(note.getVersion() + 1);
        noteRepository.save(note);
        return NoteResponse.from(note);
    }

    @Transactional
    public DeleteNoteResponse deleteNote(String userId, String noteId, DeleteNoteRequest request) {
        Note note = noteRepository.findByNoteIdAndUserId(noteId, userId)
                .orElseThrow(() -> BrainXException.notFound("노트를 찾을 수 없습니다"));

        LocalDateTime now = LocalDateTime.now();
        if ("permanent".equals(request.getMode())) {
            noteRepository.delete(note);
            return DeleteNoteResponse.builder().deletedAt(now).build();
        } else {
            note.setStatus(Note.NoteStatus.TRASHED);
            note.setTrashedAt(now);
            noteRepository.save(note);
            return DeleteNoteResponse.builder()
                    .deletedAt(now)
                    .purgeAt(now.plusDays(30))
                    .build();
        }
    }

    @Transactional
    public OkResponse recordNoteView(String userId, String noteId, NoteViewRequest request) {
        Note note = noteRepository.findByNoteIdAndUserId(noteId, userId)
                .orElseThrow(() -> BrainXException.notFound("노트를 찾을 수 없습니다"));

        LocalDateTime viewedAt = request.getViewedAt() != null ? request.getViewedAt() : LocalDateTime.now();

        // 기존 최근 활동 갱신 또는 신규 추가
        RecentActivity activity = recentActivityRepository.findByUserIdAndNoteId(userId, noteId)
                .orElse(RecentActivity.builder()
                        .userId(userId)
                        .noteId(noteId)
                        .noteTitle(note.getTitle())
                        .build());
        activity.setViewedAt(viewedAt);
        activity.setNoteTitle(note.getTitle());
        recentActivityRepository.save(activity);

        return OkResponse.builder().ok(true).build();
    }

    @Transactional(readOnly = true)
    public List<RecentActivityResponse> getRecentActivities(String userId, int limit) {
        return recentActivityRepository
                .findByUserIdOrderByViewedAtDesc(userId, PageRequest.of(0, limit))
                .stream()
                .map(RecentActivityResponse::from)
                .toList();
    }

    // ---- 태그 ----

    @Transactional
    public List<TagResponse> updateNoteTags(String userId, String noteId, UpdateTagsRequest request) {
        Note note = noteRepository.findByNoteIdAndUserId(noteId, userId)
                .orElseThrow(() -> BrainXException.notFound("노트를 찾을 수 없습니다"));

        noteTagRepository.deleteByNoteNoteId(noteId);
        note.getNoteTags().clear();

        if (request.getTagNames() != null) {
            applyTags(note, userId, request.getTagNames());
        }
        noteRepository.save(note);

        return note.getNoteTags().stream()
                .map(nt -> TagResponse.from(nt.getTag()))
                .toList();
    }

    @Transactional(readOnly = true)
    public List<TagResponse> suggestTags(String userId, String query) {
        return tagRepository.findByUserIdAndNameContainingIgnoreCase(userId, query)
                .stream()
                .map(TagResponse::from)
                .toList();
    }

    // ---- 즐겨찾기 ----

    @Transactional
    public FavoriteResponse setFavorite(String userId, String targetType, String targetId, FavoriteRequest request) {
        if (request.isEnabled()) {
            boolean exists = favoriteRepository
                    .findByUserIdAndTargetTypeAndTargetId(userId, targetType, targetId)
                    .isPresent();
            if (!exists) {
                Favorite fav = Favorite.builder()
                        .userId(userId)
                        .targetType(targetType)
                        .targetId(targetId)
                        .build();
                favoriteRepository.save(fav);
            }
        } else {
            favoriteRepository.deleteByUserIdAndTargetTypeAndTargetId(userId, targetType, targetId);
        }
        return FavoriteResponse.builder().enabled(request.isEnabled()).build();
    }

    // ---- 링크 ----

    @Transactional
    public NoteLinkResponse createNoteLink(String userId, String sourceNoteId, CreateNoteLinkRequest request) {
        Note sourceNote = noteRepository.findByNoteIdAndUserId(sourceNoteId, userId)
                .orElseThrow(() -> BrainXException.notFound("소스 노트를 찾을 수 없습니다"));

        Note targetNote;
        if (request.getTargetNoteId() != null) {
            targetNote = noteRepository.findByNoteIdAndUserId(request.getTargetNoteId(), userId)
                    .orElseThrow(() -> BrainXException.notFound("타겟 노트를 찾을 수 없습니다"));
        } else if (Boolean.TRUE.equals(request.getCreateIfMissing()) && request.getTargetTitle() != null) {
            targetNote = Note.builder()
                    .userId(userId)
                    .title(request.getTargetTitle())
                    .build();
            noteRepository.save(targetNote);
            NoteContent content = NoteContent.builder().note(targetNote).markdown("").build();
            noteContentRepository.save(content);
        } else {
            throw BrainXException.badRequest("INVALID_LINK", "targetNoteId 또는 targetTitle이 필요합니다");
        }

        if (noteLinkRepository.existsBySourceNoteNoteIdAndTargetNoteNoteId(sourceNoteId, targetNote.getNoteId())) {
            throw BrainXException.badRequest("DUPLICATE_LINK", "이미 연결된 노트입니다");
        }

        NoteLink link = NoteLink.builder()
                .sourceNote(sourceNote)
                .targetNote(targetNote)
                .targetTitle(targetNote.getTitle())
                .build();
        noteLinkRepository.save(link);

        return NoteLinkResponse.builder()
                .linkId(link.getLinkId())
                .targetNoteId(targetNote.getNoteId())
                .targetTitle(targetNote.getTitle())
                .build();
    }

    @Transactional
    public OkResponse deleteNoteLink(String userId, String sourceNoteId, String linkId) {
        // 소유권 검증
        noteRepository.findByNoteIdAndUserId(sourceNoteId, userId)
                .orElseThrow(() -> BrainXException.notFound("노트를 찾을 수 없습니다"));
        NoteLink link = noteLinkRepository.findById(linkId)
                .orElseThrow(() -> BrainXException.notFound("링크를 찾을 수 없습니다"));
        noteLinkRepository.delete(link);
        return OkResponse.builder().ok(true).build();
    }

    @Transactional(readOnly = true)
    public List<BacklinkResponse> getBacklinks(String userId, String noteId) {
        noteRepository.findByNoteIdAndUserId(noteId, userId)
                .orElseThrow(() -> BrainXException.notFound("노트를 찾을 수 없습니다"));
        return noteLinkRepository.findByTargetNoteNoteId(noteId).stream()
                .map(link -> BacklinkResponse.builder()
                        .noteId(link.getSourceNote().getNoteId())
                        .title(link.getSourceNote().getTitle())
                        .createdAt(link.getCreatedAt())
                        .build())
                .toList();
    }

    @Transactional(readOnly = true)
    public List<NoteLinkResponse> getOutgoingLinks(String userId, String noteId) {
        noteRepository.findByNoteIdAndUserId(noteId, userId)
                .orElseThrow(() -> BrainXException.notFound("노트를 찾을 수 없습니다"));
        return noteLinkRepository.findBySourceNoteNoteId(noteId).stream()
                .map(link -> NoteLinkResponse.builder()
                        .linkId(link.getLinkId())
                        .targetNoteId(link.getTargetNote().getNoteId())
                        .targetTitle(link.getTargetTitle())
                        .build())
                .toList();
    }

    // ---- 그래프 ----

    @Transactional(readOnly = true)
    public GraphResponse getGraph(String userId) {
        List<Note> notes = noteRepository.findByUserIdAndStatusNot(userId, Note.NoteStatus.DELETED);
        List<NoteLink> links = new ArrayList<>();
        for (Note n : notes) {
            links.addAll(noteLinkRepository.findBySourceNoteNoteId(n.getNoteId()));
        }

        List<GraphResponse.GraphNode> nodes = notes.stream()
                .map(n -> GraphResponse.GraphNode.builder()
                        .id(n.getNoteId())
                        .label(n.getTitle())
                        .type("note")
                        .createdAt(n.getCreatedAt())
                        .updatedAt(n.getUpdatedAt())
                        .build())
                .toList();

        List<GraphResponse.GraphEdge> edges = links.stream()
                .map(l -> GraphResponse.GraphEdge.builder()
                        .id(l.getLinkId())
                        .source(l.getSourceNote().getNoteId())
                        .target(l.getTargetNote().getNoteId())
                        .build())
                .toList();

        return GraphResponse.builder().nodes(nodes).edges(edges).build();
    }

    // ---- private helpers ----

    private void applyTags(Note note, String userId, List<String> tagNames) {
        noteTagRepository.deleteByNoteNoteId(note.getNoteId());
        note.getNoteTags().clear();

        for (String name : tagNames) {
            Tag tag = tagRepository.findByUserIdAndName(userId, name)
                    .orElseGet(() -> tagRepository.save(
                            Tag.builder().userId(userId).name(name).build()));
            NoteTag noteTag = NoteTag.builder().note(note).tag(tag).build();
            noteTagRepository.save(noteTag);
            note.getNoteTags().add(noteTag);
        }
    }
}
