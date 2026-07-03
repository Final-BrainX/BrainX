package com.brainx.mcp.tool;

import org.springframework.ai.tool.ToolCallbackProvider;
import org.springframework.ai.tool.method.MethodToolCallbackProvider;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class McpToolConfig {

    @Bean
    ToolCallbackProvider brainxMcpTools(BrainxWhoamiTool whoamiTool) {
        return MethodToolCallbackProvider.builder()
            .toolObjects(whoamiTool)
            .build();
    }
}
