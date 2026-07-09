package com.brainx.intelligence.infrastructure.web;

import java.io.IOException;

import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.validation.BindException;
import org.springframework.web.method.annotation.HandlerMethodValidationException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.validation.ConstraintViolationException;
import jakarta.servlet.http.HttpServletResponse;

import com.brainx.intelligence.agent.domain.AgentConflictException;
import com.brainx.intelligence.agent.domain.AgentDomainException;
import com.brainx.intelligence.agent.domain.AgentNotFoundException;
import com.brainx.intelligence.chat.domain.ChatDomainException;
import com.brainx.intelligence.chat.domain.ChatConflictException;
import com.brainx.intelligence.chat.domain.ChatNotFoundException;
import com.brainx.intelligence.clustering.domain.ClusteringConflictException;
import com.brainx.intelligence.clustering.domain.ClusteringDomainException;
import com.brainx.intelligence.clustering.domain.ClusteringForbiddenException;
import com.brainx.intelligence.clustering.domain.ClusteringNotFoundException;
import com.brainx.intelligence.connection.domain.ConnectionConflictException;
import com.brainx.intelligence.connection.domain.ConnectionForbiddenException;
import com.brainx.intelligence.connection.domain.ConnectionNotFoundException;
import com.brainx.intelligence.connection.domain.ConnectionProviderUnavailableException;
import com.brainx.intelligence.exploration.domain.ExplorationDomainException;
import com.brainx.intelligence.exploration.domain.ExplorationInsufficientContentException;
import com.brainx.intelligence.exploration.domain.ExplorationNotFoundException;
import com.brainx.intelligence.insight.domain.InsightConflictException;
import com.brainx.intelligence.insight.domain.InsightDomainException;
import com.brainx.intelligence.insight.domain.InsightForbiddenException;
import com.brainx.intelligence.insight.domain.InsightNotFoundException;
import com.brainx.intelligence.llmops.domain.LlmOpsNotFoundException;
import com.brainx.intelligence.organization.domain.OrganizationConflictException;
import com.brainx.intelligence.organization.domain.OrganizationDomainException;
import com.brainx.intelligence.organization.domain.OrganizationForbiddenException;
import com.brainx.intelligence.organization.domain.OrganizationNotFoundException;
import com.brainx.intelligence.organization.domain.OrganizationProviderUnavailableException;
import com.brainx.intelligence.settings.domain.SettingsDomainException;
import com.brainx.intelligence.shared.application.exception.CapabilityForbiddenException;

/**
 * Public REST API 오류를 OpenAPI 공통 오류 wrapper로 변환합니다.
 *
 * /api/v1/ai/chat-threads/{id}/messages 같은 SSE(produces=text/event-stream) 엔드포인트는
 * 요청의 Accept 헤더도 프론트가 명시적으로 "text/event-stream"만 보낸다. 스트림 시작 전
 * 예외(엔티틀먼트 거부 등)가 나면 이 어드바이스가 JSON으로 응답하려 해도 Spring의 컨텐츠
 * 네고시에이션이 "이 요청은 text/event-stream만 받아들인다"고 판단해 JSON을 쓸 컨버터를
 * 아예 찾지 않고 HttpMediaTypeNotAcceptableException을 던진다. 그 예외조차 잡히지 않아
 * 브라우저에는 빈 응답(연결 실패)으로 보인다 — ResponseEntity 대신 HttpServletResponse에
 * 직접 써서 컨텐츠 네고시에이션 자체를 건너뛴다(SecurityConfig.writeError와 동일한 패턴).
 */
@RestControllerAdvice
public class GlobalApiExceptionHandler {

    private final ObjectMapper objectMapper;

    public GlobalApiExceptionHandler(ObjectMapper objectMapper) {
        this.objectMapper = objectMapper;
    }

    @ExceptionHandler({
        MethodArgumentNotValidException.class,
        HandlerMethodValidationException.class,
        ConstraintViolationException.class,
        BindException.class,
        HttpMessageNotReadableException.class,
        AgentDomainException.class,
        ChatDomainException.class,
        ClusteringDomainException.class,
        ExplorationDomainException.class,
        InsightDomainException.class,
        OrganizationDomainException.class,
        SettingsDomainException.class,
        IllegalArgumentException.class
    })
    public void handleBadRequest(Exception exception, HttpServletResponse response) throws IOException {
        writeError(response, HttpStatus.BAD_REQUEST, "BAD_REQUEST", safeMessage(exception));
    }

    @ExceptionHandler(ExplorationInsufficientContentException.class)
    public void handleInsufficientContent(Exception exception, HttpServletResponse response) throws IOException {
        writeError(response, HttpStatus.BAD_REQUEST, "INSUFFICIENT_NOTE_CONTENT", safeMessage(exception));
    }

    @ExceptionHandler({
        CapabilityForbiddenException.class,
        ClusteringForbiddenException.class,
        ConnectionForbiddenException.class,
        InsightForbiddenException.class,
        OrganizationForbiddenException.class
    })
    public void handleForbidden(Exception exception, HttpServletResponse response) throws IOException {
        writeError(response, HttpStatus.FORBIDDEN, "FORBIDDEN", safeMessage(exception));
    }

    @ExceptionHandler({
        AgentNotFoundException.class,
        ChatNotFoundException.class,
        ClusteringNotFoundException.class,
        ConnectionNotFoundException.class,
        ExplorationNotFoundException.class,
        InsightNotFoundException.class,
        LlmOpsNotFoundException.class,
        OrganizationNotFoundException.class
    })
    public void handleNotFound(Exception exception, HttpServletResponse response) throws IOException {
        writeError(response, HttpStatus.NOT_FOUND, "NOT_FOUND", safeMessage(exception));
    }

    @ExceptionHandler({
        AgentConflictException.class,
        ChatConflictException.class,
        ClusteringConflictException.class,
        ConnectionConflictException.class,
        InsightConflictException.class,
        OrganizationConflictException.class
    })
    public void handleConflict(Exception exception, HttpServletResponse response) throws IOException {
        writeError(response, HttpStatus.CONFLICT, "CONFLICT", safeMessage(exception));
    }

    @ExceptionHandler({
        ConnectionProviderUnavailableException.class,
        OrganizationProviderUnavailableException.class
    })
    public void handleProviderUnavailable(Exception exception, HttpServletResponse response) throws IOException {
        writeError(response, HttpStatus.INTERNAL_SERVER_ERROR, "INTERNAL_SERVER_ERROR", safeMessage(exception));
    }

    private void writeError(HttpServletResponse response, HttpStatus status, String code, String message)
            throws IOException {
        response.reset();
        response.setStatus(status.value());
        response.setContentType(MediaType.APPLICATION_JSON_VALUE);
        objectMapper.writeValue(response.getOutputStream(), ApiErrorResponse.of(code, message));
    }

    private static String safeMessage(Exception exception) {
        if (exception instanceof HttpMessageNotReadableException) {
            return "Malformed request body.";
        }
        String message = exception.getMessage();
        return message == null || message.isBlank() ? "Bad request." : message;
    }
}
