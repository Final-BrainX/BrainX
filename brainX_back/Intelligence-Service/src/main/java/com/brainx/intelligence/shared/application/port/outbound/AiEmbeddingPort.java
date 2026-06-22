package com.brainx.intelligence.shared.application.port.outbound;

import java.util.List;

/**
 * 시맨틱 검색, 클러스터링, 추천 기능에서 사용할 embedding 생성을 추상화하는 출력 포트입니다.
 */
public interface AiEmbeddingPort {

    AiEmbeddingResponse embed(AiEmbeddingRequest request);

    record AiEmbeddingRequest(
        String modelId,
        List<String> texts,
        InputType inputType
    ) {
        public AiEmbeddingRequest(String modelId, List<String> texts) {
            this(modelId, texts, InputType.UNSPECIFIED);
        }
    }

    record AiEmbeddingResponse(
        String modelId,
        Integer totalTokens,
        List<AiEmbeddingVector> vectors
    ) {
    }

    record AiEmbeddingVector(
        String text,
        List<Double> values
    ) {
    }

    enum InputType {
        DOCUMENT,
        QUERY,
        UNSPECIFIED
    }
}
