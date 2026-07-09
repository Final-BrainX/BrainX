package com.brainx.intelligence.infrastructure.events.consumer;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import org.apache.kafka.clients.consumer.ConsumerRecord;
import org.junit.jupiter.api.Test;

class BrainxKafkaEventListenerTest {

    private final BrainxEventDispatcher dispatcher = mock(BrainxEventDispatcher.class);
    private final BrainxKafkaEventListener listener = new BrainxKafkaEventListener(dispatcher);
    private final ConsumerRecord<String, String> record = new ConsumerRecord<>("source-topic", 0, 1L, "key", "body");

    @Test
    void processedEventReturnsNormally() {
        when(dispatcher.dispatch("body"))
            .thenReturn(new EventDispatchResult("evt-1", EventConsumptionStatus.PROCESSED, true));

        assertThatCode(() -> listener.onMessage(record)).doesNotThrowAnyException();
    }

    @Test
    void nonRetryableFailureIsRaisedForImmediateDlqRecovery() {
        when(dispatcher.dispatch("body"))
            .thenReturn(new EventDispatchResult("evt-1", EventConsumptionStatus.FAILED_NON_RETRYABLE, false));

        assertThatThrownBy(() -> listener.onMessage(record))
            .isInstanceOf(NonRetryableEventException.class)
            .hasMessageContaining("evt-1");
    }
}
