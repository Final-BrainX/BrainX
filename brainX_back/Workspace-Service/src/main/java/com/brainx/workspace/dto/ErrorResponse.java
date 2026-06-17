package com.brainx.workspace.dto;

import java.util.Map;

public record ErrorResponse(ErrorBody error) {
    public static ErrorResponse of(String code, String message, String traceId, Map<String, Object> details) {
        return new ErrorResponse(new ErrorBody(code, message, traceId, details == null ? Map.of() : details));
    }

    public record ErrorBody(
            String code,
            String message,
            String traceId,
            Map<String, Object> details
    ) {
    }
}
