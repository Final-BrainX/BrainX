package com.brainx.intelligence.infrastructure.ai.voyage;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Map;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.fasterxml.jackson.annotation.JsonProperty;

import org.springframework.ai.document.Document;
import org.springframework.ai.embedding.BatchingStrategy;
import org.springframework.ai.embedding.Embedding;
import org.springframework.ai.embedding.EmbeddingModel;
import org.springframework.ai.embedding.EmbeddingOptions;
import org.springframework.ai.embedding.EmbeddingRequest;
import org.springframework.ai.embedding.EmbeddingResponse;
import org.springframework.ai.embedding.EmbeddingResponseMetadata;
import org.springframework.http.HttpHeaders;
import org.springframework.util.StringUtils;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestClientResponseException;

public class VoyageEmbeddingModel implements EmbeddingModel {

    private static final String EMBEDDINGS_PATH = "/v1/embeddings";
    private static final String INPUT_TYPE_QUERY = "query";
    private static final String INPUT_TYPE_DOCUMENT = "document";
    private static final String OUTPUT_DTYPE_FLOAT = "float";

    private final RestClient restClient;
    private final VoyageEmbeddingProperties.Voyage properties;

    public VoyageEmbeddingModel(RestClient restClient, VoyageEmbeddingProperties.Voyage properties) {
        this.restClient = restClient;
        this.properties = properties;
    }

    @Override
    public EmbeddingResponse call(EmbeddingRequest request) {
        List<String> texts = request.getInstructions() == null ? List.of() : request.getInstructions();
        return embedForResponse(texts, null, modelFrom(request.getOptions()), dimensionsFrom(request.getOptions()));
    }

    @Override
    public float[] embed(String text) {
        return embedTexts(List.of(text), INPUT_TYPE_QUERY, properties.getModel(), properties.getDimensions()).getFirst();
    }

    @Override
    public List<float[]> embed(List<String> texts) {
        return embedTexts(texts, INPUT_TYPE_QUERY, properties.getModel(), properties.getDimensions());
    }

    @Override
    public float[] embed(Document document) {
        return embedTexts(
            List.of(getEmbeddingContent(document)),
            INPUT_TYPE_DOCUMENT,
            properties.getModel(),
            properties.getDimensions()
        ).getFirst();
    }

    @Override
    public List<float[]> embed(
        List<Document> documents,
        EmbeddingOptions options,
        BatchingStrategy batchingStrategy
    ) {
        List<float[]> embeddings = new ArrayList<>(documents.size());
        for (List<Document> batch : batchingStrategy.batch(documents)) {
            List<String> texts = batch.stream()
                .map(this::getEmbeddingContent)
                .toList();
            embeddings.addAll(embedTexts(texts, INPUT_TYPE_DOCUMENT, modelFrom(options), dimensionsFrom(options)));
        }
        return embeddings;
    }

    @Override
    public int dimensions() {
        return properties.getDimensions();
    }

    private List<float[]> embedTexts(List<String> texts, String inputType, String model, int dimensions) {
        return embedForResponse(texts, inputType, model, dimensions).getResults().stream()
            .map(Embedding::getOutput)
            .toList();
    }

    private EmbeddingResponse embedForResponse(List<String> texts, String inputType, String model, int dimensions) {
        if (texts.isEmpty()) {
            return new EmbeddingResponse(List.of(), new EmbeddingResponseMetadata(model, null, Map.of()));
        }

        VoyageEmbeddingResponse response = requestEmbeddings(new VoyageEmbeddingRequest(
            texts,
            model,
            inputType,
            properties.isTruncation(),
            dimensions,
            OUTPUT_DTYPE_FLOAT
        ));
        if (response == null || response.data() == null) {
            throw new VoyageEmbeddingException("Voyage embedding response does not contain data.");
        }

        List<Embedding> embeddings = response.data().stream()
            .sorted(Comparator.comparingInt(VoyageEmbeddingData::safeIndex))
            .map(data -> new Embedding(toFloatArray(data.embedding()), data.safeIndex()))
            .toList();

        Map<String, Object> metadata = response.usage() == null || response.usage().totalTokens() == null
            ? Map.of()
            : Map.of("totalTokens", response.usage().totalTokens());
        return new EmbeddingResponse(embeddings, new EmbeddingResponseMetadata(model, null, metadata));
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

    private String modelFrom(EmbeddingOptions options) {
        if (options != null && StringUtils.hasText(options.getModel())) {
            return options.getModel();
        }
        return properties.getModel();
    }

    private int dimensionsFrom(EmbeddingOptions options) {
        if (options != null && options.getDimensions() != null && options.getDimensions() > 0) {
            return options.getDimensions();
        }
        return properties.getDimensions();
    }

    private static float[] toFloatArray(List<Double> values) {
        if (values == null) {
            throw new VoyageEmbeddingException("Voyage embedding item does not contain vector values.");
        }
        float[] floats = new float[values.size()];
        for (int index = 0; index < values.size(); index++) {
            floats[index] = values.get(index).floatValue();
        }
        return floats;
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
