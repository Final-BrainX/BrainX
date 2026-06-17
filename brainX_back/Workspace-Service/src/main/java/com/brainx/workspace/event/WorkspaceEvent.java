package com.brainx.workspace.event;

import java.time.Instant;
import java.util.Map;

public record WorkspaceEvent(
        String eventId,
        String eventType,
        int eventVersion,
        Instant occurredAt,
        String producer,
        String tenantId,
        String userId,
        String correlationId,
        String channel,
        Map<String, Object> payload
) {
}
