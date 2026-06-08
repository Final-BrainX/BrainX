package com.brainx.workspace.dto.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;
import java.util.List;

public class WorkspaceRequest {

    @Getter
    @NoArgsConstructor
    public static class CreateNoteRequest {
        @NotBlank(message = "제목은 필수입니다")
        @Size(max = 500)
        private String title;
        private String markdown;
        private String folderId;
        private List<String> tags;
    }

    @Getter
    @NoArgsConstructor
    public static class SaveNoteContentRequest {
        @NotNull(message = "기준 버전은 필수입니다")
        private Long baseVersion;
        private String markdown;
        private LocalDateTime clientSavedAt;
    }

    @Getter
    @NoArgsConstructor
    public static class UpdateNoteMetadataRequest {
        @Size(max = 500)
        private String title;
        private String folderId;
        private List<String> tags;
        private Boolean archived;
    }

    @Getter
    @NoArgsConstructor
    public static class DeleteNoteRequest {
        @NotBlank
        private String mode; // "trash" | "permanent"
    }

    @Getter
    @NoArgsConstructor
    public static class CreateFolderRequest {
        @NotBlank(message = "폴더 이름은 필수입니다")
        @Size(max = 200)
        private String name;
        private String parentFolderId;
    }

    @Getter
    @NoArgsConstructor
    public static class UpdateFolderRequest {
        @Size(max = 200)
        private String name;
        private String parentFolderId;
    }

    @Getter
    @NoArgsConstructor
    public static class DeleteFolderRequest {
        @NotBlank
        private String childNoteAction; // "move" | "trash"
        private String targetFolderId;
    }

    @Getter
    @NoArgsConstructor
    public static class UpdateTagsRequest {
        private List<String> tagNames;
    }

    @Getter
    @NoArgsConstructor
    public static class FavoriteRequest {
        private boolean enabled;
    }

    @Getter
    @NoArgsConstructor
    public static class CreateNoteLinkRequest {
        private String targetNoteId;
        private String targetTitle;
        private Boolean createIfMissing;
    }

    @Getter
    @NoArgsConstructor
    public static class CreateShareLinkRequest {
        @NotBlank
        private String noteId;
        @NotBlank
        private String permission; // "read" | "edit"
        private LocalDateTime expiresAt;
    }

    @Getter
    @NoArgsConstructor
    public static class UpdateShareLinkRequest {
        private LocalDateTime expiresAt;
        private Boolean revoked;
    }

    @Getter
    @NoArgsConstructor
    public static class SaveGraphLayoutRequest {
        private Object nodePositions;
        private String quality;
    }

    @Getter
    @NoArgsConstructor
    public static class NoteViewRequest {
        private LocalDateTime viewedAt;
    }
}
