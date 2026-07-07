package com.brainx.intelligence.agent.application.usecase;

import java.util.Map;

import org.springframework.util.StringUtils;

import com.brainx.intelligence.agent.domain.AgentDomainException;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;

final class AgentPlanParser {

    private static final TypeReference<Map<String, Object>> MAP_TYPE = new TypeReference<>() {
    };

    private final ObjectMapper objectMapper;

    AgentPlanParser(ObjectMapper objectMapper) {
        this.objectMapper = objectMapper;
    }

    Map<String, Object> parseJson(String content) {
        String json = extractJson(content);
        try {
            return objectMapper.readValue(json, MAP_TYPE);
        } catch (JsonProcessingException exception) {
            throw new AgentDomainException("Agent planner returned invalid JSON.");
        }
    }

    private static String extractJson(String content) {
        if (!StringUtils.hasText(content)) {
            throw new AgentDomainException("Agent planner returned an empty response.");
        }
        int start = content.indexOf('{');
        int end = content.lastIndexOf('}');
        if (start < 0 || end < start) {
            throw new AgentDomainException("Agent planner returned no JSON object.");
        }
        return content.substring(start, end + 1);
    }
}
