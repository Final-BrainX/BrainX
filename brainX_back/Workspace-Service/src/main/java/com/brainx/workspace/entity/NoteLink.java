package com.brainx.workspace.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.time.Instant;

@Getter
@Entity
@NoArgsConstructor
@Table(name = "workspace_note_links")
public class NoteLink {
    public static final String TYPE_MANUAL = "MANUAL";
    public static final String TYPE_WIKI = "WIKI";

    @Id
    private String linkId;
    @Column(nullable = false)
    private String userId;
    @Column(nullable = false)
    private String sourceNoteId;
    @Column(nullable = false)
    private String targetNoteId;
    @Column(nullable = false)
    private String targetTitle;
    @Column(nullable = false, length = 64)
    private String linkType;
    private String anchorText;
    private String headingAnchor;
    @Column(nullable = false)
    private Instant createdAt;

    public NoteLink(String linkId, String userId, String sourceNoteId, String targetNoteId, String targetTitle,
                    String linkType, String anchorText, String headingAnchor, Instant createdAt) {
        this.linkId = linkId;
        this.userId = userId;
        this.sourceNoteId = sourceNoteId;
        this.targetNoteId = targetNoteId;
        this.targetTitle = targetTitle;
        this.linkType = linkType == null || linkType.isBlank() ? TYPE_MANUAL : linkType;
        this.anchorText = anchorText;
        this.headingAnchor = headingAnchor;
        this.createdAt = createdAt;
    }

    public boolean isWikiLink() {
        return TYPE_WIKI.equals(linkType);
    }
}
