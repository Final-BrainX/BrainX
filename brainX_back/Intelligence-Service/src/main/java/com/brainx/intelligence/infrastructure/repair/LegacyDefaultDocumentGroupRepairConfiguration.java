package com.brainx.intelligence.infrastructure.repair;

import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Configuration;

@Configuration
@EnableConfigurationProperties(LegacyDefaultDocumentGroupRepairProperties.class)
class LegacyDefaultDocumentGroupRepairConfiguration {
}
