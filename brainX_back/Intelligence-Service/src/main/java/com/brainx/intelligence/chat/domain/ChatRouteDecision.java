package com.brainx.intelligence.chat.domain;

public record ChatRouteDecision(
    ChatRoute route,
    String reason,
    String routerModel,
    boolean requiresWebSearch,
    String webSearchQuery
) {

    public ChatRouteDecision {
        route = route == null ? ChatRoute.OUT_OF_SCOPE : route;
        reason = reason == null ? "" : reason.trim();
        routerModel = routerModel == null ? "" : routerModel.trim();
        webSearchQuery = webSearchQuery == null || webSearchQuery.isBlank() ? null : webSearchQuery.trim();
    }

    public ChatRouteDecision(ChatRoute route, String reason, String routerModel) {
        this(route, reason, routerModel, false, null);
    }

    public static ChatRouteDecision outOfScope(String reason, String routerModel) {
        return new ChatRouteDecision(ChatRoute.OUT_OF_SCOPE, reason, routerModel, false, null);
    }
}
