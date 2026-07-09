package com.brainx.intelligence.infrastructure.events.consumer;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.Duration;
import java.util.concurrent.CompletableFuture;

import org.apache.kafka.clients.consumer.ConsumerRecord;
import org.apache.kafka.clients.producer.ProducerRecord;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.kafka.listener.DefaultErrorHandler;

class BrainxKafkaConsumerErrorConfigurationTest {

    private final BrainxKafkaConsumerErrorConfiguration configuration =
        new BrainxKafkaConsumerErrorConfiguration();

    @Test
    void retryableFailureUsesConfiguredAttemptsThenPublishesToSamePartitionDlq() {
        KafkaTemplate<String, String> kafkaTemplate = kafkaTemplate();
        when(kafkaTemplate.send(anyProducerRecord()))
            .thenReturn(CompletableFuture.completedFuture(null));
        DefaultErrorHandler errorHandler = errorHandler(kafkaTemplate, 3);
        ConsumerRecord<String, String> record = record();

        assertThat(errorHandler.handleOne(new RuntimeException("retry"), record, null, null)).isFalse();
        assertThat(errorHandler.handleOne(new RuntimeException("retry"), record, null, null)).isFalse();
        assertThat(errorHandler.handleOne(new RuntimeException("retry"), record, null, null)).isTrue();

        ArgumentCaptor<ProducerRecord<String, String>> captor = producerRecordCaptor();
        verify(kafkaTemplate).send(captor.capture());
        assertThat(captor.getValue().topic()).isEqualTo("source-topic.dlq");
        assertThat(captor.getValue().partition()).isEqualTo(2);
        assertThat(captor.getValue().key()).isEqualTo("key");
        assertThat(captor.getValue().value()).isEqualTo("body");
    }

    @Test
    void nonRetryableFailurePublishesToDlqImmediately() {
        KafkaTemplate<String, String> kafkaTemplate = kafkaTemplate();
        when(kafkaTemplate.send(anyProducerRecord()))
            .thenReturn(CompletableFuture.completedFuture(null));
        DefaultErrorHandler errorHandler = errorHandler(kafkaTemplate, 10);

        assertThat(errorHandler.handleOne(new NonRetryableEventException("evt-1"), record(), null, null))
            .isTrue();

        verify(kafkaTemplate).send(anyProducerRecord());
    }

    @Test
    void failedDlqPublishIsNotReportedAsRecovered() {
        KafkaTemplate<String, String> kafkaTemplate = kafkaTemplate();
        when(kafkaTemplate.send(anyProducerRecord()))
            .thenReturn(CompletableFuture.failedFuture(new RuntimeException("broker unavailable")));
        DefaultErrorHandler errorHandler = errorHandler(kafkaTemplate, 1);

        assertThat(errorHandler.handleOne(new NonRetryableEventException("evt-1"), record(), null, null))
            .isFalse();
    }

    private DefaultErrorHandler errorHandler(KafkaTemplate<String, String> kafkaTemplate, int maxAttempts) {
        BrainxEventConsumerProperties properties = new BrainxEventConsumerProperties();
        properties.setMaxAttempts(maxAttempts);
        properties.setRetryInterval(Duration.ZERO);
        return configuration.brainxKafkaErrorHandler(kafkaTemplate, properties);
    }

    private static ConsumerRecord<String, String> record() {
        return new ConsumerRecord<>("source-topic", 2, 11L, "key", "body");
    }

    private static ProducerRecord<String, String> anyProducerRecord() {
        return org.mockito.ArgumentMatchers.<ProducerRecord<String, String>>any();
    }

    @SuppressWarnings("unchecked")
    private static KafkaTemplate<String, String> kafkaTemplate() {
        return mock(KafkaTemplate.class);
    }

    @SuppressWarnings("unchecked")
    private static ArgumentCaptor<ProducerRecord<String, String>> producerRecordCaptor() {
        return ArgumentCaptor.forClass(ProducerRecord.class);
    }
}
