package com.brainx.intelligence.infrastructure.ai.voyage;

import java.util.Comparator;
import java.util.List;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.fasterxml.jackson.annotation.JsonProperty;

import org.springframework.http.HttpHeaders;
import org.springframework.util.StringUtils;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestClientResponseException;

import com.brainx.intelligence.shared.application.port.outbound.AiEmbeddingPort;

public class VoyageEmbeddingAdapter implements AiEmbeddingPort {

    private static final String EMBEDDINGS_PATH = "/v1/embeddings";
    private static final String INPUT_TYPE_QUERY = "query";
    private static final String INPUT_TYPE_DOCUMENT = "document";
    private static final String OUTPUT_DTYPE_FLOAT = "float";

    private final RestClient restClient;
    private final VoyageEmbeddingProperties.Voyage properties;

    public VoyageEmbeddingAdapter(RestClient restClient, VoyageEmbeddingProperties.Voyage properties) {
        this.restClient = restClient;
        this.properties = properties;
    }

    @Override
    public AiEmbeddingResponse embed(AiEmbeddingRequest request) {
        List<String> texts = request == null || request.texts() == null ? List.of() : request.texts();
        String model = modelFrom(request);
        if (texts.isEmpty()) {
            return new AiEmbeddingResponse(model, null, List.of());
        }

        VoyageEmbeddingResponse response = requestEmbeddings(new VoyageEmbeddingRequest(
            texts,
            model,
            inputTypeFrom(request),
            properties.isTruncation(),
            properties.getDimensions(),
            OUTPUT_DTYPE_FLOAT
        ));
        if (response == null || response.data() == null) {
            throw new VoyageEmbeddingException("Voyage embedding response does not contain data.");
        }

        List<AiEmbeddingVector> vectors = response.data().stream()
            .sorted(Comparator.comparingInt(VoyageEmbeddingData::safeIndex))
            .map(data -> new AiEmbeddingVector(
                textAt(texts, data.safeIndex()),
                data.embedding() == null ? List.of() : List.copyOf(data.embedding())
            ))
            .toList();
        return new AiEmbeddingResponse(model, totalTokens(response.usage()), vectors);
    }

    private VoyageEmbeddingResponse requestEmbeddings(VoyageEmbeddingRequest request) {
        try {
            return restClient.post()
                .uri(EMBEDDINGS_PATH)
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + properties.getApiKey())
                .body(request)
                .retrieve()
                .body(VoyageEmbeddingResponse.class);
        } catch (RestClientResponseException exception) {
            throw new VoyageEmbeddingException(
                "Voyage embedding request failed with status " + exception.getStatusCode().value() + ".",
                exception
            );
        } catch (RestClientException exception) {
            throw new VoyageEmbeddingException("Voyage embedding request failed.", exception);
        }
    }

    private String modelFrom(AiEmbeddingRequest request) {
        if (request != null && StringUtils.hasText(request.modelId())) {
            return request.modelId();
        }
        return properties.getModel();
    }

    private static String inputTypeFrom(AiEmbeddingRequest request) {
        if (request == null || request.inputType() == null) {
            return null;
        }
        return switch (request.inputType()) {
            case DOCUMENT -> INPUT_TYPE_DOCUMENT;
            case QUERY -> INPUT_TYPE_QUERY;
            case UNSPECIFIED -> null;
        };
    }

    private static String textAt(List<String> texts, int index) {
        if (index < 0 || index >= texts.size()) {
            return "";
        }
        return texts.get(index);
    }

    private static Integer totalTokens(VoyageUsage usage) {
        return usage == null ? null : usage.totalTokens();
    }

    @JsonInclude(JsonInclude.Include.NON_NULL)
    record VoyageEmbeddingRequest(
        @JsonProperty("input") List<String> input,
        @JsonProperty("model") String model,
        @JsonProperty("input_type") String inputType,
        @JsonProperty("truncation") boolean truncation,
        @JsonProperty("output_dimension") int outputDimension,
        @JsonProperty("output_dtype") String outputDtype
    ) {
    }

    record VoyageEmbeddingResponse(
        @JsonProperty("data") List<VoyageEmbeddingData> data,
        @JsonProperty("usage") VoyageUsage usage
    ) {
    }

    record VoyageEmbeddingData(
        @JsonProperty("embedding") List<Double> embedding,
        @JsonProperty("index") Integer index
    ) {

        int safeIndex() {
            return index == null ? 0 : index;
        }
    }

    record VoyageUsage(
        @JsonProperty("total_tokens") Integer totalTokens
    ) {
    }
}
