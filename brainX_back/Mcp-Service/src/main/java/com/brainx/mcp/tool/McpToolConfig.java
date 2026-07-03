package com.brainx.mcp.tool;

import org.springframework.ai.tool.ToolCallbackProvider;
import org.springframework.ai.tool.method.MethodToolCallbackProvider;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class McpToolConfig {

    @Bean
    ToolCallbackProvider brainxMcpTools(BrainxWhoamiTool whoamiTool, BrainxNoteTool noteTool) {
        return MethodToolCallbackProvider.builder()
            .toolObjects(whoamiTool, noteTool)
            .build();
    }
}
