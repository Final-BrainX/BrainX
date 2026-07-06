package com.brainx.workspace;

import org.junit.jupiter.api.Test;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.datasource.init.ResourceDatabasePopulator;

import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.ResultSet;
import java.sql.Statement;

import static org.assertj.core.api.Assertions.assertThat;

class WorkspaceDocumentGroupBackfillMigrationTests {

    @Test
    void migrationIsIdempotentAndBackfillsOnlySafeMemberData() throws Exception {
        try (Connection connection = DriverManager.getConnection(
                "jdbc:h2:mem:workspace_document_group_backfill;MODE=PostgreSQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1",
                "sa",
                "")) {
            createBaseTables(connection);
            seedLegacyData(connection);

            runWorkspaceMigrations(connection);
            runWorkspaceMigrations(connection);

            try (Statement statement = connection.createStatement()) {
                assertThat(queryForInt(statement, """
                        select count(*)
                        from document_groups
                        where user_id = 'usr_member_1'
                          and is_default = true
                        """)).isEqualTo(1);

                assertThat(queryForInt(statement, """
                        select count(*)
                        from document_groups
                        where user_id = 'gst_guest_1'
                        """)).isEqualTo(0);

                assertThat(queryForString(statement, """
                        select document_group_id
                        from workspace_notes
                        where note_id = 'note_member_1'
                        """)).isEqualTo("dgrp_default_usr_member_1");

                assertThat(queryForString(statement, """
                        select document_group_id
                        from workspace_folders
                        where folder_id = 'folder_member_1'
                        """)).isEqualTo("dgrp_default_usr_member_1");

                assertThat(queryForString(statement, """
                        select document_group_id
                        from workspace_folders
                        where folder_id = 'folder_guest_1'
                        """)).isNull();

                assertThat(queryForInt(statement, """
                        select count(*)
                        from workspace_folders
                        where document_group_id is null
                        """)).isEqualTo(1);
            }
        }
    }

    private void createBaseTables(Connection connection) throws Exception {
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
    }

    private void seedLegacyData(Connection connection) throws Exception {
        try (Statement statement = connection.createStatement()) {
            statement.execute("""
                    insert into workspace_notes (note_id, user_id, title)
                    values ('note_member_1', 'usr_member_1', 'Member note')
                    """);
            statement.execute("""
                    insert into workspace_folders (folder_id, user_id, name)
                    values ('folder_member_1', 'usr_member_1', 'Member folder')
                    """);
            statement.execute("""
                    insert into workspace_folders (folder_id, user_id, name)
                    values ('folder_guest_1', 'gst_guest_1', 'Guest folder')
                    """);
        }
    }

    private void runWorkspaceMigrations(Connection connection) throws Exception {
        new ResourceDatabasePopulator(
                new ClassPathResource("db/migration/V20260705_01__add_document_groups_and_workspace_document_group_id.sql"),
                new ClassPathResource("db/migration/V20260705_02__backfill_default_workspace_document_groups.sql")
        ).populate(connection);
    }

    private int queryForInt(Statement statement, String sql) throws Exception {
        try (ResultSet resultSet = statement.executeQuery(sql)) {
            assertThat(resultSet.next()).isTrue();
            return resultSet.getInt(1);
        }
    }

    private String queryForString(Statement statement, String sql) throws Exception {
        try (ResultSet resultSet = statement.executeQuery(sql)) {
            assertThat(resultSet.next()).isTrue();
            return resultSet.getString(1);
        }
    }
}
