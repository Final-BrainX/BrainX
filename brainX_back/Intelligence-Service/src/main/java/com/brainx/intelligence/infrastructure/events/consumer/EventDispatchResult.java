package com.brainx.intelligence.infrastructure.events.consumer;

public record EventDispatchResult(String eventId, EventConsumptionStatus status, boolean handlerInvoked) {

    public static EventDispatchResult skipped(EventConsumptionRecord record) {
        return new EventDispatchResult(record.eventId(), record.status(), false);
    }

    public static EventDispatchResult notHandled(EventConsumptionRecord record) {
        return new EventDispatchResult(record.eventId(), record.status(), false);
    }

    public static EventDispatchResult handled(EventConsumptionRecord record) {
        return new EventDispatchResult(record.eventId(), record.status(), true);
    }
}
