package com.brainx.intelligence.infrastructure.dev.style;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.io.PrintStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

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
import com.brainx.intelligence.settings.application.port.outbound.StyleProfilePort;
import com.brainx.intelligence.settings.application.service.StylePromptCompiler;
import com.brainx.intelligence.settings.domain.ConversationTone;
import com.brainx.intelligence.settings.domain.StyleProfile;
import com.brainx.intelligence.settings.domain.WritingStyle;
import com.brainx.intelligence.shared.application.port.outbound.AiChatPort;
import com.brainx.intelligence.shared.application.port.outbound.AiChatPort.AiChatMessage;
import com.brainx.intelligence.shared.application.port.outbound.AiChatPort.AiChatRequest;
import com.brainx.intelligence.shared.application.port.outbound.AiChatPort.AiChatResponse;
import com.brainx.intelligence.shared.application.port.outbound.AiChatPort.AiRole;
import com.brainx.intelligence.shared.application.port.outbound.AiChatPort.AiTokenUsage;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

@Component
@ConditionalOnProperty(prefix = "brainx.dev.style-profile-quality", name = "enabled", havingValue = "true")
public class StyleProfileQualityApplicationRunner implements ApplicationRunner {

    private static final Set<String> CONVERSATION_TONE_KEYS = Set.of(
        "speechLevel",
        "warmth",
        "directness",
        "verbosity",
        "emoji"
    );
    private static final Set<String> WRITING_STYLE_KEYS = Set.of(
        "speechLevel",
        "defaultAudience",
        "defaultPurpose",
        "formality",
        "informationDensity",
        "sentenceLength",
        "avoid"
    );
    private static final List<String> RAW_STYLE_KEY_MARKERS = List.of(
        "Mandatory user style instructions",
        "conversationTone",
        "writingStyle",
        "speechLevel",
        "defaultAudience",
        "defaultPurpose",
        "informationDensity",
        "sentenceLength",
        "internal setting keys",
        "User conversation tone profile",
        "User writing style profile",
        "assistance" + "Style"
    );

    private final StyleProfileQualityDevProperties properties;
    private final StyleProfilePort styleProfilePort;
    private final StylePromptCompiler stylePromptCompiler;
    private final AiChatPort aiChatPort;
    private final CreateInlineAssistUseCase createInlineAssistUseCase;
    private final ObjectMapper objectMapper;
    private final ConfigurableApplicationContext applicationContext;

    public StyleProfileQualityApplicationRunner(
        StyleProfileQualityDevProperties properties,
        StyleProfilePort styleProfilePort,
        StylePromptCompiler stylePromptCompiler,
        AiChatPort aiChatPort,
        CreateInlineAssistUseCase createInlineAssistUseCase,
        ObjectMapper objectMapper,
        ConfigurableApplicationContext applicationContext
    ) {
        this.properties = properties;
        this.styleProfilePort = styleProfilePort;
        this.stylePromptCompiler = stylePromptCompiler;
        this.aiChatPort = aiChatPort;
        this.createInlineAssistUseCase = createInlineAssistUseCase;
        this.objectMapper = objectMapper;
        this.applicationContext = applicationContext;
    }

    @Override
    public void run(ApplicationArguments args) throws Exception {
        try (BufferedReader reader = new BufferedReader(new InputStreamReader(System.in, StandardCharsets.UTF_8))) {
            runQuality(reader, System.out);
        }
        exitSuccessfully();
    }

    void runQuality(BufferedReader reader, PrintStream out) throws IOException {
        String command = StringUtils.hasText(properties.getCommand())
            ? properties.getCommand().trim().toLowerCase(Locale.ROOT)
            : "run";
        if (!command.equals("run")) {
            throw new IllegalArgumentException("Unsupported style profile quality command: " + properties.getCommand());
        }

        while (true) {
            out.print("brainx-style-profile-quality> ");
            String line = reader.readLine();
            if (line == null || line.equalsIgnoreCase("exit") || line.equalsIgnoreCase("quit")) {
                return;
            }
            if (line.isBlank()) {
                continue;
            }
            writeJson(out, evaluate(objectMapper.readValue(line, StyleProfileQualityScenario.class)));
        }
    }

    private StyleProfileQualityCliResponse evaluate(StyleProfileQualityScenario scenario) {
        String userId = textOrDefault(scenario.userId(), properties.getUserId() + "-" + safeId(scenario.id()));
        String modelId = textOrDefault(scenario.modelId(), properties.getModelId());
        String judgeModelId = textOrDefault(scenario.judgeModelId(), properties.getJudgeModelId());

        Map<String, Object> conversationTone = allowedValues(scenario.conversationTone(), CONVERSATION_TONE_KEYS);
        Map<String, Object> writingStyle = allowedValues(scenario.writingStyle(), WRITING_STYLE_KEYS);
        styleProfilePort.save(new StyleProfile(
            userId,
            new ConversationTone(conversationTone),
            new WritingStyle(writingStyle),
            null
        ));

        ProbeResult probe = "inline-assist".equalsIgnoreCase(textOrEmpty(scenario.type()))
            ? evaluateInlineAssist(scenario, userId)
            : evaluateConversation(scenario, userId, modelId);
        List<String> deterministicFailures = deterministicFailures(scenario, probe.generatedText(), conversationTone);
        JudgeEvaluation judge = judge(scenario, probe.styleInstructions(), probe.generatedText(), judgeModelId);

        List<String> failures = new ArrayList<>();
        failures.addAll(deterministicFailures);
        failures.addAll(judge.failures());
        String status = failures.isEmpty() ? "passed" : "failed";

        return new StyleProfileQualityCliResponse(
            scenario.id(),
            textOrDefault(scenario.type(), "conversation"),
            userId,
            probe.axis(),
            probe.feature(),
            probe.modelId(),
            judgeModelId,
            probe.styleInstructions(),
            probe.generatedText(),
            probe.tokenUsage(),
            deterministicFailures,
            judge.rawResponse(),
            judge.result(),
            judge.failures(),
            failures,
            status
        );
    }

    private ProbeResult evaluateConversation(StyleProfileQualityScenario scenario, String userId, String modelId) {
        String styleInstructions = stylePromptCompiler.conversationToneInstructions(userId);
        String systemPrompt = StylePromptCompiler.appendToSystemPrompt("""
            You are the BrainX conversational assistant.
            Answer in Korean unless the user asks for another language.
            Return only the answer text, not analysis or metadata.
            """.strip(), styleInstructions);
        AiChatResponse response = aiChatPort.generate(new AiChatRequest(
            modelId,
            List.of(
                new AiChatMessage(AiRole.SYSTEM, systemPrompt),
                new AiChatMessage(AiRole.USER, textOrDefault(scenario.prompt(), defaultConversationPrompt()))
            )
        ));
        return new ProbeResult(
            "conversationTone",
            "conversation-probe",
            modelId,
            styleInstructions,
            textOrEmpty(response.content()).trim(),
            response.tokenUsage()
        );
    }

    private ProbeResult evaluateInlineAssist(StyleProfileQualityScenario scenario, String userId) {
        String styleInstructions = stylePromptCompiler.writingStyleInstructions(userId);
        InlineAssistResult result = createInlineAssistUseCase.createInlineAssist(new InlineAssistCommand(
            userId,
            textOrDefault(scenario.noteId(), properties.getNoteId() + "-" + safeId(scenario.id())),
            textOrDefault(scenario.selectedText(), defaultSelectedText()),
            textOrEmpty(scenario.contextBefore()),
            textOrEmpty(scenario.contextAfter()),
            scenario.action() == null ? InlineAssistAction.REWRITE : scenario.action(),
            textOrDefault(scenario.language(), "ko"),
            textOrEmpty(scenario.draftPrompt()),
            scenario.targetLength()
        ));
        return new ProbeResult(
            "writingStyle",
            "inline-assist-" + result.action().name().toLowerCase(Locale.ROOT),
            result.modelId(),
            styleInstructions,
            textOrEmpty(result.text()).trim(),
            null
        );
    }

    private JudgeEvaluation judge(
        StyleProfileQualityScenario scenario,
        String styleInstructions,
        String generatedText,
        String judgeModelId
    ) {
        AiChatResponse response = aiChatPort.generate(new AiChatRequest(
            judgeModelId,
            List.of(
                new AiChatMessage(AiRole.SYSTEM, """
                    You are an evaluator for BrainX LLM style-profile quality.
                    Return strict JSON only. No markdown fences.
                    JSON shape:
                    {
                      "scores": {
                        "taskCompliance": 1,
                        "styleAdherence": 1,
                        "readability": 1,
                        "overUnderStyling": 1,
                        "safetyAndFormat": 1
                      },
                      "passed": false,
                      "rationale": "short Korean rationale"
                    }
                    Higher scores are better. overUnderStyling=5 means balanced, not too weak or excessive.
                    """.strip()),
                new AiChatMessage(AiRole.USER, judgePrompt(scenario, styleInstructions, generatedText))
            )
        ));

        String rawResponse = textOrEmpty(response.content()).trim();
        try {
            JsonNode parsed = parseJson(rawResponse);
            Map<String, Object> result = objectMapper.convertValue(
                parsed,
                new TypeReference<Map<String, Object>>() {
                }
            );
            List<String> failures = judgeFailures(parsed);
            return new JudgeEvaluation(result, rawResponse, failures);
        } catch (Exception ex) {
            return new JudgeEvaluation(
                Map.of("parseError", ex.getMessage()),
                rawResponse,
                List.of("judge JSON parse failed: " + ex.getMessage())
            );
        }
    }

    private String judgePrompt(
        StyleProfileQualityScenario scenario,
        String styleInstructions,
        String generatedText
    ) {
        return """
            Scenario id: %s
            Scenario type: %s
            Task prompt or selected text:
            %s

            Expected style instructions:
            %s

            Rubric:
            %s

            Generated output:
            %s
            """.formatted(
            scenario.id(),
            textOrDefault(scenario.type(), "conversation"),
            textOrDefault(scenario.prompt(), scenario.selectedText()),
            textOrDefault(styleInstructions, "(empty style instructions)"),
            textOrDefault(scenario.rubric(), "Evaluate task compliance, style adherence, readability, and format safety."),
            generatedText
        );
    }

    private List<String> deterministicFailures(
        StyleProfileQualityScenario scenario,
        String generatedText,
        Map<String, Object> conversationTone
    ) {
        List<String> failures = new ArrayList<>();
        String text = textOrEmpty(generatedText);
        if (!StringUtils.hasText(text)) {
            failures.add("generated output is blank");
        }
        if (!Boolean.TRUE.equals(scenario.allowMarkdownFence()) && text.contains("```")) {
            failures.add("generated output contains markdown fence");
        }
        for (String marker : RAW_STYLE_KEY_MARKERS) {
            if (text.contains(marker)) {
                failures.add("generated output exposes raw style marker: " + marker);
            }
        }
        for (String fragment : nonNullList(scenario.answerMustNotContain())) {
            if (StringUtils.hasText(fragment) && text.contains(fragment)) {
                failures.add("generated output contains forbidden fragment: " + fragment);
            }
        }
        for (String fragment : nonNullList(scenario.answerMustContain())) {
            if (StringUtils.hasText(fragment) && !text.contains(fragment)) {
                failures.add("generated output is missing required fragment: " + fragment);
            }
        }
        if (isEmojiOff(conversationTone.get("emoji")) && containsEmoji(text)) {
            failures.add("generated output contains emoji while emoji preference is off");
        }
        return failures;
    }

    private List<String> judgeFailures(JsonNode parsed) {
        List<String> failures = new ArrayList<>();
        JsonNode scores = parsed.path("scores").isObject() ? parsed.path("scores") : parsed;
        requireMinimumScore(scores, "taskCompliance", failures);
        requireMinimumScore(scores, "styleAdherence", failures);
        requireMinimumScore(scores, "safetyAndFormat", failures);
        if (parsed.has("passed") && parsed.path("passed").isBoolean() && !parsed.path("passed").booleanValue()) {
            failures.add("judge marked scenario as failed");
        }
        return failures;
    }

    private void requireMinimumScore(JsonNode scores, String key, List<String> failures) {
        int score = score(scores.path(key));
        if (score < 4) {
            failures.add("judge " + key + " score below 4: " + score);
        }
    }

    private JsonNode parseJson(String rawResponse) throws IOException {
        String text = textOrEmpty(rawResponse).trim();
        int start = text.indexOf('{');
        int end = text.lastIndexOf('}');
        if (start < 0 || end < start) {
            throw new IOException("no JSON object found");
        }
        return objectMapper.readTree(text.substring(start, end + 1));
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

    private static Map<String, Object> allowedValues(Map<String, Object> values, Set<String> allowedKeys) {
        if (values == null || values.isEmpty()) {
            return Map.of();
        }
        Map<String, Object> allowed = new LinkedHashMap<>();
        for (String key : allowedKeys) {
            Object value = values.get(key);
            if (value != null) {
                allowed.put(key, value);
            }
        }
        return allowed;
    }

    private static int score(JsonNode node) {
        if (node.isInt()) {
            return node.intValue();
        }
        if (node.isNumber()) {
            return node.asInt();
        }
        if (node.isTextual()) {
            try {
                return Integer.parseInt(node.textValue().trim());
            } catch (NumberFormatException ignored) {
                return 0;
            }
        }
        return 0;
    }

    private static boolean containsEmoji(String text) {
        return text.codePoints().anyMatch(codePoint ->
            codePoint >= 0x1F300 && codePoint <= 0x1FAFF
                || codePoint >= 0x2600 && codePoint <= 0x27BF
        );
    }

    private static boolean isEmojiOff(Object value) {
        if (!(value instanceof String text) || !StringUtils.hasText(text)) {
            return false;
        }
        String normalized = text.trim().toLowerCase(Locale.ROOT);
        return normalized.contains("off")
            || normalized.contains("none")
            || normalized.contains("no emoji")
            || normalized.contains("쓰지")
            || normalized.contains("사용 안")
            || normalized.contains("사용하지");
    }

    private static String safeId(String value) {
        String id = textOrDefault(value, "scenario")
            .toLowerCase(Locale.ROOT)
            .replaceAll("[^a-z0-9_-]+", "-")
            .replaceAll("-{2,}", "-")
            .replaceAll("(^-|-$)", "");
        return StringUtils.hasText(id) ? id : "scenario";
    }

    private static List<String> nonNullList(List<String> values) {
        return values == null ? List.of() : values;
    }

    private static String textOrDefault(String value, String fallback) {
        return StringUtils.hasText(value) ? value.trim() : fallback;
    }

    private static String textOrEmpty(String value) {
        return value == null ? "" : value;
    }

    private static String defaultConversationPrompt() {
        return "BrainX 문체 설정이 실제 답변에 어떻게 반영되는지 사용자에게 설명해 주세요.";
    }

    private static String defaultSelectedText() {
        return "BrainX는 사용자의 지식 흐름을 이해하고 더 나은 다음 행동을 제안합니다.";
    }

    record StyleProfileQualityScenario(
        String id,
        String type,
        String userId,
        String noteId,
        String modelId,
        String judgeModelId,
        Map<String, Object> conversationTone,
        Map<String, Object> writingStyle,
        String prompt,
        InlineAssistAction action,
        String selectedText,
        String contextBefore,
        String contextAfter,
        String language,
        String draftPrompt,
        Integer targetLength,
        List<String> answerMustContain,
        List<String> answerMustNotContain,
        Boolean allowMarkdownFence,
        String rubric
    ) {
    }

    private record ProbeResult(
        String axis,
        String feature,
        String modelId,
        String styleInstructions,
        String generatedText,
        AiTokenUsage tokenUsage
    ) {
    }

    private record JudgeEvaluation(
        Map<String, Object> result,
        String rawResponse,
        List<String> failures
    ) {
    }

    public record StyleProfileQualityCliResponse(
        String scenarioId,
        String type,
        String userId,
        String axis,
        String feature,
        String modelId,
        String judgeModelId,
        String styleInstructions,
        String generatedText,
        AiTokenUsage tokenUsage,
        List<String> deterministicFailures,
        String judgeRawResponse,
        Map<String, Object> judgeResult,
        List<String> judgeFailures,
        List<String> failures,
        String status
    ) {
    }
}
