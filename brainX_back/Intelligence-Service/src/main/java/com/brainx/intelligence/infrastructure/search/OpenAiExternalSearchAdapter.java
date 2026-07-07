package com.brainx.intelligence.infrastructure.search;

import org.springframework.http.HttpHeaders;
import org.springframework.util.StringUtils;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestClientResponseException;

import com.brainx.intelligence.shared.application.port.outbound.ExternalSearchPort;
import com.brainx.intelligence.shared.application.service.AiTokenUsageCostEstimator;
import com.brainx.intelligence.shared.application.service.AiUsageRecorder;
import com.fasterxml.jackson.databind.JsonNode;

public class OpenAiExternalSearchAdapter implements ExternalSearchPort {

    static final String PROVIDER = "openai";
    private static final String FEATURE_ID = "external-search-web";

    private final RestClient restClient;
    private final ExternalSearchProperties properties;
    private final AiUsageRecorder aiUsageRecorder;
    private final OpenAiExternalSearchRequestFactory requestFactory;
    private final OpenAiExternalSearchResponseMapper responseMapper;

    public OpenAiExternalSearchAdapter(
        RestClient restClient,
        ExternalSearchProperties properties,
        AiUsageRecorder aiUsageRecorder,
        AiTokenUsageCostEstimator usageCostEstimator
    ) {
        this.restClient = restClient;
        this.properties = properties;
        this.aiUsageRecorder = aiUsageRecorder;
        this.requestFactory = new OpenAiExternalSearchRequestFactory();
        this.responseMapper = new OpenAiExternalSearchResponseMapper(usageCostEstimator);
    }

    @Override
    public ExternalSearchResponse search(ExternalSearchRequest request) {
        String modelId = modelId(request);
        ExternalSearchResponse response = responseMapper.toResponse(
            requestSearch(request, modelId),
            modelId,
            maxSources(request)
        );
        recordTokenUsage(request.userId(), modelId, response.responseId(), response.tokenUsage());
        return response;
    }

    private JsonNode requestSearch(ExternalSearchRequest request, String modelId) {
        try {
            return restClient.post()
                .uri(OpenAiExternalSearchRequestFactory.RESPONSES_PATH)
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + properties.getOpenai().getApiKey())
                .body(requestFactory.requestBody(request, modelId))
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
}
