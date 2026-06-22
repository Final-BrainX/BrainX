package com.brainx.intelligence.infrastructure.vector.qdrant;

import static org.assertj.core.api.Assertions.assertThat;

import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.support.DefaultListableBeanFactory;

import com.brainx.intelligence.exploration.application.port.outbound.NoteChunkRetrievalPort.NoteChunkSearchQuery;
import com.brainx.intelligence.exploration.application.port.outbound.NoteSearchIndexPort.NoteSearchQuery;
import com.brainx.intelligence.exploration.domain.NoteSearchDocument;
import com.brainx.intelligence.exploration.domain.SearchMatchType;
import com.brainx.intelligence.infrastructure.vector.qdrant.QdrantVectorIndexClient.QdrantVectorPoint;
import com.brainx.intelligence.infrastructure.vector.qdrant.QdrantVectorIndexClient.QdrantVectorSearchHit;
import com.brainx.intelligence.settings.application.port.outbound.AiModelCatalogPort;
import com.brainx.intelligence.settings.domain.AiModel;
import com.brainx.intelligence.settings.domain.VendorTokenCost;
import com.brainx.intelligence.shared.application.port.outbound.AiEmbeddingPort;
import com.brainx.intelligence.shared.application.port.outbound.TokenUsagePort;
import com.brainx.intelligence.shared.application.port.outbound.TokenUsagePort.TokenUsageRecord;
import com.brainx.intelligence.shared.application.service.AiTokenUsageCostEstimator;

class QdrantNoteSearchIndexAdapterTest {

    private final FakeQdrantVectorIndexClient vectorIndexClient = new FakeQdrantVectorIndexClient();
    private final FakeEmbeddingPort embeddingPort = new FakeEmbeddingPort();
    private final FakeTokenUsagePort tokenUsagePort = new FakeTokenUsagePort();
    private final QdrantNoteSearchIndexAdapter adapter = adapter(vectorIndexClient, embeddingPort, tokenUsagePort);

    @Test
    void replaceDeletesExistingNoteChunksEmbedsDocumentsAndUpsertsPoints() {
        boolean indexed = adapter.replaceNoteChunks("user-1", "group-1", "note-1", List.of(
            new NoteSearchDocument("user-1", "group-1", "note-1", "note-1::0", 0, "RAG note", "chunk 0", "chunk 0", List.of("keyword-1"), "hash-1", 1, "docs/rag.md", "rag.md"),
            new NoteSearchDocument("user-1", "group-1", "note-1", "note-1::1", 1, "RAG note", "chunk 1", "chunk 1", List.of(), "hash-1", 1, null, null)
        ));

        assertThat(indexed).isTrue();
        assertThat(vectorIndexClient.deletedKeys).containsExactly("user-1::group-1::note-1");
        assertThat(embeddingPort.requests).hasSize(1);
        assertThat(embeddingPort.requests.getFirst().inputType()).isEqualTo(AiEmbeddingPort.InputType.DOCUMENT);
        assertThat(embeddingPort.requests.getFirst().texts()).containsExactly("chunk 0", "chunk 1");
        assertThat(vectorIndexClient.upsertedPoints).hasSize(2);
        assertThat(vectorIndexClient.upsertedPoints.getFirst().id()).isEqualTo(UUID.nameUUIDFromBytes(
            "user-1::group-1::note-1::0".getBytes(StandardCharsets.UTF_8)
        ));
        assertThat(vectorIndexClient.upsertedPoints).extracting(point -> point.payload().get("chunkId"))
            .containsExactly("note-1::0", "note-1::1");
        assertThat(vectorIndexClient.upsertedPoints.getFirst().payload())
            .containsEntry("userId", "user-1")
            .containsEntry("documentGroupId", "group-1")
            .containsEntry("noteId", "note-1")
            .containsEntry("doc_content", "chunk 0")
            .containsEntry("markdownHash", "hash-1")
            .containsEntry("version", 1)
            .containsEntry("sourcePath", "docs/rag.md")
            .containsEntry("sourceFilename", "rag.md");
        assertThat(tokenUsagePort.records).hasSize(1);
        assertThat(tokenUsagePort.records.getFirst().featureId()).isEqualTo("note-search-index-embedding");
        assertThat(tokenUsagePort.records.getFirst().modelId()).isEqualTo("voyage-4-lite");
        assertThat(tokenUsagePort.records.getFirst().inputTokens()).isEqualTo(10);
        assertThat(tokenUsagePort.records.getFirst().estimatedCost()).isEqualByComparingTo("0.0000002");
    }

    @Test
    void searchEmbedsQuerySearchesQdrantAndDeduplicatesByBestNoteScore() {
        vectorIndexClient.searchHits = List.of(
            hit(0.4d, Map.of(
                "userId", "user-1",
                "documentGroupId", "group-1",
                "noteId", "note-1",
                "title", "RAG note",
                "excerpt", "low",
                "keywordIds", List.of()
            )),
            hit(0.9d, Map.of(
                "userId", "user-1",
                "documentGroupId", "group-1",
                "noteId", "note-1",
                "title", "RAG note",
                "excerpt", "high",
                "keywordIds", List.of("keyword-1")
            )),
            hit(0.99d, Map.of(
                "userId", "user-1",
                "documentGroupId", "group-2",
                "noteId", "note-2",
                "title", "Other group note",
                "excerpt", "must not leak",
                "keywordIds", List.of("keyword-1")
            ))
        );

        var results = adapter.search(new NoteSearchQuery(
            "user-1",
            "group-1",
            "semantic search",
            Map.of(),
            3,
            List.of("keyword-1")
        ));

        assertThat(embeddingPort.requests).hasSize(1);
        assertThat(embeddingPort.requests.getFirst().inputType()).isEqualTo(AiEmbeddingPort.InputType.QUERY);
        assertThat(embeddingPort.requests.getFirst().texts()).containsExactly("semantic search");
        assertThat(vectorIndexClient.lastSearchUserId).isEqualTo("user-1");
        assertThat(vectorIndexClient.lastSearchDocumentGroupId).isEqualTo("group-1");
        assertThat(vectorIndexClient.lastSearchLimit).isEqualTo(12);
        assertThat(vectorIndexClient.lastSearchVector).containsExactly(1.0d, 2.0d);
        assertThat(results).hasSize(1);
        assertThat(results.getFirst().excerpt()).isEqualTo("high");
        assertThat(results.getFirst().score()).isEqualTo(0.9d);
        assertThat(results.getFirst().matchedType()).isEqualTo(SearchMatchType.HYBRID);
        assertThat(tokenUsagePort.records.getFirst().featureId()).isEqualTo("note-search-query-embedding");
    }

    @Test
    void searchMapsSemanticResultWhenKeywordDoesNotMatch() {
        vectorIndexClient.searchHits = List.of(hit(0.71d, Map.of(
            "noteId", "note-1",
            "title", "RAG note",
            "excerpt", "semantic search content",
            "keywordIds", List.of("keyword-2")
        )));

        var results = adapter.search(new NoteSearchQuery(
            "user-1",
            "group-1",
            "semantic search",
            Map.of(),
            3,
            List.of("keyword-1")
        ));

        assertThat(results.getFirst().matchedType()).isEqualTo(SearchMatchType.SEMANTIC);
    }

    @Test
    void searchChunksKeepsChunkLevelHitsWithoutDedupe() {
        vectorIndexClient.searchHits = List.of(
            hit(0.5d, Map.of(
                "userId", "user-1",
                "documentGroupId", "group-1",
                "noteId", "note-1",
                "chunkId", "note-1::0",
                "chunkIndex", 0,
                "title", "RAG note",
                "doc_content", "first chunk",
                "markdownHash", "hash-1",
                "version", 1
            )),
            hit(0.9d, Map.ofEntries(
                Map.entry("userId", "user-1"),
                Map.entry("documentGroupId", "group-1"),
                Map.entry("noteId", "note-1"),
                Map.entry("chunkId", "note-1::1"),
                Map.entry("chunkIndex", 1),
                Map.entry("title", "RAG note"),
                Map.entry("doc_content", "second chunk"),
                Map.entry("markdownHash", "hash-1"),
                Map.entry("version", 1),
                Map.entry("sourcePath", "docs/rag.md"),
                Map.entry("sourceFilename", "rag.md")
            ))
        );

        var results = adapter.searchChunks(new NoteChunkSearchQuery("user-1", "group-1", "semantic search", 2));

        assertThat(vectorIndexClient.lastSearchDocumentGroupId).isEqualTo("group-1");
        assertThat(vectorIndexClient.lastSearchLimit).isEqualTo(2);
        assertThat(results).hasSize(2);
        assertThat(results).extracting("chunkId").containsExactly("note-1::1", "note-1::0");
        assertThat(results.getFirst().documentGroupId()).isEqualTo("group-1");
        assertThat(results.getFirst().text()).isEqualTo("second chunk");
        assertThat(results.getFirst().sourcePath()).isEqualTo("docs/rag.md");
        assertThat(results.getFirst().sourceFilename()).isEqualTo("rag.md");
    }

    @Test
    void deleteUsesUserAndNoteFilter() {
        boolean deleted = adapter.deleteByUserIdAndDocumentGroupIdAndNoteId("user-1", "group-1", "note-1");

        assertThat(deleted).isTrue();
        assertThat(vectorIndexClient.deletedKeys).containsExactly("user-1::group-1::note-1");
    }

    @Test
    void missingQdrantClientOrEmbeddingProviderFallsBackWithoutMutation() {
        QdrantNoteSearchIndexAdapter noClient = adapter(null, embeddingPort, new FakeTokenUsagePort());
        QdrantNoteSearchIndexAdapter noEmbedding = adapter(vectorIndexClient, null, new FakeTokenUsagePort());

        assertThat(noClient.replaceNoteChunks("user-1", "group-1", "note-1", List.of())).isFalse();
        assertThat(noClient.search(new NoteSearchQuery("user-1", "query", Map.of(), 3, List.of()))).isEmpty();
        assertThat(noEmbedding.replaceNoteChunks("user-1", "default", "note-1", List.of(
            new NoteSearchDocument("user-1", "note-1", "title", "excerpt", List.of())
        ))).isFalse();
        assertThat(noEmbedding.searchChunks(new NoteChunkSearchQuery("user-1", "query", 2))).isEmpty();
    }

    private static QdrantVectorSearchHit hit(double score, Map<String, Object> payload) {
        return new QdrantVectorSearchHit("point-id", score, payload);
    }

    private static QdrantNoteSearchIndexAdapter adapter(
        QdrantVectorIndexClient vectorIndexClient,
        AiEmbeddingPort embeddingPort,
        FakeTokenUsagePort tokenUsagePort
    ) {
        DefaultListableBeanFactory beanFactory = new DefaultListableBeanFactory();
        if (vectorIndexClient != null) {
            beanFactory.registerSingleton("vectorIndexClient", vectorIndexClient);
        }
        if (embeddingPort != null) {
            beanFactory.registerSingleton("embeddingPort", embeddingPort);
        }
        return new QdrantNoteSearchIndexAdapter(
            beanFactory.getBeanProvider(QdrantVectorIndexClient.class),
            beanFactory.getBeanProvider(AiEmbeddingPort.class),
            tokenUsagePort,
            new AiTokenUsageCostEstimator(new FakeAiModelCatalog())
        );
    }

    private static final class FakeQdrantVectorIndexClient implements QdrantVectorIndexClient {

        private final List<QdrantVectorPoint> upsertedPoints = new ArrayList<>();
        private final List<String> deletedKeys = new ArrayList<>();
        private List<QdrantVectorSearchHit> searchHits = List.of();
        private String lastSearchUserId;
        private String lastSearchDocumentGroupId;
        private List<Double> lastSearchVector;
        private int lastSearchLimit;

        @Override
        public void upsert(List<QdrantVectorPoint> points) {
            upsertedPoints.addAll(points);
        }

        @Override
        public void deleteByUserIdAndDocumentGroupIdAndNoteId(String userId, String documentGroupId, String noteId) {
            deletedKeys.add(userId + "::" + documentGroupId + "::" + noteId);
        }

        @Override
        public List<QdrantVectorSearchHit> search(String userId, String documentGroupId, List<Double> vector, int limit) {
            lastSearchUserId = userId;
            lastSearchDocumentGroupId = documentGroupId;
            lastSearchVector = vector;
            lastSearchLimit = limit;
            return searchHits.stream()
                .filter(hit -> userId.equals(hit.payload().getOrDefault("userId", userId)))
                .filter(hit -> documentGroupId.equals(hit.payload().getOrDefault("documentGroupId", documentGroupId)))
                .toList();
        }
    }

    private static final class FakeEmbeddingPort implements AiEmbeddingPort {

        private final List<AiEmbeddingRequest> requests = new ArrayList<>();

        @Override
        public AiEmbeddingResponse embed(AiEmbeddingRequest request) {
            requests.add(request);
            List<AiEmbeddingVector> vectors = new ArrayList<>();
            List<String> texts = request.texts() == null ? List.of() : request.texts();
            for (int index = 0; index < texts.size(); index++) {
                vectors.add(new AiEmbeddingVector(
                    texts.get(index),
                    List.of((double) index + 1.0d, (double) index + 2.0d)
                ));
            }
            return new AiEmbeddingResponse("voyage-4-lite", 10, vectors);
        }
    }

    private static final class FakeTokenUsagePort implements TokenUsagePort {

        private final List<TokenUsageRecord> records = new ArrayList<>();

        @Override
        public void recordTokenUsage(TokenUsageRecord record) {
            records.add(record);
        }
    }

    private static final class FakeAiModelCatalog implements AiModelCatalogPort {

        private static final AiModel MODEL = new AiModel(
            "voyage-4-lite",
            "Voyage 4 Lite",
            "voyage",
            new VendorTokenCost(
                new BigDecimal("0.000020"),
                null,
                null,
                "USD"
            )
        );

        @Override
        public List<AiModel> findAll() {
            return List.of(MODEL);
        }

        @Override
        public Optional<AiModel> findByModelId(String modelId) {
            return MODEL.modelId().equals(modelId) ? Optional.of(MODEL) : Optional.empty();
        }

        @Override
        public boolean existsByModelId(String modelId) {
            return MODEL.modelId().equals(modelId);
        }
    }
}
