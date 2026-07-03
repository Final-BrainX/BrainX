package com.brainx.intelligence.infrastructure.dev.chatrouter;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.io.PrintStream;
import java.nio.charset.StandardCharsets;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.ConfigurableApplicationContext;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

import com.brainx.intelligence.chat.application.port.inbound.CreateChatThreadUseCase;
import com.brainx.intelligence.chat.application.port.inbound.CreateChatThreadUseCase.CreateChatThreadCommand;
import com.brainx.intelligence.chat.application.port.inbound.GetChatThreadUseCase;
import com.brainx.intelligence.chat.application.port.inbound.SendChatMessageUseCase;
import com.brainx.intelligence.chat.application.port.inbound.SendChatMessageUseCase.ChatStreamEvent;
import com.brainx.intelligence.chat.application.port.inbound.SendChatMessageUseCase.SendChatMessageCommand;
import com.brainx.intelligence.infrastructure.dev.rag.SampleRagProperties;
import com.brainx.intelligence.infrastructure.dev.rag.SampleRagService;
import com.fasterxml.jackson.databind.ObjectMapper;

@Component
@ConditionalOnProperty(prefix = "brainx.dev.chat-router", name = "enabled", havingValue = "true")
public class ChatRouterApplicationRunner implements ApplicationRunner {

    private final ChatRouterDevProperties properties;
    private final SampleRagProperties sampleRagProperties;
    private final SampleRagService sampleRagService;
    private final CreateChatThreadUseCase createChatThreadUseCase;
    private final SendChatMessageUseCase sendChatMessageUseCase;
    private final GetChatThreadUseCase getChatThreadUseCase;
    private final ObjectMapper objectMapper;
    private final ConfigurableApplicationContext applicationContext;

    public ChatRouterApplicationRunner(
        ChatRouterDevProperties properties,
        SampleRagProperties sampleRagProperties,
        SampleRagService sampleRagService,
        CreateChatThreadUseCase createChatThreadUseCase,
        SendChatMessageUseCase sendChatMessageUseCase,
        GetChatThreadUseCase getChatThreadUseCase,
        ObjectMapper objectMapper,
        ConfigurableApplicationContext applicationContext
    ) {
        this.properties = properties;
        this.sampleRagProperties = sampleRagProperties;
        this.sampleRagService = sampleRagService;
        this.createChatThreadUseCase = createChatThreadUseCase;
        this.sendChatMessageUseCase = sendChatMessageUseCase;
        this.getChatThreadUseCase = getChatThreadUseCase;
        this.objectMapper = objectMapper;
        this.applicationContext = applicationContext;
    }

    @Override
    public void run(ApplicationArguments args) throws Exception {
        try (BufferedReader reader = new BufferedReader(new InputStreamReader(System.in, StandardCharsets.UTF_8))) {
            runChat(reader, System.out);
        }
        exitSuccessfully();
    }

    void runChat(BufferedReader reader, PrintStream out) throws IOException {
        String command = normalizedCommand();
        if (command.equals("ingest-and-ask")) {
            configureSampleRagProperties();
            writeJson(out, sampleRagService.ingest());
        } else if (!command.equals("ask")) {
            throw new IllegalArgumentException("Unsupported chat router command: " + properties.getCommand());
        }

        if (StringUtils.hasText(properties.getQuery())) {
            writeJson(out, ask(properties.getQuery()));
            return;
        }

        while (true) {
            out.print("brainx-chat-router> ");
            String line = reader.readLine();
            if (line == null || line.equalsIgnoreCase("exit") || line.equalsIgnoreCase("quit")) {
                return;
            }
            if (line.isBlank()) {
                continue;
            }
            writeJson(out, ask(line));
        }
    }

    ChatRouterCliResponse ask(String query) {
        var thread = createChatThreadUseCase.createChatThread(new CreateChatThreadCommand(
            properties.getUserId(),
            properties.getDocumentGroupId(),
            titleFor(query),
            null,
            properties.getModelId()
        ));
        List<ChatStreamEvent> events = sendChatMessageUseCase.sendChatMessage(new SendChatMessageCommand(
            properties.getUserId(),
            thread.threadId(),
            query,
            Map.of("documentGroupId", properties.getDocumentGroupId()),
            Map.of("source", "WORKSPACE_CHAT", "mode", "NONE", "items", List.of()),
            properties.getModelId()
        )).collectList().block();

        String route = "";
        String routeReason = "";
        String routerModel = "";
        StringBuilder answer = new StringBuilder();
        String doneMessageId = "";
        for (ChatStreamEvent event : events == null ? List.<ChatStreamEvent>of() : events) {
            if (event.eventName().equals("route")) {
                route = stringValue(event.data().get("route"));
                routeReason = stringValue(event.data().get("reason"));
                routerModel = stringValue(event.data().get("routerModel"));
            } else if (event.eventName().equals("delta")) {
                answer.append(stringValue(event.data().get("text")));
            } else if (event.eventName().equals("done")) {
                doneMessageId = stringValue(event.data().get("messageId"));
            }
        }

        List<Map<String, Object>> citations = citations(thread.threadId(), doneMessageId);
        return new ChatRouterCliResponse(
            query,
            routerModel,
            route,
            routeReason,
            answer.toString(),
            citations,
            eventMaps(events)
        );
    }

    private List<Map<String, Object>> citations(String threadId, String doneMessageId) {
        if (!StringUtils.hasText(doneMessageId)) {
            return List.of();
        }
        var detail = getChatThreadUseCase.getChatThread(new GetChatThreadUseCase.GetChatThreadQuery(
            properties.getUserId(),
            threadId
        ));
        return detail.messages().stream()
            .filter(message -> doneMessageId.equals(stringValue(message.get("messageId"))))
            .findFirst()
            .map(message -> citationMaps(message.get("citations")))
            .orElse(List.of());
    }

    private static List<Map<String, Object>> citationMaps(Object citations) {
        if (!(citations instanceof List<?> items)) {
            return List.of();
        }
        return items.stream()
            .map(ChatRouterApplicationRunner::citationMap)
            .filter(map -> !map.isEmpty())
            .toList();
    }

    private static Map<String, Object> citationMap(Object value) {
        if (!(value instanceof Map<?, ?> item)) {
            return Map.of();
        }
        Map<String, Object> values = new LinkedHashMap<>();
        item.forEach((key, entryValue) -> values.put(key.toString(), entryValue));
        return values;
    }

    private static List<Map<String, Object>> eventMaps(List<ChatStreamEvent> events) {
        return (events == null ? List.<ChatStreamEvent>of() : events).stream()
            .map(event -> Map.<String, Object>of(
                "event", event.eventName(),
                "data", event.data()
            ))
            .toList();
    }

    private void configureSampleRagProperties() {
        sampleRagProperties.setDirectory(properties.getDirectory());
        sampleRagProperties.setUserId(properties.getUserId());
        sampleRagProperties.setDocumentGroupId(properties.getDocumentGroupId());
        sampleRagProperties.setFolderId(properties.getFolderId());
        sampleRagProperties.setTags(properties.getTags());
    }

    private String normalizedCommand() {
        return StringUtils.hasText(properties.getCommand()) ? properties.getCommand().trim().toLowerCase() : "ask";
    }

    private static String titleFor(String query) {
        String text = StringUtils.hasText(query) ? query.trim() : "Router chat";
        return text.length() <= 40 ? text : text.substring(0, 40);
    }

    private static String stringValue(Object value) {
        return value == null ? "" : value.toString();
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

    public record ChatRouterCliResponse(
        String query,
        String routerModel,
        String route,
        String routeReason,
        String answer,
        List<Map<String, Object>> citations,
        List<Map<String, Object>> events
    ) {
    }
}
