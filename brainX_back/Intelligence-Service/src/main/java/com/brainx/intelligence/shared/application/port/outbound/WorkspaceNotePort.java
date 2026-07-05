package com.brainx.intelligence.shared.application.port.outbound;

import java.time.Instant;
import java.util.List;

import com.brainx.intelligence.shared.domain.DocumentGroups;

/**
 * 원본 노트 조회와 수락된 AI 제안 반영을 Workspace 도메인에 위임하기 위한 출력 포트입니다.
 */
public interface WorkspaceNotePort {

    NoteSnapshot getNoteSnapshot(String noteId);

    void applyAcceptedSuggestion(ApplyAcceptedSuggestionCommand command);

    default CreatedNote createNoteFromAgent(CreateNoteCommand command) {
        throw new UnsupportedOperationException("Agent note creation is not implemented.");
    }

    default NoteContentPatchResult appendNoteContentFromAgent(AppendNoteContentCommand command) {
        throw new UnsupportedOperationException("Agent note append is not implemented.");
    }

    record NoteSnapshot(
        String noteId,
        String documentGroupId,
        String title,
        String markdown,
        List<String> tags,
        String folderId,
        int version,
        Instant updatedAt
    ) {

        public NoteSnapshot(String noteId, String title, String markdown, Instant capturedAt) {
            this(noteId, DocumentGroups.DEFAULT_DOCUMENT_GROUP_ID, title, markdown, List.of(), null, 0, capturedAt);
        }

        public NoteSnapshot(
            String noteId,
            String title,
            String markdown,
            List<String> tags,
            String folderId,
            int version,
            Instant updatedAt
        ) {
            this(noteId, DocumentGroups.DEFAULT_DOCUMENT_GROUP_ID, title, markdown, tags, folderId, version, updatedAt);
        }

        public NoteSnapshot {
            documentGroupId = DocumentGroups.normalize(documentGroupId);
        }
    }

    record ApplyAcceptedSuggestionCommand(
        String noteId,
        String suggestionId,
        String replacementMarkdown
    ) {
    }

    record CreateNoteCommand(
        String userId,
        String documentGroupId,
        String actionId,
        String title,
        String markdown,
        List<String> tags,
        String targetFolderId
    ) {
    }

    record CreatedNote(
        String noteId,
        int version
    ) {
    }

    record AppendNoteContentCommand(
        String userId,
        String documentGroupId,
        String noteId,
        String actionId,
        int baseVersion,
        String appendMarkdown
    ) {
    }

    record NoteContentPatchResult(
        String noteId,
        int version,
        Instant savedAt
    ) {
    }
}
