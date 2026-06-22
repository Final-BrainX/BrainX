package com.brainx.intelligence.devui;

import org.springframework.boot.autoconfigure.domain.EntityScan;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Profile;
import org.springframework.data.jpa.repository.config.EnableJpaRepositories;

@Configuration
@Profile("dev-ui")
@EntityScan("com.brainx.intelligence.infrastructure.persistence.jpa")
@EnableJpaRepositories("com.brainx.intelligence.infrastructure.persistence.jpa")
class DevUiPersistenceConfig {
}
