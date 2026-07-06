package com.brainx.intelligence.chat.domain;

import java.util.LinkedHashMap;
import java.util.Map;

public record ChatWebSource(
    String title,
    String url,
    String snippet,
    int rank
) {

    public ChatWebSource {
        title = title == null ? "" : title.trim();
        url = requireText(url, "url");
        snippet = snippet == null ? "" : snippet.trim();
        rank = Math.max(1, rank);
    }

    public Map<String, Object> toMap() {
        Map<String, Object> values = new LinkedHashMap<>();
        values.put("title", title);
        values.put("url", url);
        values.put("snippet", snippet);
        values.put("rank", rank);
        return values;
    }

    private static String requireText(String value, String name) {
        if (value == null || value.isBlank()) {
            throw new ChatDomainException(name + " must not be blank.");
        }
        return value.trim();
    }
}
