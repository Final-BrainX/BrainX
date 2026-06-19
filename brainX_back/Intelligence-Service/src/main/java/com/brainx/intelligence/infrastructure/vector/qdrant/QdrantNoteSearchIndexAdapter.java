package com.brainx.intelligence.infrastructure.vector.qdrant;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

import org.springframework.ai.document.Document;
import org.springframework.ai.vectorstore.SearchRequest;
import org.springframework.ai.vectorstore.VectorStore;
import org.springframework.boot.autoconfigure.condition.ConditionalOnBean;
import org.springframework.context.annotation.Primary;
import org.springframework.stereotype.Component;

import com.brainx.intelligence.exploration.application.port.outbound.NoteSearchIndexPort;
import com.brainx.intelligence.exploration.domain.NoteSearchDocument;
import com.brainx.intelligence.exploration.domain.SearchMatchType;
import com.brainx.intelligence.exploration.domain.SemanticSearchResult;

@Component
@Primary
@ConditionalOnBean(VectorStore.class)
public class QdrantNoteSearchIndexAdapter implements NoteSearchIndexPort {

    private static final String USER_ID = "userId";
    private static final String NOTE_ID = "noteId";
    private static final String TITLE = "title";
    private static final String EXCERPT = "excerpt";
    private static final String KEYWORD_IDS = "keywordIds";

    private final VectorStore vectorStore;

    public QdrantNoteSearchIndexAdapter(VectorStore vectorStore) {
        this.vectorStore = vectorStore;
    }

    @Override
    public List<SemanticSearchResult> search(NoteSearchQuery query) {
        SearchRequest searchRequest = SearchRequest.builder()
            .query(query.queryText())
            .topK(query.limit())
            .similarityThresholdAll()
            .filterExpression(USER_ID + " == '" + escapeFilterValue(query.userId()) + "'")
            .build();

        return vectorStore.similaritySearch(searchRequest).stream()
            .map(document -> toSearchResult(document, query.hybridWithClientKeywordIds()))
            .toList();
    }

    @Override
    public NoteSearchDocument save(NoteSearchDocument document) {
        vectorStore.add(List.of(toVectorDocument(document)));
        return document;
    }

    static Document toVectorDocument(NoteSearchDocument document) {
        Map<String, Object> metadata = new LinkedHashMap<>();
        metadata.put(USER_ID, document.userId());
        metadata.put(NOTE_ID, document.noteId());
        metadata.put(TITLE, document.title());
        metadata.put(EXCERPT, document.excerpt());
        metadata.put(KEYWORD_IDS, document.keywordIds());

        return Document.builder()
            .id(document.userId() + "::" + document.noteId())
            .text(content(document))
            .metadata(metadata)
            .build();
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

    private static String content(NoteSearchDocument document) {
        if (!document.excerpt().isBlank()) {
            return document.excerpt();
        }
        return document.title();
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
