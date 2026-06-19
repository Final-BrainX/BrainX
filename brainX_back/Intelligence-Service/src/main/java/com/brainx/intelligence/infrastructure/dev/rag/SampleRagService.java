package com.brainx.intelligence.infrastructure.dev.rag;

import java.time.Instant;
import java.util.List;

import org.springframework.beans.factory.ObjectProvider;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import com.brainx.intelligence.exploration.application.port.outbound.NoteChunkRetrievalPort;
import com.brainx.intelligence.exploration.application.port.outbound.NoteChunkRetrievalPort.NoteChunkSearchQuery;
import com.brainx.intelligence.exploration.application.port.outbound.NoteSearchIndexPort;
import com.brainx.intelligence.exploration.domain.NoteChunkSearchResult;
import com.brainx.intelligence.infrastructure.events.note.MarkdownNoteChunker;
import com.brainx.intelligence.infrastructure.events.note.NoteProjection;
import com.brainx.intelligence.infrastructure.events.note.NoteProjectionStore;
import com.brainx.intelligence.shared.application.port.outbound.AiChatPort;
import com.brainx.intelligence.shared.application.port.outbound.AiChatPort.AiChatMessage;
import com.brainx.intelligence.shared.application.port.outbound.AiChatPort.AiChatRequest;
import com.brainx.intelligence.shared.application.port.outbound.AiChatPort.AiRole;

@Service
public class SampleRagService {

    private static final int CONTEXT_SNIPPET_LENGTH = 1_200;
    private static final String RETRIEVAL_ONLY_MODEL = "none";

    private final SampleRagProperties properties;
    private final SampleNoteLoader sampleNoteLoader;
    private final NoteProjectionStore noteProjectionStore;
    private final MarkdownNoteChunker noteChunker;
    private final NoteSearchIndexPort noteSearchIndexPort;
    private final NoteChunkRetrievalPort noteChunkRetrievalPort;
    private final ObjectProvider<AiChatPort> aiChatPortProvider;

    public SampleRagService(
        SampleRagProperties properties,
        SampleNoteLoader sampleNoteLoader,
        NoteProjectionStore noteProjectionStore,
        MarkdownNoteChunker noteChunker,
        NoteSearchIndexPort noteSearchIndexPort,
        NoteChunkRetrievalPort noteChunkRetrievalPort,
        ObjectProvider<AiChatPort> aiChatPortProvider
    ) {
        this.properties = properties;
        this.sampleNoteLoader = sampleNoteLoader;
        this.noteProjectionStore = noteProjectionStore;
        this.noteChunker = noteChunker;
        this.noteSearchIndexPort = noteSearchIndexPort;
        this.noteChunkRetrievalPort = noteChunkRetrievalPort;
        this.aiChatPortProvider = aiChatPortProvider;
    }

    public SampleRagIngestionResult ingest() {
        List<SampleNoteLoader.SampleNoteSnapshot> snapshots = sampleNoteLoader.load(properties);
        int chunkCount = 0;
        for (SampleNoteLoader.SampleNoteSnapshot snapshot : snapshots) {
            List<String> tags = normalizedTags();
            var projection = new NoteProjection(
                snapshot.userId(),
                snapshot.noteId(),
                snapshot.title(),
                properties.getFolderId(),
                tags,
                1,
                snapshot.markdownHash(),
                false,
                false,
                false,
                false,
                "sample-notes:" + snapshot.markdownHash().substring(0, 16),
                snapshot.updatedAt() == null ? Instant.now() : snapshot.updatedAt()
            );
            noteProjectionStore.save(projection);

            var chunks = noteChunker.chunk(
                snapshot.userId(),
                snapshot.noteId(),
                snapshot.title(),
                snapshot.markdown(),
                tags,
                snapshot.markdownHash(),
                projection.version()
            );
            noteSearchIndexPort.replaceNoteChunks(snapshot.userId(), snapshot.noteId(), chunks);
            chunkCount += chunks.size();
        }
        return new SampleRagIngestionResult(
            properties.getDirectory().toString(),
            properties.getUserId(),
            snapshots.size(),
            chunkCount
        );
    }

    public SampleRagQueryResponse ask(String query) {
        if (!StringUtils.hasText(query)) {
            throw new IllegalArgumentException("query must not be blank.");
        }
        List<SampleRagContext> contexts = noteChunkRetrievalPort.searchChunks(new NoteChunkSearchQuery(
                properties.getUserId(),
                query,
                properties.getTopK()
            )).stream()
            .map(SampleRagService::toContext)
            .toList();

        if (contexts.isEmpty()) {
            return retrievalOnly(query, contexts, "관련 sample note chunk를 찾지 못했습니다.");
        }

        AiChatPort aiChatPort = aiChatPortProvider.getIfAvailable();
        if (aiChatPort == null) {
            return retrievalOnly(query, contexts, retrievalOnlyAnswer(contexts));
        }

        try {
            var response = aiChatPort.generate(new AiChatRequest(
                properties.getChatModel(),
                List.of(
                    new AiChatMessage(AiRole.SYSTEM, systemPrompt()),
                    new AiChatMessage(AiRole.USER, userPrompt(query, contexts))
                )
            ));
            return new SampleRagQueryResponse(
                query,
                "llm",
                properties.getChatModel(),
                response.content(),
                contexts
            );
        } catch (IllegalStateException exception) {
            if (exception.getMessage() != null && exception.getMessage().contains("ChatClient.Builder bean is not configured")) {
                return retrievalOnly(query, contexts, retrievalOnlyAnswer(contexts));
            }
            throw exception;
        }
    }

    private List<String> normalizedTags() {
        List<String> tags = properties.getTags() == null ? List.of() : properties.getTags();
        return tags.stream()
            .filter(StringUtils::hasText)
            .distinct()
            .toList();
    }

    private SampleRagQueryResponse retrievalOnly(String query, List<SampleRagContext> contexts, String answer) {
        return new SampleRagQueryResponse(query, "retrieval", RETRIEVAL_ONLY_MODEL, answer, contexts);
    }

    private static SampleRagContext toContext(NoteChunkSearchResult result) {
        return new SampleRagContext(
            result.noteId(),
            result.chunkId(),
            result.chunkIndex(),
            result.title(),
            result.score(),
            snippet(result.text())
        );
    }

    private static String snippet(String text) {
        if (text == null || text.length() <= CONTEXT_SNIPPET_LENGTH) {
            return text == null ? "" : text;
        }
        return text.substring(0, CONTEXT_SNIPPET_LENGTH).trim();
    }

    private static String retrievalOnlyAnswer(List<SampleRagContext> contexts) {
        return "ChatModel이 설정되지 않아 생성 답변은 생략했습니다. 상위 근거 chunk "
            + contexts.size()
            + "개를 확인하세요.";
    }

    private static String systemPrompt() {
        return """
            너는 BrainX sample_notes RAG 품질 검증용 챗봇이다.
            제공된 context만 근거로 한국어로 답변한다.
            context에 없는 내용은 추측하지 말고 모른다고 답한다.
            답변 끝에 참고한 note title과 chunk index를 짧게 적는다.
            """;
    }

    private String userPrompt(String query, List<SampleRagContext> contexts) {
        StringBuilder builder = new StringBuilder();
        builder.append("질문:\n").append(query).append("\n\nContext:\n");
        int remainingChars = Math.max(1_000, properties.getMaxContextChars());
        for (int index = 0; index < contexts.size() && remainingChars > 0; index++) {
            SampleRagContext context = contexts.get(index);
            String header = "[" + (index + 1) + "] title=" + context.title()
                + ", noteId=" + context.noteId()
                + ", chunkIndex=" + context.chunkIndex()
                + ", score=" + context.score()
                + "\n";
            String text = context.text();
            int allowed = Math.max(0, remainingChars - header.length() - 2);
            if (text.length() > allowed) {
                text = text.substring(0, allowed).trim();
            }
            builder.append(header).append(text).append("\n\n");
            remainingChars -= header.length() + text.length() + 2;
        }
        return builder.toString();
    }

    public record SampleRagIngestionResult(
        String directory,
        String userId,
        int notesIndexed,
        int chunksIndexed
    ) {
    }

    public record SampleRagQueryResponse(
        String query,
        String answerMode,
        String model,
        String answer,
        List<SampleRagContext> contexts
    ) {
    }

    public record SampleRagContext(
        String noteId,
        String chunkId,
        int chunkIndex,
        String title,
        double score,
        String text
    ) {
    }
}
