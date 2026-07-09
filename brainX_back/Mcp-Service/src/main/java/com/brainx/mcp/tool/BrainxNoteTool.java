package com.brainx.mcp.tool;

import com.brainx.mcp.downstream.IntelligenceSearchGateway;
import com.brainx.mcp.downstream.WorkspaceNoteGateway;
import com.brainx.mcp.downstream.WorkspaceNoteGateway.CreateNoteCommand;
import com.brainx.mcp.security.McpPrincipal;
import com.brainx.mcp.security.McpSecurity;
import java.util.List;
import java.util.Locale;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.springframework.ai.tool.annotation.Tool;
import org.springframework.ai.tool.annotation.ToolParam;
import org.springframework.stereotype.Component;

@Component
public class BrainxNoteTool {

    private static final String NOTES_READ = "notes:read";
    private static final String NOTES_WRITE = "notes:write";
    private static final String AI_SEARCH = "ai:search";
    private static final String DEFAULT_SEARCH_SCOPE = "USER";
    private static final String DEFAULT_SEARCH_MODE = "SEMANTIC";
    private static final int DEFAULT_SEARCH_LIMIT = 10;
    private static final Pattern LEADING_MARKDOWN_HEADING = Pattern.compile(
        "\\A(?:[ \\t]*(?:\\r?\\n))*[ \\t]{0,3}#{1,6}[ \\t]+(.+?)(?:[ \\t]+#+[ \\t]*)?(?:\\r?\\n|\\z)"
    );
    private static final Pattern LEADING_HTML_H1 = Pattern.compile(
        "\\A\\s*<h1\\b[^>]*>(.*?)</h1>",
        Pattern.CASE_INSENSITIVE | Pattern.DOTALL
    );
    private static final Pattern LEADING_EMPTY_HTML_PARAGRAPHS = Pattern.compile(
        "\\A(?:\\s*<p\\b[^>]*>\\s*</p>)+",
        Pattern.CASE_INSENSITIVE
    );

    private final WorkspaceNoteGateway workspaceNoteGateway;
    private final IntelligenceSearchGateway intelligenceSearchGateway;

    public BrainxNoteTool(
        WorkspaceNoteGateway workspaceNoteGateway,
        IntelligenceSearchGateway intelligenceSearchGateway
    ) {
        this.workspaceNoteGateway = workspaceNoteGateway;
        this.intelligenceSearchGateway = intelligenceSearchGateway;
    }

    @Tool(name = "brainx_search_notes", description = "Search the authenticated user's BrainX notes with semantic, keyword, or hybrid search.")
    public SearchNotesToolResult searchNotes(
        @ToolParam(description = "Natural-language query to search for.") String query,
        @ToolParam(description = "Maximum number of results. Defaults to 10.", required = false) Integer limit,
        @ToolParam(description = "Search scope: USER or DOCUMENT_GROUP. Defaults to USER.", required = false) String scope,
        @ToolParam(description = "Document group id. Omit when scope is USER.", required = false) String documentGroupId,
        @ToolParam(description = "Search mode: SEMANTIC, KEYWORD, or HYBRID. Defaults to SEMANTIC.", required = false) String mode
    ) {
        McpPrincipal principal = McpSecurity.currentApiClient(NOTES_READ, AI_SEARCH);
        String normalizedQuery = requireText(query, "query");
        var response = intelligenceSearchGateway.search(principal.userId(), new IntelligenceSearchGateway.SearchQuery(
            normalizedQuery,
            limit == null ? DEFAULT_SEARCH_LIMIT : limit,
            hasText(scope) ? scope.trim() : DEFAULT_SEARCH_SCOPE,
            blankToNull(documentGroupId),
            normalizeMode(mode)
        ));
        return new SearchNotesToolResult(
            response.results() == null ? List.of() : response.results(),
            response.tokenEstimate(),
            response.charged()
        );
    }

    @Tool(name = "brainx_ask_notes", description = "Answer a question using the authenticated user's BrainX notes and return supporting citations.")
    public AskNotesToolResult askNotes(
        @ToolParam(description = "Question to answer from BrainX notes.") String question,
        @ToolParam(description = "Maximum number of note contexts. Defaults to 8.", required = false) Integer limit,
        @ToolParam(description = "Search scope: USER or DOCUMENT_GROUP. Defaults to USER.", required = false) String scope,
        @ToolParam(description = "Document group id. Omit when scope is USER.", required = false) String documentGroupId,
        @ToolParam(description = "Optional AI model id. Omit to use the user's default model.", required = false) String modelId
    ) {
        McpPrincipal principal = McpSecurity.currentApiClient(NOTES_READ, AI_SEARCH);
        var response = intelligenceSearchGateway.askNotes(principal.userId(), new IntelligenceSearchGateway.AskNotesQuery(
            requireText(question, "question"),
            limit,
            hasText(scope) ? scope.trim() : DEFAULT_SEARCH_SCOPE,
            blankToNull(documentGroupId),
            blankToNull(modelId)
        ));
        return new AskNotesToolResult(
            response.answer(),
            response.citations() == null ? List.of() : response.citations(),
            response.modelId(),
            response.tokenEstimate(),
            response.charged(),
            response.tokenUsage()
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
        String normalizedTitle = requireText(title, "title");
        return workspaceNoteGateway.createNote(principal.userId(), new CreateNoteCommand(
            normalizedTitle,
            stripDuplicateTitleHeading(markdown, normalizedTitle),
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

    private static String stripDuplicateTitleHeading(String markdown, String title) {
        Matcher markdownHeading = LEADING_MARKDOWN_HEADING.matcher(markdown);
        if (markdownHeading.find() && headingMatchesTitle(markdownHeading.group(1), title)) {
            return stripLeadingBlankLines(markdown.substring(markdownHeading.end()));
        }

        Matcher htmlHeading = LEADING_HTML_H1.matcher(markdown);
        if (htmlHeading.find() && headingMatchesTitle(htmlHeading.group(1), title)) {
            return stripLeadingBlankHtmlBlocks(markdown.substring(htmlHeading.end()));
        }

        return markdown;
    }

    private static boolean headingMatchesTitle(String heading, String title) {
        return normalizeHeadingText(heading).equals(normalizeHeadingText(title));
    }

    private static String normalizeHeadingText(String value) {
        return stripMarkdownFormattingWrapper(value
            .replaceAll("<[^>]+>", " ")
            .replace("&nbsp;", " ")
            .replace("&amp;", "&")
            .replace("&lt;", "<")
            .replace("&gt;", ">")
            .replace("&quot;", "\"")
            .replace("&#39;", "'"))
            .replaceAll("\\s+", " ")
            .trim()
            .toLowerCase(Locale.ROOT);
    }

    private static String stripMarkdownFormattingWrapper(String value) {
        String current = value.strip();
        boolean changed;
        do {
            changed = false;
            String next = stripWrapper(current, "**");
            next = stripWrapper(next, "__");
            next = stripWrapper(next, "~~");
            next = stripWrapper(next, "`");
            next = stripSingleWrapper(next, "*");
            next = stripSingleWrapper(next, "_");
            next = next.strip();
            if (!next.equals(current)) {
                current = next;
                changed = true;
            }
        } while (changed);
        return current;
    }

    private static String stripWrapper(String value, String marker) {
        if (value.length() <= marker.length() * 2 || !value.startsWith(marker) || !value.endsWith(marker)) {
            return value;
        }
        String inner = value.substring(marker.length(), value.length() - marker.length()).strip();
        return inner.isEmpty() ? value : inner;
    }

    private static String stripSingleWrapper(String value, String marker) {
        if (value.startsWith(marker + marker) || value.endsWith(marker + marker)) {
            return value;
        }
        return stripWrapper(value, marker);
    }

    private static String stripLeadingBlankLines(String value) {
        return value.replaceFirst("\\A(?:[ \\t]*(?:\\r?\\n))+", "");
    }

    private static String stripLeadingBlankHtmlBlocks(String value) {
        return LEADING_EMPTY_HTML_PARAGRAPHS.matcher(value).replaceFirst("").stripLeading();
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

    private static String normalizeMode(String mode) {
        return hasText(mode) ? mode.trim().toUpperCase(Locale.ROOT) : DEFAULT_SEARCH_MODE;
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

    public record AskNotesToolResult(
        String answer,
        List<IntelligenceSearchGateway.AskNotesCitation> citations,
        String modelId,
        Integer tokenEstimate,
        boolean charged,
        IntelligenceSearchGateway.AskNotesTokenUsage tokenUsage
    ) {
    }
}
