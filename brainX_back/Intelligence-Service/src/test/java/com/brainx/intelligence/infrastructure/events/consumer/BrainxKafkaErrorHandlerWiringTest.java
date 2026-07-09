package com.brainx.intelligence.infrastructure.events.consumer;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.kafka.config.KafkaListenerEndpointRegistry;
import org.springframework.kafka.listener.AbstractMessageListenerContainer;
import org.springframework.kafka.listener.DefaultErrorHandler;
import org.springframework.test.context.ActiveProfiles;

@SpringBootTest(properties = {
    "brainx.events.consumer.enabled=true",
    "spring.kafka.listener.auto-startup=false"
})
@ActiveProfiles("test")
class BrainxKafkaErrorHandlerWiringTest {

    @Autowired
    private DefaultErrorHandler errorHandler;

    @Autowired
    private KafkaListenerEndpointRegistry registry;

    @Test
    void kafkaListenerContainerUsesConfiguredErrorHandler() {
        assertThat(registry.getListenerContainers())
            .singleElement()
            .isInstanceOfSatisfying(AbstractMessageListenerContainer.class, container ->
                assertThat(container.getCommonErrorHandler()).isSameAs(errorHandler));
    }
}
