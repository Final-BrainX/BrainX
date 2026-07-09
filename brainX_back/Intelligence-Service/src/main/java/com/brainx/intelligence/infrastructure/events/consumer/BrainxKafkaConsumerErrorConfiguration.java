package com.brainx.intelligence.infrastructure.events.consumer;

import org.apache.kafka.common.TopicPartition;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.kafka.listener.DeadLetterPublishingRecoverer;
import org.springframework.kafka.listener.DefaultErrorHandler;
import org.springframework.util.backoff.FixedBackOff;

@Configuration(proxyBeanMethods = false)
@ConditionalOnProperty(prefix = "brainx.events.consumer", name = "enabled", havingValue = "true")
class BrainxKafkaConsumerErrorConfiguration {

    @Bean
    DefaultErrorHandler brainxKafkaErrorHandler(
        KafkaTemplate<String, String> kafkaTemplate,
        BrainxEventConsumerProperties properties
    ) {
        DeadLetterPublishingRecoverer recoverer = new DeadLetterPublishingRecoverer(
            kafkaTemplate,
            (record, exception) -> new TopicPartition(record.topic() + ".dlq", record.partition())
        );
        recoverer.setFailIfSendResultIsError(true);
        long retries = Math.max(0, properties.getMaxAttempts() - 1L);
        DefaultErrorHandler errorHandler = new DefaultErrorHandler(
            recoverer,
            new FixedBackOff(properties.getRetryInterval().toMillis(), retries)
        );
        errorHandler.addNotRetryableExceptions(NonRetryableEventException.class);
        return errorHandler;
    }
}
