package com.brainx.intelligence.shared.application.exception;

/**
 * AI capability 또는 quota 정책이 현재 요청을 허용하지 않음을 표현합니다.
 */
public class CapabilityForbiddenException extends RuntimeException {

    public CapabilityForbiddenException(String message) {
        super(message);
    }
}
