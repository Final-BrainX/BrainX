package com.brainx.intelligence.infrastructure.search;

import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;

import org.springframework.util.StringUtils;

import com.brainx.intelligence.shared.application.port.outbound.ExternalSearchPort.ExternalSearchRequest;

final class OpenAiExternalSearchRequestFactory {

    static final String RESPONSES_PATH = "/v1/responses";
    private static final String WEB_SEARCH_TOOL = "web_search";
    private static final String SOURCES_INCLUDE = "web_search_call.action.sources";
    private static final int MAX_DOMAIN_FILTERS = 100;

    Map<String, Object> requestBody(ExternalSearchRequest request, String modelId) {
        Map<String, Object> webSearchTool = new LinkedHashMap<>();
        webSearchTool.put("type", WEB_SEARCH_TOOL);
        Map<String, Object> filters = filters(request.allowedDomains(), request.blockedDomains());
        if (!filters.isEmpty()) {
            webSearchTool.put("filters", filters);
        }

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("model", modelId);
        body.put("tools", List.of(webSearchTool));
        body.put("tool_choice", "required");
        body.put("include", List.of(SOURCES_INCLUDE));
        body.put("input", request.query());
        return body;
    }

    private static Map<String, Object> filters(List<String> allowedDomains, List<String> blockedDomains) {
        List<String> allowed = normalizeDomains(allowedDomains);
        List<String> blocked = normalizeDomains(blockedDomains);
        if (!allowed.isEmpty() && !blocked.isEmpty()) {
            throw new IllegalArgumentException("allowedDomains and blockedDomains cannot both be set.");
        }

        Map<String, Object> filters = new LinkedHashMap<>();
        if (!allowed.isEmpty()) {
            filters.put("allowed_domains", allowed);
        } else if (!blocked.isEmpty()) {
            filters.put("blocked_domains", blocked);
        }
        return filters;
    }

    private static List<String> normalizeDomains(List<String> domains) {
        if (domains == null || domains.isEmpty()) {
            return List.of();
        }
        LinkedHashSet<String> normalized = new LinkedHashSet<>();
        for (String value : domains) {
            String domain = normalizeDomain(value);
            if (StringUtils.hasText(domain)) {
                normalized.add(domain);
            }
            if (normalized.size() >= MAX_DOMAIN_FILTERS) {
                break;
            }
        }
        return List.copyOf(normalized);
    }

    private static String normalizeDomain(String value) {
        if (!StringUtils.hasText(value)) {
            return "";
        }
        String domain = value.trim()
            .replaceFirst("^[a-zA-Z][a-zA-Z0-9+.-]*://", "")
            .toLowerCase(Locale.ROOT);
        int slash = domain.indexOf('/');
        if (slash >= 0) {
            domain = domain.substring(0, slash);
        }
        int query = domain.indexOf('?');
        if (query >= 0) {
            domain = domain.substring(0, query);
        }
        int fragment = domain.indexOf('#');
        if (fragment >= 0) {
            domain = domain.substring(0, fragment);
        }
        int port = domain.indexOf(':');
        if (port >= 0) {
            domain = domain.substring(0, port);
        }
        return domain;
    }
}
