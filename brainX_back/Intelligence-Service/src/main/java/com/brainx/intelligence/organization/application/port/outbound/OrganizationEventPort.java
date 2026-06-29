package com.brainx.intelligence.organization.application.port.outbound;

public interface OrganizationEventPort {

    void folderOrganizationProposalCreated(FolderOrganizationProposalCreatedEvent event);

    record FolderOrganizationProposalCreatedEvent(
        String userId,
        String suggestionId,
        String featureId,
        String noteId,
        String modelId
    ) {
    }
}
