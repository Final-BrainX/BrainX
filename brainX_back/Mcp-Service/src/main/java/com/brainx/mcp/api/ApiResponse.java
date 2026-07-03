package com.brainx.mcp.api;

import java.util.Map;

public record ApiResponse<T>(
    boolean success,
    T data,
    String message,
    ErrorBody error
) {

    public static <T> ApiResponse<T> success(T data, String message) {
        return new ApiResponse<>(true, data, message, null);
    }

    public static <T> ApiResponse<T> failure(String code, String message, String traceId) {
        return new ApiResponse<>(false, null, message, new ErrorBody(code, message, traceId, Map.of()));
    }

    public record ErrorBody(
        String code,
        String message,
        String traceId,
        Map<String, Object> details
    ) {
    }
}
