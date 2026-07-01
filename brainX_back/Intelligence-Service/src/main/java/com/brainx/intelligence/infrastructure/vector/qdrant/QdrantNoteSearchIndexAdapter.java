package com.brainx.intelligence.infrastructure.vector.qdrant;

import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

import org.springframework.beans.factory.ObjectProvider;
import org.springframework.context.annotation.Primary;
import org.springframework.stereotype.Component;

import com.brainx.intelligence.exploration.application.port.outbound.NoteChunkRetrievalPort;
import com.brainx.intelligence.exploration.application.port.outbound.NoteChunkRetrievalPort.NoteChunkSearchQuery;
import com.brainx.intelligence.exploration.application.port.outbound.NoteSearchIndexPort;
import com.brainx.intelligence.exploration.application.port.outbound.NoteSearchIndexPort.NoteChunkDelta;
import com.brainx.intelligence.exploration.domain.NoteChunkSearchResult;
import com.brainx.intelligence.exploration.domain.NoteSearchDocument;
import com.brainx.intelligence.exploration.domain.SearchMatchType;
import com.brainx.intelligence.exploration.domain.SearchScope;
import com.brainx.intelligence.exploration.domain.SemanticSearchResult;
import com.brainx.intelligence.infrastructure.vector.qdrant.QdrantVectorIndexClient.QdrantVectorPoint;
import com.brainx.intelligence.infrastructure.vector.qdrant.QdrantVectorIndexClient.QdrantVectorSearchHit;
import com.brainx.intelligence.shared.application.port.outbound.AiEmbeddingPort;
import com.brainx.intelligence.shared.application.port.outbound.AiEmbeddingPort.AiEmbeddingRequest;
import com.brainx.intelligence.shared.application.port.outbound.AiEmbeddingPort.AiEmbeddingResponse;
import com.brainx.intelligence.shared.application.port.outbound.AiEmbeddingPort.InputType;
import com.brainx.intelligence.shared.application.service.AiUsageRecorder;
import com.brainx.intelligence.shared.domain.DocumentGroups;

@Component
@Primary
public class QdrantNoteSearchIndexAdapter implements NoteSearchIndexPort, NoteChunkRetrievalPort {

    private static final String USER_ID = "userId";
    private static final String DOCUMENT_GROUP_ID = "documentGroupId";
    private static final String NOTE_ID = "noteId";
    private static final String CHUNK_ID = "chunkId";
    private static final String CHUNK_INDEX = "chunkIndex";
    private static final String TITLE = "title";
    private static final String EXCERPT = "excerpt";
    private static final String KEYWORD_IDS = "keywordIds";
    private static final String MARKDOWN_HASH = "markdownHash";
    private static final String VERSION = "version";
    private static final String DOC_CONTENT = "doc_content";
    private static final String SOURCE_PATH = "sourcePath";
    private static final String SOURCE_FILENAME = "sourceFilename";
    private static final String INDEX_EMBEDDING_FEATURE_ID = "note-search-index-embedding";
    private static final String QUERY_EMBEDDING_FEATURE_ID = "note-search-query-embedding";
    private static final int MIN_SEARCH_TOP_K = 10;
    private static final int SEARCH_OVERFETCH_FACTOR = 4;
    private static final int MAX_SEARCH_TOP_K = 80;

    private final ObjectProvider<QdrantVectorIndexClient> vectorIndexClientProvider;
    private final ObjectProvider<AiEmbeddingPort> aiEmbeddingPortProvider;
    private final AiUsageRecorder aiUsageRecorder;

    public QdrantNoteSearchIndexAdapter(
        ObjectProvider<QdrantVectorIndexClient> vectorIndexClientProvider,
        ObjectProvider<AiEmbeddingPort> aiEmbeddingPortProvider,
        AiUsageRecorder aiUsageRecorder
    ) {
        this.vectorIndexClientProvider = vectorIndexClientProvider;
        this.aiEmbeddingPortProvider = aiEmbeddingPortProvider;
        this.aiUsageRecorder = aiUsageRecorder;
    }

    @Override
    public List<SemanticSearchResult> search(NoteSearchQuery query) {
        QdrantVectorIndexClient vectorIndexClient = vectorIndexClientProvider.getIfAvailable();
        AiEmbeddingPort aiEmbeddingPort = aiEmbeddingPortProvider.getIfAvailable();
        if (vectorIndexClient == null || aiEmbeddingPort == null) {
            return List.of();
        }
        AiEmbeddingResponse embedding = aiEmbeddingPort.embed(new AiEmbeddingRequest(
            null,
            List.of(query.queryText()),
            InputType.QUERY
        ));
        recordEmbeddingUsage(query.userId(), QUERY_EMBEDDING_FEATURE_ID, embedding);
        List<Double> queryVector = firstVector(embedding);
        if (queryVector.isEmpty()) {
            return List.of();
        }

        Map<String, SemanticSearchResult> bestByNoteId = new LinkedHashMap<>();
        for (QdrantVectorSearchHit hit : vectorIndexClient.search(
            query.userId(),
            query.scope() == SearchScope.USER ? null : query.documentGroupId(),
            queryVector,
            searchTopK(query.limit())
        )) {
            SemanticSearchResult result = toSearchResult(hit, query.hybridWithClientKeywordIds());
            SemanticSearchResult existing = bestByNoteId.get(result.noteId());
            if (existing == null || result.score() > existing.score()) {
                bestByNoteId.put(result.noteId(), result);
            }
        }
        return bestByNoteId.values().stream()
            .sorted(Comparator.comparingDouble(SemanticSearchResult::score).reversed())
            .limit(query.limit())
            .toList();
    }

    @Override
    public List<NoteChunkSearchResult> searchChunks(NoteChunkSearchQuery query) {
        QdrantVectorIndexClient vectorIndexClient = vectorIndexClientProvider.getIfAvailable();
        AiEmbeddingPort aiEmbeddingPort = aiEmbeddingPortProvider.getIfAvailable();
        if (vectorIndexClient == null || aiEmbeddingPort == null) {
            return List.of();
        }
        AiEmbeddingResponse embedding = aiEmbeddingPort.embed(new AiEmbeddingRequest(
            null,
            List.of(query.queryText()),
            InputType.QUERY
        ));
        recordEmbeddingUsage(query.userId(), QUERY_EMBEDDING_FEATURE_ID, embedding);
        List<Double> queryVector = firstVector(embedding);
        if (queryVector.isEmpty()) {
            return List.of();
        }

        String documentGroupId = query.scope() == SearchScope.USER ? null : query.documentGroupId();
        return vectorIndexClient.search(query.userId(), documentGroupId, queryVector, query.topK()).stream()
            .map(QdrantNoteSearchIndexAdapter::toChunkSearchResult)
            .sorted(Comparator.comparingDouble(NoteChunkSearchResult::score).reversed())
            .limit(query.topK())
            .toList();
    }

    @Override
    public NoteSearchDocument save(NoteSearchDocument document) {
        QdrantVectorIndexClient vectorIndexClient = vectorIndexClientProvider.getIfAvailable();
        AiEmbeddingPort aiEmbeddingPort = aiEmbeddingPortProvider.getIfAvailable();
        if (vectorIndexClient != null && aiEmbeddingPort != null) {
            AiEmbeddingResponse embedding = aiEmbeddingPort.embed(new AiEmbeddingRequest(
                null,
                List.of(document.chunkText()),
                InputType.DOCUMENT
            ));
            recordEmbeddingUsage(document.userId(), INDEX_EMBEDDING_FEATURE_ID, embedding);
            List<Double> vector = firstVector(embedding);
            if (!vector.isEmpty()) {
                vectorIndexClient.upsert(List.of(toVectorPoint(document, vector)));
            }
        }
        return document;
    }

    @Override
    public boolean replaceNoteChunks(String userId, String documentGroupId, String noteId, List<NoteSearchDocument> chunks) {
        QdrantVectorIndexClient vectorIndexClient = vectorIndexClientProvider.getIfAvailable();
        if (vectorIndexClient == null) {
            return false;
        }
        String normalizedDocumentGroupId = DocumentGroups.normalize(documentGroupId);
        List<NoteSearchDocument> safeChunks = chunks == null ? List.of() : chunks;
        AiEmbeddingPort aiEmbeddingPort = aiEmbeddingPortProvider.getIfAvailable();
        if (!safeChunks.isEmpty() && aiEmbeddingPort == null) {
            return false;
        }
        if (safeChunks.stream().anyMatch(chunk -> !normalizedDocumentGroupId.equals(chunk.documentGroupId()))) {
            throw new IllegalArgumentException("chunk documentGroupId must match replace documentGroupId.");
        }

        vectorIndexClient.deleteByUserIdAndDocumentGroupIdAndNoteId(userId, normalizedDocumentGroupId, noteId);
        if (safeChunks.isEmpty()) {
            return true;
        }

        AiEmbeddingResponse embedding = aiEmbeddingPort.embed(new AiEmbeddingRequest(
            null,
            safeChunks.stream().map(NoteSearchDocument::chunkText).toList(),
            InputType.DOCUMENT
        ));
        recordEmbeddingUsage(userId, INDEX_EMBEDDING_FEATURE_ID, embedding);
        List<QdrantVectorPoint> points = toVectorPoints(safeChunks, embedding);
        if (points.isEmpty()) {
            return false;
        }
        vectorIndexClient.upsert(points);
        return true;
    }

    @Override
    public boolean applyNoteChunkDelta(String userId, String documentGroupId, String noteId, NoteChunkDelta delta) {
        QdrantVectorIndexClient vectorIndexClient = vectorIndexClientProvider.getIfAvailable();
        if (vectorIndexClient == null) {
            return false;
        }
        if (delta == null || delta.empty()) {
            return true;
        }
        String normalizedDocumentGroupId = DocumentGroups.normalize(documentGroupId);
        ensureDeltaChunksMatchScope(userId, normalizedDocumentGroupId, noteId, delta);
        AiEmbeddingPort aiEmbeddingPort = aiEmbeddingPortProvider.getIfAvailable();
        if (!delta.upsertChunks().isEmpty() && aiEmbeddingPort == null) {
            return false;
        }

        if (!delta.deleteChunkIds().isEmpty()) {
            vectorIndexClient.deleteByPointIds(delta.deleteChunkIds().stream()
                .map(chunkId -> documentId(userId, normalizedDocumentGroupId, chunkId))
                .toList());
        }
        if (!delta.upsertChunks().isEmpty()) {
            AiEmbeddingResponse embedding = aiEmbeddingPort.embed(new AiEmbeddingRequest(
                null,
                delta.upsertChunks().stream().map(NoteSearchDocument::chunkText).toList(),
                InputType.DOCUMENT
            ));
            recordEmbeddingUsage(userId, INDEX_EMBEDDING_FEATURE_ID, embedding);
            List<QdrantVectorPoint> points = toVectorPoints(delta.upsertChunks(), embedding);
            if (points.isEmpty()) {
                return false;
            }
            vectorIndexClient.upsert(points);
        }
        for (NoteSearchDocument chunk : delta.payloadOnlyChunks()) {
            vectorIndexClient.overwritePayload(
                documentId(chunk.userId(), chunk.documentGroupId(), chunk.chunkId()),
                toPayload(chunk)
            );
        }
        return true;
    }

    @Override
    public boolean deleteByUserIdAndDocumentGroupIdAndNoteId(String userId, String documentGroupId, String noteId) {
        QdrantVectorIndexClient vectorIndexClient = vectorIndexClientProvider.getIfAvailable();
        if (vectorIndexClient == null) {
            return false;
        }
        vectorIndexClient.deleteByUserIdAndDocumentGroupIdAndNoteId(
            userId,
            DocumentGroups.normalize(documentGroupId),
            noteId
        );
        return true;
    }

    private void recordEmbeddingUsage(String userId, String featureId, AiEmbeddingResponse embedding) {
        aiUsageRecorder.recordEmbeddingUsage(userId, featureId, null, embedding);
    }

    private static List<QdrantVectorPoint> toVectorPoints(
        List<NoteSearchDocument> chunks,
        AiEmbeddingResponse embedding
    ) {
        if (embedding == null || embedding.vectors() == null || chunks.size() != embedding.vectors().size()) {
            return List.of();
        }
        List<QdrantVectorPoint> points = new ArrayList<>(chunks.size());
        for (int index = 0; index < chunks.size(); index++) {
            points.add(toVectorPoint(chunks.get(index), embedding.vectors().get(index).values()));
        }
        return points;
    }

    private static QdrantVectorPoint toVectorPoint(NoteSearchDocument document, List<Double> vector) {
        return new QdrantVectorPoint(
            documentId(document.userId(), document.documentGroupId(), document.chunkId()),
            vector,
            toPayload(document)
        );
    }

    private static Map<String, Object> toPayload(NoteSearchDocument document) {
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put(USER_ID, document.userId());
        payload.put(DOCUMENT_GROUP_ID, document.documentGroupId());
        payload.put(NOTE_ID, document.noteId());
        payload.put(CHUNK_ID, document.chunkId());
        payload.put(CHUNK_INDEX, document.chunkIndex());
        payload.put(TITLE, document.title());
        payload.put(EXCERPT, document.excerpt());
        payload.put(DOC_CONTENT, document.chunkText());
        payload.put(KEYWORD_IDS, document.keywordIds());
        putIfNotNull(payload, MARKDOWN_HASH, document.markdownHash());
        putIfNotNull(payload, VERSION, document.version());
        putIfNotNull(payload, SOURCE_PATH, document.sourcePath());
        putIfNotNull(payload, SOURCE_FILENAME, document.sourceFilename());
        return payload;
    }

    private static List<Double> firstVector(AiEmbeddingResponse embedding) {
        if (embedding == null || embedding.vectors() == null || embedding.vectors().isEmpty()) {
            return List.of();
        }
        List<Double> values = embedding.vectors().getFirst().values();
        return values == null ? List.of() : values;
    }

    private static UUID documentId(String userId, String documentGroupId, String chunkId) {
        return UUID.nameUUIDFromBytes((userId + "::" + documentGroupId + "::" + chunkId)
            .getBytes(StandardCharsets.UTF_8));
    }

    private static void ensureDeltaChunksMatchScope(
        String userId,
        String documentGroupId,
        String noteId,
        NoteChunkDelta delta
    ) {
        boolean mismatch = delta.upsertChunks().stream()
            .anyMatch(chunk -> !chunkMatchesScope(chunk, userId, documentGroupId, noteId))
            || delta.payloadOnlyChunks().stream()
                .anyMatch(chunk -> !chunkMatchesScope(chunk, userId, documentGroupId, noteId));
        if (mismatch) {
            throw new IllegalArgumentException("chunk scope must match delta scope.");
        }
    }

    private static boolean chunkMatchesScope(
        NoteSearchDocument chunk,
        String userId,
        String documentGroupId,
        String noteId
    ) {
        return userId.equals(chunk.userId())
            && documentGroupId.equals(chunk.documentGroupId())
            && noteId.equals(chunk.noteId());
    }

    private static int searchTopK(int limit) {
        return Math.min(MAX_SEARCH_TOP_K, Math.max(MIN_SEARCH_TOP_K, limit * SEARCH_OVERFETCH_FACTOR));
    }

    private static void putIfNotNull(Map<String, Object> metadata, String key, Object value) {
        if (value != null) {
            metadata.put(key, value);
        }
    }

    private static SemanticSearchResult toSearchResult(QdrantVectorSearchHit hit, List<String> requestedKeywordIds) {
        Map<String, Object> payload = hit.payload();
        boolean keywordMatched = intersects(stringList(payload.get(KEYWORD_IDS)), requestedKeywordIds);
        return new SemanticSearchResult(
            stringValue(payload.get(NOTE_ID), hit.id()),
            stringValue(payload.get(TITLE), ""),
            stringValue(payload.get(EXCERPT), stringValue(payload.get(DOC_CONTENT), "")),
            hit.score(),
            keywordMatched ? SearchMatchType.HYBRID : SearchMatchType.SEMANTIC
        );
    }

    private static NoteChunkSearchResult toChunkSearchResult(QdrantVectorSearchHit hit) {
        Map<String, Object> payload = hit.payload();
        String noteId = stringValue(payload.get(NOTE_ID), hit.id());
        int chunkIndex = integerValue(payload.get(CHUNK_INDEX), 0);
        return new NoteChunkSearchResult(
            stringValue(payload.get(USER_ID), ""),
            stringValue(payload.get(DOCUMENT_GROUP_ID), ""),
            noteId,
            stringValue(payload.get(CHUNK_ID), noteId + "::" + chunkIndex),
            chunkIndex,
            stringValue(payload.get(TITLE), ""),
            stringValue(payload.get(DOC_CONTENT), stringValue(payload.get(EXCERPT), "")),
            hit.score(),
            nullableString(payload.get(MARKDOWN_HASH)),
            nullableInteger(payload.get(VERSION)),
            nullableString(payload.get(SOURCE_PATH)),
            nullableString(payload.get(SOURCE_FILENAME))
        );
    }

    private static String stringValue(Object value, String fallback) {
        if (value == null) {
            return fallback;
        }
        String text = value.toString();
        return text.isBlank() ? fallback : text;
    }

    private static List<String> stringList(Object value) {
        if (value instanceof Iterable<?> iterable) {
            List<String> values = new ArrayList<>();
            for (Object item : iterable) {
                if (item != null && !item.toString().isBlank()) {
                    values.add(item.toString());
                }
            }
            return values;
        }
        if (value instanceof String text && !text.isBlank()) {
            return List.of(text);
        }
        return List.of();
    }

    private static int integerValue(Object value, int fallback) {
        Integer integer = nullableInteger(value);
        return integer == null ? fallback : integer;
    }

    private static Integer nullableInteger(Object value) {
        if (value instanceof Number number) {
            return number.intValue();
        }
        if (value instanceof String text && !text.isBlank()) {
            try {
                return Integer.parseInt(text);
            } catch (NumberFormatException exception) {
                return null;
            }
        }
        return null;
    }

    private static String nullableString(Object value) {
        if (value == null) {
            return null;
        }
        String text = value.toString();
        return text.isBlank() ? null : text;
    }

    private static boolean intersects(List<String> left, List<String> right) {
        if (left == null || right == null || left.isEmpty() || right.isEmpty()) {
            return false;
        }
        Set<String> values = new HashSet<>(left);
        return right.stream().anyMatch(values::contains);
    }
}
