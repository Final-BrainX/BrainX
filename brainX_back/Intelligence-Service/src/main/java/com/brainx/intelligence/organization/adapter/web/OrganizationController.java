package com.brainx.intelligence.organization.adapter.web;

import java.security.Principal;
import java.util.List;
import java.util.Map;

import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

import com.brainx.intelligence.infrastructure.web.ApiSuccessResponse;
import com.brainx.intelligence.organization.application.port.inbound.CreateFolderOrganizationProposalUseCase;
import com.brainx.intelligence.organization.application.port.inbound.CreateFolderOrganizationProposalUseCase.FolderOrganizationProposalCommand;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;

@RestController
@Validated
public class OrganizationController {

    private final CreateFolderOrganizationProposalUseCase createFolderOrganizationProposalUseCase;

    public OrganizationController(CreateFolderOrganizationProposalUseCase createFolderOrganizationProposalUseCase) {
        this.createFolderOrganizationProposalUseCase = createFolderOrganizationProposalUseCase;
    }

    @PostMapping("/api/v1/ai/folder-organization-proposals")
    public ApiSuccessResponse<FolderOrganizationProposalData> createFolderOrganizationProposal(
        Principal principal,
        @Valid @RequestBody FolderOrganizationProposalRequest request
    ) {
        var result = createFolderOrganizationProposalUseCase.createFolderOrganizationProposal(new FolderOrganizationProposalCommand(
            userId(principal),
            request.scope(),
            request.folderId()
        ));
        return ApiSuccessResponse.ok(new FolderOrganizationProposalData(
            result.proposalId(),
            result.llmRunId(),
            result.proposedFolders(),
            result.proposedMoves()
        ));
    }

    private static String userId(Principal principal) {
        if (principal != null && principal.getName() != null && !principal.getName().isBlank()) {
            return principal.getName();
        }
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        if (authentication != null && authentication.getName() != null && !authentication.getName().isBlank()) {
            return authentication.getName();
        }
        throw new IllegalArgumentException("Authenticated user is required.");
    }

    record FolderOrganizationProposalRequest(
        @NotBlank String scope,
        String folderId
    ) {
    }

    record FolderOrganizationProposalData(
        String proposalId,
        String llmRunId,
        List<Map<String, Object>> proposedFolders,
        List<Map<String, Object>> proposedMoves
    ) {
    }
}
