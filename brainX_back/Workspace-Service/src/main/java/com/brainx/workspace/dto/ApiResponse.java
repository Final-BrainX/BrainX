package com.brainx.workspace.dto;

import com.fasterxml.jackson.annotation.JsonInclude;

@JsonInclude(JsonInclude.Include.ALWAYS)
public record ApiResponse<T>(
        boolean success,
        T data,
        String message
) {
    public static <T> ApiResponse<T> success(T data) {
        return new ApiResponse<>(true, data, "요청이 성공적으로 처리되었습니다.");
    }
}
