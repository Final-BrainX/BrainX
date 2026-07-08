package com.brainx.intelligence.infrastructure.persistence.jpa;

import static org.assertj.core.api.Assertions.assertThat;

import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;

import org.flywaydb.core.Flyway;
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
            .run(applicationArgs())) {
            assertThat(context.isActive()).isTrue();
        }

        assertThat(columnExists("intelligence_note_projections", "index_attempt_count")).isTrue();
        assertThat(indexExists("idx_note_projection_index_retry")).isTrue();
        assertThat(aiModelCount()).isGreaterThanOrEqualTo(6);
        assertThat(migrationApplied("V20260703_01__baseline_and_repair_intelligence_schema.sql")).isTrue();
        assertThat(migrationApplied("V20260704_01__remove_assistance_style_from_style_profiles.sql")).isTrue();
        assertThat(migrationApplied("R__seed_ai_model_catalog.sql")).isTrue();
    }

    @Test
    void migratesLegacyOidLobColumnsAndStartsWithJpaValidate() throws SQLException {
        assertDedicatedTestDatabase();
        resetPublicSchema();
        createLegacyOidLobSchema();

        try (ConfigurableApplicationContext context = new SpringApplicationBuilder(IntelligenceServiceApplication.class)
            .run(applicationArgs())) {
            assertThat(context.isActive()).isTrue();
        }

        assertThat(columnType("intelligence_chat_messages", "client_context")).isEqualTo("text");
        assertThat(columnType("intelligence_chat_messages", "note_scope")).isEqualTo("text");
        assertThat(columnType("intelligence_chat_messages", "citations")).isEqualTo("text");
        assertThat(columnType("intelligence_note_projections", "tags")).isEqualTo("text");
        assertThat(columnType("intelligence_note_projections", "markdown")).isEqualTo("text");
        assertThat(singleString("select client_context from intelligence_chat_messages where message_id = 'legacy-message'"))
            .isEqualTo("{\"source\":\"legacy\"}");
        assertThat(singleString("select note_scope from intelligence_chat_messages where message_id = 'legacy-message'"))
            .isEqualTo("{\"noteIds\":[\"legacy-note\"]}");
        assertThat(singleString("select tags from intelligence_note_projections where projection_id = 'legacy-user::default::legacy-note'"))
            .isEqualTo("[\"legacy\"]");
        assertThat(singleString("select markdown from intelligence_note_projections where projection_id = 'legacy-user::default::legacy-note'"))
            .isEqualTo("# Legacy");
        assertThat(singleString("select document_group_id from intelligence_note_projections where projection_id = 'legacy-user::default::legacy-note'"))
            .isEqualTo("default");
        assertThat(migrationApplied("V20260703_01__baseline_and_repair_intelligence_schema.sql")).isTrue();
        assertThat(migrationApplied("V20260704_01__remove_assistance_style_from_style_profiles.sql")).isTrue();
        assertThat(columnType("user_style_profiles", "style")).isEqualTo("text");
        assertThat(singleString("select style from user_style_profiles where user_id = 'legacy-style-user'"))
            .contains("conversationTone", "writingStyle")
            .doesNotContain("assistanceStyle");
    }

    @Test
    void removesLegacyDefaultProjectionWhenWorkspaceProjectionExists() throws SQLException {
        assertDedicatedTestDatabase();
        resetPublicSchema();
        migrateTo("20260706.03");
        createLegacyDefaultDocumentGroupFixture();

        migrateAll();

        try (ConfigurableApplicationContext context = new SpringApplicationBuilder(IntelligenceServiceApplication.class)
            .run(applicationArgs())) {
            assertThat(context.isActive()).isTrue();
        }

        assertThat(singleLong("select count(*) from intelligence_note_projections where user_id = 'user-1' and document_group_id = 'default' and note_id = 'note-1'"))
            .isZero();
        assertThat(singleLong("select count(*) from intelligence_note_index_chunks where user_id = 'user-1' and document_group_id = 'default' and note_id = 'note-1'"))
            .isZero();
        assertThat(singleLong("select count(*) from intelligence_note_projections where user_id = 'user-1' and document_group_id = 'default' and note_id = 'note-2'"))
            .isEqualTo(1);
        assertThat(singleLong("select count(*) from intelligence_note_index_chunks where user_id = 'user-1' and document_group_id = 'default' and note_id = 'note-2'"))
            .isEqualTo(1);
        assertThat(singleLong("select count(*) from intelligence_note_projections where user_id = 'user-1' and document_group_id = 'dgrp_default_user-1' and note_id = 'note-1'"))
            .isEqualTo(1);
        assertThat(singleString("select vector_cleanup_status from intelligence_legacy_default_document_group_repairs where repair_id = 'user-1::default::note-1'"))
            .isNull();
        assertThat(migrationApplied("V20260707_01__cleanup_legacy_default_note_projections.sql")).isTrue();
    }

    private static String[] applicationArgs() {
        return new String[] {
            "--spring.main.web-application-type=none",
            "--spring.main.banner-mode=off",
            "--spring.datasource.url=" + POSTGRES_URL,
            "--spring.datasource.username=" + POSTGRES_USERNAME,
            "--spring.datasource.password=" + POSTGRES_PASSWORD,
            "--spring.datasource.driver-class-name=org.postgresql.Driver",
            "--spring.sql.init.mode=never",
            "--spring.jpa.hibernate.ddl-auto=validate",
            "--spring.flyway.enabled=true",
            "--spring.flyway.locations=classpath:db/migration",
            "--spring.flyway.baseline-on-migrate=true",
            "--spring.flyway.baseline-version=0",
            "--spring.flyway.validate-on-migrate=true",
            "--spring.ai.model.chat=none",
            "--spring.cloud.discovery.enabled=false",
            "--eureka.client.enabled=false",
            "--brainx.events.consumer.enabled=false",
            "--brainx.events.producer.enabled=false",
            "--brainx.note-index.retry.enabled=false",
            "--brainx.repair.legacy-default-document-group-vectors.enabled=false",
            "--brainx.external-search.provider=none",
            "--brainx.ai.embedding.provider=none",
            "--brainx.vector.qdrant.enabled=false"
        };
    }

    private static void assertDedicatedTestDatabase() {
        String lowerCaseUrl = POSTGRES_URL.toLowerCase();
        if (!lowerCaseUrl.contains("_ci") && !lowerCaseUrl.contains("test")) {
            throw new IllegalStateException("BRAINX_TEST_POSTGRES_URL must point at a disposable CI/test database.");
        }
    }

    private static void createLegacyDefaultDocumentGroupFixture() throws SQLException {
        try (Connection connection = connection(); Statement statement = connection.createStatement()) {
            statement.execute("""
                insert into intelligence_note_projections (
                  projection_id,
                  user_id,
                  document_group_id,
                  note_id,
                  title,
                  tags,
                  note_version,
                  content_pending,
                  archived,
                  trashed,
                  deleted,
                  last_event_id,
                  updated_at,
                  search_index_status,
                  index_attempt_count
                ) values
                  ('user-1::default::note-1', 'user-1', 'default', 'note-1', 'Legacy duplicate', '[]', 1, false, false, false, false, 'event-1', now(), 'STALE', 0),
                  ('user-1::dgrp_default_user-1::note-1', 'user-1', 'dgrp_default_user-1', 'note-1', 'Current duplicate', '[]', 2, false, false, false, false, 'event-2', now(), 'INDEXED', 0),
                  ('user-1::default::note-2', 'user-1', 'default', 'note-2', 'Legacy only', '[]', 1, false, false, false, false, 'event-3', now(), 'INDEXED', 0),
                  ('user-1::dgrp_default_user-1::note-3', 'user-1', 'dgrp_default_user-1', 'note-3', 'Current only', '[]', 1, false, false, false, false, 'event-4', now(), 'INDEXED', 0)
                """);
            statement.execute("""
                insert into intelligence_note_index_chunks (
                  manifest_id,
                  user_id,
                  document_group_id,
                  note_id,
                  chunk_id,
                  chunk_index,
                  embedding_text_hash,
                  payload_hash,
                  chunker_version,
                  indexed_version,
                  indexed_markdown_hash,
                  indexed_at
                ) values
                  ('user-1::default::note-1::chunk-1', 'user-1', 'default', 'note-1', 'chunk-1', 0, 'hash-a', 'payload-a', 1, 1, 'markdown-a', now()),
                  ('user-1::dgrp_default_user-1::note-1::chunk-1', 'user-1', 'dgrp_default_user-1', 'note-1', 'chunk-1', 0, 'hash-b', 'payload-b', 1, 2, 'markdown-b', now()),
                  ('user-1::default::note-2::chunk-1', 'user-1', 'default', 'note-2', 'chunk-1', 0, 'hash-c', 'payload-c', 1, 1, 'markdown-c', now())
                """);
        }
    }

    private static void resetPublicSchema() throws SQLException {
        try (Connection connection = connection(); Statement statement = connection.createStatement()) {
            statement.execute("drop schema if exists public cascade");
            statement.execute("create schema public");
        }
    }

    private static void createLegacyOidLobSchema() throws SQLException {
        try (Connection connection = connection(); Statement statement = connection.createStatement()) {
            statement.execute("""
                create table intelligence_note_projections (
                  projection_id varchar(240) primary key,
                  user_id varchar(120) not null,
                  document_group_id varchar(120),
                  note_id varchar(120) not null,
                  title varchar(500) not null,
                  folder_id varchar(120),
                  tags oid not null,
                  note_version integer not null default 0,
                  markdown_hash varchar(160),
                  markdown oid,
                  content_pending boolean,
                  archived boolean not null default false,
                  trashed boolean not null default false,
                  deleted boolean not null default false,
                  last_event_id varchar(160),
                  updated_at timestamp(6) with time zone not null default now(),
                  search_index_status varchar(40),
                  indexed_version integer,
                  indexed_markdown_hash varchar(160),
                  indexed_at timestamp(6) with time zone,
                  last_index_attempt_at timestamp(6) with time zone,
                  next_index_retry_at timestamp(6) with time zone,
                  index_attempt_count integer,
                  last_index_error_code varchar(120),
                  last_index_error_message varchar(1000)
                )
                """);
            statement.execute("""
                insert into intelligence_note_projections (
                  projection_id,
                  user_id,
                  document_group_id,
                  note_id,
                  title,
                  tags,
                  note_version,
                  markdown_hash,
                  markdown,
                  content_pending,
                  archived,
                  trashed,
                  deleted,
                  last_event_id,
                  updated_at,
                  search_index_status,
                  index_attempt_count
                ) values (
                  'legacy-user::default::legacy-note',
                  'legacy-user',
                  '',
                  'legacy-note',
                  'Legacy note',
                  lo_from_bytea(0, convert_to('["legacy"]', 'UTF8')),
                  1,
                  'legacy-hash',
                  lo_from_bytea(0, convert_to('# Legacy', 'UTF8')),
                  null,
                  false,
                  false,
                  false,
                  'legacy-event',
                  now(),
                  'STALE',
                  null
                )
                """);
            statement.execute("""
                create table intelligence_chat_messages (
                  message_id varchar(120) primary key,
                  thread_id varchar(120) not null,
                  user_id varchar(120) not null,
                  role varchar(20) not null,
                  content oid not null,
                  model_id varchar(120),
                  note_scope oid not null,
                  client_context oid not null,
                  citations oid not null,
                  token_usage oid,
                  created_at timestamp(6) with time zone not null
                )
                """);
            statement.execute("""
                insert into intelligence_chat_messages (
                  message_id,
                  thread_id,
                  user_id,
                  role,
                  content,
                  model_id,
                  note_scope,
                  client_context,
                  citations,
                  token_usage,
                  created_at
                ) values (
                  'legacy-message',
                  'legacy-thread',
                  'legacy-user',
                  'USER',
                  lo_from_bytea(0, convert_to('Legacy content', 'UTF8')),
                  'gpt-5.4-mini',
                  lo_from_bytea(0, convert_to('{"noteIds":["legacy-note"]}', 'UTF8')),
                  lo_from_bytea(0, convert_to('{"source":"legacy"}', 'UTF8')),
                  lo_from_bytea(0, convert_to('[]', 'UTF8')),
                  lo_from_bytea(0, convert_to('{"totalTokens":1}', 'UTF8')),
                  now()
                )
                """);
            statement.execute("""
                create table user_style_profiles (
                  user_id varchar(100) primary key,
                  style oid not null,
                  detected_from_notes_at timestamp(6) with time zone
                )
                """);
            statement.execute("""
                insert into user_style_profiles (
                  user_id,
                  style,
                  detected_from_notes_at
                ) values (
                  'legacy-style-user',
                  lo_from_bytea(0, convert_to('{"conversationTone":{"directness":"high"},"writingStyle":{"formality":"business"},"assistanceStyle":{"clarificationPolicy":"only_when_blocking"}}', 'UTF8')),
                  now()
                )
                """);
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

    private static String columnType(String tableName, String columnName) throws SQLException {
        try (
            Connection connection = connection();
            PreparedStatement statement = connection.prepareStatement("""
                select udt_name
                from information_schema.columns
                where table_schema = 'public'
                  and table_name = ?
                  and column_name = ?
                """)
        ) {
            statement.setString(1, tableName);
            statement.setString(2, columnName);
            try (ResultSet resultSet = statement.executeQuery()) {
                assertThat(resultSet.next()).isTrue();
                return resultSet.getString(1);
            }
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

    private static long singleLong(String sql) throws SQLException {
        try (Connection connection = connection(); Statement statement = connection.createStatement()) {
            try (ResultSet resultSet = statement.executeQuery(sql)) {
                assertThat(resultSet.next()).isTrue();
                return resultSet.getLong(1);
            }
        }
    }

    private static String singleString(String sql) throws SQLException {
        try (Connection connection = connection(); Statement statement = connection.createStatement()) {
            try (ResultSet resultSet = statement.executeQuery(sql)) {
                assertThat(resultSet.next()).isTrue();
                return resultSet.getString(1);
            }
        }
    }

    private static long singleLong(PreparedStatement statement) throws SQLException {
        try (ResultSet resultSet = statement.executeQuery()) {
            assertThat(resultSet.next()).isTrue();
            return resultSet.getLong(1);
        }
    }

    private static void migrateTo(String target) {
        flyway(target).migrate();
    }

    private static void migrateAll() {
        flyway(null).migrate();
    }

    private static Flyway flyway(String target) {
        var configuration = Flyway.configure()
            .dataSource(POSTGRES_URL, POSTGRES_USERNAME, POSTGRES_PASSWORD)
            .locations("classpath:db/migration")
            .baselineOnMigrate(true)
            .baselineVersion("0")
            .validateOnMigrate(true);
        if (target != null && !target.isBlank()) {
            configuration.target(target);
        }
        return configuration.load();
    }

    private static Connection connection() throws SQLException {
        return DriverManager.getConnection(POSTGRES_URL, POSTGRES_USERNAME, POSTGRES_PASSWORD);
    }

    private static String env(String name, String fallback) {
        String value = System.getenv(name);
        return value == null || value.isBlank() ? fallback : value;
    }
}
