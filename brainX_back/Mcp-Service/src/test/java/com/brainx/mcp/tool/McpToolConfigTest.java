package com.brainx.mcp.tool;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.Arrays;
import org.junit.jupiter.api.Test;
import org.springframework.ai.tool.ToolCallbackProvider;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.TestPropertySource;

@SpringBootTest
@ActiveProfiles("test")
@TestPropertySource(properties = "brainx.jwt.secret=test-jwt-secret-for-mcp-service")
class McpToolConfigTest {

    @Autowired
    private ToolCallbackProvider toolCallbackProvider;

    @Test
    void registersBrainxMcpTools() {
        assertThat(Arrays.stream(toolCallbackProvider.getToolCallbacks())
            .map(callback -> callback.getToolDefinition().name()))
            .contains(
                "brainx_whoami",
                "brainx_search_notes",
                "brainx_ask_notes",
                "brainx_get_note",
                "brainx_create_note"
            );
    }
}
