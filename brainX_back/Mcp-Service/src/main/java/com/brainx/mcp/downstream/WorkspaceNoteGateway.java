package com.brainx.mcp.downstream;

import java.time.Instant;
import java.util.List;

public interface WorkspaceNoteGateway {

    NoteDetail getNote(String userId, String noteId);

    CreatedNote createNote(String userId, CreateNoteCommand command);

    record CreateNoteCommand(
        String title,
        String markdown,
        String folderId,
        List<String> tags
    ) {
    }

    record CreatedNote(
        String noteId,
        String title,
        String folderId,
        int version,
        Instant createdAt
    ) {
    }

    record NoteDetail(
        String noteId,
        String title,
        String markdown,
        FolderRef folder,
        List<String> tags,
        int version,
        Instant createdAt,
        Instant updatedAt
    ) {
    }

    record FolderRef(
        String folderId,
        String name
    ) {
    }
}
