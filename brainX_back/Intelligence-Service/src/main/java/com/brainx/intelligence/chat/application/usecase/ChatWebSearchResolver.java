package com.brainx.intelligence.chat.application.usecase;

import java.util.List;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.util.StringUtils;

import com.brainx.intelligence.chat.domain.ChatRouteDecision;
import com.brainx.intelligence.chat.domain.ChatWebSource;
import com.brainx.intelligence.shared.application.port.outbound.ExternalSearchPort;
import com.brainx.intelligence.shared.application.port.outbound.ExternalSearchPort.ExternalSearchRequest;
import com.brainx.intelligence.shared.application.port.outbound.ExternalSearchPort.ExternalSearchResponse;
import com.brainx.intelligence.shared.application.port.outbound.ExternalSearchPort.ExternalSearchSource;

final class ChatWebSearchResolver {

    private static final Logger log = LoggerFactory.getLogger(ChatWebSearchResolver.class);
    private static final int DEFAULT_WEB_SEARCH_MAX_SOURCES = 8;
    private static final int WEB_SOURCE_SNIPPET_LENGTH = 500;
    private static final String NOOP_SEARCH_PROVIDER = "none";

    private final ExternalSearchPort externalSearchPort;

    ChatWebSearchResolver(ExternalSearchPort externalSearchPort) {
        this.externalSearchPort = externalSearchPort;
    }

    WebSearchContext resolve(String userId, String message, ChatRouteDecision routeDecision) {
        if (!routeDecision.requiresWebSearch()) {
            return WebSearchContext.none();
        }
        String query = StringUtils.hasText(routeDecision.webSearchQuery()) ? routeDecision.webSearchQuery() : message;
        try {
            ExternalSearchResponse response = externalSearchPort.search(new ExternalSearchRequest(
                userId,
                query,
                null,
                DEFAULT_WEB_SEARCH_MAX_SOURCES,
                List.of(),
                List.of()
            ));
            if (response == null || NOOP_SEARCH_PROVIDER.equalsIgnoreCase(response.provider())) {
                return WebSearchContext.unavailable(query);
            }
            List<ChatWebSource> sources = response.sources().stream()
                .map(ChatWebSearchResolver::toWebSource)
                .toList();
            if (!StringUtils.hasText(response.answer()) && sources.isEmpty()) {
                return WebSearchContext.unavailable(query);
            }
            return new WebSearchContext(
                true,
                query,
                response.answer(),
                sources,
                response.provider(),
                response.modelId(),
                response.responseId()
            );
        } catch (RuntimeException exception) {
            log.warn("External search failed for chat request.", exception);
            return WebSearchContext.unavailable(query);
        }
    }

    private static ChatWebSource toWebSource(ExternalSearchSource source) {
        return new ChatWebSource(
            source.title(),
            source.url(),
            webSourceSnippet(source.snippet()),
            source.rank()
        );
    }

    private static String webSourceSnippet(String text) {
        if (text == null || text.length() <= WEB_SOURCE_SNIPPET_LENGTH) {
            return text == null ? "" : text;
        }
        return text.substring(0, WEB_SOURCE_SNIPPET_LENGTH).trim();
    }
}
