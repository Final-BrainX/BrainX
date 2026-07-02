package com.brainx.workspace;

import org.junit.jupiter.api.Test;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.datasource.SingleConnectionDataSource;
import org.springframework.jdbc.datasource.init.ResourceDatabasePopulator;

import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.ResultSet;
import java.sql.Statement;

import static org.assertj.core.api.Assertions.assertThat;

class WorkspaceNoteLinkMigrationTests {

    @Test
    void backfillsLegacyLinkTypeValuesBeforeNotNullIsEnforced() throws Exception {
        try (Connection connection = DriverManager.getConnection(
                "jdbc:h2:mem:workspace_note_link_migration;MODE=PostgreSQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1",
                "sa",
                "");
             Statement statement = connection.createStatement()) {
            statement.execute("""
                    create table workspace_note_links (
                        link_id varchar(64) primary key,
                        user_id varchar(64) not null,
                        source_note_id varchar(64) not null,
                        target_note_id varchar(64) not null,
                        target_title varchar(255) not null,
                        anchor_text varchar(255),
                        heading_anchor varchar(255),
                        created_at timestamp not null
                    )
                    """);
            statement.execute("""
                    insert into workspace_note_links (
                        link_id, user_id, source_note_id, target_note_id, target_title, anchor_text, heading_anchor, created_at
                    ) values (
                        'link-legacy', 'user-1', 'source-1', 'target-1', 'Legacy target', null, null, current_timestamp
                    )
                    """);

            SingleConnectionDataSource singleConnectionDataSource = new SingleConnectionDataSource(connection, true);
            new ResourceDatabasePopulator(new ClassPathResource("db/migration/V20260702_01__repair_workspace_note_links_link_type.sql"))
                    .execute(singleConnectionDataSource);

            try (ResultSet rs = statement.executeQuery("""
                    select link_type
                    from workspace_note_links
                    where link_id = 'link-legacy'
                    """)) {
                assertThat(rs.next()).isTrue();
                assertThat(rs.getString("link_type")).isEqualTo("MANUAL");
            }

            try (ResultSet rs = statement.executeQuery("""
                    select count(*)
                    from information_schema.columns
                    where table_name = 'workspace_note_links'
                      and column_name = 'link_type'
                      and is_nullable = 'NO'
                    """)) {
                assertThat(rs.next()).isTrue();
                assertThat(rs.getInt(1)).isEqualTo(1);
            }

            statement.execute("""
                    insert into workspace_note_links (
                        link_id, user_id, source_note_id, target_note_id, target_title, anchor_text, heading_anchor, created_at
                    ) values (
                        'link-default', 'user-1', 'source-1', 'target-2', 'Default target', null, null, current_timestamp
                    )
                    """);

            try (ResultSet rs = statement.executeQuery("""
                    select link_type
                    from workspace_note_links
                    where link_id = 'link-default'
                    """)) {
                assertThat(rs.next()).isTrue();
                assertThat(rs.getString("link_type")).isEqualTo("MANUAL");
            }
        }
    }
}
