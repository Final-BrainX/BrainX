package com.brainx.intelligence.infrastructure.events.consumer;

import org.apache.kafka.clients.consumer.ConsumerRecord;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.stereotype.Component;

@Component
@ConditionalOnProperty(prefix = "brainx.events.consumer", name = "enabled", havingValue = "true")
public class BrainxKafkaEventListener {

    private final BrainxEventDispatcher dispatcher;

    public BrainxKafkaEventListener(BrainxEventDispatcher dispatcher) {
        this.dispatcher = dispatcher;
    }

    @KafkaListener(
        topics = "#{@brainxEventConsumerProperties.topics}",
        groupId = "#{@brainxEventConsumerProperties.groupId}"
    )
    public void onMessage(ConsumerRecord<String, String> record) {
        dispatcher.dispatch(record.value());
    }
}
