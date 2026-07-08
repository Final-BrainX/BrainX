package com.brainx.intelligence.infrastructure.persistence.jpa.note;

import java.time.Instant;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.Set;
import java.util.function.Function;
import java.util.stream.Collectors;

import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

import com.brainx.intelligence.agent.application.port.outbound.AgentNoteSourcePort;
import com.brainx.intelligence.agent.application.port.outbound.AgentNoteSourcePort.AgentNoteSource;
import com.brainx.intelligence.autolink.application.port.outbound.AutoLinkNoteSourcePort;
import com.brainx.intelligence.autolink.application.port.outbound.AutoLinkNoteSourcePort.AutoLinkNoteSource;
import com.brainx.intelligence.clustering.application.port.outbound.ClusteringNoteSourcePort;
import com.brainx.intelligence.connection.application.port.outbound.ConnectionNoteSourcePort;
import com.brainx.intelligence.connection.application.port.outbound.ConnectionNoteSourcePort.ConnectionBridgeSourceNote;
import com.brainx.intelligence.connection.application.port.outbound.ConnectionNoteSourcePort.ConnectionNoteSource;
import com.brainx.intelligence.exploration.application.port.outbound.NoteIndexStatusPort;
import com.brainx.intelligence.exploration.application.port.outbound.NoteIndexStatusPort.NoteIndexStatusProjection;
import com.brainx.intelligence.exploration.application.port.outbound.NoteKeywordSearchPort;
import com.brainx.intelligence.exploration.application.port.outbound.NoteKeywordSearchPort.KeywordSearchQuery;
import com.brainx.intelligence.exploration.domain.SearchMatchType;
import com.brainx.intelligence.exploration.domain.SemanticSearchResult;
import com.brainx.intelligence.infrastructure.events.note.NoteProjection;
import com.brainx.intelligence.infrastructure.events.note.NoteProjectionStore;
import com.brainx.intelligence.infrastructure.events.note.NoteSearchIndexStatus;
import com.brainx.intelligence.organization.application.port.outbound.OrganizationNoteSourcePort;
import com.brainx.intelligence.organization.application.port.outbound.OrganizationNoteSourcePort.OrganizationNoteSource;
import com.brainx.intelligence.shared.application.port.outbound.KnowledgeAnalysisNoteSourcePort;
import com.brainx.intelligence.shared.application.port.outbound.KnowledgeAnalysisNoteSourcePort.KnowledgeAnalysisNote;
import com.brainx.intelligence.shared.domain.DocumentGroups;

@Repository
public class NoteProjectionJpaAdapter implements NoteProjectionStore, AgentNoteSourcePort, AutoLinkNoteSourcePort, ClusteringNoteSourcePort, ConnectionNoteSourcePort, KnowledgeAnalysisNoteSourcePort, OrganizationNoteSourcePort, NoteIndexStatusPort, NoteKeywordSearchPort {

    private static final int KEYWORD_CANDIDATE_OVERFETCH_FACTOR = 12;
    private static final int KEYWORD_CANDIDATE_MIN_LIMIT = 50;
    private static final int KEYWORD_CANDIDATE_MAX_LIMIT = 500;

    private final NoteProjectionJpaRepository repository;

    public NoteProjectionJpaAdapter(NoteProjectionJpaRepository repository) {
        this.repository = repository;
    }

    @Override
    @Transactional(readOnly = true)
    public Optional<NoteProjection> findByUserIdAndDocumentGroupIdAndNoteId(
        String userId,
        String documentGroupId,
        String noteId
    ) {
        return repository.findByUserIdAndDocumentGroupIdAndNoteId(
                userId,
                DocumentGroups.normalize(documentGroupId),
                noteId
            )
            .map(NoteProjectionJpaEntity::toDomain);
    }

    @Override
    @Transactional(readOnly = true)
    public List<NoteProjection> findByUserIdAndDocumentGroupIdAndNoteIds(
        String userId,
        String documentGroupId,
        List<String> noteIds
    ) {
        if (noteIds == null || noteIds.isEmpty()) {
            return List.of();
        }
        return repository.findByUserIdAndDocumentGroupIdAndNoteIdIn(
                userId,
                DocumentGroups.normalize(documentGroupId),
                noteIds
            ).stream()
            .map(NoteProjectionJpaEntity::toDomain)
            .toList();
    }

    @Override
    @Transactional(readOnly = true)
    public List<NoteProjection> findSearchableByUserIdAndDocumentGroupId(
        String userId,
        String documentGroupId,
        int limit
    ) {
        if (limit <= 0) {
            return List.of();
        }
        return repository.findSearchable(
                userId,
                DocumentGroups.normalize(documentGroupId),
                NoteSearchIndexStatus.INDEXED,
                PageRequest.of(0, limit)
            ).stream()
            .map(NoteProjectionJpaEntity::toDomain)
            .toList();
    }

    private List<NoteProjection> findGraphAiSources(String userId, String documentGroupId, int limit) {
        if (limit <= 0) {
            return List.of();
        }
        return repository.findGraphAiSources(
                userId,
                DocumentGroups.normalize(documentGroupId),
                NoteSearchIndexStatus.REMOVED,
                PageRequest.of(0, limit)
            ).stream()
            .map(NoteProjectionJpaEntity::toDomain)
            .toList();
    }

    @Override
    @Transactional(readOnly = true)
    public List<NoteProjection> findIndexRetryCandidates(Instant now, int limit) {
        if (limit <= 0) {
            return List.of();
        }
        Instant cutoff = now == null ? Instant.now() : now;
        return repository.findRetryCandidates(
                Set.of(
                    NoteSearchIndexStatus.NOT_INDEXED,
                    NoteSearchIndexStatus.PROVISIONAL,
                    NoteSearchIndexStatus.STALE,
                    NoteSearchIndexStatus.FAILED
                ),
                cutoff,
                PageRequest.of(0, limit)
            ).stream()
            .map(NoteProjectionJpaEntity::toDomain)
            .toList();
    }

    @Override
    @Transactional(readOnly = true)
    public List<AutoLinkNoteSource> findSearchableNoteSources(String userId, String documentGroupId, int limit) {
        return findSearchableByUserIdAndDocumentGroupId(userId, documentGroupId, limit).stream()
            .map(NoteProjectionJpaAdapter::toAutoLinkNoteSource)
            .toList();
    }

    @Override
    @Transactional(readOnly = true)
    public List<AutoLinkNoteSource> findGraphAiNoteSources(String userId, String documentGroupId, int limit) {
        return findGraphAiSources(userId, documentGroupId, limit).stream()
            .map(NoteProjectionJpaAdapter::toAutoLinkNoteSource)
            .toList();
    }

    @Override
    @Transactional(readOnly = true)
    public Optional<AutoLinkNoteSource> findSearchableNoteSource(String userId, String documentGroupId, String noteId) {
        return findByUserIdAndDocumentGroupIdAndNoteId(userId, documentGroupId, noteId)
            .filter(NoteProjectionJpaAdapter::canCreateLinkSuggestions)
            .map(NoteProjectionJpaAdapter::toAutoLinkNoteSource);
    }

    @Override
    @Transactional(readOnly = true)
    public Optional<AutoLinkNoteSource> findGraphAiNoteSource(String userId, String documentGroupId, String noteId) {
        return findByUserIdAndDocumentGroupIdAndNoteId(userId, documentGroupId, noteId)
            .filter(NoteProjectionJpaAdapter::canUseGraphAiSource)
            .map(NoteProjectionJpaAdapter::toAutoLinkNoteSource);
    }

    @Override
    @Transactional(readOnly = true)
    public List<NoteIndexStatusProjection> findNoteIndexStatuses(
        String userId,
        String documentGroupId,
        List<String> noteIds
    ) {
        return findByUserIdAndDocumentGroupIdAndNoteIds(userId, documentGroupId, noteIds).stream()
            .map(projection -> new NoteIndexStatusProjection(
                projection.noteId(),
                projection.searchIndexStatus().name(),
                canUseGraphAiSource(projection),
                projection.indexedAt()
            ))
            .toList();
    }

    @Override
    @Transactional(readOnly = true)
    public List<SemanticSearchResult> searchKeyword(KeywordSearchQuery query) {
        List<String> terms = keywordTerms(query.queryText());
        if (terms.isEmpty() || query.limit() <= 0) {
            return List.of();
        }
        int candidateLimit = keywordCandidateLimit(query.limit());
        Map<String, NoteProjection> candidatesByNoteId = new LinkedHashMap<>();
        for (String term : terms) {
            repository.findKeywordSearchable(
                    query.userId(),
                    query.documentGroupId(),
                    NoteSearchIndexStatus.INDEXED.name(),
                    "%" + term + "%",
                    PageRequest.of(0, candidateLimit)
                ).stream()
                .map(NoteProjectionJpaEntity::toDomain)
                .forEach(projection -> candidatesByNoteId.putIfAbsent(projection.noteId(), projection));
        }

        return candidatesByNoteId.values().stream()
            .map(projection -> toKeywordSearchResult(projection, terms))
            .filter(Objects::nonNull)
            .sorted(Comparator
                .comparingDouble(SemanticSearchResult::score)
                .reversed()
                .thenComparing(SemanticSearchResult::noteId))
            .limit(query.limit())
            .toList();
    }

    @Override
    @Transactional(readOnly = true)
    public Optional<ConnectionNoteSource> findLinkSuggestionSourceNote(
        String userId,
        String documentGroupId,
        String noteId
    ) {
        return findByUserIdAndDocumentGroupIdAndNoteId(userId, documentGroupId, noteId)
            .filter(NoteProjectionJpaAdapter::canUseGraphAiSource)
            .map(projection -> new ConnectionNoteSource(
                projection.userId(),
                projection.documentGroupId(),
                projection.noteId(),
                projection.title()
            ));
    }

    @Override
    @Transactional(readOnly = true)
    public Optional<AgentNoteSource> findSearchableAgentNoteSource(
        String userId,
        String documentGroupId,
        String noteId
    ) {
        return findByUserIdAndDocumentGroupIdAndNoteId(userId, documentGroupId, noteId)
            .filter(NoteProjection::searchable)
            .map(projection -> new AgentNoteSource(projection.noteId(), projection.title()));
    }

    @Override
    @Transactional(readOnly = true)
    public List<ConnectionBridgeSourceNote> findBridgeSourceNotes(
        String userId,
        String documentGroupId,
        List<String> noteIds
    ) {
        if (noteIds == null || noteIds.isEmpty()) {
            return List.of();
        }
        Map<String, NoteProjection> projectionsById = findByUserIdAndDocumentGroupIdAndNoteIds(
                userId,
                documentGroupId,
                noteIds
            ).stream()
            .filter(NoteProjection::searchable)
            .collect(Collectors.toMap(
                NoteProjection::noteId,
                Function.identity(),
                (left, right) -> left
            ));
        return noteIds.stream()
            .distinct()
            .map(projectionsById::get)
            .filter(projection -> projection != null)
            .map(projection -> new ConnectionBridgeSourceNote(
                projection.userId(),
                projection.documentGroupId(),
                projection.noteId(),
                projection.title(),
                projection.tags()
            ))
            .toList();
    }

    @Override
    @Transactional(readOnly = true)
    public List<KnowledgeAnalysisNote> findAnalysisNotes(String userId, String documentGroupId, int limit) {
        return findSearchableByUserIdAndDocumentGroupId(userId, documentGroupId, limit).stream()
            .filter(NoteProjectionJpaAdapter::canAnalyze)
            .map(NoteProjectionJpaAdapter::toAnalysisNote)
            .toList();
    }

    @Override
    @Transactional(readOnly = true)
    public List<KnowledgeAnalysisNote> findAnalysisNotesByIds(
        String userId,
        String documentGroupId,
        List<String> noteIds
    ) {
        if (noteIds == null || noteIds.isEmpty()) {
            return List.of();
        }
        Map<String, NoteProjection> projectionsById = findByUserIdAndDocumentGroupIdAndNoteIds(
                userId,
                documentGroupId,
                noteIds
            ).stream()
            .filter(NoteProjectionJpaAdapter::canAnalyze)
            .collect(Collectors.toMap(
                NoteProjection::noteId,
                Function.identity(),
                (left, right) -> left
            ));
        return noteIds.stream()
            .distinct()
            .map(projectionsById::get)
            .filter(Objects::nonNull)
            .map(NoteProjectionJpaAdapter::toAnalysisNote)
            .toList();
    }

    @Override
    @Transactional(readOnly = true)
    public List<KnowledgeAnalysisNote> findClusteringSourceNotes(String userId, String documentGroupId, int limit) {
        return findGraphAiSources(userId, documentGroupId, limit).stream()
            .map(NoteProjectionJpaAdapter::toAnalysisNote)
            .toList();
    }

    @Override
    @Transactional(readOnly = true)
    public List<KnowledgeAnalysisNote> findClusteringSourceNotesByIds(
        String userId,
        String documentGroupId,
        List<String> noteIds
    ) {
        if (noteIds == null || noteIds.isEmpty()) {
            return List.of();
        }
        Map<String, NoteProjection> projectionsById = findByUserIdAndDocumentGroupIdAndNoteIds(
                userId,
                documentGroupId,
                noteIds
            ).stream()
            .filter(NoteProjectionJpaAdapter::canUseGraphAiSource)
            .collect(Collectors.toMap(
                NoteProjection::noteId,
                Function.identity(),
                (left, right) -> left
            ));
        return noteIds.stream()
            .distinct()
            .map(projectionsById::get)
            .filter(Objects::nonNull)
            .map(NoteProjectionJpaAdapter::toAnalysisNote)
            .toList();
    }

    @Override
    @Transactional(readOnly = true)
    public List<OrganizationNoteSource> findOrganizationSourceNotes(String userId, String documentGroupId, int limit) {
        return findSearchableByUserIdAndDocumentGroupId(userId, documentGroupId, limit).stream()
            .filter(NoteProjectionJpaAdapter::canAnalyze)
            .map(NoteProjectionJpaAdapter::toOrganizationNoteSource)
            .toList();
    }

    @Override
    @Transactional(readOnly = true)
    public List<OrganizationNoteSource> findOrganizationSourceNotesByFolder(
        String userId,
        String documentGroupId,
        String folderId,
        int limit
    ) {
        if (limit <= 0) {
            return List.of();
        }
        return repository.findSearchableByFolder(
                userId,
                DocumentGroups.normalize(documentGroupId),
                folderId,
                NoteSearchIndexStatus.INDEXED,
                PageRequest.of(0, limit)
            ).stream()
            .map(NoteProjectionJpaEntity::toDomain)
            .filter(NoteProjectionJpaAdapter::canAnalyze)
            .map(NoteProjectionJpaAdapter::toOrganizationNoteSource)
            .toList();
    }

    @Override
    @Transactional
    public NoteProjection save(NoteProjection projection) {
        NoteProjectionJpaEntity entity = NoteProjectionJpaEntity.fromDomain(projection);
        repository.findByUserIdAndDocumentGroupIdAndNoteId(
                projection.userId(),
                projection.documentGroupId(),
                projection.noteId()
            )
            .map(NoteProjectionJpaEntity::projectionId)
            .ifPresent(entity::setProjectionId);
        return repository.save(entity).toDomain();
    }

    private static boolean canCreateLinkSuggestions(NoteProjection projection) {
        return projection.searchable()
            && !projection.contentPending()
            && projection.markdown() != null
            && projection.searchIndexStatus() == NoteSearchIndexStatus.INDEXED;
    }

    private static boolean canUseGraphAiSource(NoteProjection projection) {
        return projection.searchable()
            && !projection.contentPending()
            && projection.markdown() != null
            && projection.searchIndexStatus() != NoteSearchIndexStatus.REMOVED;
    }

    private static boolean canAnalyze(NoteProjection projection) {
        return canCreateLinkSuggestions(projection);
    }

    private static AutoLinkNoteSource toAutoLinkNoteSource(NoteProjection projection) {
        return new AutoLinkNoteSource(
            projection.userId(),
            projection.documentGroupId(),
            projection.noteId(),
            projection.title(),
            projection.tags(),
            projection.markdownHash(),
            projection.markdown(),
            projection.updatedAt()
        );
    }

    private static KnowledgeAnalysisNote toAnalysisNote(NoteProjection projection) {
        String markdown = projection.markdown();
        return new KnowledgeAnalysisNote(
            projection.userId(),
            projection.documentGroupId(),
            projection.noteId(),
            projection.title(),
            projection.tags(),
            headings(markdown),
            excerpt(markdown),
            projection.updatedAt()
        );
    }

    private static OrganizationNoteSource toOrganizationNoteSource(NoteProjection projection) {
        String markdown = projection.markdown();
        return new OrganizationNoteSource(
            projection.userId(),
            projection.documentGroupId(),
            projection.noteId(),
            projection.folderId(),
            projection.title(),
            projection.tags(),
            headings(markdown),
            excerpt(markdown),
            projection.updatedAt()
        );
    }

    private static List<String> headings(String markdown) {
        if (markdown == null || markdown.isBlank()) {
            return List.of();
        }
        return markdown.lines()
            .map(String::trim)
            .filter(line -> line.startsWith("#"))
            .map(line -> line.replaceFirst("^#+\\s*", "").trim())
            .filter(line -> !line.isBlank())
            .distinct()
            .limit(8)
            .toList();
    }

    private static String excerpt(String markdown) {
        if (markdown == null || markdown.isBlank()) {
            return "";
        }
        String normalized = markdown
            .replaceAll("(?s)```.*?```", " ")
            .replaceAll("[#>`*_\\[\\]()]", " ")
            .replaceAll("\\s+", " ")
            .trim();
        if (normalized.length() <= 700) {
            return normalized;
        }
        return normalized.substring(0, 700).trim();
    }

    private static List<String> keywordTerms(String queryText) {
        if (queryText == null || queryText.isBlank()) {
            return List.of();
        }
        return java.util.Arrays.stream(queryText.toLowerCase(Locale.ROOT)
                .split("[^\\p{IsAlphabetic}\\p{IsDigit}]+"))
            .map(String::trim)
            .filter(term -> !term.isBlank())
            .distinct()
            .limit(8)
            .toList();
    }

    private static int keywordCandidateLimit(int limit) {
        return Math.min(
            KEYWORD_CANDIDATE_MAX_LIMIT,
            Math.max(KEYWORD_CANDIDATE_MIN_LIMIT, limit * KEYWORD_CANDIDATE_OVERFETCH_FACTOR)
        );
    }

    private static SemanticSearchResult toKeywordSearchResult(NoteProjection projection, List<String> terms) {
        String title = lowercase(projection.title());
        String markdown = lowercase(projection.markdown());
        String tags = lowercase(String.join(" ", projection.tags() == null ? List.of() : projection.tags()));
        double score = 0.0d;
        int matchedTerms = 0;
        for (String term : terms) {
            boolean matched = false;
            if (title.contains(term)) {
                score += 0.45d;
                matched = true;
            }
            if (tags.contains(term)) {
                score += 0.35d;
                matched = true;
            }
            if (markdown.contains(term)) {
                score += 0.20d;
                matched = true;
            }
            if (matched) {
                matchedTerms++;
            }
        }
        if (matchedTerms == 0) {
            return null;
        }
        double normalizedScore = Math.min(1.0d, score / Math.max(1, terms.size()));
        return new SemanticSearchResult(
            projection.noteId(),
            projection.title(),
            keywordExcerpt(projection.markdown(), terms),
            normalizedScore,
            SearchMatchType.KEYWORD
        );
    }

    private static String keywordExcerpt(String markdown, List<String> terms) {
        String fallback = excerpt(markdown);
        if (markdown == null || markdown.isBlank()) {
            return fallback;
        }
        String lowerMarkdown = markdown.toLowerCase(Locale.ROOT);
        int index = -1;
        for (String term : terms) {
            index = lowerMarkdown.indexOf(term);
            if (index >= 0) {
                break;
            }
        }
        if (index < 0) {
            return fallback;
        }
        int start = Math.max(0, index - 160);
        int end = Math.min(markdown.length(), index + 360);
        return excerpt(markdown.substring(start, end));
    }

    private static String lowercase(String value) {
        return value == null ? "" : value.toLowerCase(Locale.ROOT);
    }
}
