package com.brainx.intelligence.insight.application.usecase;

import java.util.List;

import com.brainx.intelligence.insight.domain.InsightRecommendation;

record ParsedInsight(
    String summary,
    List<String> knowledgeGaps,
    List<InsightRecommendation> recommendations
) {
}
