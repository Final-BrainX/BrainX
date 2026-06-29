package com.brainx.intelligence.organization.application.port.outbound;

import java.time.Instant;
import java.util.List;

import com.brainx.intelligence.shared.domain.DocumentGroups;

public interface OrganizationNoteSourcePort {

    List<OrganizationNoteSource> findOrganizationSourceNotes(String userId, String documentGroupId, int limit);

    List<OrganizationNoteSource> findOrganizationSourceNotesByFolder(
        String userId,
        String documentGroupId,
        String folderId,
        int limit
    );

    record OrganizationNoteSource(
        String userId,
        String documentGroupId,
        String noteId,
        String folderId,
        String title,
        List<String> tags,
        List<String> headings,
        String excerpt,
        Instant updatedAt
    ) {
        public OrganizationNoteSource {
            documentGroupId = DocumentGroups.normalize(documentGroupId);
            folderId = folderId == null ? "" : folderId;
            title = title == null ? "" : title;
            tags = tags == null ? List.of() : List.copyOf(tags);
            headings = headings == null ? List.of() : List.copyOf(headings);
            excerpt = excerpt == null ? "" : excerpt;
            updatedAt = updatedAt == null ? Instant.EPOCH : updatedAt;
        }
    }
}
