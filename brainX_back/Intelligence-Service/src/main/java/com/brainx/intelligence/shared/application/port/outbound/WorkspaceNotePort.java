package com.brainx.intelligence.shared.application.port.outbound;

import java.time.Instant;
import java.util.List;

/**
 * 원본 노트 조회와 수락된 AI 제안 반영을 Workspace 도메인에 위임하기 위한 출력 포트입니다.
 */
public interface WorkspaceNotePort {

    NoteSnapshot getNoteSnapshot(String noteId);

    void applyAcceptedSuggestion(ApplyAcceptedSuggestionCommand command);

    record NoteSnapshot(
        String noteId,
        String title,
        String markdown,
        List<String> tags,
        String folderId,
        int version,
        Instant updatedAt
    ) {

        public NoteSnapshot(String noteId, String title, String markdown, Instant capturedAt) {
            this(noteId, title, markdown, List.of(), null, 0, capturedAt);
        }
    }

    record ApplyAcceptedSuggestionCommand(
        String noteId,
        String suggestionId,
        String replacementMarkdown
    ) {
    }
}
