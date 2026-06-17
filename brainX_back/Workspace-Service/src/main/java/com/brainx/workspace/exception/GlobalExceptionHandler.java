package com.brainx.workspace.exception;

import com.brainx.workspace.dto.ErrorResponse;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.validation.FieldError;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

import java.util.Map;

@RestControllerAdvice
public class GlobalExceptionHandler {
    @ExceptionHandler(WorkspaceException.class)
    public ResponseEntity<ErrorResponse> handleWorkspaceException(WorkspaceException exception, HttpServletRequest request) {
        return ResponseEntity.status(exception.getStatus())
                .body(ErrorResponse.of(exception.getCode(), exception.getMessage(), traceId(request), exception.getDetails()));
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<ErrorResponse> handleValidation(MethodArgumentNotValidException exception, HttpServletRequest request) {
        String message = exception.getBindingResult().getFieldErrors().stream()
                .findFirst()
                .map(FieldError::getDefaultMessage)
                .orElse("Invalid request.");
        return ResponseEntity.badRequest()
                .body(ErrorResponse.of("VALIDATION_FAILED", message, traceId(request), Map.of()));
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<ErrorResponse> handleException(Exception exception, HttpServletRequest request) {
        return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                .body(ErrorResponse.of("INTERNAL_ERROR", "Internal server error.", traceId(request), Map.of()));
    }

    private String traceId(HttpServletRequest request) {
        String header = request.getHeader("X-Request-Id");
        return header == null || header.isBlank() ? "trc_" + System.currentTimeMillis() : header;
    }
}
