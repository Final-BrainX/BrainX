package com.brainx.workspace;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.brainx.workspace.dto.WorkspaceDtos.NoteCreateRequest;
import com.brainx.workspace.service.WorkspaceService;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

@SpringBootTest
@AutoConfigureMockMvc
@Transactional
@TestPropertySource(properties = {
    "brainx.graph.neo4j.enabled=false",
    "eureka.client.enabled=false"
})
class InternalWorkspaceControllerIntegrationTest {

    private static final String SERVICE_TOKEN = "test-service-token";
    private static final String USER_ID = "usr_internal_delete";

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private WorkspaceService workspaceService;

    @Test
    void internalDeleteRequiresServiceToken() throws Exception {
        String noteId = createNote("Protected note");

        mockMvc.perform(delete("/internal/v1/workspace/users/{userId}/notes/{noteId}", USER_ID, noteId)
                .queryParam("mode", "trash"))
            .andExpect(status().isForbidden());

        mockMvc.perform(delete("/internal/v1/workspace/users/{userId}/notes/{noteId}", USER_ID, noteId)
                .header("X-Service-Token", "wrong-service-token")
                .queryParam("mode", "trash"))
            .andExpect(status().isForbidden());
    }

    @Test
    void internalDeleteMovesNoteToTrash() throws Exception {
        String noteId = createNote("Trash note");

        mockMvc.perform(delete("/internal/v1/workspace/users/{userId}/notes/{noteId}", USER_ID, noteId)
                .header("X-Service-Token", SERVICE_TOKEN)
                .queryParam("mode", "trash"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.data.noteId").value(noteId))
            .andExpect(jsonPath("$.data.deletedAt").isString())
            .andExpect(jsonPath("$.data.purgeAt").isString());
    }

    @Test
    void internalDeletePermanentlyDeletesNote() throws Exception {
        String noteId = createNote("Permanent note");

        mockMvc.perform(delete("/internal/v1/workspace/users/{userId}/notes/{noteId}", USER_ID, noteId)
                .header("X-Service-Token", SERVICE_TOKEN)
                .queryParam("mode", "permanent"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.data.noteId").value(noteId))
            .andExpect(jsonPath("$.data.deletedAt").isString())
            .andExpect(jsonPath("$.data.purgeAt").doesNotExist());
    }

    @Test
    void internalDeleteRejectsInvalidMode() throws Exception {
        String noteId = createNote("Invalid mode note");

        mockMvc.perform(delete("/internal/v1/workspace/users/{userId}/notes/{noteId}", USER_ID, noteId)
                .header("X-Service-Token", SERVICE_TOKEN)
                .queryParam("mode", "archive"))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.error.code").value("INVALID_DELETE_MODE"));
    }

    private String createNote(String title) {
        return workspaceService.createNote(
            USER_ID,
            new NoteCreateRequest(null, title, "body", null, List.of("mcp"))
        ).noteId();
    }
}
