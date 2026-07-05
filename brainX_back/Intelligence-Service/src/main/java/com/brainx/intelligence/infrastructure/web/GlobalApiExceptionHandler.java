package com.brainx.intelligence.infrastructure.web;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.validation.BindException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

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
import com.brainx.intelligence.insight.domain.InsightConflictException;
import com.brainx.intelligence.insight.domain.InsightDomainException;
import com.brainx.intelligence.insight.domain.InsightForbiddenException;
import com.brainx.intelligence.insight.domain.InsightNotFoundException;
import com.brainx.intelligence.organization.domain.OrganizationConflictException;
import com.brainx.intelligence.organization.domain.OrganizationDomainException;
import com.brainx.intelligence.organization.domain.OrganizationForbiddenException;
import com.brainx.intelligence.organization.domain.OrganizationNotFoundException;
import com.brainx.intelligence.organization.domain.OrganizationProviderUnavailableException;
import com.brainx.intelligence.settings.domain.SettingsDomainException;

/**
 * Public REST API 오류를 OpenAPI 공통 오류 wrapper로 변환합니다.
 */
@RestControllerAdvice
public class GlobalApiExceptionHandler {

    @ExceptionHandler({
        MethodArgumentNotValidException.class,
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
    public ResponseEntity<ApiErrorResponse> handleBadRequest(Exception exception) {
        return ResponseEntity.status(HttpStatus.BAD_REQUEST)
            .body(ApiErrorResponse.of("BAD_REQUEST", safeMessage(exception)));
    }

    @ExceptionHandler({
        ClusteringForbiddenException.class,
        ConnectionForbiddenException.class,
        InsightForbiddenException.class,
        OrganizationForbiddenException.class
    })
    public ResponseEntity<ApiErrorResponse> handleForbidden(Exception exception) {
        return ResponseEntity.status(HttpStatus.FORBIDDEN)
            .body(ApiErrorResponse.of("FORBIDDEN", safeMessage(exception)));
    }

    @ExceptionHandler({
        AgentNotFoundException.class,
        ChatNotFoundException.class,
        ClusteringNotFoundException.class,
        ConnectionNotFoundException.class,
        InsightNotFoundException.class,
        OrganizationNotFoundException.class
    })
    public ResponseEntity<ApiErrorResponse> handleNotFound(Exception exception) {
        return ResponseEntity.status(HttpStatus.NOT_FOUND)
            .body(ApiErrorResponse.of("NOT_FOUND", safeMessage(exception)));
    }

    @ExceptionHandler({
        AgentConflictException.class,
        ChatConflictException.class,
        ClusteringConflictException.class,
        ConnectionConflictException.class,
        InsightConflictException.class,
        OrganizationConflictException.class
    })
    public ResponseEntity<ApiErrorResponse> handleConflict(Exception exception) {
        return ResponseEntity.status(HttpStatus.CONFLICT)
            .body(ApiErrorResponse.of("CONFLICT", safeMessage(exception)));
    }

    @ExceptionHandler({
        ConnectionProviderUnavailableException.class,
        OrganizationProviderUnavailableException.class
    })
    public ResponseEntity<ApiErrorResponse> handleProviderUnavailable(Exception exception) {
        return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
            .body(ApiErrorResponse.of("INTERNAL_SERVER_ERROR", safeMessage(exception)));
    }

    private static String safeMessage(Exception exception) {
        if (exception instanceof HttpMessageNotReadableException) {
            return "Malformed request body.";
        }
        String message = exception.getMessage();
        return message == null || message.isBlank() ? "Bad request." : message;
    }
}
