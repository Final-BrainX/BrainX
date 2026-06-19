package com.brainx.intelligence.infrastructure.workspace;

import java.time.Instant;

import org.springframework.stereotype.Component;

import com.brainx.intelligence.shared.application.port.outbound.WorkspaceNotePort;

@Component
public class ExternalWorkspaceNoteAdapter implements WorkspaceNotePort {

    @Override
    public NoteSnapshot getNoteSnapshot(String noteId) {
        return new NoteSnapshot(noteId, "", "", Instant.now());
    }

    @Override
    public void applyAcceptedSuggestion(ApplyAcceptedSuggestionCommand command) {
        // Workspace patch integration is implemented with the assist domain.
    }
}
