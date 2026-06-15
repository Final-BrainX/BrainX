package com.brainx.workspace.entity;

import jakarta.persistence.*;
import lombok.*;
import org.springframework.data.annotation.LastModifiedDate;
import org.springframework.data.jpa.domain.support.AuditingEntityListener;

import java.time.LocalDateTime;

@Entity
@Table(name = "note_contents")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
@EntityListeners(AuditingEntityListener.class)
public class NoteContent {

    @Id
    @Column(name = "note_id", length = 36)
    private String noteId;

    @OneToOne
    @MapsId
    @JoinColumn(name = "note_id")
    private Note note;

    @Lob
    @Column(name = "markdown", columnDefinition = "LONGTEXT")
    private String markdown;

    @LastModifiedDate
    @Column(name = "updated_at")
    private LocalDateTime updatedAt;
}
