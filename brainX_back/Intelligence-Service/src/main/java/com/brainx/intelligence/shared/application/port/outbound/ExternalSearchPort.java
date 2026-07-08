package com.brainx.intelligence.shared.application.port.outbound;

import java.math.BigDecimal;
import java.util.List;

import org.springframework.util.StringUtils;

import reactor.core.publisher.Flux;

/**
 * 외부 자료 검색 provider를 application 계층에서 기술 독립적으로 호출하기 위한 출력 포트입니다.
 */
public interface ExternalSearchPort {

    ExternalSearchResponse search(ExternalSearchRequest request);

    default Flux<ExternalSearchStreamEvent> searchStream(ExternalSearchRequest request) {
        return Flux.defer(() -> Flux.just(ExternalSearchStreamEvent.completed(search(request))));
    }

    record ExternalSearchRequest(
        String userId,
        String query,
        String modelId,
        int maxSources,
        List<String> allowedDomains,
        List<String> blockedDomains
    ) {
        public ExternalSearchRequest {
            userId = requireText(userId, "userId");
            query = requireText(query, "query");
            modelId = StringUtils.hasText(modelId) ? modelId.trim() : null;
            maxSources = Math.max(0, maxSources);
            allowedDomains = allowedDomains == null ? List.of() : List.copyOf(allowedDomains);
            blockedDomains = blockedDomains == null ? List.of() : List.copyOf(blockedDomains);
        }

        private static String requireText(String value, String name) {
            if (!StringUtils.hasText(value)) {
                throw new IllegalArgumentException(name + " must not be blank.");
            }
            return value.trim();
        }
    }

    record ExternalSearchResponse(
        String answer,
        List<ExternalSearchSource> sources,
        String provider,
        String modelId,
        String responseId,
        ExternalSearchTokenUsage tokenUsage
    ) {
        public ExternalSearchResponse {
            answer = answer == null ? "" : answer;
            sources = sources == null ? List.of() : List.copyOf(sources);
            provider = provider == null ? "" : provider;
            modelId = modelId == null ? "" : modelId;
            responseId = StringUtils.hasText(responseId) ? responseId.trim() : null;
        }
    }

    record ExternalSearchStreamEvent(
        String eventType,
        String status,
        String actionType,
        String query,
        List<ExternalSearchSource> sources,
        ExternalSearchResponse response,
        String message
    ) {

        private static final String EVENT_PROGRESS = "progress";
        private static final String EVENT_SOURCES = "sources";
        private static final String EVENT_COMPLETED = "completed";

        public ExternalSearchStreamEvent {
            eventType = StringUtils.hasText(eventType) ? eventType.trim() : EVENT_PROGRESS;
            status = status == null ? "" : status.trim();
            actionType = actionType == null ? "" : actionType.trim();
            query = query == null ? "" : query.trim();
            sources = sources == null ? List.of() : List.copyOf(sources);
            message = message == null ? "" : message.trim();
        }

        public static ExternalSearchStreamEvent progress(
            String status,
            String actionType,
            String query,
            String message
        ) {
            return new ExternalSearchStreamEvent(EVENT_PROGRESS, status, actionType, query, List.of(), null, message);
        }

        public static ExternalSearchStreamEvent sources(String query, List<ExternalSearchSource> sources) {
            return new ExternalSearchStreamEvent(EVENT_SOURCES, "", "", query, sources, null, "");
        }

        public static ExternalSearchStreamEvent completed(ExternalSearchResponse response) {
            return new ExternalSearchStreamEvent(EVENT_COMPLETED, "completed", "", "", List.of(), response, "");
        }

        public boolean progressEvent() {
            return EVENT_PROGRESS.equals(eventType);
        }

        public boolean sourcesEvent() {
            return EVENT_SOURCES.equals(eventType);
        }

        public boolean completedEvent() {
            return EVENT_COMPLETED.equals(eventType);
        }
    }

    record ExternalSearchSource(
        String title,
        String url,
        String snippet,
        int rank
    ) {
        public ExternalSearchSource {
            title = title == null ? "" : title;
            url = requireText(url, "url");
            snippet = snippet == null ? "" : snippet;
            rank = Math.max(1, rank);
        }

        private static String requireText(String value, String name) {
            if (!StringUtils.hasText(value)) {
                throw new IllegalArgumentException(name + " must not be blank.");
            }
            return value.trim();
        }
    }

    record ExternalSearchTokenUsage(
        int inputTokens,
        int cachedInputTokens,
        int billableInputTokens,
        int outputTokens,
        int reasoningTokens,
        int totalTokens,
        ExternalSearchCostEstimate costEstimate
    ) {
        public ExternalSearchTokenUsage {
            inputTokens = Math.max(0, inputTokens);
            cachedInputTokens = Math.max(0, Math.min(cachedInputTokens, inputTokens));
            billableInputTokens = Math.max(0, Math.min(billableInputTokens, inputTokens - cachedInputTokens));
            outputTokens = Math.max(0, outputTokens);
            reasoningTokens = Math.max(0, reasoningTokens);
            totalTokens = totalTokens < 0 ? inputTokens + outputTokens : totalTokens;
            costEstimate = costEstimate == null ? ExternalSearchCostEstimate.unknown() : costEstimate;
        }
    }

    record ExternalSearchCostEstimate(
        BigDecimal inputCost,
        BigDecimal cachedInputCost,
        BigDecimal outputCost,
        BigDecimal totalCost,
        String currencyCode
    ) {
        public static ExternalSearchCostEstimate unknown() {
            return new ExternalSearchCostEstimate(null, null, null, null, null);
        }
    }
}
