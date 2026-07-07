package com.brainx.intelligence.chat.application.usecase;

import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.atomic.AtomicBoolean;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.util.StringUtils;

import com.brainx.intelligence.chat.application.port.inbound.SendChatMessageUseCase.ChatStreamEvent;
import com.brainx.intelligence.chat.domain.ChatRouteDecision;
import com.brainx.intelligence.chat.domain.ChatWebSource;
import com.brainx.intelligence.shared.application.port.outbound.ExternalSearchPort;
import com.brainx.intelligence.shared.application.port.outbound.ExternalSearchPort.ExternalSearchRequest;
import com.brainx.intelligence.shared.application.port.outbound.ExternalSearchPort.ExternalSearchResponse;
import com.brainx.intelligence.shared.application.port.outbound.ExternalSearchPort.ExternalSearchSource;
import com.brainx.intelligence.shared.application.port.outbound.ExternalSearchPort.ExternalSearchStreamEvent;

import reactor.core.publisher.Flux;

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
        return resolveStream(userId, message, routeDecision)
            .filter(WebSearchResolution::completed)
            .next()
            .map(WebSearchResolution::context)
            .blockOptional()
            .orElseGet(WebSearchContext::none);
    }

    Flux<WebSearchResolution> resolveStream(String userId, String message, ChatRouteDecision routeDecision) {
        if (!routeDecision.requiresWebSearch()) {
            return Flux.just(WebSearchResolution.completed(WebSearchContext.none()));
        }
        String query = StringUtils.hasText(routeDecision.webSearchQuery()) ? routeDecision.webSearchQuery() : message;
        ExternalSearchRequest request = new ExternalSearchRequest(
            userId,
            query,
            null,
            DEFAULT_WEB_SEARCH_MAX_SOURCES,
            List.of(),
            List.of()
        );
        return Flux.defer(() -> {
            AtomicBoolean sourceEventEmitted = new AtomicBoolean(false);
            return externalSearchPort.searchStream(request)
                .flatMapIterable(event -> toResolutions(query, event, sourceEventEmitted));
        }).onErrorResume(exception -> {
            log.warn("External search failed for chat request.", exception);
            return Flux.just(WebSearchResolution.completed(WebSearchContext.unavailable(query)));
        });
    }

    private static List<WebSearchResolution> toResolutions(
        String query,
        ExternalSearchStreamEvent event,
        AtomicBoolean sourceEventEmitted
    ) {
        if (event == null) {
            return List.of();
        }
        if (event.progressEvent()) {
            return List.of(WebSearchResolution.event(ChatStreamEvent.webSearchProgress(
                event.status(),
                event.actionType(),
                StringUtils.hasText(event.query()) ? event.query() : query,
                event.message()
            )));
        }
        if (event.sourcesEvent()) {
            List<ChatWebSource> sources = toWebSources(event.sources());
            if (sources.isEmpty()) {
                return List.of();
            }
            sourceEventEmitted.set(true);
            return List.of(WebSearchResolution.event(ChatStreamEvent.webSources(
                StringUtils.hasText(event.query()) ? event.query() : query,
                sources.stream().map(ChatWebSource::toMap).toList()
            )));
        }
        if (!event.completedEvent()) {
            return List.of();
        }
        WebSearchContext context = contextFromResponse(query, event.response());
        List<WebSearchResolution> resolutions = new ArrayList<>();
        if (context.available() && !context.sources().isEmpty() && !sourceEventEmitted.getAndSet(true)) {
            resolutions.add(WebSearchResolution.event(ChatStreamEvent.webSources(
                context.query(),
                context.sources().stream().map(ChatWebSource::toMap).toList()
            )));
        }
        resolutions.add(WebSearchResolution.completed(context));
        return resolutions;
    }

    private static WebSearchContext contextFromResponse(String query, ExternalSearchResponse response) {
        if (response == null || NOOP_SEARCH_PROVIDER.equalsIgnoreCase(response.provider())) {
            return WebSearchContext.unavailable(query);
        }
        List<ChatWebSource> sources = toWebSources(response.sources());
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
    }

    private static List<ChatWebSource> toWebSources(List<ExternalSearchSource> sources) {
        return sources.stream()
            .map(ChatWebSearchResolver::toWebSource)
            .toList();
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

    record WebSearchResolution(
        ChatStreamEvent event,
        WebSearchContext context
    ) {

        static WebSearchResolution event(ChatStreamEvent event) {
            return new WebSearchResolution(event, null);
        }

        static WebSearchResolution completed(WebSearchContext context) {
            return new WebSearchResolution(null, context);
        }

        boolean completed() {
            return context != null;
        }
    }
}
