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
import org.springframework.data.redis.core.Cursor;
import org.springframework.data.redis.core.ScanOptions;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Service;

import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Collection;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashSet;
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

        String documentGroupId = normalizeDocumentGroupId(request.documentGroupId());
        return new NoteDraftSaveData(noteId, documentGroupId, actorType.toUpperCase(Locale.ROOT), savedAt, expiresAt, "DRAFT_SAVED");
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

        String folderId = (String) payload.get("folderId");
        return new NoteDraftData(
                (String) payload.get("noteId"),
                normalizeDocumentGroupId((String) payload.get("documentGroupId")),
                (String) payload.get("actorType"),
                (String) payload.getOrDefault("title", "Untitled"),
                (String) payload.get("markdown"),
                (folderId == null || folderId.isBlank()) ? null : folderId,
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

    public void deleteDraft(Actor actor, String noteId) {
        redisTemplate.delete(draftKey(actor, noteId));
        redisTemplate.opsForSet().remove(dirtyKey(actor), noteId);
    }

    /** 폴더(들)가 cascade로 삭제될 때, 그 폴더에 속해 있던 이 actor의 draft-only 노트(아직
        Postgres에 flush되지 않아 백엔드 폴더 cascade가 못 보는 노트)도 같이 지운다 — orphan
        draft가 남지 않게 한다. 삭제된 noteId 목록을 돌려준다. */
    public List<String> deleteDraftsByFolder(Actor actor, Collection<String> folderIds) {
        if (folderIds == null || folderIds.isEmpty()) {
            return List.of();
        }
        List<String> deleted = new ArrayList<>();
        for (NoteDraftData draft : listDrafts(actor).drafts()) {
            if (draft.folderId() != null && folderIds.contains(draft.folderId())) {
                deleteDraft(actor, draft.noteId());
                deleted.add(draft.noteId());
            }
        }
        return deleted;
    }

    public List<String> userIdsWithDirtyDrafts() {
        String pattern = DIRTY_KEY_FORMAT.formatted(actorTypeSegmentName("USER"), "*");
        String prefix = DIRTY_KEY_FORMAT.formatted(actorTypeSegmentName("USER"), "");
        ScanOptions scanOptions = ScanOptions.scanOptions()
                .match(pattern)
                .count(500)
                .build();
        Set<String> userIds = new LinkedHashSet<>();

        try (Cursor<String> cursor = redisTemplate.scan(scanOptions)) {
            while (cursor.hasNext()) {
                String userId = parseUserIdFromDirtyKey(cursor.next(), prefix);
                if (userId != null) {
                    userIds.add(userId);
                }
            }
        }

        return List.copyOf(userIds);
    }

    private String parseUserIdFromDirtyKey(String key, String prefix) {
        if (key == null || !key.startsWith(prefix)) {
            return null;
        }
        String userId = key.substring(prefix.length());
        if (userId.isBlank() || userId.contains(":")) {
            return null;
        }
        return userId;
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

    private String actorTypeSegmentName(String actorType) {
        return actorType.toLowerCase(Locale.ROOT);
    }

    private String draftPayload(Actor actor, String noteId, NoteDraftSaveRequest request, Instant savedAt) {
        Map<String, Object> payload = new HashMap<>();
        payload.put("actorType", actor.type().name());
        payload.put("actorId", actor.id());
        payload.put("noteId", noteId);
        payload.put("documentGroupId", normalizeDocumentGroupId(request.documentGroupId()));
        payload.put("title", request.title() == null ? "" : request.title());
        payload.put("markdown", request.markdown());
        // 빈 문자열로 저장해 "루트"와 "필드 없음(과거 draft)"을 구분한다 — getDraft에서 빈
        // 문자열은 null(루트)로, 키 자체가 없으면(이전 버전 draft) null로 동일하게 처리한다.
        payload.put("folderId", request.folderId() == null ? "" : request.folderId());
        payload.put("baseVersion", request.baseVersion());
        payload.put("clientSavedAt", request.clientSavedAt().toString());
        payload.put("savedAt", savedAt.toString());
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

    private String normalizeDocumentGroupId(String documentGroupId) {
        if (documentGroupId == null) {
            return null;
        }
        String trimmed = documentGroupId.trim();
        return trimmed.isBlank() ? null : trimmed;
    }
}
