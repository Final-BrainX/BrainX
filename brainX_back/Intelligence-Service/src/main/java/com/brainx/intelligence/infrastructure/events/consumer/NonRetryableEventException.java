package com.brainx.intelligence.infrastructure.events.consumer;

/**
 * 재시도해도 성공할 수 없는 이벤트를 Kafka DLQ로 즉시 넘기기 위한 listener 경계 예외입니다.
 */
public class NonRetryableEventException extends RuntimeException {

    public NonRetryableEventException(String eventId) {
        super("Event is not retryable: " + eventId);
    }
}
