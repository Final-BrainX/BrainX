package com.brainx.intelligence.organization.adapter.web;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.argThat;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import com.brainx.intelligence.infrastructure.security.SecurityConfig;
import com.brainx.intelligence.infrastructure.web.GlobalApiExceptionHandler;
import com.brainx.intelligence.organization.application.port.inbound.CreateFolderOrganizationProposalUseCase;
import com.brainx.intelligence.organization.application.port.inbound.CreateFolderOrganizationProposalUseCase.FolderOrganizationProposalCommand;
import com.brainx.intelligence.organization.application.port.inbound.CreateFolderOrganizationProposalUseCase.FolderOrganizationProposalResult;
import com.brainx.intelligence.organization.domain.OrganizationConflictException;
import com.brainx.intelligence.organization.domain.OrganizationForbiddenException;
import com.brainx.intelligence.organization.domain.OrganizationNotFoundException;
import com.brainx.intelligence.organization.domain.OrganizationProviderUnavailableException;

@WebMvcTest(OrganizationController.class)
@Import({SecurityConfig.class, GlobalApiExceptionHandler.class})
class OrganizationControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @MockitoBean
    private CreateFolderOrganizationProposalUseCase createFolderOrganizationProposalUseCase;

    @Test
    void createFolderOrganizationProposalReturnsWrappedData() throws Exception {
        when(createFolderOrganizationProposalUseCase.createFolderOrganizationProposal(any(FolderOrganizationProposalCommand.class)))
            .thenReturn(new FolderOrganizationProposalResult(
                "proposal-1",
                List.of(Map.of("name", "Backend", "noteIds", List.of("note-1"))),
                List.of(Map.of("noteId", "note-2", "targetFolderName", "Backend"))
            ));

        mockMvc.perform(post("/api/v1/ai/folder-organization-proposals")
                .with(user("user-1"))
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {
                      "documentGroupId": "group-1",
                      "scope": "folder",
                      "folderId": "folder-1"
                    }
                    """))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.success").value(true))
            .andExpect(jsonPath("$.data.proposalId").value("proposal-1"))
            .andExpect(jsonPath("$.data.proposedFolders[0].name").value("Backend"))
            .andExpect(jsonPath("$.data.proposedFolders[0].noteIds[0]").value("note-1"))
            .andExpect(jsonPath("$.data.proposedMoves[0].noteId").value("note-2"))
            .andExpect(jsonPath("$.data.proposedMoves[0].targetFolderName").value("Backend"));

        verify(createFolderOrganizationProposalUseCase).createFolderOrganizationProposal(argThat(command ->
            command.userId().equals("user-1")
                && command.documentGroupId().equals("group-1")
                && command.scope().equals("folder")
                && command.folderId().equals("folder-1")
        ));
    }

    @Test
    void createFolderOrganizationProposalRequiresAuthentication() throws Exception {
        mockMvc.perform(post("/api/v1/ai/folder-organization-proposals")
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {
                      "scope": "all"
                    }
                    """))
            .andExpect(status().isUnauthorized())
            .andExpect(jsonPath("$.error.code").value("UNAUTHORIZED"));
    }

    @Test
    void createFolderOrganizationProposalRejectsBlankScope() throws Exception {
        mockMvc.perform(post("/api/v1/ai/folder-organization-proposals")
                .with(user("user-1"))
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {
                      "documentGroupId": "group-1",
                      "scope": ""
                    }
                    """))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.error.code").value("BAD_REQUEST"));
    }

    @Test
    void createFolderOrganizationProposalMapsInvalidScopeToBadRequest() throws Exception {
        when(createFolderOrganizationProposalUseCase.createFolderOrganizationProposal(any(FolderOrganizationProposalCommand.class)))
            .thenThrow(new IllegalArgumentException("scope must be all or folder."));

        mockMvc.perform(post("/api/v1/ai/folder-organization-proposals")
                .with(user("user-1"))
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {
                      "documentGroupId": "group-1",
                      "scope": "workspace"
                    }
                    """))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.error.code").value("BAD_REQUEST"));
    }

    @Test
    void createFolderOrganizationProposalMapsNotFoundForbiddenConflictAndProviderErrors() throws Exception {
        when(createFolderOrganizationProposalUseCase.createFolderOrganizationProposal(any(FolderOrganizationProposalCommand.class)))
            .thenThrow(new OrganizationNotFoundException("missing"));

        mockMvc.perform(post("/api/v1/ai/folder-organization-proposals")
                .with(user("user-1"))
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {
                      "documentGroupId": "group-1",
                      "scope": "folder",
                      "folderId": "missing"
                    }
                    """))
            .andExpect(status().isNotFound())
            .andExpect(jsonPath("$.error.code").value("NOT_FOUND"));

        when(createFolderOrganizationProposalUseCase.createFolderOrganizationProposal(any(FolderOrganizationProposalCommand.class)))
            .thenThrow(new OrganizationForbiddenException("denied"));

        mockMvc.perform(post("/api/v1/ai/folder-organization-proposals")
                .with(user("user-1"))
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {
                      "documentGroupId": "group-1",
                      "scope": "all"
                    }
                    """))
            .andExpect(status().isForbidden())
            .andExpect(jsonPath("$.error.code").value("FORBIDDEN"));

        when(createFolderOrganizationProposalUseCase.createFolderOrganizationProposal(any(FolderOrganizationProposalCommand.class)))
            .thenThrow(new OrganizationConflictException("empty"));

        mockMvc.perform(post("/api/v1/ai/folder-organization-proposals")
                .with(user("user-1"))
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {
                      "documentGroupId": "group-1",
                      "scope": "all"
                    }
                    """))
            .andExpect(status().isConflict())
            .andExpect(jsonPath("$.error.code").value("CONFLICT"));

        when(createFolderOrganizationProposalUseCase.createFolderOrganizationProposal(any(FolderOrganizationProposalCommand.class)))
            .thenThrow(new OrganizationProviderUnavailableException("down"));

        mockMvc.perform(post("/api/v1/ai/folder-organization-proposals")
                .with(user("user-1"))
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {
                      "documentGroupId": "group-1",
                      "scope": "all"
                    }
                    """))
            .andExpect(status().isInternalServerError())
            .andExpect(jsonPath("$.error.code").value("INTERNAL_SERVER_ERROR"));
    }
}
