package com.brainx.intelligence.infrastructure.search;

import java.time.Duration;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.atomic.AtomicReference;

import org.springframework.core.ParameterizedTypeReference;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.codec.ServerSentEvent;
import org.springframework.util.StringUtils;
import org.springframework.web.reactive.function.client.WebClient;
import org.springframework.web.reactive.function.client.WebClientException;

import com.brainx.intelligence.shared.application.port.outbound.ExternalSearchPort;
import com.brainx.intelligence.shared.application.service.AiTokenUsageCostEstimator;
import com.brainx.intelligence.shared.application.service.AiUsageRecorder;
import com.fasterxml.jackson.databind.JsonNode;

import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;

public class OpenAiExternalSearchAdapter implements ExternalSearchPort {

    static final String PROVIDER = "openai";
    private static final String FEATURE_ID = "external-search-web";
    private static final ParameterizedTypeReference<ServerSentEvent<JsonNode>> SSE_EVENT_TYPE =
        new ParameterizedTypeReference<>() {
        };

    private final WebClient webClient;
    private final ExternalSearchProperties properties;
    private final AiUsageRecorder aiUsageRecorder;
    private final OpenAiExternalSearchRequestFactory requestFactory;
    private final OpenAiExternalSearchResponseMapper responseMapper;

    public OpenAiExternalSearchAdapter(
        WebClient webClient,
        ExternalSearchProperties properties,
        AiUsageRecorder aiUsageRecorder,
        AiTokenUsageCostEstimator usageCostEstimator
    ) {
        this.webClient = webClient;
        this.properties = properties;
        this.aiUsageRecorder = aiUsageRecorder;
        this.requestFactory = new OpenAiExternalSearchRequestFactory();
        this.responseMapper = new OpenAiExternalSearchResponseMapper(usageCostEstimator);
    }

    @Override
    public ExternalSearchResponse search(ExternalSearchRequest request) {
        AtomicReference<ExternalSearchResponse> response = new AtomicReference<>();
        Duration timeout = properties.getTimeout().plusSeconds(5);
        searchStream(request)
            .doOnNext(event -> {
                if (event.completedEvent()) {
                    response.set(event.response());
                }
            })
            .blockLast(timeout);
        if (response.get() == null) {
            throw new OpenAiExternalSearchException("OpenAI external search stream completed without response.");
        }
        return response.get();
    }

    @Override
    public Flux<ExternalSearchStreamEvent> searchStream(ExternalSearchRequest request) {
        String modelId = modelId(request);
        int maxSources = maxSources(request);
        return Flux.defer(() -> {
            SearchStreamState state = new SearchStreamState(request.query(), maxSources);
            return requestSearchStream(request, modelId)
                .flatMapIterable(event -> state.toEvents(event, modelId))
                .doOnNext(event -> {
                    if (event.completedEvent() && event.response() != null) {
                        recordTokenUsage(
                            request.userId(),
                            modelId,
                            event.response().responseId(),
                            event.response().tokenUsage()
                        );
                    }
                });
        })
            .timeout(properties.getTimeout())
            .onErrorMap(this::toExternalSearchException);
    }

    private Flux<ServerSentEvent<JsonNode>> requestSearchStream(ExternalSearchRequest request, String modelId) {
        return webClient.post()
            .uri(OpenAiExternalSearchRequestFactory.RESPONSES_PATH)
            .header(HttpHeaders.AUTHORIZATION, "Bearer " + properties.getOpenai().getApiKey())
            .accept(MediaType.TEXT_EVENT_STREAM)
            .bodyValue(requestFactory.requestBody(request, modelId, properties.getSearchContextSize()))
            .retrieve()
            .onStatus(
                status -> status.isError(),
                response -> response.bodyToMono(String.class)
                    .defaultIfEmpty("")
                    .map(body -> new OpenAiExternalSearchException(
                        "OpenAI external search request failed with status " + response.statusCode().value() + "."
                    ))
            )
            .bodyToFlux(SSE_EVENT_TYPE);
    }

    private RuntimeException toExternalSearchException(Throwable exception) {
        if (exception instanceof OpenAiExternalSearchException typed) {
            return typed;
        }
        if (exception instanceof WebClientException) {
            return new OpenAiExternalSearchException("OpenAI external search request failed.", exception);
        }
        return new OpenAiExternalSearchException("OpenAI external search stream failed.", exception);
    }

    private String modelId(ExternalSearchRequest request) {
        if (StringUtils.hasText(request.modelId())) {
            return request.modelId();
        }
        return properties.getOpenai().getModel();
    }

    private int maxSources(ExternalSearchRequest request) {
        return request.maxSources() <= 0 ? properties.getMaxSources() : request.maxSources();
    }

    private void recordTokenUsage(
        String userId,
        String modelId,
        String responseId,
        ExternalSearchTokenUsage tokenUsage
    ) {
        if (tokenUsage == null) {
            return;
        }
        aiUsageRecorder.recordRawUsage(
            userId,
            FEATURE_ID,
            modelId,
            responseId,
            tokenUsage.inputTokens(),
            tokenUsage.cachedInputTokens(),
            tokenUsage.outputTokens(),
            tokenUsage.reasoningTokens(),
            tokenUsage.totalTokens()
        );
    }

    private final class SearchStreamState {

        private final String fallbackQuery;
        private final int maxSources;
        private final Map<String, ExternalSearchSource> sources = new LinkedHashMap<>();
        private final StringBuilder answer = new StringBuilder();

        private SearchStreamState(String fallbackQuery, int maxSources) {
            this.fallbackQuery = fallbackQuery == null ? "" : fallbackQuery;
            this.maxSources = Math.max(1, maxSources);
        }

        private List<ExternalSearchStreamEvent> toEvents(ServerSentEvent<JsonNode> sse, String modelId) {
            JsonNode data = sse.data();
            if (data == null || data.isMissingNode() || data.isNull()) {
                return List.of();
            }
            String eventType = StringUtils.hasText(sse.event()) ? sse.event() : text(data.path("type"));
            return switch (eventType) {
                case "response.created" -> List.of(ExternalSearchStreamEvent.progress(
                    "created",
                    "",
                    fallbackQuery,
                    "Web search request started."
                ));
                case "response.output_item.added" -> outputItemEvent(data.path("item"), "started");
                case "response.output_item.done" -> outputItemDoneEvent(data.path("item"));
                case "response.output_text.delta" -> {
                    String delta = text(data.path("delta"));
                    if (StringUtils.hasText(delta)) {
                        answer.append(delta);
                    }
                    yield List.of();
                }
                case "response.output_text.annotation.added" -> annotationEvent(data.path("annotation"));
                case "response.completed" -> completedEvent(responseNode(data), modelId);
                case "response.failed", "error" -> throw new OpenAiExternalSearchException(errorMessage(data));
                default -> List.of();
            };
        }

        private List<ExternalSearchStreamEvent> outputItemEvent(JsonNode item, String status) {
            if (!"web_search_call".equals(text(item.path("type")))) {
                return List.of();
            }
            JsonNode action = item.path("action");
            String actionType = text(action.path("type"));
            String query = query(action);
            return List.of(ExternalSearchStreamEvent.progress(
                status,
                actionType,
                StringUtils.hasText(query) ? query : fallbackQuery,
                progressMessage(status, actionType)
            ));
        }

        private List<ExternalSearchStreamEvent> outputItemDoneEvent(JsonNode item) {
            List<ExternalSearchStreamEvent> events = new ArrayList<>(outputItemEvent(item, "completed"));
            List<ExternalSearchSource> itemSources = responseMapper.sourcesFromOutputItem(
                item,
                answer.toString(),
                maxSources
            );
            if (addSources(itemSources)) {
                events.add(ExternalSearchStreamEvent.sources(fallbackQuery, sources()));
            }
            return events;
        }

        private List<ExternalSearchStreamEvent> annotationEvent(JsonNode annotation) {
            if (addSources(OpenAiExternalSearchResponseMapper.sourcesFromAnnotation(annotation, answer.toString()))) {
                return List.of(ExternalSearchStreamEvent.sources(fallbackQuery, sources()));
            }
            return List.of();
        }

        private List<ExternalSearchStreamEvent> completedEvent(JsonNode responseNode, String modelId) {
            ExternalSearchResponse mapped = responseMapper.toResponse(responseNode, modelId, maxSources);
            boolean changed = addSources(mapped.sources());
            ExternalSearchResponse response = new ExternalSearchResponse(
                mapped.answer(),
                sources().isEmpty() ? mapped.sources() : sources(),
                PROVIDER,
                modelId,
                mapped.responseId(),
                mapped.tokenUsage()
            );
            List<ExternalSearchStreamEvent> events = new ArrayList<>();
            if (changed) {
                events.add(ExternalSearchStreamEvent.sources(fallbackQuery, sources()));
            }
            events.add(ExternalSearchStreamEvent.completed(response));
            return events;
        }

        private boolean addSources(List<ExternalSearchSource> values) {
            boolean changed = false;
            for (ExternalSearchSource source : values == null ? List.<ExternalSearchSource>of() : values) {
                if (sources.size() >= maxSources) {
                    break;
                }
                String key = source.url().trim().toLowerCase(Locale.ROOT);
                if (!sources.containsKey(key)) {
                    sources.put(key, new ExternalSearchSource(
                        source.title(),
                        source.url(),
                        source.snippet(),
                        sources.size() + 1
                    ));
                    changed = true;
                }
            }
            return changed;
        }

        private List<ExternalSearchSource> sources() {
            return List.copyOf(sources.values());
        }
    }

    private static JsonNode responseNode(JsonNode eventData) {
        JsonNode response = eventData.path("response");
        return response.isMissingNode() || response.isNull() ? eventData : response;
    }

    private static String query(JsonNode action) {
        String query = text(action.path("query"));
        if (StringUtils.hasText(query)) {
            return query;
        }
        JsonNode queries = action.path("queries");
        if (queries.isArray() && !queries.isEmpty()) {
            return text(queries.get(0));
        }
        return "";
    }

    private static String progressMessage(String status, String actionType) {
        String action = StringUtils.hasText(actionType) ? actionType : "search";
        return "Web search " + action + " " + status + ".";
    }

    private static String errorMessage(JsonNode data) {
        String message = text(data.path("message"));
        if (StringUtils.hasText(message)) {
            return "OpenAI external search stream failed: " + message;
        }
        JsonNode error = data.path("error");
        message = text(error.path("message"));
        if (StringUtils.hasText(message)) {
            return "OpenAI external search stream failed: " + message;
        }
        return "OpenAI external search stream failed.";
    }

    private static String text(JsonNode node) {
        return node == null || node.isMissingNode() || node.isNull() ? "" : node.asText("");
    }
}
