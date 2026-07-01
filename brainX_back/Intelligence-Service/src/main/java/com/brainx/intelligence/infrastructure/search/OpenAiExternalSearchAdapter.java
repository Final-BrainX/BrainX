package com.brainx.intelligence.infrastructure.search;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;

import org.springframework.http.HttpHeaders;
import org.springframework.util.StringUtils;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestClientResponseException;

import com.brainx.intelligence.shared.application.port.outbound.ExternalSearchPort;
import com.brainx.intelligence.shared.application.service.AiUsageRecorder;
import com.brainx.intelligence.shared.application.service.AiTokenUsageCostEstimator;
import com.brainx.intelligence.shared.application.service.AiTokenUsageCostEstimator.TokenCostEstimate;
import com.fasterxml.jackson.databind.JsonNode;

public class OpenAiExternalSearchAdapter implements ExternalSearchPort {

    static final String PROVIDER = "openai";
    static final String FEATURE_ID = "external-search-web";
    private static final String RESPONSES_PATH = "/v1/responses";
    private static final String WEB_SEARCH_TOOL = "web_search";
    private static final String SOURCES_INCLUDE = "web_search_call.action.sources";
    private static final int MAX_DOMAIN_FILTERS = 100;

    private final RestClient restClient;
    private final ExternalSearchProperties properties;
    private final AiUsageRecorder aiUsageRecorder;
    private final AiTokenUsageCostEstimator usageCostEstimator;

    public OpenAiExternalSearchAdapter(
        RestClient restClient,
        ExternalSearchProperties properties,
        AiUsageRecorder aiUsageRecorder,
        AiTokenUsageCostEstimator usageCostEstimator
    ) {
        this.restClient = restClient;
        this.properties = properties;
        this.aiUsageRecorder = aiUsageRecorder;
        this.usageCostEstimator = usageCostEstimator;
    }

    @Override
    public ExternalSearchResponse search(ExternalSearchRequest request) {
        String modelId = modelId(request);
        int maxSources = maxSources(request);
        JsonNode response = requestSearch(request, modelId);
        String responseId = text(response.path("id"));
        String answer = answer(response);
        List<ExternalSearchSource> sources = sources(response, answer, maxSources);
        ExternalSearchTokenUsage tokenUsage = tokenUsage(response.path("usage"), modelId);
        recordTokenUsage(request.userId(), modelId, responseId, tokenUsage);
        return new ExternalSearchResponse(answer, sources, PROVIDER, modelId, responseId, tokenUsage);
    }

    private JsonNode requestSearch(ExternalSearchRequest request, String modelId) {
        try {
            return restClient.post()
                .uri(RESPONSES_PATH)
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + properties.getOpenai().getApiKey())
                .body(requestBody(request, modelId))
                .retrieve()
                .body(JsonNode.class);
        } catch (RestClientResponseException exception) {
            throw new OpenAiExternalSearchException(
                "OpenAI external search request failed with status " + exception.getStatusCode().value() + ".",
                exception
            );
        } catch (RestClientException exception) {
            throw new OpenAiExternalSearchException("OpenAI external search request failed.", exception);
        }
    }

    private Map<String, Object> requestBody(ExternalSearchRequest request, String modelId) {
        Map<String, Object> webSearchTool = new LinkedHashMap<>();
        webSearchTool.put("type", WEB_SEARCH_TOOL);
        Map<String, Object> filters = filters(request.allowedDomains(), request.blockedDomains());
        if (!filters.isEmpty()) {
            webSearchTool.put("filters", filters);
        }

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("model", modelId);
        body.put("tools", List.of(webSearchTool));
        body.put("tool_choice", "required");
        body.put("include", List.of(SOURCES_INCLUDE));
        body.put("input", request.query());
        return body;
    }

    private static Map<String, Object> filters(List<String> allowedDomains, List<String> blockedDomains) {
        List<String> allowed = normalizeDomains(allowedDomains);
        List<String> blocked = normalizeDomains(blockedDomains);
        if (!allowed.isEmpty() && !blocked.isEmpty()) {
            throw new IllegalArgumentException("allowedDomains and blockedDomains cannot both be set.");
        }

        Map<String, Object> filters = new LinkedHashMap<>();
        if (!allowed.isEmpty()) {
            filters.put("allowed_domains", allowed);
        } else if (!blocked.isEmpty()) {
            filters.put("blocked_domains", blocked);
        }
        return filters;
    }

    private static List<String> normalizeDomains(List<String> domains) {
        if (domains == null || domains.isEmpty()) {
            return List.of();
        }
        LinkedHashSet<String> normalized = new LinkedHashSet<>();
        for (String value : domains) {
            String domain = normalizeDomain(value);
            if (StringUtils.hasText(domain)) {
                normalized.add(domain);
            }
            if (normalized.size() >= MAX_DOMAIN_FILTERS) {
                break;
            }
        }
        return List.copyOf(normalized);
    }

    private static String normalizeDomain(String value) {
        if (!StringUtils.hasText(value)) {
            return "";
        }
        String domain = value.trim()
            .replaceFirst("^[a-zA-Z][a-zA-Z0-9+.-]*://", "")
            .toLowerCase(Locale.ROOT);
        int slash = domain.indexOf('/');
        if (slash >= 0) {
            domain = domain.substring(0, slash);
        }
        int query = domain.indexOf('?');
        if (query >= 0) {
            domain = domain.substring(0, query);
        }
        int fragment = domain.indexOf('#');
        if (fragment >= 0) {
            domain = domain.substring(0, fragment);
        }
        int port = domain.indexOf(':');
        if (port >= 0) {
            domain = domain.substring(0, port);
        }
        return domain;
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
