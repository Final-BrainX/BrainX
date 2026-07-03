package com.brainx.intelligence.exploration.application.usecase;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.function.Function;
import java.util.stream.Collectors;

import org.springframework.stereotype.Service;

import com.brainx.intelligence.exploration.application.port.inbound.GetNoteIndexStatusesUseCase;
import com.brainx.intelligence.exploration.application.port.outbound.NoteIndexStatusPort;
import com.brainx.intelligence.exploration.application.port.outbound.NoteIndexStatusPort.NoteIndexStatusProjection;
import com.brainx.intelligence.exploration.domain.ExplorationDomainException;
import com.brainx.intelligence.shared.domain.DocumentGroups;

@Service
public class NoteIndexStatusService implements GetNoteIndexStatusesUseCase {

    private static final int MAX_NOTE_IDS = 200;
    private static final String NOT_INDEXED = "NOT_INDEXED";

    private final NoteIndexStatusPort noteIndexStatusPort;

    public NoteIndexStatusService(NoteIndexStatusPort noteIndexStatusPort) {
        this.noteIndexStatusPort = noteIndexStatusPort;
    }

    @Override
    public NoteIndexStatusesResponse getNoteIndexStatuses(NoteIndexStatusesCommand command) {
        String userId = requireText(command.userId(), "userId");
        String documentGroupId = DocumentGroups.normalize(command.documentGroupId());
        List<String> noteIds = normalizeNoteIds(command.noteIds());
        Map<String, NoteIndexStatusProjection> projectionsById = noteIndexStatusPort.findNoteIndexStatuses(
                userId,
                documentGroupId,
                noteIds
            ).stream()
            .collect(Collectors.toMap(
                NoteIndexStatusProjection::noteId,
                Function.identity(),
                (left, right) -> left,
                LinkedHashMap::new
            ));

        return new NoteIndexStatusesResponse(noteIds.stream()
            .map(noteId -> toView(noteId, projectionsById.get(noteId)))
            .toList());
    }

    private static NoteIndexStatusView toView(String noteId, NoteIndexStatusProjection projection) {
        if (projection == null) {
            return new NoteIndexStatusView(
                noteId,
                NOT_INDEXED,
                false,
                null
            );
        }
        return new NoteIndexStatusView(
            projection.noteId(),
            projection.searchIndexStatus(),
            projection.availableForAiFeatures(),
            projection.indexedAt()
        );
    }

    private static List<String> normalizeNoteIds(List<String> noteIds) {
        if (noteIds == null || noteIds.isEmpty()) {
            throw new ExplorationDomainException("noteIds must not be empty.");
        }
        if (noteIds.size() > MAX_NOTE_IDS) {
            throw new ExplorationDomainException("noteIds must contain at most 200 items.");
        }
        return noteIds.stream()
            .map(noteId -> requireText(noteId, "noteIds[]"))
            .toList();
    }

    private static String requireText(String value, String name) {
        if (value == null || value.isBlank()) {
            throw new ExplorationDomainException(name + " must not be blank.");
        }
        return value;
    }
}
