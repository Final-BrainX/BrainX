package com.brainx.intelligence.infrastructure.persistence.jpa;

import static org.assertj.core.api.Assertions.assertThat;

import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.LinkedHashMap;
import java.util.Map;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.boot.builder.SpringApplicationBuilder;
import org.springframework.context.ConfigurableApplicationContext;

import com.brainx.intelligence.IntelligenceServiceApplication;

@EnabledIfEnvironmentVariable(named = "BRAINX_TEST_POSTGRES_URL", matches = ".+")
class FlywayPostgresMigrationTest {

    private static final String POSTGRES_URL = env("BRAINX_TEST_POSTGRES_URL", "");
    private static final String POSTGRES_USERNAME = env("BRAINX_TEST_POSTGRES_USERNAME", "brainx");
    private static final String POSTGRES_PASSWORD = env("BRAINX_TEST_POSTGRES_PASSWORD", "brainx_password");

    @Test
    void migratesPostgresSchemaAndStartsWithJpaValidate() throws SQLException {
        assertDedicatedTestDatabase();
        resetPublicSchema();

        try (ConfigurableApplicationContext context = new SpringApplicationBuilder(IntelligenceServiceApplication.class)
            .properties(applicationProperties())
            .run()) {
            assertThat(context.isActive()).isTrue();
        }

        assertThat(columnExists("intelligence_note_projections", "index_attempt_count")).isTrue();
        assertThat(indexExists("idx_note_projection_index_retry")).isTrue();
        assertThat(aiModelCount()).isGreaterThanOrEqualTo(6);
        assertThat(migrationApplied("V20260703_01__baseline_and_repair_intelligence_schema.sql")).isTrue();
        assertThat(migrationApplied("R__seed_ai_model_catalog.sql")).isTrue();
    }

    private static Map<String, Object> applicationProperties() {
        Map<String, Object> properties = new LinkedHashMap<>();
        properties.put("spring.main.web-application-type", "none");
        properties.put("spring.main.banner-mode", "off");
        properties.put("spring.datasource.url", POSTGRES_URL);
        properties.put("spring.datasource.username", POSTGRES_USERNAME);
        properties.put("spring.datasource.password", POSTGRES_PASSWORD);
        properties.put("spring.datasource.driver-class-name", "org.postgresql.Driver");
        properties.put("spring.sql.init.mode", "never");
        properties.put("spring.jpa.hibernate.ddl-auto", "validate");
        properties.put("spring.flyway.enabled", "true");
        properties.put("spring.flyway.locations", "classpath:db/migration");
        properties.put("spring.flyway.baseline-on-migrate", "true");
        properties.put("spring.flyway.baseline-version", "0");
        properties.put("spring.flyway.validate-on-migrate", "true");
        properties.put("spring.ai.model.chat", "none");
        properties.put("brainx.events.consumer.enabled", "false");
        properties.put("brainx.events.producer.enabled", "false");
        properties.put("brainx.note-index.retry.enabled", "false");
        properties.put("brainx.external-search.provider", "none");
        properties.put("brainx.ai.embedding.provider", "none");
        properties.put("brainx.vector.qdrant.enabled", "false");
        return properties;
    }

    private static void assertDedicatedTestDatabase() {
        String lowerCaseUrl = POSTGRES_URL.toLowerCase();
        if (!lowerCaseUrl.contains("_ci") && !lowerCaseUrl.contains("test")) {
            throw new IllegalStateException("BRAINX_TEST_POSTGRES_URL must point at a disposable CI/test database.");
        }
    }

    private static void resetPublicSchema() throws SQLException {
        try (Connection connection = connection(); Statement statement = connection.createStatement()) {
            statement.execute("drop schema if exists public cascade");
            statement.execute("create schema public");
        }
    }

    private static boolean columnExists(String tableName, String columnName) throws SQLException {
        try (
            Connection connection = connection();
            PreparedStatement statement = connection.prepareStatement("""
                select count(*)
                from information_schema.columns
                where table_schema = 'public'
                  and table_name = ?
                  and column_name = ?
                """)
        ) {
            statement.setString(1, tableName);
            statement.setString(2, columnName);
            return singleLong(statement) > 0;
        }
    }

    private static boolean indexExists(String indexName) throws SQLException {
        try (
            Connection connection = connection();
            PreparedStatement statement = connection.prepareStatement("""
                select count(*)
                from pg_indexes
                where schemaname = 'public'
                  and indexname = ?
                """)
        ) {
            statement.setString(1, indexName);
            return singleLong(statement) > 0;
        }
    }

    private static long aiModelCount() throws SQLException {
        try (
            Connection connection = connection();
            PreparedStatement statement = connection.prepareStatement("select count(*) from ai_models")
        ) {
            return singleLong(statement);
        }
    }

    private static boolean migrationApplied(String script) throws SQLException {
        try (
            Connection connection = connection();
            PreparedStatement statement = connection.prepareStatement("""
                select count(*)
                from flyway_schema_history
                where script = ?
                  and success = true
                """)
        ) {
            statement.setString(1, script);
            return singleLong(statement) > 0;
        }
    }

    private static long singleLong(PreparedStatement statement) throws SQLException {
        try (ResultSet resultSet = statement.executeQuery()) {
            assertThat(resultSet.next()).isTrue();
            return resultSet.getLong(1);
        }
    }

    private static Connection connection() throws SQLException {
        return DriverManager.getConnection(POSTGRES_URL, POSTGRES_USERNAME, POSTGRES_PASSWORD);
    }

    private static String env(String name, String fallback) {
        String value = System.getenv(name);
        return value == null || value.isBlank() ? fallback : value;
    }
}
