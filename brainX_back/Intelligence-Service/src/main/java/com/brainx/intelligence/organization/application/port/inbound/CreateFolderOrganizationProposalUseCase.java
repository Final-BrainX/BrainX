package com.brainx.intelligence.organization.application.port.inbound;

import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

public interface CreateFolderOrganizationProposalUseCase {

    FolderOrganizationProposalResult createFolderOrganizationProposal(FolderOrganizationProposalCommand command);

    record FolderOrganizationProposalCommand(
        String userId,
        String scope,
        String folderId
    ) {
    }

    record FolderOrganizationProposalResult(
        String proposalId,
        List<Map<String, Object>> proposedFolders,
        List<Map<String, Object>> proposedMoves
    ) {
        public FolderOrganizationProposalResult {
            proposedFolders = immutableMaps(proposedFolders);
            proposedMoves = immutableMaps(proposedMoves);
        }
    }

    private static List<Map<String, Object>> immutableMaps(List<Map<String, Object>> values) {
        if (values == null) {
            return List.of();
        }
        return values.stream()
            .map(value -> Collections.unmodifiableMap(new LinkedHashMap<>(value)))
            .toList();
    }
}
