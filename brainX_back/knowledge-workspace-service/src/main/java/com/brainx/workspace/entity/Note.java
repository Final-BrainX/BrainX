package com.brainx.workspace.entity;

import jakarta.persistence.*;
import lombok.*;
import org.springframework.data.annotation.CreatedDate;
import org.springframework.data.annotation.LastModifiedDate;
import org.springframework.data.jpa.domain.support.AuditingEntityListener;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;

@Entity
@Table(name = "notes", indexes = {
        @Index(name = "idx_notes_user_id", columnList = "user_id"),
        @Index(name = "idx_notes_folder_id", columnList = "folder_id")
})
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
@EntityListeners(AuditingEntityListener.class)
public class Note {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    @Column(name = "note_id", length = 36)
    private String noteId;

    @Column(name = "user_id", nullable = false, length = 36)
    private String userId;

    @Column(name = "title", nullable = false, length = 500)
    private String title;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false, length = 20)
    @Builder.Default
    private NoteStatus status = NoteStatus.ACTIVE;

    @Column(name = "version", nullable = false)
    @Builder.Default
    private long version = 1L;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "folder_id")
    private Folder folder;

    @Column(name = "is_public", nullable = false)
    @Builder.Default
    private boolean isPublic = false;

    @CreatedDate
    @Column(name = "created_at", updatable = false)
    private LocalDateTime createdAt;

    @LastModifiedDate
    @Column(name = "updated_at")
    private LocalDateTime updatedAt;

    @Column(name = "trashed_at")
    private LocalDateTime trashedAt;

    @OneToOne(mappedBy = "note", cascade = CascadeType.ALL, orphanRemoval = true)
    private NoteContent content;

    @OneToMany(mappedBy = "note", cascade = CascadeType.ALL, orphanRemoval = true)
    @Builder.Default
    private List<NoteTag> noteTags = new ArrayList<>();

    @OneToMany(mappedBy = "sourceNote", cascade = CascadeType.ALL, orphanRemoval = true)
    @Builder.Default
    private List<NoteLink> outgoingLinks = new ArrayList<>();

    public enum NoteStatus {
        ACTIVE, TRASHED, DELETED
    }
}
