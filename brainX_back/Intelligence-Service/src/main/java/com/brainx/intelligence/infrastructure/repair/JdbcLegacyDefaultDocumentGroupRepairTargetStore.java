package com.brainx.intelligence.infrastructure.repair;

import java.util.List;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
class JdbcLegacyDefaultDocumentGroupRepairTargetStore implements LegacyDefaultDocumentGroupRepairTargetStore {

    private final JdbcTemplate jdbcTemplate;

    JdbcLegacyDefaultDocumentGroupRepairTargetStore(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    @Override
    public List<LegacyDefaultDocumentGroupRepairTarget> findPendingVectorCleanupTargets() {
        return jdbcTemplate.query("""
            select user_id, note_id
            from intelligence_legacy_default_document_group_repairs
            where vector_cleanup_status is null
               or vector_cleanup_status <> 'SUCCESS'
            order by created_at asc, repair_id asc
            """, (resultSet, rowNumber) -> new LegacyDefaultDocumentGroupRepairTarget(
            resultSet.getString("user_id"),
            resultSet.getString("note_id")
        ));
    }

    @Override
    public void markVectorCleanupSucceeded(LegacyDefaultDocumentGroupRepairTarget target) {
        jdbcTemplate.update("""
            update intelligence_legacy_default_document_group_repairs
            set vector_cleanup_attempted_at = now(),
                vector_cleanup_status = 'SUCCESS',
                vector_cleanup_error = null
            where repair_id = ?
            """, repairId(target));
    }

    @Override
    public void markVectorCleanupFailed(LegacyDefaultDocumentGroupRepairTarget target, String errorMessage) {
        jdbcTemplate.update("""
            update intelligence_legacy_default_document_group_repairs
            set vector_cleanup_attempted_at = now(),
                vector_cleanup_status = 'FAILED',
                vector_cleanup_error = ?
            where repair_id = ?
            """, truncate(errorMessage), repairId(target));
    }

    private static String repairId(LegacyDefaultDocumentGroupRepairTarget target) {
        return target.userId() + "::default::" + target.noteId();
    }

    private static String truncate(String value) {
        if (value == null || value.isBlank()) {
            return "Legacy default vector cleanup failed.";
        }
        return value.length() <= 1000 ? value : value.substring(0, 1000);
    }
}
