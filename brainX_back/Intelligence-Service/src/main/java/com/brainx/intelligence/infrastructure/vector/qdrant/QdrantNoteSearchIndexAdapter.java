package com.brainx.intelligence.infrastructure.vector.qdrant;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

import org.springframework.ai.document.Document;
import org.springframework.ai.vectorstore.SearchRequest;
import org.springframework.ai.vectorstore.VectorStore;
import org.springframework.ai.vectorstore.filter.FilterExpressionTextParser;
import org.springframework.boot.autoconfigure.condition.ConditionalOnBean;
import org.springframework.context.annotation.Primary;
import org.springframework.stereotype.Component;

import com.brainx.intelligence.exploration.application.port.outbound.NoteChunkRetrievalPort;
import com.brainx.intelligence.exploration.application.port.outbound.NoteChunkRetrievalPort.NoteChunkSearchQuery;
import com.brainx.intelligence.exploration.application.port.outbound.NoteSearchIndexPort;
import com.brainx.intelligence.exploration.domain.NoteChunkSearchResult;
import com.brainx.intelligence.exploration.domain.NoteSearchDocument;
import com.brainx.intelligence.exploration.domain.SearchMatchType;
import com.brainx.intelligence.exploration.domain.SemanticSearchResult;

@Component
@Primary
@ConditionalOnBean(VectorStore.class)
public class QdrantNoteSearchIndexAdapter implements NoteSearchIndexPort, NoteChunkRetrievalPort {

    private static final String USER_ID = "userId";
    private static final String NOTE_ID = "noteId";
    private static final String CHUNK_ID = "chunkId";
    private static final String CHUNK_INDEX = "chunkIndex";
    private static final String TITLE = "title";
    private static final String EXCERPT = "excerpt";
    private static final String KEYWORD_IDS = "keywordIds";
    private static final String MARKDOWN_HASH = "markdownHash";
    private static final String VERSION = "version";
    private static final int MIN_SEARCH_TOP_K = 10;
    private static final int SEARCH_OVERFETCH_FACTOR = 4;
    private static final int MAX_SEARCH_TOP_K = 80;

    private final VectorStore vectorStore;
    private final FilterExpressionTextParser filterParser = new FilterExpressionTextParser();

    public QdrantNoteSearchIndexAdapter(VectorStore vectorStore) {
        this.vectorStore = vectorStore;
    }

    @Override
    public List<SemanticSearchResult> search(NoteSearchQuery query) {
        SearchRequest searchRequest = SearchRequest.builder()
            .query(query.queryText())
            .topK(searchTopK(query.limit()))
            .similarityThresholdAll()
            .filterExpression(USER_ID + " == '" + escapeFilterValue(query.userId()) + "'")
            .build();

        Map<String, SemanticSearchResult> bestByNoteId = new LinkedHashMap<>();
        for (Document document : vectorStore.similaritySearch(searchRequest)) {
            SemanticSearchResult result = toSearchResult(document, query.hybridWithClientKeywordIds());
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
        SearchRequest searchRequest = SearchRequest.builder()
            .query(query.queryText())
            .topK(query.topK())
            .similarityThresholdAll()
            .filterExpression(USER_ID + " == '" + escapeFilterValue(query.userId()) + "'")
            .build();

        return vectorStore.similaritySearch(searchRequest).stream()
            .map(QdrantNoteSearchIndexAdapter::toChunkSearchResult)
            .sorted(Comparator.comparingDouble(NoteChunkSearchResult::score).reversed())
            .limit(query.topK())
            .toList();
    }

    @Override
    public NoteSearchDocument save(NoteSearchDocument document) {
        vectorStore.add(List.of(toVectorDocument(document)));
        return document;
    }

    @Override
    public void replaceNoteChunks(String userId, String noteId, List<NoteSearchDocument> chunks) {
        deleteByUserIdAndNoteId(userId, noteId);
        if (chunks != null && !chunks.isEmpty()) {
            vectorStore.add(chunks.stream()
                .map(QdrantNoteSearchIndexAdapter::toVectorDocument)
                .toList());
        }
    }

    @Override
    public void deleteByUserIdAndNoteId(String userId, String noteId) {
        vectorStore.delete(filterParser.parse(
            USER_ID + " == '" + escapeFilterValue(userId) + "' && "
                + NOTE_ID + " == '" + escapeFilterValue(noteId) + "'"
        ));
    }

    static Document toVectorDocument(NoteSearchDocument document) {
        Map<String, Object> metadata = new LinkedHashMap<>();
        metadata.put(USER_ID, document.userId());
        metadata.put(NOTE_ID, document.noteId());
        metadata.put(CHUNK_ID, document.chunkId());
        metadata.put(CHUNK_INDEX, document.chunkIndex());
        metadata.put(TITLE, document.title());
        metadata.put(EXCERPT, document.excerpt());
        metadata.put(KEYWORD_IDS, document.keywordIds());
        putIfNotNull(metadata, MARKDOWN_HASH, document.markdownHash());
        putIfNotNull(metadata, VERSION, document.version());

        return Document.builder()
            .id(documentId(document.userId(), document.noteId(), document.chunkIndex()))
            .text(content(document))
            .metadata(metadata)
            .build();
    }

    private static String documentId(String userId, String noteId, int chunkIndex) {
        return userId + "::" + noteId + "::" + chunkIndex;
    }

    private static int searchTopK(int limit) {
        return Math.min(MAX_SEARCH_TOP_K, Math.max(MIN_SEARCH_TOP_K, limit * SEARCH_OVERFETCH_FACTOR));
    }

    private static void putIfNotNull(Map<String, Object> metadata, String key, Object value) {
        if (value != null) {
            metadata.put(key, value);
        }
    }

    private static SemanticSearchResult toSearchResult(Document document, List<String> requestedKeywordIds) {
        Map<String, Object> metadata = document.getMetadata();
        boolean keywordMatched = intersects(stringList(metadata.get(KEYWORD_IDS)), requestedKeywordIds);
        return new SemanticSearchResult(
            stringValue(metadata.get(NOTE_ID), document.getId()),
            stringValue(metadata.get(TITLE), ""),
            stringValue(metadata.get(EXCERPT), document.getText()),
            document.getScore() == null ? 0.0d : document.getScore(),
            keywordMatched ? SearchMatchType.HYBRID : SearchMatchType.SEMANTIC
        );
    }

    private static NoteChunkSearchResult toChunkSearchResult(Document document) {
        Map<String, Object> metadata = document.getMetadata();
        String noteId = stringValue(metadata.get(NOTE_ID), document.getId());
        int chunkIndex = integerValue(metadata.get(CHUNK_INDEX), 0);
        return new NoteChunkSearchResult(
            stringValue(metadata.get(USER_ID), ""),
            noteId,
            stringValue(metadata.get(CHUNK_ID), noteId + "::" + chunkIndex),
            chunkIndex,
            stringValue(metadata.get(TITLE), ""),
            stringValue(document.getText(), stringValue(metadata.get(EXCERPT), "")),
            document.getScore() == null ? 0.0d : document.getScore(),
            nullableString(metadata.get(MARKDOWN_HASH)),
            nullableInteger(metadata.get(VERSION))
        );
    }

    private static String content(NoteSearchDocument document) {
        return document.chunkText();
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

    private static String escapeFilterValue(String value) {
        return value.replace("\\", "\\\\").replace("'", "\\'");
    }
}
