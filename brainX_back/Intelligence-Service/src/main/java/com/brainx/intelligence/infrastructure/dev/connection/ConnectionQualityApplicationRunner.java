package com.brainx.intelligence.infrastructure.dev.connection;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.io.PrintStream;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.ArrayList;
import java.util.HexFormat;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;

import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.ConfigurableApplicationContext;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

import com.brainx.intelligence.connection.application.port.inbound.CreateBridgeConceptsUseCase;
import com.brainx.intelligence.connection.application.port.inbound.CreateBridgeConceptsUseCase.BridgeConceptRecommendation;
import com.brainx.intelligence.connection.application.port.inbound.CreateBridgeConceptsUseCase.BridgeConceptsCommand;
import com.brainx.intelligence.connection.application.port.inbound.CreateLinkSuggestionsUseCase;
import com.brainx.intelligence.connection.application.port.inbound.CreateLinkSuggestionsUseCase.LinkSuggestionResult;
import com.brainx.intelligence.connection.application.port.inbound.CreateLinkSuggestionsUseCase.LinkSuggestionsCommand;
import com.brainx.intelligence.infrastructure.dev.rag.SampleRagProperties;
import com.brainx.intelligence.infrastructure.dev.rag.SampleRagService;
import com.fasterxml.jackson.databind.ObjectMapper;

@Component
@ConditionalOnProperty(prefix = "brainx.dev.connection-quality", name = "enabled", havingValue = "true")
public class ConnectionQualityApplicationRunner implements ApplicationRunner {

    private final ConnectionQualityDevProperties properties;
    private final SampleRagProperties sampleRagProperties;
    private final SampleRagService sampleRagService;
    private final CreateLinkSuggestionsUseCase createLinkSuggestionsUseCase;
    private final CreateBridgeConceptsUseCase createBridgeConceptsUseCase;
    private final ObjectMapper objectMapper;
    private final ConfigurableApplicationContext applicationContext;

    public ConnectionQualityApplicationRunner(
        ConnectionQualityDevProperties properties,
        SampleRagProperties sampleRagProperties,
        SampleRagService sampleRagService,
        CreateLinkSuggestionsUseCase createLinkSuggestionsUseCase,
        CreateBridgeConceptsUseCase createBridgeConceptsUseCase,
        ObjectMapper objectMapper,
        ConfigurableApplicationContext applicationContext
    ) {
        this.properties = properties;
        this.sampleRagProperties = sampleRagProperties;
        this.sampleRagService = sampleRagService;
        this.createLinkSuggestionsUseCase = createLinkSuggestionsUseCase;
        this.createBridgeConceptsUseCase = createBridgeConceptsUseCase;
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
        String command = normalizedCommand();
        if (command.equals("ingest-and-run")) {
            configureSampleRagProperties();
            writeJson(out, new ConnectionQualityIngestResponse("ingest", sampleRagService.ingest()));
        } else if (!command.equals("run")) {
            throw new IllegalArgumentException("Unsupported connection quality command: " + properties.getCommand());
        }

        if (StringUtils.hasText(properties.getType())) {
            writeJson(out, runScenario(scenarioFromProperties()));
            return;
        }

        while (true) {
            out.print("brainx-connection-quality> ");
            String line = reader.readLine();
            if (line == null || line.equalsIgnoreCase("exit") || line.equalsIgnoreCase("quit")) {
                return;
            }
            if (line.isBlank()) {
                continue;
            }
            writeJson(out, runScenario(objectMapper.readValue(line, ConnectionQualityScenario.class)));
        }
    }

    private ConnectionQualityCliResponse runScenario(ConnectionQualityScenario scenario) {
        String type = StringUtils.hasText(scenario.type()) ? scenario.type().trim().toLowerCase() : "";
        return switch (type) {
            case "link-suggestions" -> linkSuggestions(scenario);
            case "bridge-concepts" -> bridgeConcepts(scenario);
            default -> throw new IllegalArgumentException("Unsupported connection quality scenario type: " + scenario.type());
        };
    }

    private ConnectionQualityCliResponse linkSuggestions(ConnectionQualityScenario scenario) {
        String noteId = textOrDefault(scenario.sourceNoteId(), noteIdFromPath(scenario.sourcePath()));
        var result = createLinkSuggestionsUseCase.createLinkSuggestions(new LinkSuggestionsCommand(
            textOrDefault(scenario.userId(), properties.getUserId()),
            properties.getDocumentGroupId(),
            noteId
        ));
        List<String> failures = validateLinkSuggestions(scenario, result.suggestions());
        return new ConnectionQualityCliResponse(
            scenario.id(),
            "link-suggestions",
            noteId,
            List.of(),
            result.suggestions(),
            null,
            validationStatus(failures),
            failures
        );
    }

    private ConnectionQualityCliResponse bridgeConcepts(ConnectionQualityScenario scenario) {
        List<String> noteIds = noteIds(scenario);
        var result = createBridgeConceptsUseCase.createBridgeConcepts(new BridgeConceptsCommand(
            textOrDefault(scenario.userId(), properties.getUserId()),
            properties.getDocumentGroupId(),
            noteIds
        ));
        List<String> failures = validateBridgeConcepts(scenario, result.recommendations());
        return new ConnectionQualityCliResponse(
            scenario.id(),
            "bridge-concepts",
            null,
            noteIds,
            null,
            result.recommendations(),
            validationStatus(failures),
            failures
        );
    }

    private List<String> noteIds(ConnectionQualityScenario scenario) {
        if (scenario.noteIds() != null && !scenario.noteIds().isEmpty()) {
            return scenario.noteIds();
        }
        List<String> paths = scenario.notePaths() == null ? List.of() : scenario.notePaths();
        return paths.stream()
            .map(ConnectionQualityApplicationRunner::sampleNoteId)
            .toList();
    }

    private List<String> validateLinkSuggestions(
        ConnectionQualityScenario scenario,
        List<LinkSuggestionResult> suggestions
    ) {
        List<String> failures = new ArrayList<>();
        int minCount = scenario.minSuggestionCount() == null ? 0 : Math.max(0, scenario.minSuggestionCount());
        if (suggestions.size() < minCount) {
            failures.add("suggestion count " + suggestions.size() + " is below " + minCount);
        }
        double minScore = scenario.minScore() == null ? 0.0d : scenario.minScore();
        for (LinkSuggestionResult suggestion : suggestions) {
            if (suggestion.score() < minScore) {
                failures.add("suggestion score is below " + minScore + ": " + suggestion.suggestionId());
            }
            if (Boolean.TRUE.equals(scenario.requireReason()) && !StringUtils.hasText(suggestion.reason())) {
                failures.add("suggestion reason is blank: " + suggestion.suggestionId());
            }
        }
        return failures;
    }

    private static List<String> validateBridgeConcepts(
        ConnectionQualityScenario scenario,
        List<BridgeConceptRecommendation> recommendations
    ) {
        List<String> failures = new ArrayList<>();
        int minCount = scenario.minRecommendationCount() == null ? 0 : Math.max(0, scenario.minRecommendationCount());
        if (recommendations.size() < minCount) {
            failures.add("recommendation count " + recommendations.size() + " is below " + minCount);
        }
        Set<String> ids = new LinkedHashSet<>();
        Set<String> titles = new LinkedHashSet<>();
        for (BridgeConceptRecommendation recommendation : recommendations) {
            String bridgeReason = recommendation.bridgeReason() == null ? "" : recommendation.bridgeReason();
            if (!ids.add(recommendation.noteId())) {
                failures.add("duplicate recommendation id: " + recommendation.noteId());
            }
            if (!titles.add(normalizeTitle(recommendation.title()))) {
                failures.add("duplicate recommendation title: " + recommendation.title());
            }
            if (Boolean.TRUE.equals(scenario.requireReason()) && !StringUtils.hasText(bridgeReason)) {
                failures.add("recommendation reason is blank: " + recommendation.noteId());
            }
            for (String requiredLink : requiredBridgeWikiLinks(scenario)) {
                if (!bridgeReason.contains(requiredLink)) {
                    failures.add("recommendation reason is missing bridge wiki link " + requiredLink + ": " + recommendation.noteId());
                }
            }
        }
        return failures;
    }

    private void configureSampleRagProperties() {
        sampleRagProperties.setDirectory(properties.getDirectory());
        sampleRagProperties.setUserId(properties.getUserId());
        sampleRagProperties.setDocumentGroupId(properties.getDocumentGroupId());
        sampleRagProperties.setFolderId(properties.getFolderId());
        sampleRagProperties.setTags(properties.getTags());
    }

    private ConnectionQualityScenario scenarioFromProperties() {
        return new ConnectionQualityScenario(
            "property",
            properties.getType(),
            properties.getUserId(),
            properties.getSourcePath(),
            properties.getSourceNoteId(),
            properties.getNotePaths(),
            properties.getNoteIds(),
            1,
            0.0d,
            1,
            true,
            List.of()
        );
    }

    private String normalizedCommand() {
        return StringUtils.hasText(properties.getCommand()) ? properties.getCommand().trim().toLowerCase() : "run";
    }

    private String noteIdFromPath(String path) {
        String value = textOrDefault(path, properties.getSourcePath());
        if (!StringUtils.hasText(value)) {
            throw new IllegalArgumentException("sourcePath or sourceNoteId is required for link-suggestions.");
        }
        return sampleNoteId(value);
    }

    static String sampleNoteId(String relativePath) {
        String normalized = relativePath.replace('\\', '/').trim();
        return "sample-" + sha256(normalized).substring(0, 16);
    }

    private static String sha256(String value) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            return HexFormat.of().formatHex(digest.digest(value.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException("SHA-256 is not available.", exception);
        }
    }

    private static String textOrDefault(String value, String fallback) {
        return StringUtils.hasText(value) ? value.trim() : fallback;
    }

    private static String validationStatus(List<String> failures) {
        return failures.isEmpty() ? "passed" : "failed";
    }

    private static String normalizeTitle(String title) {
        return title == null ? "" : title.replaceAll("\\s+", "").trim().toLowerCase();
    }

    private static List<String> requiredBridgeWikiLinks(ConnectionQualityScenario scenario) {
        if (scenario.requiredBridgeWikiLinks() == null) {
            return List.of();
        }
        return scenario.requiredBridgeWikiLinks().stream()
            .filter(StringUtils::hasText)
            .map(String::trim)
            .toList();
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

    record ConnectionQualityScenario(
        String id,
        String type,
        String userId,
        String sourcePath,
        String sourceNoteId,
        List<String> notePaths,
        List<String> noteIds,
        Integer minSuggestionCount,
        Double minScore,
        Integer minRecommendationCount,
        Boolean requireReason,
        List<String> requiredBridgeWikiLinks
    ) {
    }

    public record ConnectionQualityIngestResponse(
        String type,
        Object result
    ) {
    }

    public record ConnectionQualityCliResponse(
        String scenarioId,
        String type,
        String sourceNoteId,
        List<String> noteIds,
        List<LinkSuggestionResult> suggestions,
        List<BridgeConceptRecommendation> recommendations,
        String status,
        List<String> failures
    ) {
    }
}
