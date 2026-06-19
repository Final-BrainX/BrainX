package com.brainx.intelligence.infrastructure.dev.rag;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;

import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.ConfigurableApplicationContext;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

import com.fasterxml.jackson.databind.ObjectMapper;

@Component
@ConditionalOnProperty(prefix = "brainx.dev.sample-rag", name = "enabled", havingValue = "true")
public class SampleRagApplicationRunner implements ApplicationRunner {

    private final SampleRagProperties properties;
    private final SampleRagService sampleRagService;
    private final ObjectMapper objectMapper;
    private final ConfigurableApplicationContext applicationContext;

    public SampleRagApplicationRunner(
        SampleRagProperties properties,
        SampleRagService sampleRagService,
        ObjectMapper objectMapper,
        ConfigurableApplicationContext applicationContext
    ) {
        this.properties = properties;
        this.sampleRagService = sampleRagService;
        this.objectMapper = objectMapper;
        this.applicationContext = applicationContext;
    }

    @Override
    public void run(ApplicationArguments args) throws Exception {
        try {
            switch (normalizedCommand()) {
                case "ingest" -> writeJson(sampleRagService.ingest());
                case "ask" -> ask();
                case "ingest-and-ask" -> {
                    writeJson(sampleRagService.ingest());
                    ask();
                }
                default -> throw new IllegalArgumentException("Unsupported sample RAG command: " + properties.getCommand());
            }
        } finally {
            applicationContext.close();
        }
    }

    private String normalizedCommand() {
        return StringUtils.hasText(properties.getCommand()) ? properties.getCommand().trim().toLowerCase() : "ingest";
    }

    private void ask() throws IOException {
        if (StringUtils.hasText(properties.getQuery())) {
            writeJson(sampleRagService.ask(properties.getQuery()));
            return;
        }

        try (BufferedReader reader = new BufferedReader(new InputStreamReader(System.in, StandardCharsets.UTF_8))) {
            String line;
            while (true) {
                System.out.print("brainx-rag> ");
                line = reader.readLine();
                if (line == null || line.equalsIgnoreCase("exit") || line.equalsIgnoreCase("quit")) {
                    return;
                }
                if (line.isBlank()) {
                    continue;
                }
                writeJson(sampleRagService.ask(line));
            }
        }
    }

    private void writeJson(Object value) throws IOException {
        System.out.println(objectMapper.writerWithDefaultPrettyPrinter().writeValueAsString(value));
    }
}
