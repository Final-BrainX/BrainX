package com.brainx.workspace.dto.response;

import com.brainx.workspace.entity.*;
import lombok.Builder;
import lombok.Getter;

import java.time.LocalDateTime;
import java.util.List;

public class WorkspaceResponse {

    @Getter
    @Builder
    public static class NoteResponse {
        private String noteId;
        private String title;
        private String status;
        private long version;
        private String folderId;
        private List<String> tags;
        private boolean isPublic;
        private LocalDateTime createdAt;
        private LocalDateTime updatedAt;

        public static NoteResponse from(Note note) {
            List<String> tagNames = note.getNoteTags().stream()
                    .map(nt -> nt.getTag().getName())
                    .toList();
            return NoteResponse.builder()
                    .noteId(note.getNoteId())
                    .title(note.getTitle())
                    .status(note.getStatus().name())
                    .version(note.getVersion())
                    .folderId(note.getFolder() != null ? note.getFolder().getFolderId() : null)
                    .tags(tagNames)
                    .isPublic(note.isPublic())
                    .createdAt(note.getCreatedAt())
                    .updatedAt(note.getUpdatedAt())
                    .build();
        }
    }

    @Getter
    @Builder
    public static class NoteDetailResponse {
        private NoteResponse note;
        private String content;
        private long version;

        public static NoteDetailResponse from(Note note) {
            return NoteDetailResponse.builder()
                    .note(NoteResponse.from(note))
                    .content(note.getContent() != null ? note.getContent().getMarkdown() : "")
                    .version(note.getVersion())
                    .build();
        }
    }

    @Getter
    @Builder
    public static class NoteSaveResponse {
        private long version;
        private LocalDateTime savedAt;
        private Boolean conflict;
    }

    @Getter
    @Builder
    public static class FolderResponse {
        private String folderId;
        private String name;
        private String parentFolderId;
        private LocalDateTime createdAt;
        private LocalDateTime updatedAt;

        public static FolderResponse from(Folder folder) {
            return FolderResponse.builder()
                    .folderId(folder.getFolderId())
                    .name(folder.getName())
                    .parentFolderId(folder.getParentFolder() != null ? folder.getParentFolder().getFolderId() : null)
                    .createdAt(folder.getCreatedAt())
                    .updatedAt(folder.getUpdatedAt())
                    .build();
        }
    }

    @Getter
    @Builder
    public static class TagResponse {
        private String tagId;
        private String name;
        private String color;

        public static TagResponse from(Tag tag) {
            return TagResponse.builder()
                    .tagId(tag.getTagId())
                    .name(tag.getName())
                    .color(tag.getColor())
                    .build();
        }
    }

    @Getter
    @Builder
    public static class FavoriteResponse {
        private boolean enabled;
    }

    @Getter
    @Builder
    public static class RecentActivityResponse {
        private String noteId;
        private String noteTitle;
        private LocalDateTime viewedAt;

        public static RecentActivityResponse from(RecentActivity ra) {
            return RecentActivityResponse.builder()
                    .noteId(ra.getNoteId())
                    .noteTitle(ra.getNoteTitle())
                    .viewedAt(ra.getViewedAt())
                    .build();
        }
    }

    @Getter
    @Builder
    public static class BacklinkResponse {
        private String noteId;
        private String title;
        private LocalDateTime createdAt;
    }

    @Getter
    @Builder
    public static class NoteLinkResponse {
        private String linkId;
        private String targetNoteId;
        private String targetTitle;
    }

    @Getter
    @Builder
    public static class ShareLinkResponse {
        private String shareId;
        private String url;
        private String permission;
        private LocalDateTime expiresAt;
        private boolean revoked;

        public static ShareLinkResponse from(ShareLink shareLink, String baseUrl) {
            return ShareLinkResponse.builder()
                    .shareId(shareLink.getShareId())
                    .url(baseUrl + "/share/" + shareLink.getShareId())
                    .permission(shareLink.getPermission().name().toLowerCase())
                    .expiresAt(shareLink.getExpiresAt())
                    .revoked(shareLink.isRevoked())
                    .build();
        }
    }

    @Getter
    @Builder
    public static class GraphResponse {
        private List<GraphNode> nodes;
        private List<GraphEdge> edges;

        @Getter
        @Builder
        public static class GraphNode {
            private String id;
            private String label;
            private String type;
            private LocalDateTime createdAt;
            private LocalDateTime updatedAt;
        }

        @Getter
        @Builder
        public static class GraphEdge {
            private String id;
            private String source;
            private String target;
        }
    }

    @Getter
    @Builder
    public static class WorkspaceSyncResponse {
        private String cursor;
        private List<NoteResponse> notes;
        private List<FolderResponse> folders;
        private List<TagResponse> tags;
        private List<NoteLinkResponse> links;
        private List<FavoriteResponse> favorites;
        private List<RecentActivityResponse> recentActivities;
    }

    @Getter
    @Builder
    public static class OkResponse {
        private boolean ok;
    }

    @Getter
    @Builder
    public static class DeleteNoteResponse {
        private LocalDateTime deletedAt;
        private LocalDateTime purgeAt;
    }
}
