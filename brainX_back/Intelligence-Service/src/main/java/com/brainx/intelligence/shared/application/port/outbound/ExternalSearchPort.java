package com.brainx.intelligence.shared.application.port.outbound;

import java.math.BigDecimal;
import java.util.List;

import org.springframework.util.StringUtils;

/**
 * 외부 자료 검색 provider를 application 계층에서 기술 독립적으로 호출하기 위한 출력 포트입니다.
 */
public interface ExternalSearchPort {

    ExternalSearchResponse search(ExternalSearchRequest request);

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
