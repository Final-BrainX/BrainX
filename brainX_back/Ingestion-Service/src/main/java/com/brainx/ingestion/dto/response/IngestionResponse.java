package com.brainx.ingestion.dto.response;

import com.brainx.ingestion.entity.ExportJob;
import com.brainx.ingestion.entity.ImportJob;
import com.brainx.ingestion.entity.IntegrationAccount;
import com.brainx.ingestion.service.NotionApiService.NotionPageItem;
import lombok.Builder;
import lombok.Getter;

import java.util.List;

public class IngestionResponse {

    @Getter
    @Builder
    public static class NotionAuthorizeResponse {
        private String authorizationUrl;
        private String state;
    }

    @Getter
    @Builder
    public static class IntegrationConnectedResponse {
        private String integrationAccountId;

        public static IntegrationConnectedResponse from(IntegrationAccount account) {
            return IntegrationConnectedResponse.builder()
                    .integrationAccountId(account.getIntegrationAccountId())
                    .build();
        }
    }

    @Getter
    @Builder
    public static class NotionPageListResponse {
        private List<NotionPageItem> pages;

        public static NotionPageListResponse from(List<NotionPageItem> pages) {
            return NotionPageListResponse.builder().pages(pages).build();
        }
    }

    @Getter
    @Builder
    public static class ImportJobCreatedResponse {
        private String importJobId;
        private String status;

        public static ImportJobCreatedResponse from(ImportJob job) {
            return ImportJobCreatedResponse.builder()
                    .importJobId(job.getImportJobId())
                    .status(job.getStatus().name())
                    .build();
        }
    }

    @Getter
    @Builder
    public static class ImportJobStatusResponse {
        private String importJobId;
        private String status;
        private List<CreatedNoteItem> createdNotes;
        private List<FailedFileItem> failedFiles;
        private List<Object> conflicts;

        public static ImportJobStatusResponse from(ImportJob job) {
            List<CreatedNoteItem> notes = job.getCreatedNoteIds() != null && !job.getCreatedNoteIds().isBlank()
                    ? List.of(new CreatedNoteItem(job.getCreatedNoteIds(), "가져온 노트"))
                    : List.of();

            List<FailedFileItem> failed = job.getFailedFiles() != null && !job.getFailedFiles().isBlank()
                    ? List.of(new FailedFileItem(job.getFailedFiles(), "처리 실패"))
                    : List.of();

            return ImportJobStatusResponse.builder()
                    .importJobId(job.getImportJobId())
                    .status(job.getStatus().name())
                    .createdNotes(notes)
                    .failedFiles(failed)
                    .conflicts(List.of())
                    .build();
        }

        @Getter
        @Builder
        public static class CreatedNoteItem {
            private String noteId;
            private String title;

            public CreatedNoteItem(String noteId, String title) {
                this.noteId = noteId;
                this.title = title;
            }
        }

        @Getter
        @Builder
        public static class FailedFileItem {
            private String fileName;
            private String reason;

            public FailedFileItem(String fileName, String reason) {
                this.fileName = fileName;
                this.reason = reason;
            }
        }
    }

    @Getter
    @Builder
    public static class ExportJobCreatedResponse {
        private String exportJobId;
        private String status;

        public static ExportJobCreatedResponse from(ExportJob job) {
            return ExportJobCreatedResponse.builder()
                    .exportJobId(job.getExportJobId())
                    .status(job.getStatus().name())
                    .build();
        }
    }

    @Getter
    @Builder
    public static class ExportJobStatusResponse {
        private String exportJobId;
        private String status;
        private String downloadUrl;
        private String error;

        public static ExportJobStatusResponse from(ExportJob job) {
            return ExportJobStatusResponse.builder()
                    .exportJobId(job.getExportJobId())
                    .status(job.getStatus().name())
                    .downloadUrl(job.getDownloadUrl())
                    .error(job.getErrorMessage())
                    .build();
        }
    }
}
