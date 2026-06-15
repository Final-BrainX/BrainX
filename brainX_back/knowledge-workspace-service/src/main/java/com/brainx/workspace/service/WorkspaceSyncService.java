package com.brainx.workspace.service;

import com.brainx.workspace.dto.response.WorkspaceResponse.*;
import com.brainx.workspace.entity.Favorite;
import com.brainx.workspace.entity.Note;
import com.brainx.workspace.repository.*;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.List;

@Service
@RequiredArgsConstructor
public class WorkspaceSyncService {

    private final NoteRepository noteRepository;
    private final FolderRepository folderRepository;
    private final TagRepository tagRepository;
    private final NoteLinkRepository noteLinkRepository;
    private final FavoriteRepository favoriteRepository;
    private final RecentActivityRepository recentActivityRepository;

    @Transactional(readOnly = true)
    public WorkspaceSyncResponse sync(String userId, String cursor) {
        // cursor가 있으면 해당 시점 이후 변경분만, 없으면 전체
        List<Note> notes;
        if (cursor != null && !cursor.isBlank()) {
            LocalDateTime since = LocalDateTime.parse(cursor);
            notes = noteRepository.findUpdatedSince(userId, since);
        } else {
            notes = noteRepository.findByUserIdAndStatusNot(userId, Note.NoteStatus.DELETED);
        }

        List<NoteResponse> noteResponses = notes.stream()
                .map(NoteResponse::from)
                .toList();

        List<FolderResponse> folders = folderRepository.findByUserId(userId).stream()
                .map(FolderResponse::from)
                .toList();

        List<TagResponse> tags = tagRepository.findByUserId(userId).stream()
                .map(TagResponse::from)
                .toList();

        List<NoteLinkResponse> links = notes.stream()
                .flatMap(n -> noteLinkRepository.findBySourceNoteNoteId(n.getNoteId()).stream())
                .map(l -> NoteLinkResponse.builder()
                        .linkId(l.getLinkId())
                        .targetNoteId(l.getTargetNote().getNoteId())
                        .targetTitle(l.getTargetTitle())
                        .build())
                .toList();

        List<FavoriteResponse> favorites = favoriteRepository.findByUserId(userId).stream()
                .map(f -> FavoriteResponse.builder().enabled(true).build())
                .toList();

        List<RecentActivityResponse> recentActivities = recentActivityRepository
                .findByUserIdOrderByViewedAtDesc(userId, PageRequest.of(0, 20))
                .stream()
                .map(RecentActivityResponse::from)
                .toList();

        String newCursor = LocalDateTime.now().toString();

        return WorkspaceSyncResponse.builder()
                .cursor(newCursor)
                .notes(noteResponses)
                .folders(folders)
                .tags(tags)
                .links(links)
                .favorites(favorites)
                .recentActivities(recentActivities)
                .build();
    }
}
