package com.brainx.intelligence.infrastructure.events.consumer;

import java.util.Set;

public interface BrainxEventHandler {

    Set<String> eventTypes();

    void handle(EventProcessingContext context);
}
