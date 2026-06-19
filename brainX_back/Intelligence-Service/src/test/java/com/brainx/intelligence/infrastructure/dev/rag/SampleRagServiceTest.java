package com.brainx.intelligence.infrastructure.dev.rag;

import static org.assertj.core.api.Assertions.assertThat;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.beans.factory.support.DefaultListableBeanFactory;

import com.brainx.intelligence.exploration.application.port.outbound.NoteChunkRetrievalPort;
import com.brainx.intelligence.exploration.application.port.outbound.NoteSearchIndexPort;
import com.brainx.intelligence.exploration.domain.NoteChunkSearchResult;
import com.brainx.intelligence.exploration.domain.NoteSearchDocument;
import com.brainx.intelligence.exploration.domain.SemanticSearchResult;
import com.brainx.intelligence.infrastructure.events.note.MarkdownNoteChunker;
import com.brainx.intelligence.infrastructure.events.note.NoteProjection;
import com.brainx.intelligence.infrastructure.events.note.NoteProjectionStore;
import com.brainx.intelligence.shared.application.port.outbound.AiChatPort;

import reactor.core.publisher.Flux;

class SampleRagServiceTest {

    @TempDir
    private Path tempDir;

    @Test
    void ingestStoresProjectionAndReplacesChunks() throws Exception {
        Files.writeString(tempDir.resolve("rag.md"), "# RAG 품질\n\n본문 ".repeat(100));
        var properties = properties();
        FakeProjectionStore projectionStore = new FakeProjectionStore();
        FakeSearchIndex searchIndex = new FakeSearchIndex();

        var result = service(properties, projectionStore, searchIndex, new FakeChunkRetrieval(), null).ingest();

        assertThat(result.notesIndexed()).isEqualTo(1);
        assertThat(result.chunksIndexed()).isGreaterThan(0);
        assertThat(projectionStore.saved).hasSize(1);
        assertThat(projectionStore.saved.getFirst().markdownHash()).hasSize(64);
        assertThat(searchIndex.replacedChunks).hasSize(1);
        assertThat(searchIndex.replacedChunks.getFirst()).isNotEmpty();
        assertThat(searchIndex.replacedChunks.getFirst().getFirst().markdownHash()).hasSize(64);
    }

    @Test
    void askReturnsRetrievalOnlyWhenChatIsUnavailable() {
        FakeChunkRetrieval chunkRetrieval = new FakeChunkRetrieval();
        chunkRetrieval.results = List.of(new NoteChunkSearchResult(
            "sample-user",
            "note-1",
            "note-1::0",
            0,
            "RAG note",
            "chunk text",
            0.93d,
            "hash",
            1
        ));

        var response = service(properties(), new FakeProjectionStore(), new FakeSearchIndex(), chunkRetrieval, null)
            .ask("RAG란?");

        assertThat(response.answerMode()).isEqualTo("retrieval");
        assertThat(response.model()).isEqualTo("none");
        assertThat(response.contexts()).hasSize(1);
        assertThat(response.contexts().getFirst().title()).isEqualTo("RAG note");
    }

    @Test
    void askUsesChatWhenAiChatPortIsAvailable() {
        FakeChunkRetrieval chunkRetrieval = new FakeChunkRetrieval();
        chunkRetrieval.results = List.of(new NoteChunkSearchResult(
            "sample-user",
            "note-1",
            "note-1::1",
            1,
            "RAG note",
            "chunk text for prompt",
            0.91d,
            "hash",
            1
        ));
        FakeAiChatPort aiChatPort = new FakeAiChatPort();

        var response = service(properties(), new FakeProjectionStore(), new FakeSearchIndex(), chunkRetrieval, aiChatPort)
            .ask("검색 흐름은?");

        assertThat(response.answerMode()).isEqualTo("llm");
        assertThat(response.model()).isEqualTo("gpt-5.4-mini");
        assertThat(response.answer()).isEqualTo("generated from context");
        assertThat(aiChatPort.lastRequest.modelId()).isEqualTo("gpt-5.4-mini");
        assertThat(aiChatPort.lastRequest.messages().get(1).content()).contains("chunk text for prompt");
    }

    private SampleRagProperties properties() {
        SampleRagProperties properties = new SampleRagProperties();
        properties.setDirectory(tempDir);
        properties.setUserId("sample-user");
        properties.setChatModel("gpt-5.4-mini");
        return properties;
    }

    private static SampleRagService service(
        SampleRagProperties properties,
        FakeProjectionStore projectionStore,
        FakeSearchIndex searchIndex,
        FakeChunkRetrieval chunkRetrieval,
        AiChatPort aiChatPort
    ) {
        DefaultListableBeanFactory beanFactory = new DefaultListableBeanFactory();
        if (aiChatPort != null) {
            beanFactory.registerSingleton("aiChatPort", aiChatPort);
        }
        return new SampleRagService(
            properties,
            new SampleNoteLoader(),
            projectionStore,
            new MarkdownNoteChunker(),
            searchIndex,
            chunkRetrieval,
            beanFactory.getBeanProvider(AiChatPort.class)
        );
    }

    private static final class FakeProjectionStore implements NoteProjectionStore {

        private final List<NoteProjection> saved = new ArrayList<>();

        @Override
        public Optional<NoteProjection> findByUserIdAndNoteId(String userId, String noteId) {
            return saved.stream()
                .filter(projection -> projection.userId().equals(userId) && projection.noteId().equals(noteId))
                .findFirst();
        }

        @Override
        public List<NoteProjection> findByUserIdAndNoteIds(String userId, List<String> noteIds) {
            return saved.stream()
                .filter(projection -> projection.userId().equals(userId) && noteIds.contains(projection.noteId()))
                .toList();
        }

        @Override
        public NoteProjection save(NoteProjection projection) {
            saved.add(projection);
            return projection;
        }
    }

    private static final class FakeSearchIndex implements NoteSearchIndexPort {

        private final List<List<NoteSearchDocument>> replacedChunks = new ArrayList<>();

        @Override
        public List<SemanticSearchResult> search(NoteSearchQuery query) {
            return List.of();
        }

        @Override
        public NoteSearchDocument save(NoteSearchDocument document) {
            return document;
        }

        @Override
        public void replaceNoteChunks(String userId, String noteId, List<NoteSearchDocument> chunks) {
            replacedChunks.add(chunks);
        }

        @Override
        public void deleteByUserIdAndNoteId(String userId, String noteId) {
        }
    }

    private static final class FakeChunkRetrieval implements NoteChunkRetrievalPort {

        private List<NoteChunkSearchResult> results = List.of();

        @Override
        public List<NoteChunkSearchResult> searchChunks(NoteChunkSearchQuery query) {
            return results;
        }
    }

    private static final class FakeAiChatPort implements AiChatPort {

        private AiChatRequest lastRequest;

        @Override
        public AiChatResponse generate(AiChatRequest request) {
            lastRequest = request;
            return new AiChatResponse("generated from context", new AiTokenUsage(1, 2, 3));
        }

        @Override
        public Flux<AiChatChunk> stream(AiChatRequest request) {
            return Flux.empty();
        }
    }
}
