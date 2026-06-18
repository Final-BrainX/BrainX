package com.brainx.ingestion.dto.request;

import jakarta.validation.constraints.NotBlank;
import lombok.Getter;
import lombok.NoArgsConstructor;

public class IngestionRequest {

    @Getter
    @NoArgsConstructor
    public static class NotionOAuthAuthorizeRequest {
        @NotBlank(message = "redirectUri는 필수입니다")
        private String redirectUri;
    }

    @Getter
    @NoArgsConstructor
    public static class NotionOAuthCallbackRequest {
        @NotBlank(message = "code는 필수입니다")
        private String code;
        @NotBlank(message = "state는 필수입니다")
        private String state;
    }

    @Getter
    @NoArgsConstructor
    public static class NotionImportJobRequest {
        @NotBlank(message = "integrationAccountId는 필수입니다")
        private String integrationAccountId;
        @NotBlank(message = "sourceId는 필수입니다")
        private String sourceId;
        private String mode = "IMPORT";
        private String targetFolderId;
    }

    @Getter
    @NoArgsConstructor
    public static class ObsidianImportJobRequest {
        @NotBlank(message = "uploadedZipAssetId는 필수입니다")
        private String uploadedZipAssetId;
        private String targetFolderId;
    }

    @Getter
    @NoArgsConstructor
    public static class ExportJobRequest {
        @NotBlank(message = "noteId는 필수입니다")
        private String noteId;
        @NotBlank(message = "format은 필수입니다")
        private String format;
        private String clientType = "WEB";
    }

    @Getter
    @NoArgsConstructor
    public static class PublishJobRequest {
        @NotBlank(message = "noteId는 필수입니다")
        private String noteId;
        @NotBlank(message = "platform은 필수입니다")
        private String platform;
        private String templateId;
        private String noteContent;
    }
}
