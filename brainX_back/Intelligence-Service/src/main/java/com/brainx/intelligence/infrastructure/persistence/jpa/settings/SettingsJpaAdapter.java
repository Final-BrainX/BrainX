package com.brainx.intelligence.infrastructure.persistence.jpa.settings;

import java.util.List;
import java.util.Optional;

import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Repository;

import com.brainx.intelligence.settings.application.port.outbound.AiModelCatalogPort;
import com.brainx.intelligence.settings.application.port.outbound.AiModelSettingsPort;
import com.brainx.intelligence.settings.application.port.outbound.StyleProfilePort;
import com.brainx.intelligence.settings.domain.AiModel;
import com.brainx.intelligence.settings.domain.AiModelSettings;
import com.brainx.intelligence.settings.domain.StyleProfile;

@Repository
public class SettingsJpaAdapter implements AiModelCatalogPort, AiModelSettingsPort, StyleProfilePort {

    private final AiModelJpaRepository aiModelJpaRepository;
    private final AiModelSettingsJpaRepository aiModelSettingsJpaRepository;
    private final StyleProfileJpaRepository styleProfileJpaRepository;

    public SettingsJpaAdapter(
        AiModelJpaRepository aiModelJpaRepository,
        AiModelSettingsJpaRepository aiModelSettingsJpaRepository,
        StyleProfileJpaRepository styleProfileJpaRepository
    ) {
        this.aiModelJpaRepository = aiModelJpaRepository;
        this.aiModelSettingsJpaRepository = aiModelSettingsJpaRepository;
        this.styleProfileJpaRepository = styleProfileJpaRepository;
    }

    @Override
    public List<AiModel> findAll() {
        return aiModelJpaRepository.findAll(Sort.by("modelId")).stream()
            .map(AiModelJpaEntity::toDomain)
            .toList();
    }

    @Override
    public Optional<AiModel> findByModelId(String modelId) {
        return aiModelJpaRepository.findById(modelId)
            .map(AiModelJpaEntity::toDomain);
    }

    @Override
    public boolean existsByModelId(String modelId) {
        return aiModelJpaRepository.existsById(modelId);
    }

    @Override
    public AiModelSettings save(AiModelSettings settings) {
        return aiModelSettingsJpaRepository.save(AiModelSettingsJpaEntity.fromDomain(settings))
            .toDomain();
    }

    @Override
    public Optional<AiModelSettings> findSettingsByUserId(String userId) {
        return aiModelSettingsJpaRepository.findById(userId)
            .map(AiModelSettingsJpaEntity::toDomain);
    }

    @Override
    public StyleProfile save(StyleProfile styleProfile) {
        return styleProfileJpaRepository.save(StyleProfileJpaEntity.fromDomain(styleProfile))
            .toDomain();
    }

    @Override
    public Optional<StyleProfile> findStyleProfileByUserId(String userId) {
        return styleProfileJpaRepository.findById(userId)
            .map(StyleProfileJpaEntity::toDomain);
    }
}
