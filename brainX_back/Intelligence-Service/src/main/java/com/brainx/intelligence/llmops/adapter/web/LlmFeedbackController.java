package com.brainx.intelligence.llmops.adapter.web;

import java.security.Principal;
import java.time.Instant;

import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

import com.brainx.intelligence.infrastructure.web.ApiSuccessResponse;
import com.brainx.intelligence.llmops.application.service.LlmFeedbackService;
import com.brainx.intelligence.llmops.domain.LlmFeedback;
import com.brainx.intelligence.llmops.domain.LlmFeedbackRating;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

@RestController
@Validated
public class LlmFeedbackController {

    private final LlmFeedbackService feedbackService;

    public LlmFeedbackController(LlmFeedbackService feedbackService) {
        this.feedbackService = feedbackService;
    }

    @PutMapping("/api/v1/ai/llm-feedback")
    public ApiSuccessResponse<LlmFeedbackData> submitFeedback(
        Principal principal,
        @Valid @RequestBody LlmFeedbackRequest request
    ) {
        return ApiSuccessResponse.ok(toData(feedbackService.submitFeedback(
            userId(principal),
            request.llmRunId(),
            request.rating(),
            request.reasonCode(),
            request.comment()
        )));
    }

    private static LlmFeedbackData toData(LlmFeedback feedback) {
        return new LlmFeedbackData(
            feedback.feedbackId(),
            feedback.llmRunId(),
            feedback.rating(),
            feedback.reasonCode(),
            feedback.comment(),
            feedback.createdAt(),
            feedback.updatedAt()
        );
    }

    private static String userId(Principal principal) {
        if (principal != null && principal.getName() != null && !principal.getName().isBlank()) {
            return principal.getName();
        }
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        if (authentication != null && authentication.getName() != null && !authentication.getName().isBlank()) {
            return authentication.getName();
        }
        throw new IllegalArgumentException("Authenticated user is required.");
    }

    record LlmFeedbackRequest(
        @NotBlank String llmRunId,
        @NotNull LlmFeedbackRating rating,
        String reasonCode,
        String comment
    ) {
    }

    record LlmFeedbackData(
        String feedbackId,
        String llmRunId,
        LlmFeedbackRating rating,
        String reasonCode,
        String comment,
        Instant createdAt,
        Instant updatedAt
    ) {
    }
}
