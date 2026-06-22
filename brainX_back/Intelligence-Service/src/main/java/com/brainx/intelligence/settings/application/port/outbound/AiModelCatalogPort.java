package com.brainx.intelligence.settings.application.port.outbound;

import java.util.List;
import java.util.Optional;

import com.brainx.intelligence.settings.domain.AiModel;

/**
 * AI 모델 catalog 조회를 추상화하는 출력 포트입니다.
 */
public interface AiModelCatalogPort {

    List<AiModel> findAll();

    Optional<AiModel> findByModelId(String modelId);

    boolean existsByModelId(String modelId);
}
