package com.brainx.intelligence.agent.application.port.outbound;

import java.util.Optional;

public interface AgentNoteSourcePort {

    Optional<AgentNoteSource> findSearchableAgentNoteSource(
        String userId,
        String documentGroupId,
        String noteId
    );

    record AgentNoteSource(
        String noteId,
        String title
    ) {
    }
}
