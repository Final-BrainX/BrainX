package com.brainx.commerce.service;

import java.util.Map;

/**
 * Intelligence-Service의 featureId(자유 문자열, enum 아님)를 대시보드 UI가 요구하는
 * 4개 카테고리 + 기타(fallback)로 묶는다. 신규 featureId가 추가돼도 매핑이 없으면
 * 조용히 사라지지 않고 "기타"로 노출된다.
 */
final class TokenUsageFeatureLabels {
    private TokenUsageFeatureLabels() {
    }

    static final String AI_WRITING_ASSIST = "AI 글쓰기 도우미";
    static final String AUTO_SUMMARY = "자동 요약";
    static final String SEMANTIC_SEARCH = "시맨틱 검색";
    static final String AUTO_TAG_ORGANIZATION = "자동 태그 정리";
    static final String OTHER = "기타";

    private static final Map<String, String> LABELS_BY_FEATURE_ID = Map.ofEntries(
            Map.entry("inline-assist-chat", AI_WRITING_ASSIST),
            Map.entry("insight-report-chat", AUTO_SUMMARY),
            Map.entry("note-search-index-embedding", SEMANTIC_SEARCH),
            Map.entry("note-search-query-embedding", SEMANTIC_SEARCH),
            Map.entry("rag-chat", SEMANTIC_SEARCH),
            Map.entry("folder-organization", AUTO_TAG_ORGANIZATION),
            Map.entry("note-auto-link-vector-refine-chat", AUTO_TAG_ORGANIZATION),
            Map.entry("note-auto-link-llm-only-chat", AUTO_TAG_ORGANIZATION),
            Map.entry("note-auto-link-relation-verifier-chat", AUTO_TAG_ORGANIZATION),
            Map.entry("ai-clustering-chat", AUTO_TAG_ORGANIZATION),
            Map.entry("bridge-concepts", AUTO_TAG_ORGANIZATION),
            Map.entry("link-suggestions", AUTO_TAG_ORGANIZATION)
    );

    static String labelFor(String featureId) {
        return LABELS_BY_FEATURE_ID.getOrDefault(featureId, OTHER);
    }
}
