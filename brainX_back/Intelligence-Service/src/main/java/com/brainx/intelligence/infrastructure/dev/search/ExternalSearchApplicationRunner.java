package com.brainx.intelligence.infrastructure.dev.search;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.io.PrintStream;
import java.nio.charset.StandardCharsets;
import java.util.List;

import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.ConfigurableApplicationContext;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

import com.brainx.intelligence.shared.application.port.outbound.ExternalSearchPort;
import com.brainx.intelligence.shared.application.port.outbound.ExternalSearchPort.ExternalSearchRequest;
import com.brainx.intelligence.shared.application.port.outbound.ExternalSearchPort.ExternalSearchSource;
import com.brainx.intelligence.shared.application.port.outbound.ExternalSearchPort.ExternalSearchStreamEvent;
import com.brainx.intelligence.shared.application.port.outbound.ExternalSearchPort.ExternalSearchTokenUsage;
import com.fasterxml.jackson.databind.ObjectMapper;

@Component
@ConditionalOnProperty(prefix = "brainx.dev.external-search", name = "enabled", havingValue = "true")
public class ExternalSearchApplicationRunner implements ApplicationRunner {

    private final ExternalSearchDevProperties properties;
    private final ExternalSearchPort externalSearchPort;
    private final ObjectMapper objectMapper;
    private final ConfigurableApplicationContext applicationContext;

    public ExternalSearchApplicationRunner(
        ExternalSearchDevProperties properties,
        ExternalSearchPort externalSearchPort,
        ObjectMapper objectMapper,
        ConfigurableApplicationContext applicationContext
    ) {
        this.properties = properties;
        this.externalSearchPort = externalSearchPort;
        this.objectMapper = objectMapper;
        this.applicationContext = applicationContext;
    }

    @Override
    public void run(ApplicationArguments args) throws Exception {
        try (BufferedReader reader = new BufferedReader(new InputStreamReader(System.in, StandardCharsets.UTF_8))) {
            runSearch(reader, System.out);
        }
        exitSuccessfully();
    }

    void runSearch(BufferedReader reader, PrintStream out) throws IOException {
        if (StringUtils.hasText(properties.getQuery())) {
            writeJson(out, search(properties.getQuery()));
            return;
        }

        while (true) {
            out.print("brainx-search> ");
            String line = reader.readLine();
            if (line == null || line.equalsIgnoreCase("exit") || line.equalsIgnoreCase("quit")) {
                return;
            }
            if (line.isBlank()) {
                continue;
            }
            writeJson(out, search(line));
        }
    }

    Object search(String query) {
        if (properties.isStreamEvents()) {
            return searchWithStreamEvents(query);
        }
        var response = externalSearchPort.search(new ExternalSearchRequest(
            properties.getUserId(),
            query,
            properties.getModelId(),
            properties.getMaxSources(),
            properties.getAllowedDomains(),
            properties.getBlockedDomains()
        ));
        return new ExternalSearchCliResponse(
            query,
            response.answer(),
            response.sources(),
            response.provider(),
            response.modelId(),
            response.tokenUsage(),
            response.responseId()
        );
    }

    private ExternalSearchStreamingCliResponse searchWithStreamEvents(String query) {
        List<ExternalSearchStreamEvent> events = externalSearchPort.searchStream(new ExternalSearchRequest(
            properties.getUserId(),
            query,
            properties.getModelId(),
            properties.getMaxSources(),
            properties.getAllowedDomains(),
            properties.getBlockedDomains()
        )).collectList().block();
        List<ExternalSearchStreamEvent> safeEvents = events == null ? List.of() : events;
        var response = safeEvents.stream()
            .filter(ExternalSearchStreamEvent::completedEvent)
            .map(ExternalSearchStreamEvent::response)
            .filter(item -> item != null)
            .reduce((first, second) -> second)
            .orElseThrow(() -> new IllegalStateException("External search stream completed without response."));
        return new ExternalSearchStreamingCliResponse(
            query,
            response.answer(),
            response.sources(),
            response.provider(),
            response.modelId(),
            response.tokenUsage(),
            response.responseId(),
            safeEvents.stream().map(ExternalSearchCliStreamEvent::from).toList()
        );
    }

    private void writeJson(PrintStream out, Object value) throws IOException {
        out.println(objectMapper.writerWithDefaultPrettyPrinter().writeValueAsString(value));
    }

    private void exitSuccessfully() {
        System.out.flush();
        System.err.flush();
        int exitCode = SpringApplication.exit(applicationContext, () -> 0);
        System.exit(exitCode);
    }

    public record ExternalSearchCliResponse(
        String query,
        String answer,
        List<ExternalSearchSource> sources,
        String provider,
        String modelId,
        ExternalSearchTokenUsage tokenUsage,
        String responseId
    ) {
    }

    public record ExternalSearchStreamingCliResponse(
        String query,
        String answer,
        List<ExternalSearchSource> sources,
        String provider,
        String modelId,
        ExternalSearchTokenUsage tokenUsage,
        String responseId,
        List<ExternalSearchCliStreamEvent> streamEvents
    ) {
    }

    public record ExternalSearchCliStreamEvent(
        String eventType,
        String status,
        String actionType,
        String query,
        String message,
        int sourceCount,
        List<ExternalSearchSource> sources
    ) {

        static ExternalSearchCliStreamEvent from(ExternalSearchStreamEvent event) {
            List<ExternalSearchSource> sources = event.completedEvent() && event.response() != null
                ? event.response().sources()
                : event.sources();
            sources = sources == null ? List.of() : sources;
            return new ExternalSearchCliStreamEvent(
                event.eventType(),
                event.status(),
                event.actionType(),
                event.query(),
                event.message(),
                sources.size(),
                sources
            );
        }
    }

}
