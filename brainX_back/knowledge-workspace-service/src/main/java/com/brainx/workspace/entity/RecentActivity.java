package com.brainx.workspace.entity;

import jakarta.persistence.*;
import lombok.*;
import org.springframework.data.annotation.CreatedDate;
import org.springframework.data.jpa.domain.support.AuditingEntityListener;

import java.time.LocalDateTime;

@Entity
@Table(name = "recent_activities", indexes = {
        @Index(name = "idx_recent_user_id", columnList = "user_id"),
        @Index(name = "idx_recent_viewed_at", columnList = "viewed_at")
})
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
@EntityListeners(AuditingEntityListener.class)
public class RecentActivity {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    @Column(name = "activity_id", length = 36)
    private String activityId;

    @Column(name = "user_id", nullable = false, length = 36)
    private String userId;

    @Column(name = "note_id", nullable = false, length = 36)
    private String noteId;

    @Column(name = "note_title", length = 500)
    private String noteTitle;

    @Column(name = "viewed_at", nullable = false)
    private LocalDateTime viewedAt;

    @CreatedDate
    @Column(name = "created_at", updatable = false)
    private LocalDateTime createdAt;
}
