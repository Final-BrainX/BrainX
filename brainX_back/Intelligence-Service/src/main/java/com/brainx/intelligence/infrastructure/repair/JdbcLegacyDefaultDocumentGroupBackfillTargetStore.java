package com.brainx.intelligence.infrastructure.repair;

import java.util.List;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
class JdbcLegacyDefaultDocumentGroupBackfillTargetStore implements LegacyDefaultDocumentGroupBackfillTargetStore {

    private final JdbcTemplate jdbcTemplate;

    JdbcLegacyDefaultDocumentGroupBackfillTargetStore(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    @Override
    public List<LegacyDefaultDocumentGroupBackfillTarget> findDefaultOnlyProjectionTargets(int limit) {
        return jdbcTemplate.query("""
            select legacy.user_id, legacy.note_id
            from intelligence_note_projections legacy
            where legacy.document_group_id = 'default'
              and legacy.archived = false
              and legacy.trashed = false
              and legacy.deleted = false
              and legacy.search_index_status <> 'REMOVED'
              and not exists (
                select 1
                from intelligence_note_projections current_projection
                where current_projection.user_id = legacy.user_id
                  and current_projection.note_id = legacy.note_id
                  and current_projection.document_group_id <> 'default'
              )
            order by legacy.updated_at desc, legacy.note_id asc
            limit ?
            """, (resultSet, rowNumber) -> new LegacyDefaultDocumentGroupBackfillTarget(
            resultSet.getString("user_id"),
            resultSet.getString("note_id")
        ), Math.max(1, limit));
    }
}
