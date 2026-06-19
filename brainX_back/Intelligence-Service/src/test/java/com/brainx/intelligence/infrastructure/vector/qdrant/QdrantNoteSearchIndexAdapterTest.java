package com.brainx.intelligence.infrastructure.vector.qdrant;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import org.junit.jupiter.api.Test;
import org.springframework.ai.document.Document;
import org.springframework.ai.vectorstore.SearchRequest;
import org.springframework.ai.vectorstore.VectorStore;
import org.springframework.ai.vectorstore.filter.Filter;

import com.brainx.intelligence.exploration.application.port.outbound.NoteSearchIndexPort.NoteSearchQuery;
import com.brainx.intelligence.exploration.domain.NoteSearchDocument;
import com.brainx.intelligence.exploration.domain.SearchMatchType;

class QdrantNoteSearchIndexAdapterTest {

    private final FakeVectorStore vectorStore = new FakeVectorStore();
    private final QdrantNoteSearchIndexAdapter adapter = new QdrantNoteSearchIndexAdapter(vectorStore);

    @Test
    void saveStoresDocumentContentAndMetadata() {
        adapter.save(new NoteSearchDocument(
            "user-1",
            "note-1",
            "RAG note",
            "semantic search content",
            List.of("keyword-1")
        ));

        assertThat(vectorStore.addedDocuments).hasSize(1);
        Document document = vectorStore.addedDocuments.getFirst();
        assertThat(document.getId()).isEqualTo("user-1::note-1");
        assertThat(document.getText()).isEqualTo("semantic search content");
        assertThat(document.getMetadata())
            .containsEntry("userId", "user-1")
            .containsEntry("noteId", "note-1")
            .containsEntry("title", "RAG note")
            .containsEntry("excerpt", "semantic search content")
            .containsEntry("keywordIds", List.of("keyword-1"));
    }

    @Test
    void searchPassesQueryLimitAndUserFilterToVectorStore() {
        vectorStore.searchResults = List.of(Document.builder()
            .id("user-1::note-1")
            .text("semantic search content")
            .metadata(Map.of(
                "userId", "user-1",
                "noteId", "note-1",
                "title", "RAG note",
                "excerpt", "semantic search content",
                "keywordIds", List.of("keyword-1")
            ))
            .score(0.87d)
            .build());

        var results = adapter.search(new NoteSearchQuery(
            "user-1",
            "semantic search",
            Map.of(),
            3,
            List.of("keyword-1")
        ));

        assertThat(vectorStore.lastSearchRequest).isNotNull();
        assertThat(vectorStore.lastSearchRequest.getQuery()).isEqualTo("semantic search");
        assertThat(vectorStore.lastSearchRequest.getTopK()).isEqualTo(3);
        assertThat(vectorStore.lastSearchRequest.hasFilterExpression()).isTrue();
        assertThat(vectorStore.lastSearchRequest.getFilterExpression().toString()).contains("user-1");
        assertThat(results).hasSize(1);
        assertThat(results.getFirst().noteId()).isEqualTo("note-1");
        assertThat(results.getFirst().score()).isEqualTo(0.87d);
        assertThat(results.getFirst().matchedType()).isEqualTo(SearchMatchType.HYBRID);
    }

    @Test
    void searchMapsSemanticResultWhenKeywordDoesNotMatch() {
        vectorStore.searchResults = List.of(Document.builder()
            .id("user-1::note-1")
            .text("semantic search content")
            .metadata(Map.of(
                "noteId", "note-1",
                "title", "RAG note",
                "excerpt", "semantic search content",
                "keywordIds", List.of("keyword-2")
            ))
            .score(0.71d)
            .build());

        var results = adapter.search(new NoteSearchQuery(
            "user-1",
            "semantic search",
            Map.of(),
            3,
            List.of("keyword-1")
        ));

        assertThat(results.getFirst().matchedType()).isEqualTo(SearchMatchType.SEMANTIC);
    }

    private static final class FakeVectorStore implements VectorStore {

        private final List<Document> addedDocuments = new ArrayList<>();
        private List<Document> searchResults = List.of();
        private SearchRequest lastSearchRequest;

        @Override
        public void add(List<Document> documents) {
            addedDocuments.addAll(documents);
        }

        @Override
        public void delete(List<String> ids) {
        }

        @Override
        public void delete(Filter.Expression filterExpression) {
        }

        @Override
        public List<Document> similaritySearch(SearchRequest request) {
            lastSearchRequest = request;
            return searchResults;
        }

        @Override
        public <T> Optional<T> getNativeClient() {
            return Optional.empty();
        }
    }
}
