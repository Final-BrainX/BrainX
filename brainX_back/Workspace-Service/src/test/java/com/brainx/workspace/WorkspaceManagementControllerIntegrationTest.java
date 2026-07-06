package com.brainx.workspace;

import com.brainx.workspace.entity.Workspace;
import com.brainx.workspace.repository.WorkspaceRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

import java.time.Instant;

import static org.hamcrest.Matchers.hasSize;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
class WorkspaceManagementControllerIntegrationTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private WorkspaceRepository workspaceRepository;

    @Autowired
    private ObjectMapper objectMapper;

    @BeforeEach
    void cleanDatabase() {
        workspaceRepository.deleteAll();
    }

    @Test
    void memberCanListWorkspacesAndDefaultComesFirst() throws Exception {
        workspaceRepository.save(new Workspace("dgrp_b", "usr_member", "Project B", false, Instant.parse("2026-07-05T00:01:00Z")));
        workspaceRepository.save(new Workspace("dgrp_default_usr_member", "usr_member", "Default", true, Instant.parse("2026-07-05T00:02:00Z")));
        workspaceRepository.save(new Workspace("dgrp_a", "usr_member", "Project A", false, Instant.parse("2026-07-05T00:00:00Z")));

        mockMvc.perform(get("/api/v1/workspaces")
                        .header("X-User-Id", "usr_member"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.workspaces", hasSize(3)))
                .andExpect(jsonPath("$.data.workspaces[0].documentGroupId").value("dgrp_default_usr_member"))
                .andExpect(jsonPath("$.data.workspaces[1].documentGroupId").value("dgrp_a"))
                .andExpect(jsonPath("$.data.workspaces[2].documentGroupId").value("dgrp_b"))
                .andExpect(jsonPath("$.data.workspaces[0].noteCount").doesNotExist())
                .andExpect(jsonPath("$.data.workspaces[0].folderCount").doesNotExist())
                .andExpect(jsonPath("$.data.workspaces[0].storageBytes").doesNotExist())
                .andExpect(jsonPath("$.data.workspaces[0].description").doesNotExist());
    }

    @Test
    void memberCanGetWorkspaceDetail() throws Exception {
        workspaceRepository.save(new Workspace("dgrp_detail", "usr_member", "Project Detail", false, Instant.parse("2026-07-05T00:00:00Z")));

        mockMvc.perform(get("/api/v1/workspaces/dgrp_detail")
                        .header("X-User-Id", "usr_member"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.documentGroupId").value("dgrp_detail"))
                .andExpect(jsonPath("$.data.name").value("Project Detail"))
                .andExpect(jsonPath("$.data.isDefault").value(false))
                .andExpect(jsonPath("$.data.noteCount").doesNotExist())
                .andExpect(jsonPath("$.data.folderCount").doesNotExist())
                .andExpect(jsonPath("$.data.storageBytes").doesNotExist())
                .andExpect(jsonPath("$.data.description").doesNotExist());
    }

    @Test
    void memberCanCreateWorkspace() throws Exception {
        mockMvc.perform(post("/api/v1/workspaces")
                        .header("X-User-Id", "usr_member")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(new NameBody("Project Alpha"))))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.data.documentGroupId").value(org.hamcrest.Matchers.startsWith("dgrp_")))
                .andExpect(jsonPath("$.data.name").value("Project Alpha"))
                .andExpect(jsonPath("$.data.isDefault").value(false));
    }

    @Test
    void guestCannotCreateWorkspace() throws Exception {
        mockMvc.perform(post("/api/v1/workspaces")
                        .header("X-Guest-Id", "gst_1")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(new NameBody("Guest Project"))))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.error.code").value("GUEST_WORKSPACE_FORBIDDEN"));
    }

    @Test
    void memberCanRenameWorkspace() throws Exception {
        workspaceRepository.save(new Workspace("dgrp_rename", "usr_member", "Old Name", false, Instant.parse("2026-07-05T00:00:00Z")));

        mockMvc.perform(patch("/api/v1/workspaces/dgrp_rename")
                        .header("X-User-Id", "usr_member")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(new NameBody("New Name"))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.documentGroupId").value("dgrp_rename"))
                .andExpect(jsonPath("$.data.name").value("New Name"));
    }

    @Test
    void otherUserCannotRenameWorkspace() throws Exception {
        workspaceRepository.save(new Workspace("dgrp_other", "usr_owner", "Owner Workspace", false, Instant.parse("2026-07-05T00:00:00Z")));

        mockMvc.perform(patch("/api/v1/workspaces/dgrp_other")
                        .header("X-User-Id", "usr_attacker")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(new NameBody("Hacked"))))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.error.code").value("WORKSPACE_NOT_FOUND"));
    }

    @Test
    void blankWorkspaceNameIsRejectedOnCreateAndPatch() throws Exception {
        workspaceRepository.save(new Workspace("dgrp_blank", "usr_member", "Valid Name", false, Instant.parse("2026-07-05T00:00:00Z")));

        mockMvc.perform(post("/api/v1/workspaces")
                        .header("X-User-Id", "usr_member")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(new NameBody("   "))))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error.code").value("VALIDATION_FAILED"));

        mockMvc.perform(patch("/api/v1/workspaces/dgrp_blank")
                        .header("X-User-Id", "usr_member")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(new NameBody("   "))))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error.code").value("VALIDATION_FAILED"));
    }

    @Test
    void duplicateWorkspaceNameIsRejectedForCreateAndRename() throws Exception {
        workspaceRepository.save(new Workspace("dgrp_existing", "usr_member", "Project A", false, Instant.parse("2026-07-05T00:00:00Z")));
        workspaceRepository.save(new Workspace("dgrp_other_name", "usr_member", "Project B", false, Instant.parse("2026-07-05T00:01:00Z")));

        mockMvc.perform(post("/api/v1/workspaces")
                        .header("X-User-Id", "usr_member")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(new NameBody("Project A"))))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.error.code").value("WORKSPACE_NAME_DUPLICATE"));

        mockMvc.perform(patch("/api/v1/workspaces/dgrp_other_name")
                        .header("X-User-Id", "usr_member")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(new NameBody("Project A"))))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.error.code").value("WORKSPACE_NAME_DUPLICATE"));
    }

    @Test
    void patchingWithTheSameExistingNameIsAllowed() throws Exception {
        workspaceRepository.save(new Workspace("dgrp_same", "usr_member", "Project Same", false, Instant.parse("2026-07-05T00:00:00Z")));

        mockMvc.perform(patch("/api/v1/workspaces/dgrp_same")
                        .header("X-User-Id", "usr_member")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(new NameBody("Project Same"))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.name").value("Project Same"));
    }

    @Test
    void deleteWorkspaceApiIsNotExposed() throws Exception {
        workspaceRepository.save(new Workspace("dgrp_delete", "usr_member", "Delete Target", false, Instant.parse("2026-07-05T00:00:00Z")));

        mockMvc.perform(delete("/api/v1/workspaces/dgrp_delete")
                        .header("X-User-Id", "usr_member"))
                .andExpect(status().isMethodNotAllowed());
    }

    private record NameBody(String name) {
    }
}
