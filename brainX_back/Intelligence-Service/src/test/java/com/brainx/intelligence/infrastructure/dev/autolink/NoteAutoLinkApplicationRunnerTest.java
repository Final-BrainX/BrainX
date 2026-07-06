package com.brainx.intelligence.infrastructure.dev.autolink;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.ByteArrayOutputStream;
import java.io.PrintStream;
import java.nio.charset.StandardCharsets;
import java.util.List;

import org.junit.jupiter.api.Test;

import com.brainx.intelligence.autolink.application.port.inbound.NoteAutoLinkUseCase;
import com.brainx.intelligence.autolink.application.port.inbound.NoteAutoLinkUseCase.AutoLinkCommand;
import com.brainx.intelligence.autolink.application.port.inbound.NoteAutoLinkUseCase.AutoLinkComparison;
import com.brainx.intelligence.autolink.application.port.inbound.NoteAutoLinkUseCase.AutoLinkResult;
import com.brainx.intelligence.autolink.application.port.inbound.NoteAutoLinkUseCase.AutoLinkSourceCommand;
import com.brainx.intelligence.autolink.domain.NoteAutoLinkStrategy;
import com.fasterxml.jackson.databind.ObjectMapper;

class NoteAutoLinkApplicationRunnerTest {

    @Test
    void analyzeCommandWritesJsonResponse() throws Exception {
        NoteAutoLinkDevProperties properties = new NoteAutoLinkDevProperties();
        properties.setEnabled(true);
        properties.setUserId("user-1");
        properties.setDocumentGroupId("group-1");
        properties.setStrategy(NoteAutoLinkStrategy.COMPARE);
        FakeUseCase useCase = new FakeUseCase();
        NoteAutoLinkApplicationRunner runner = new NoteAutoLinkApplicationRunner(
            properties,
            useCase,
            new ObjectMapper().findAndRegisterModules(),
            null
        );

        ByteArrayOutputStream output = new ByteArrayOutputStream();
        runner.runAnalyze(new PrintStream(output, true, StandardCharsets.UTF_8));

        String json = output.toString(StandardCharsets.UTF_8);
        assertThat(json).contains("\"requestedStrategy\" : \"COMPARE\"");
        assertThat(json).contains("\"documentGroupId\" : \"group-1\"");
        assertThat(useCase.command.userId()).isEqualTo("user-1");
        assertThat(useCase.command.documentGroupId()).isEqualTo("group-1");
    }

    private static final class FakeUseCase implements NoteAutoLinkUseCase {

        private AutoLinkCommand command;

        @Override
        public AutoLinkResult analyze(AutoLinkCommand command) {
            this.command = command;
            return new AutoLinkResult(
                command.userId(),
                command.documentGroupId(),
                command.strategy(),
                "COMPLETED",
                false,
                50,
                2,
                2,
                List.of(),
                new AutoLinkComparison(0, 0, 0)
            );
        }

        @Override
        public AutoLinkResult analyzeSourceLinks(AutoLinkSourceCommand command) {
            throw new UnsupportedOperationException("source-only analysis is not used by this runner");
        }
    }
}
