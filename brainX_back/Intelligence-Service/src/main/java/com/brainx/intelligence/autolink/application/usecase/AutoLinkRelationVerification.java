package com.brainx.intelligence.autolink.application.usecase;

record AutoLinkRelationVerification(
    String relationType,
    double confidence,
    String reason
) {
}
