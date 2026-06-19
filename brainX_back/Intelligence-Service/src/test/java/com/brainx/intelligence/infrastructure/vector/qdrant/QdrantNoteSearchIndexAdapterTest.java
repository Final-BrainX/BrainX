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

import com.brainx.intelligence.exploration.application.port.outbound.NoteChunkRetrievalPort.NoteChunkSearchQuery;
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
            "note-1::2",
            2,
            "RAG note",
            "semantic search content",
            "full chunk text",
            List.of("keyword-1"),
            "hash-1",
            3
        ));

        assertThat(vectorStore.addedDocuments).hasSize(1);
        Document document = vectorStore.addedDocuments.getFirst();
        assertThat(document.getId()).isEqualTo("user-1::note-1::2");
        assertThat(document.getText()).isEqualTo("full chunk text");
        assertThat(document.getMetadata())
            .containsEntry("userId", "user-1")
            .containsEntry("noteId", "note-1")
            .containsEntry("chunkId", "note-1::2")
            .containsEntry("chunkIndex", 2)
            .containsEntry("title", "RAG note")
            .containsEntry("excerpt", "semantic search content")
            .containsEntry("keywordIds", List.of("keyword-1"))
            .containsEntry("markdownHash", "hash-1")
            .containsEntry("version", 3);
    }

    @Test
    void searchPassesQueryLimitAndUserFilterToVectorStore() {
        vectorStore.searchResults = List.of(Document.builder()
            .id("user-1::note-1::0")
            .text("semantic search content")
            .metadata(Map.of(
                "userId", "user-1",
                "noteId", "note-1",
                "chunkId", "note-1::0",
                "chunkIndex", 0,
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
        assertThat(vectorStore.lastSearchRequest.getTopK()).isEqualTo(12);
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
            .id("user-1::note-1::0")
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

    @Test
    void searchDeduplicatesChunksByNoteIdKeepingBestScore() {
        vectorStore.searchResults = List.of(
            Document.builder()
                .id("user-1::note-1::0")
                .text("low")
                .metadata(Map.of(
                    "noteId", "note-1",
                    "title", "RAG note",
                    "excerpt", "low",
                    "keywordIds", List.of()
                ))
                .score(0.5d)
                .build(),
            Document.builder()
                .id("user-1::note-1::1")
                .text("high")
                .metadata(Map.of(
                    "noteId", "note-1",
                    "title", "RAG note",
                    "excerpt", "high",
                    "keywordIds", List.of()
                ))
                .score(0.9d)
                .build()
        );

        var results = adapter.search(new NoteSearchQuery(
            "user-1",
            "semantic search",
            Map.of(),
            3,
            List.of()
        ));

        assertThat(results).hasSize(1);
        assertThat(results.getFirst().excerpt()).isEqualTo("high");
        assertThat(results.getFirst().score()).isEqualTo(0.9d);
    }

    @Test
    void searchChunksKeepsChunkLevelHitsWithoutDedupe() {
        vectorStore.searchResults = List.of(
            Document.builder()
                .id("user-1::note-1::0")
                .text("first chunk")
                .metadata(Map.of(
                    "userId", "user-1",
                    "noteId", "note-1",
                    "chunkId", "note-1::0",
                    "chunkIndex", 0,
                    "title", "RAG note",
                    "markdownHash", "hash-1",
                    "version", 1
                ))
                .score(0.5d)
                .build(),
            Document.builder()
                .id("user-1::note-1::1")
                .text("second chunk")
                .metadata(Map.of(
                    "userId", "user-1",
                    "noteId", "note-1",
                    "chunkId", "note-1::1",
                    "chunkIndex", 1,
                    "title", "RAG note",
                    "markdownHash", "hash-1",
                    "version", 1
                ))
                .score(0.9d)
                .build()
        );

        var results = adapter.searchChunks(new NoteChunkSearchQuery("user-1", "semantic search", 2));

        assertThat(vectorStore.lastSearchRequest.getQuery()).isEqualTo("semantic search");
        assertThat(vectorStore.lastSearchRequest.getTopK()).isEqualTo(2);
        assertThat(vectorStore.lastSearchRequest.getFilterExpression().toString()).contains("user-1");
        assertThat(results).hasSize(2);
        assertThat(results).extracting("chunkId").containsExactly("note-1::1", "note-1::0");
        assertThat(results.getFirst().text()).isEqualTo("second chunk");
    }

    @Test
    void replaceDeletesExistingNoteChunksThenAddsNewChunks() {
        adapter.replaceNoteChunks("user-1", "note-1", List.of(
            new NoteSearchDocument("user-1", "note-1", "note-1::0", 0, "RAG note", "chunk 0", "chunk 0", List.of(), "hash-1", 1),
            new NoteSearchDocument("user-1", "note-1", "note-1::1", 1, "RAG note", "chunk 1", "chunk 1", List.of(), "hash-1", 1)
        ));

        assertThat(vectorStore.deletedFilters).hasSize(1);
        assertThat(vectorStore.deletedFilters.getFirst()).contains("user-1").contains("note-1");
        assertThat(vectorStore.addedDocuments).hasSize(2);
        assertThat(vectorStore.addedDocuments).extracting(Document::getId)
            .containsExactly("user-1::note-1::0", "user-1::note-1::1");
    }

    @Test
    void deleteUsesUserAndNoteFilter() {
        adapter.deleteByUserIdAndNoteId("user-1", "note-1");

        assertThat(vectorStore.deletedFilters).hasSize(1);
        assertThat(vectorStore.deletedFilters.getFirst()).contains("user-1").contains("note-1");
    }

    private static final class FakeVectorStore implements VectorStore {

        private final List<Document> addedDocuments = new ArrayList<>();
        private final List<String> deletedIds = new ArrayList<>();
        private final List<String> deletedFilters = new ArrayList<>();
        private List<Document> searchResults = List.of();
        private SearchRequest lastSearchRequest;

        @Override
        public void add(List<Document> documents) {
            addedDocuments.addAll(documents);
        }

        @Override
        public void delete(List<String> ids) {
            deletedIds.addAll(ids);
        }

        @Override
        public void delete(Filter.Expression filterExpression) {
            deletedFilters.add(filterExpression.toString());
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
