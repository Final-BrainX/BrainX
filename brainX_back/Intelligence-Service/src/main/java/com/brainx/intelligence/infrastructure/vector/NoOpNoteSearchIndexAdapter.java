package com.brainx.intelligence.infrastructure.vector;

import java.util.List;

import org.springframework.stereotype.Component;

import com.brainx.intelligence.exploration.application.port.outbound.NoteSearchIndexPort;
import com.brainx.intelligence.exploration.domain.NoteSearchDocument;
import com.brainx.intelligence.exploration.domain.SemanticSearchResult;

@Component
public class NoOpNoteSearchIndexAdapter implements NoteSearchIndexPort {

    @Override
    public List<SemanticSearchResult> search(NoteSearchQuery query) {
        return List.of();
    }

    @Override
    public NoteSearchDocument save(NoteSearchDocument document) {
        return document;
    }
}
