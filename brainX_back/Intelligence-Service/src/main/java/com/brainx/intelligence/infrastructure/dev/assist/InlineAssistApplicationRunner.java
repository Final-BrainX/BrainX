package com.brainx.intelligence.infrastructure.dev.assist;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.io.PrintStream;
import java.nio.charset.StandardCharsets;

import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.ConfigurableApplicationContext;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

import com.brainx.intelligence.assist.application.port.inbound.CreateInlineAssistUseCase;
import com.brainx.intelligence.assist.application.port.inbound.CreateInlineAssistUseCase.InlineAssistCommand;
import com.brainx.intelligence.assist.application.port.inbound.CreateInlineAssistUseCase.InlineAssistResult;
import com.brainx.intelligence.assist.domain.InlineAssistAction;
import com.fasterxml.jackson.databind.ObjectMapper;

@Component
@ConditionalOnProperty(prefix = "brainx.dev.inline-assist", name = "enabled", havingValue = "true")
public class InlineAssistApplicationRunner implements ApplicationRunner {

    private final InlineAssistDevProperties properties;
    private final CreateInlineAssistUseCase createInlineAssistUseCase;
    private final ObjectMapper objectMapper;
    private final ConfigurableApplicationContext applicationContext;

    public InlineAssistApplicationRunner(
        InlineAssistDevProperties properties,
        CreateInlineAssistUseCase createInlineAssistUseCase,
        ObjectMapper objectMapper,
        ConfigurableApplicationContext applicationContext
    ) {
        this.properties = properties;
        this.createInlineAssistUseCase = createInlineAssistUseCase;
        this.objectMapper = objectMapper;
        this.applicationContext = applicationContext;
    }

    @Override
    public void run(ApplicationArguments args) throws Exception {
        try (BufferedReader reader = new BufferedReader(new InputStreamReader(System.in, StandardCharsets.UTF_8))) {
            runAssist(reader, System.out);
        }
        exitSuccessfully();
    }

    void runAssist(BufferedReader reader, PrintStream out) throws IOException {
        String command = StringUtils.hasText(properties.getCommand())
            ? properties.getCommand().trim().toLowerCase()
            : "run";
        if (!command.equals("run")) {
            throw new IllegalArgumentException("Unsupported inline assist command: " + properties.getCommand());
        }
        if (StringUtils.hasText(properties.getAction())) {
            writeJson(out, assist(scenarioFromProperties()));
            return;
        }

        while (true) {
            out.print("brainx-inline-assist> ");
            String line = reader.readLine();
            if (line == null || line.equalsIgnoreCase("exit") || line.equalsIgnoreCase("quit")) {
                return;
            }
            if (line.isBlank()) {
                continue;
            }
            writeJson(out, assist(objectMapper.readValue(line, InlineAssistScenario.class)));
        }
    }

    private InlineAssistCliResponse assist(InlineAssistScenario scenario) {
        InlineAssistResult result = createInlineAssistUseCase.createInlineAssist(new InlineAssistCommand(
            textOrDefault(scenario.userId(), properties.getUserId()),
            textOrDefault(scenario.noteId(), properties.getNoteId()),
            textOrEmpty(scenario.selectedText()),
            textOrEmpty(scenario.contextBefore()),
            textOrEmpty(scenario.contextAfter()),
            scenario.action(),
            textOrDefault(scenario.language(), properties.getLanguage()),
            textOrDefault(scenario.draftPrompt(), properties.getDraftPrompt()),
            scenario.targetLength() == null ? properties.getTargetLength() : scenario.targetLength()
        ));
        return new InlineAssistCliResponse(
            scenario.id(),
            result.suggestionId(),
            result.action(),
            result.modelId(),
            result.text()
        );
    }

    private InlineAssistScenario scenarioFromProperties() {
        return new InlineAssistScenario(
            "property",
            properties.getUserId(),
            properties.getNoteId(),
            InlineAssistAction.valueOf(properties.getAction().trim().toUpperCase()),
            properties.getSelectedText(),
            properties.getContextBefore(),
            properties.getContextAfter(),
            properties.getLanguage(),
            properties.getDraftPrompt(),
            properties.getTargetLength()
        );
    }

    private void writeJson(PrintStream out, Object value) throws IOException {
        out.println(objectMapper.writerWithDefaultPrettyPrinter().writeValueAsString(value));
    }

    private void exitSuccessfully() {
        System.out.flush();
        System.err.flush();
        int exitCode = SpringApplication.exit(applicationContext, () -> 0);
        System.exit(exitCode);
    }

    private static String textOrDefault(String value, String fallback) {
        return StringUtils.hasText(value) ? value.trim() : fallback;
    }

    private static String textOrEmpty(String value) {
        return value == null ? "" : value;
    }

    record InlineAssistScenario(
        String id,
        String userId,
        String noteId,
        InlineAssistAction action,
        String selectedText,
        String contextBefore,
        String contextAfter,
        String language,
        String draftPrompt,
        Integer targetLength
    ) {
    }

    public record InlineAssistCliResponse(
        String scenarioId,
        String suggestionId,
        InlineAssistAction action,
        String modelId,
        String text
    ) {
    }
}
