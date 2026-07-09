package com.brainx.commerce.service;

import java.util.List;
import java.util.Map;

/**
 * Intelligence-Service의 featureId(자유 문자열, enum 아님)를 대시보드 UI 카테고리로
 * 묶는다. 신규 featureId가 추가돼도 매핑이 없으면 조용히 사라지지 않고 "기타"로 노출된다.
 */
final class TokenUsageFeatureLabels {
    private TokenUsageFeatureLabels() {
    }

    static final String AI_WRITING_ASSIST = "AI 글쓰기 도우미";
    static final String SEMANTIC_SEARCH = "시맨틱 검색";
    static final String AUTO_TAG_ORGANIZATION = "자동 태그 정리";
    static final String AUTO_SUMMARY = "자동 요약";
    static final String AI_CHATBOT = "AI 챗봇";
    static final String OTHER = "기타";

    /**
     * 대시보드에 항상 노출할 고정 카테고리. 이번 달 사용 이력이 없어도 0으로 표시되도록
     * {@link com.brainx.commerce.service.TokenUsageService}가 이 목록으로 기본값을 채운다.
     * "기타"는 미분류 featureId가 실제로 생겼을 때만 노출되는 예외 버킷이라 제외한다.
     */
    static final List<String> KNOWN_LABELS = List.of(
            AI_CHATBOT,
            AI_WRITING_ASSIST,
            SEMANTIC_SEARCH,
            AUTO_TAG_ORGANIZATION,
            AUTO_SUMMARY
    );

    private static final Map<String, String> LABELS_BY_FEATURE_ID = Map.ofEntries(
            Map.entry("inline-assist-chat", AI_WRITING_ASSIST),
            Map.entry("insight-report-chat", AI_CHATBOT),
            Map.entry("note-search-index-embedding", SEMANTIC_SEARCH),
            Map.entry("note-search-query-embedding", SEMANTIC_SEARCH),
            Map.entry("rag-chat", AI_CHATBOT),
            Map.entry("chat-router-classifier", AI_CHATBOT),
            Map.entry("folder-organization", AUTO_TAG_ORGANIZATION),
            Map.entry("note-auto-link-vector-refine-chat", AUTO_TAG_ORGANIZATION),
            Map.entry("note-auto-link-llm-only-chat", AUTO_TAG_ORGANIZATION),
            Map.entry("note-auto-link-relation-verifier-chat", AUTO_TAG_ORGANIZATION),
            Map.entry("ai-clustering-chat", AUTO_TAG_ORGANIZATION),
            Map.entry("bridge-concepts", AUTO_TAG_ORGANIZATION),
            Map.entry("note-summary-chat", AUTO_SUMMARY)
    );

    static String labelFor(String featureId) {
        return LABELS_BY_FEATURE_ID.getOrDefault(featureId, OTHER);
    }
}
