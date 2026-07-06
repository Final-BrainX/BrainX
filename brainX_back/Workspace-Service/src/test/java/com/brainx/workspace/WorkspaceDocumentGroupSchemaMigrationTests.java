package com.brainx.workspace;

import org.junit.jupiter.api.Test;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.datasource.init.ResourceDatabasePopulator;

import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.ResultSet;
import java.sql.Statement;

import static org.assertj.core.api.Assertions.assertThat;

class WorkspaceDocumentGroupSchemaMigrationTests {

    @Test
    void migrationCreatesDocumentGroupsAndNullableColumns() throws Exception {
        try (Connection connection = DriverManager.getConnection(
                "jdbc:h2:mem:workspace_document_group_schema;MODE=PostgreSQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1",
                "sa",
                "")) {
            try (Statement statement = connection.createStatement()) {
                statement.execute("""
                        create table workspace_notes (
                            note_id varchar(255) primary key,
                            user_id varchar(255) not null,
                            title varchar(255) not null
                        )
                        """);
                statement.execute("""
                        create table workspace_folders (
                            folder_id varchar(255) primary key,
                            user_id varchar(255) not null,
                            name varchar(255) not null
                        )
                        """);
            }

            new ResourceDatabasePopulator(new ClassPathResource(
                    "db/migration/V20260705_01__add_document_groups_and_workspace_document_group_id.sql"))
                    .populate(connection);

            try (Statement statement = connection.createStatement()) {
                assertThat(exists(statement, """
                        select 1
                        from information_schema.tables
                        where table_name = 'document_groups'
                        """)).isTrue();

                assertThat(isNullable(statement, "workspace_notes", "document_group_id")).isTrue();
                assertThat(isNullable(statement, "workspace_folders", "document_group_id")).isTrue();
            }
        }
    }

    private boolean exists(Statement statement, String sql) throws Exception {
        try (ResultSet resultSet = statement.executeQuery(sql)) {
            return resultSet.next();
        }
    }

    private boolean isNullable(Statement statement, String tableName, String columnName) throws Exception {
        try (ResultSet resultSet = statement.executeQuery("""
                select is_nullable
                from information_schema.columns
                where table_name = '%s'
                  and column_name = '%s'
                """.formatted(tableName, columnName))) {
            assertThat(resultSet.next()).isTrue();
            return "YES".equalsIgnoreCase(resultSet.getString(1));
        }
    }
}
