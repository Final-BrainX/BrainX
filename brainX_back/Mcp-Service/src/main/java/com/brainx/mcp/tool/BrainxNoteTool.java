package com.brainx.mcp.tool;

import com.brainx.mcp.downstream.IntelligenceSearchGateway;
import com.brainx.mcp.downstream.WorkspaceNoteGateway;
import com.brainx.mcp.downstream.WorkspaceNoteGateway.CreateNoteCommand;
import com.brainx.mcp.security.McpPrincipal;
import com.brainx.mcp.security.McpSecurity;
import java.util.List;
import org.springframework.ai.tool.annotation.Tool;
import org.springframework.ai.tool.annotation.ToolParam;
import org.springframework.stereotype.Component;

@Component
public class BrainxNoteTool {

    private static final String NOTES_READ = "notes:read";
    private static final String NOTES_WRITE = "notes:write";
    private static final String AI_SEARCH = "ai:search";
    private static final String DEFAULT_SEARCH_SCOPE = "USER";
    private static final int DEFAULT_SEARCH_LIMIT = 10;

    private final WorkspaceNoteGateway workspaceNoteGateway;
    private final IntelligenceSearchGateway intelligenceSearchGateway;

    public BrainxNoteTool(
        WorkspaceNoteGateway workspaceNoteGateway,
        IntelligenceSearchGateway intelligenceSearchGateway
    ) {
        this.workspaceNoteGateway = workspaceNoteGateway;
        this.intelligenceSearchGateway = intelligenceSearchGateway;
    }

    @Tool(name = "brainx_search_notes", description = "Search the authenticated user's BrainX notes with semantic search.")
    public SearchNotesToolResult searchNotes(
        @ToolParam(description = "Natural-language query to search for.") String query,
        @ToolParam(description = "Maximum number of results. Defaults to 10.", required = false) Integer limit,
        @ToolParam(description = "Search scope: USER or DOCUMENT_GROUP. Defaults to USER.", required = false) String scope,
        @ToolParam(description = "Document group id. Omit when scope is USER.", required = false) String documentGroupId
    ) {
        McpPrincipal principal = McpSecurity.currentApiClient(NOTES_READ, AI_SEARCH);
        String normalizedQuery = requireText(query, "query");
        var response = intelligenceSearchGateway.search(principal.userId(), new IntelligenceSearchGateway.SearchQuery(
            normalizedQuery,
            limit == null ? DEFAULT_SEARCH_LIMIT : limit,
            hasText(scope) ? scope.trim() : DEFAULT_SEARCH_SCOPE,
            blankToNull(documentGroupId)
        ));
        return new SearchNotesToolResult(
            response.results() == null ? List.of() : response.results(),
            response.tokenEstimate(),
            response.charged()
        );
    }

    @Tool(name = "brainx_get_note", description = "Read one BrainX workspace note by note id.")
    public WorkspaceNoteGateway.NoteDetail getNote(
        @ToolParam(description = "BrainX workspace note id.") String noteId
    ) {
        McpPrincipal principal = McpSecurity.currentApiClient(NOTES_READ);
        return workspaceNoteGateway.getNote(principal.userId(), requireText(noteId, "noteId"));
    }

    @Tool(name = "brainx_create_note", description = "Create a new BrainX workspace note.")
    public WorkspaceNoteGateway.CreatedNote createNote(
        @ToolParam(description = "New note title.") String title,
        @ToolParam(description = "New note markdown body.") String markdown,
        @ToolParam(description = "Target folder id. Omit to create at workspace root.", required = false) String folderId,
        @ToolParam(description = "Optional note tags.", required = false) List<String> tags
    ) {
        McpPrincipal principal = McpSecurity.currentApiClient(NOTES_WRITE);
        if (markdown == null) {
            throw new IllegalArgumentException("markdown is required.");
        }
        return workspaceNoteGateway.createNote(principal.userId(), new CreateNoteCommand(
            requireText(title, "title"),
            markdown,
            blankToNull(folderId),
            normalizeTags(tags)
        ));
    }

    private static String requireText(String value, String fieldName) {
        if (!hasText(value)) {
            throw new IllegalArgumentException(fieldName + " is required.");
        }
        return value.trim();
    }

    private static String blankToNull(String value) {
        return hasText(value) ? value.trim() : null;
    }

    private static List<String> normalizeTags(List<String> tags) {
        if (tags == null) {
            return List.of();
        }
        return tags.stream()
            .filter(BrainxNoteTool::hasText)
            .map(String::trim)
            .distinct()
            .toList();
    }

    private static boolean hasText(String value) {
        return value != null && !value.isBlank();
    }

    public record SearchNotesToolResult(
        List<IntelligenceSearchGateway.SearchResult> results,
        Integer tokenEstimate,
        boolean charged
    ) {
    }
}
