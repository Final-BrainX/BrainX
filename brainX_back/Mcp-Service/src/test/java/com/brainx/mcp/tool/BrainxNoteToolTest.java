package com.brainx.mcp.tool;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.brainx.mcp.downstream.IntelligenceSearchGateway;
import com.brainx.mcp.downstream.WorkspaceNoteGateway;
import com.brainx.mcp.security.McpPrincipal;
import java.time.Instant;
import java.util.List;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;

class BrainxNoteToolTest {

    private final FakeWorkspaceGateway workspaceGateway = new FakeWorkspaceGateway();
    private final FakeIntelligenceGateway intelligenceGateway = new FakeIntelligenceGateway();
    private final BrainxNoteTool tool = new BrainxNoteTool(workspaceGateway, intelligenceGateway);

    @AfterEach
    void clearSecurityContext() {
        SecurityContextHolder.clearContext();
    }

    @Test
    void searchNotesRequiresReadAndSearchScopes() {
        authenticate("usr_1", List.of("notes:read"));

        assertThatThrownBy(() -> tool.searchNotes("fastapi", null, null, null))
            .isInstanceOf(IllegalStateException.class)
            .hasMessageContaining("ai:search");
    }

    @Test
    void searchNotesUsesPrincipalUserAndDefaultsToUserScope() {
        authenticate("usr_1", List.of("notes:read", "ai:search"));

        BrainxNoteTool.SearchNotesToolResult result = tool.searchNotes(" fastapi ", null, null, null);

        assertThat(intelligenceGateway.userId).isEqualTo("usr_1");
        assertThat(intelligenceGateway.query).isEqualTo(new IntelligenceSearchGateway.SearchQuery(
            "fastapi",
            10,
            "USER",
            null
        ));
        assertThat(result.results()).hasSize(1);
        assertThat(result.results().getFirst().noteId()).isEqualTo("note-1");
    }

    @Test
    void getNoteUsesPrincipalUser() {
        authenticate("usr_1", List.of("notes:read"));

        WorkspaceNoteGateway.NoteDetail result = tool.getNote(" note-1 ");

        assertThat(workspaceGateway.getUserId).isEqualTo("usr_1");
        assertThat(workspaceGateway.getNoteId).isEqualTo("note-1");
        assertThat(result.title()).isEqualTo("FastAPI");
    }

    @Test
    void createNoteNormalizesOptionalFieldsAndTags() {
        authenticate("usr_1", List.of("notes:write"));

        WorkspaceNoteGateway.CreatedNote result = tool.createNote(
            " FastAPI Draft ",
            "# FastAPI\n\nNotes",
            " ",
            List.of(" ai ", "", "chat", "ai")
        );

        assertThat(workspaceGateway.createUserId).isEqualTo("usr_1");
        assertThat(workspaceGateway.createCommand).isEqualTo(new WorkspaceNoteGateway.CreateNoteCommand(
            "FastAPI Draft",
            "# FastAPI\n\nNotes",
            null,
            List.of("ai", "chat")
        ));
        assertThat(result.noteId()).isEqualTo("created-note-1");
    }

    private static void authenticate(String userId, List<String> scopes) {
        SecurityContextHolder.getContext().setAuthentication(new UsernamePasswordAuthenticationToken(
            new McpPrincipal(userId, "mcp_1", scopes),
            null,
            List.of(new SimpleGrantedAuthority("ROLE_MCP_CLIENT"))
        ));
    }

    private static final class FakeWorkspaceGateway implements WorkspaceNoteGateway {

        private String getUserId;
        private String getNoteId;
        private String createUserId;
        private CreateNoteCommand createCommand;

        @Override
        public NoteDetail getNote(String userId, String noteId) {
            this.getUserId = userId;
            this.getNoteId = noteId;
            return new NoteDetail(
                noteId,
                "FastAPI",
                "# FastAPI",
                null,
                List.of("api"),
                3,
                Instant.parse("2026-01-01T00:00:00Z"),
                Instant.parse("2026-01-02T00:00:00Z")
            );
        }

        @Override
        public CreatedNote createNote(String userId, CreateNoteCommand command) {
            this.createUserId = userId;
            this.createCommand = command;
            return new CreatedNote(
                "created-note-1",
                command.title(),
                command.folderId(),
                1,
                Instant.parse("2026-01-01T00:00:00Z")
            );
        }
    }

    private static final class FakeIntelligenceGateway implements IntelligenceSearchGateway {

        private String userId;
        private SearchQuery query;

        @Override
        public SearchResponse search(String userId, SearchQuery query) {
            this.userId = userId;
            this.query = query;
            return new SearchResponse(
                List.of(new SearchResult("note-1", "FastAPI", "excerpt", 0.9d, "SEMANTIC")),
                12,
                true
            );
        }
    }
}
