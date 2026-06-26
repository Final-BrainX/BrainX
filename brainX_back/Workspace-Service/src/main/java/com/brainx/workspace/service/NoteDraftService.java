package com.brainx.workspace.service;

import com.brainx.workspace.dto.WorkspaceDtos.NoteDraftSaveData;
import com.brainx.workspace.dto.WorkspaceDtos.NoteDraftSaveRequest;
import com.brainx.workspace.dto.WorkspaceDtos.NoteDraftData;
import com.brainx.workspace.dto.WorkspaceDtos.NoteDraftIdData;
import com.brainx.workspace.dto.WorkspaceDtos.NoteDraftListData;
import com.brainx.workspace.security.CurrentActor.Actor;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Service;

import java.time.Duration;
import java.time.Instant;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Set;

@Service
@RequiredArgsConstructor
public class NoteDraftService {
    private static final String DRAFT_KEY_FORMAT = "workspace:note:draft:%s:%s:%s";
    private static final String DIRTY_KEY_FORMAT = "workspace:note:dirty:%s:%s";

    private final StringRedisTemplate redisTemplate;
    private final ObjectMapper objectMapper;

    @Value("${brainx.workspace.draft.ttl-seconds:86400}")
    private long draftTtlSeconds;

    public NoteDraftSaveData saveDraft(Actor actor, String noteId, NoteDraftSaveRequest request) {
        Instant savedAt = Instant.now();
        Instant expiresAt = savedAt.plusSeconds(draftTtlSeconds);
        Duration ttl = Duration.ofSeconds(draftTtlSeconds);
        String actorType = actorTypeSegment(actor);
        String draftKey = draftKey(actor, noteId);
        String dirtyKey = dirtyKey(actor);

        redisTemplate.opsForValue().set(draftKey, draftPayload(actor, noteId, request, savedAt), ttl);
        redisTemplate.opsForSet().add(dirtyKey, noteId);
        redisTemplate.expire(dirtyKey, ttl);

        return new NoteDraftSaveData(noteId, actorType.toUpperCase(Locale.ROOT), savedAt, expiresAt, "DRAFT_SAVED");
    }

    public NoteDraftIdData issueDraftId(Actor actor) {
        return new NoteDraftIdData(
                Ids.note(),
                actor.type().name(),
                Instant.now(),
                "DRAFT_ID_ISSUED"
        );
    }

    public NoteDraftData getDraft(Actor actor, String noteId) {
        String draftKey = draftKey(actor, noteId);
        String rawDraft = redisTemplate.opsForValue().get(draftKey);
        if (rawDraft == null) {
            return null;
        }

        Map<String, Object> payload = readDraftPayload(rawDraft);
        Instant savedAt = Instant.parse((String) payload.get("savedAt"));
        Long remainingTtlSeconds = redisTemplate.getExpire(draftKey);
        Instant expiresAt = remainingTtlSeconds != null && remainingTtlSeconds > 0
                ? Instant.now().plusSeconds(remainingTtlSeconds)
                : savedAt.plusSeconds(draftTtlSeconds);

        return new NoteDraftData(
                (String) payload.get("noteId"),
                (String) payload.get("actorType"),
                (String) payload.getOrDefault("title", "Untitled"),
                (String) payload.get("markdown"),
                ((Number) payload.get("baseVersion")).intValue(),
                Instant.parse((String) payload.get("clientSavedAt")),
                savedAt,
                expiresAt
        );
    }

    public NoteDraftListData listDrafts(Actor actor) {
        Set<String> noteIds = redisTemplate.opsForSet().members(dirtyKey(actor));
        if (noteIds == null || noteIds.isEmpty()) {
            return new NoteDraftListData(List.of());
        }

        List<NoteDraftData> drafts = noteIds.stream()
                .map(noteId -> getDraft(actor, noteId))
                .filter(Objects::nonNull)
                .sorted(Comparator.comparing(NoteDraftData::savedAt).reversed())
                .toList();
        return new NoteDraftListData(drafts);
    }

    String draftKey(Actor actor, String noteId) {
        return DRAFT_KEY_FORMAT.formatted(actorTypeSegment(actor), actor.id(), noteId);
    }

    String dirtyKey(Actor actor) {
        return DIRTY_KEY_FORMAT.formatted(actorTypeSegment(actor), actor.id());
    }

    private String actorTypeSegment(Actor actor) {
        return actor.type().name().toLowerCase(Locale.ROOT);
    }

    private String draftPayload(Actor actor, String noteId, NoteDraftSaveRequest request, Instant savedAt) {
        Map<String, Object> payload = Map.of(
                "actorType", actor.type().name(),
                "actorId", actor.id(),
                "noteId", noteId,
                "title", request.title() == null ? "" : request.title(),
                "markdown", request.markdown(),
                "baseVersion", request.baseVersion(),
                "clientSavedAt", request.clientSavedAt().toString(),
                "savedAt", savedAt.toString()
        );
        try {
            return objectMapper.writeValueAsString(payload);
        } catch (JsonProcessingException exception) {
            throw new IllegalStateException("Failed to serialize note draft.", exception);
        }
    }

    private Map<String, Object> readDraftPayload(String rawDraft) {
        try {
            return objectMapper.readValue(rawDraft, new TypeReference<>() {
            });
        } catch (JsonProcessingException exception) {
            throw new IllegalStateException("Failed to deserialize note draft.", exception);
        }
    }
}
