package com.brainx.intelligence.exploration.adapter.web;

import java.security.Principal;
import java.util.List;
import java.util.Map;

import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

import com.brainx.intelligence.exploration.application.port.inbound.GetNoteSummaryUseCase;
import com.brainx.intelligence.exploration.application.port.inbound.GetNoteSummaryUseCase.GetNoteSummaryQuery;
import com.brainx.intelligence.exploration.application.port.inbound.GetNoteIndexStatusesUseCase;
import com.brainx.intelligence.exploration.application.port.inbound.GetNoteIndexStatusesUseCase.NoteIndexStatusesCommand;
import com.brainx.intelligence.exploration.application.port.inbound.SemanticSearchUseCase;
import com.brainx.intelligence.exploration.application.port.inbound.SemanticSearchUseCase.SemanticSearchCommand;
import com.brainx.intelligence.exploration.domain.SearchMatchType;
import com.brainx.intelligence.exploration.domain.SearchScope;
import com.brainx.intelligence.exploration.domain.SummarySource;
import com.brainx.intelligence.infrastructure.web.ApiSuccessResponse;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.Size;

@RestController
@Validated
public class ExplorationController {

    private final SemanticSearchUseCase semanticSearchUseCase;
    private final GetNoteIndexStatusesUseCase getNoteIndexStatusesUseCase;
    private final GetNoteSummaryUseCase getNoteSummaryUseCase;

    public ExplorationController(
        SemanticSearchUseCase semanticSearchUseCase,
        GetNoteIndexStatusesUseCase getNoteIndexStatusesUseCase,
        GetNoteSummaryUseCase getNoteSummaryUseCase
    ) {
        this.semanticSearchUseCase = semanticSearchUseCase;
        this.getNoteIndexStatusesUseCase = getNoteIndexStatusesUseCase;
        this.getNoteSummaryUseCase = getNoteSummaryUseCase;
    }

    @PostMapping("/api/v1/intelligence/semantic-search")
    public ApiSuccessResponse<SemanticSearchData> semanticSearch(
        Principal principal,
        @Valid @RequestBody SemanticSearchRequest request
    ) {
        return semanticSearchForUser(userId(principal), request);
    }

    @PostMapping("/internal/v1/intelligence/semantic-search")
    public ApiSuccessResponse<SemanticSearchData> semanticSearchInternal(
        @Valid @RequestBody InternalSemanticSearchRequest request
    ) {
        return semanticSearchForUser(request.userId(), request.toPublicRequest());
    }

    private ApiSuccessResponse<SemanticSearchData> semanticSearchForUser(String userId, SemanticSearchRequest request) {
        var result = semanticSearchUseCase.semanticSearch(new SemanticSearchCommand(
            userId,
            SearchScope.normalize(request.scope()),
            request.documentGroupId(),
            request.query(),
            nullToEmpty(request.filters()),
            request.limit(),
            nullToEmptyList(request.hybridWithClientKeywordIds())
        ));

        return ApiSuccessResponse.ok(new SemanticSearchData(
            result.results().stream()
                .map(item -> new SemanticSearchResultData(
                    item.noteId(),
                    item.title(),
                    item.excerpt(),
                    item.score(),
                    item.matchedType()
                ))
                .toList(),
            result.tokenEstimate(),
            result.charged()
        ));
    }

    @PostMapping("/api/v1/intelligence/note-index-statuses")
    public ApiSuccessResponse<NoteIndexStatusesData> noteIndexStatuses(
        Principal principal,
        @Valid @RequestBody NoteIndexStatusesRequest request
    ) {
        var result = getNoteIndexStatusesUseCase.getNoteIndexStatuses(new NoteIndexStatusesCommand(
            userId(principal),
            request.documentGroupId(),
            request.noteIds()
        ));

        return ApiSuccessResponse.ok(new NoteIndexStatusesData(
            result.notes().stream()
                .map(note -> new NoteIndexStatusData(
                    note.noteId(),
                    note.searchIndexStatus(),
                    note.availableForAiFeatures(),
                    note.indexedAt()
                ))
                .toList()
        ));
    }

    @GetMapping("/api/v1/notes/{noteId}/summary")
    public ApiSuccessResponse<NoteSummaryData> getNoteSummary(
        Principal principal,
        @PathVariable @NotBlank String noteId
    ) {
        var result = getNoteSummaryUseCase.getNoteSummary(new GetNoteSummaryQuery(userId(principal), noteId));

        return ApiSuccessResponse.ok(new NoteSummaryData(
            result.noteId(),
            result.summary(),
            result.source()
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

    private static Map<String, Object> nullToEmpty(Map<String, Object> values) {
        return values == null ? Map.of() : values;
    }

    private static List<String> nullToEmptyList(List<String> values) {
        return values == null ? List.of() : values;
    }

    record SemanticSearchRequest(
        String scope,
        String documentGroupId,
        @NotBlank String query,
        Map<String, Object> filters,
        Integer limit,
        List<String> hybridWithClientKeywordIds
    ) {
    }

    record InternalSemanticSearchRequest(
        @NotBlank String userId,
        String scope,
        String documentGroupId,
        @NotBlank String query,
        Map<String, Object> filters,
        Integer limit,
        List<String> hybridWithClientKeywordIds
    ) {

        SemanticSearchRequest toPublicRequest() {
            return new SemanticSearchRequest(scope, documentGroupId, query, filters, limit, hybridWithClientKeywordIds);
        }
    }

    record SemanticSearchData(
        List<SemanticSearchResultData> results,
        Integer tokenEstimate,
        boolean charged
    ) {
    }

    record SemanticSearchResultData(
        String noteId,
        String title,
        String excerpt,
        double score,
        SearchMatchType matchedType
    ) {
    }

    record NoteIndexStatusesRequest(
        String documentGroupId,
        @NotEmpty @Size(max = 200) List<@NotBlank String> noteIds
    ) {
    }

    record NoteIndexStatusesData(
        List<NoteIndexStatusData> notes
    ) {
    }

    record NoteIndexStatusData(
        String noteId,
        String searchIndexStatus,
        boolean availableForAiFeatures,
        java.time.Instant indexedAt
    ) {
    }

    record NoteSummaryData(
        String noteId,
        String summary,
        SummarySource source
    ) {
    }
}
