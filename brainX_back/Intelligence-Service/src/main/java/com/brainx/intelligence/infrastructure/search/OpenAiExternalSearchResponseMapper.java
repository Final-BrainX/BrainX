package com.brainx.intelligence.infrastructure.search;

import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;

import org.springframework.util.StringUtils;

import com.brainx.intelligence.shared.application.port.outbound.ExternalSearchPort.ExternalSearchCostEstimate;
import com.brainx.intelligence.shared.application.port.outbound.ExternalSearchPort.ExternalSearchResponse;
import com.brainx.intelligence.shared.application.port.outbound.ExternalSearchPort.ExternalSearchSource;
import com.brainx.intelligence.shared.application.port.outbound.ExternalSearchPort.ExternalSearchTokenUsage;
import com.brainx.intelligence.shared.application.service.AiTokenUsageCostEstimator;
import com.brainx.intelligence.shared.application.service.AiTokenUsageCostEstimator.TokenCostEstimate;
import com.fasterxml.jackson.databind.JsonNode;

final class OpenAiExternalSearchResponseMapper {

    private final AiTokenUsageCostEstimator usageCostEstimator;

    OpenAiExternalSearchResponseMapper(AiTokenUsageCostEstimator usageCostEstimator) {
        this.usageCostEstimator = usageCostEstimator;
    }

    ExternalSearchResponse toResponse(JsonNode response, String modelId, int maxSources) {
        String responseId = text(response.path("id"));
        String answer = answer(response);
        List<ExternalSearchSource> sources = sources(response, answer, maxSources);
        ExternalSearchTokenUsage tokenUsage = tokenUsage(response.path("usage"), modelId);
        return new ExternalSearchResponse(
            answer,
            sources,
            OpenAiExternalSearchAdapter.PROVIDER,
            modelId,
            responseId,
            tokenUsage
        );
    }

    private static String answer(JsonNode response) {
        String outputText = text(response.path("output_text"));
        if (StringUtils.hasText(outputText)) {
            return outputText;
        }

        StringBuilder builder = new StringBuilder();
        JsonNode output = response.path("output");
        if (output.isArray()) {
            for (JsonNode item : output) {
                JsonNode content = item.path("content");
                if (!content.isArray()) {
                    continue;
                }
                for (JsonNode contentItem : content) {
                    String text = text(contentItem.path("text"));
                    if (StringUtils.hasText(text)) {
                        builder.append(text);
                    }
                }
            }
        }
        return builder.toString();
    }

    private static List<ExternalSearchSource> sources(JsonNode response, String answer, int maxSources) {
        SourceCollector collector = new SourceCollector(Math.max(1, maxSources));
        collectCitationSources(response.path("output"), answer, collector);
        collectActionSources(response.path("output"), collector);
        return collector.sources();
    }

    private static void collectCitationSources(JsonNode output, String answer, SourceCollector collector) {
        if (!output.isArray()) {
            return;
        }
        for (JsonNode item : output) {
            JsonNode content = item.path("content");
            if (!content.isArray()) {
                continue;
            }
            for (JsonNode contentItem : content) {
                JsonNode annotations = contentItem.path("annotations");
                if (!annotations.isArray()) {
                    continue;
                }
                for (JsonNode annotation : annotations) {
                    if (!"url_citation".equals(text(annotation.path("type")))) {
                        continue;
                    }
                    collector.add(
                        text(annotation.path("title")),
                        text(annotation.path("url")),
                        citedText(answer, annotation.path("start_index"), annotation.path("end_index"))
                    );
                }
            }
        }
    }

    private static void collectActionSources(JsonNode output, SourceCollector collector) {
        if (!output.isArray()) {
            return;
        }
        for (JsonNode item : output) {
            JsonNode sources = item.path("action").path("sources");
            if (!sources.isArray()) {
                continue;
            }
            for (JsonNode source : sources) {
                collector.add(
                    text(source.path("title")),
                    text(source.path("url")),
                    text(source.path("snippet"))
                );
            }
        }
    }

    private ExternalSearchTokenUsage tokenUsage(JsonNode usage, String modelId) {
        if (usage == null || usage.isMissingNode() || usage.isNull()) {
            return null;
        }
        int inputTokens = intValue(usage.path("input_tokens"));
        int cachedInputTokens = intValue(usage.path("input_tokens_details").path("cached_tokens"));
        int outputTokens = intValue(usage.path("output_tokens"));
        int reasoningTokens = intValue(usage.path("output_tokens_details").path("reasoning_tokens"));
        int totalTokens = usage.path("total_tokens").isNumber()
            ? intValue(usage.path("total_tokens"))
            : inputTokens + outputTokens;
        int billableInputTokens = Math.max(0, inputTokens - cachedInputTokens);
        TokenCostEstimate cost = usageCostEstimator.estimate(
            modelId,
            inputTokens,
            cachedInputTokens,
            outputTokens
        );
        return new ExternalSearchTokenUsage(
            inputTokens,
            cachedInputTokens,
            billableInputTokens,
            outputTokens,
            reasoningTokens,
            totalTokens,
            toCostEstimate(cost)
        );
    }

    private static ExternalSearchCostEstimate toCostEstimate(TokenCostEstimate cost) {
        return new ExternalSearchCostEstimate(
            cost.inputCost(),
            cost.cachedInputCost(),
            cost.outputCost(),
            cost.totalCost(),
            cost.currencyCode()
        );
    }

    private static String citedText(String answer, JsonNode startIndex, JsonNode endIndex) {
        if (!StringUtils.hasText(answer) || !startIndex.isNumber() || !endIndex.isNumber()) {
            return "";
        }
        int start = Math.max(0, startIndex.asInt());
        int end = Math.max(start, endIndex.asInt());
        if (start >= answer.length()) {
            return "";
        }
        return answer.substring(start, Math.min(end, answer.length())).trim();
    }

    private static int intValue(JsonNode node) {
        return node != null && node.isNumber() ? Math.max(0, node.asInt()) : 0;
    }

    private static String text(JsonNode node) {
        return node == null || node.isMissingNode() || node.isNull() ? "" : node.asText("");
    }

    private static final class SourceCollector {

        private final int maxSources;
        private final List<ExternalSearchSource> sources = new ArrayList<>();
        private final LinkedHashSet<String> seenUrls = new LinkedHashSet<>();

        private SourceCollector(int maxSources) {
            this.maxSources = maxSources;
        }

        private void add(String title, String url, String snippet) {
            if (sources.size() >= maxSources || !StringUtils.hasText(url)) {
                return;
            }
            String normalizedUrl = url.trim();
            String key = normalizedUrl.toLowerCase(Locale.ROOT);
            if (!seenUrls.add(key)) {
                return;
            }
            sources.add(new ExternalSearchSource(title, normalizedUrl, snippet, sources.size() + 1));
        }

        private List<ExternalSearchSource> sources() {
            return List.copyOf(sources);
        }
    }
}
