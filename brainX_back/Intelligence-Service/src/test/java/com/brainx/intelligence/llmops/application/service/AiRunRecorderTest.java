package com.brainx.intelligence.llmops.application.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.Test;

import com.brainx.intelligence.llmops.LlmOpsTestSupport;
import com.brainx.intelligence.llmops.application.port.outbound.LlmOpsStore;
import com.brainx.intelligence.llmops.domain.LlmRunStatus;
import com.brainx.intelligence.shared.application.port.outbound.AiChatPort.AiChatMessage;
import com.brainx.intelligence.shared.application.port.outbound.AiChatPort.AiChatResponse;
import com.brainx.intelligence.shared.application.port.outbound.AiChatPort.AiRole;
import com.brainx.intelligence.shared.application.port.outbound.AiChatPort.AiTokenUsage;

class AiRunRecorderTest {

    private final LlmOpsStore store = LlmOpsTestSupport.store();
    private final AiRunRecorder recorder = LlmOpsTestSupport.runRecorder(store);

    @Test
    void recordsSuccessfulChatRunWithUsageAndRedactedPreview() {
        var recorded = recorder.recordChatGenerateWithRun(
            "user-1",
            "inline-assist-chat",
            "inline-assist",
            "code",
            "gpt-test",
            "AI_SUGGESTION",
            "suggestion-1",
            List.of(
                new AiChatMessage(AiRole.SYSTEM, "Use api_key=sk-secret123456789012 safely."),
                new AiChatMessage(AiRole.USER, "rewrite this")
            ),
            Map.of("token", "Bearer abc.def.ghi", "nested", Map.of("voyage", "pa-secret123456789012")),
            () -> new AiChatResponse(
                "result with sk-output123456789012",
                new AiTokenUsage(100, 20, 120, 30, 5)
            )
        );

        var run = store.findRunById(recorded.llmRunId()).orElseThrow();

        assertThat(run.status()).isEqualTo(LlmRunStatus.SUCCEEDED);
        assertThat(run.promptKey()).isEqualTo("inline-assist");
        assertThat(run.promptVersion()).isEqualTo("code");
        assertThat(run.inputTokens()).isEqualTo(100);
        assertThat(run.cachedInputTokens()).isEqualTo(30);
        assertThat(run.billableInputTokens()).isEqualTo(70);
        assertThat(run.outputTokens()).isEqualTo(20);
        assertThat(run.reasoningTokens()).isEqualTo(5);
        assertThat(run.totalTokens()).isEqualTo(120);
        assertThat(run.inputPreview().toString()).contains("[REDACTED]");
        assertThat(run.outputPreview().toString()).contains("[REDACTED]");
        assertThat(run.metadata().toString()).contains("[REDACTED]");
        assertThat(run.inputPreview().toString()).doesNotContain("sk-secret");
        assertThat(run.metadata().toString()).doesNotContain("abc.def.ghi");
    }

    @Test
    void recordsFailedChatRunAndRethrowsProviderError() {
        assertThatThrownBy(() -> recorder.recordChatGenerate(
            "user-1",
            "rag-chat",
            "chat.note-qa",
            "code",
            "gpt-test",
            "CHAT_MESSAGE",
            "message-1",
            List.of(new AiChatMessage(AiRole.USER, "hello")),
            Map.of(),
            () -> {
                throw new IllegalStateException("provider failed with sk-secret123456789012");
            }
        )).isInstanceOf(IllegalStateException.class);

        var run = store.listRuns("user-1", "rag-chat", "FAILED", 10).getFirst();

        assertThat(run.status()).isEqualTo(LlmRunStatus.FAILED);
        assertThat(run.errorCode()).isEqualTo("ILLEGALSTATEEXCEPTION");
        assertThat(run.errorMessage()).contains("[REDACTED]");
        assertThat(run.errorMessage()).doesNotContain("sk-secret");
    }
}
