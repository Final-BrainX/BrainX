package brain.web.mvc.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;
import java.util.UUID;

@Getter
@Builder
@Entity
@Table(name = "support_inquiries")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor(access = AccessLevel.PRIVATE)
public class SupportInquiry {

    @Id
    @Column(name = "inquiry_id", length = 40)
    private String inquiryId;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "user_id", nullable = false)
    private User user;

    @Column(nullable = false, length = 40)
    private String category;

    @Column(nullable = false, length = 120)
    private String title;

    @Column(nullable = false, columnDefinition = "TEXT")
    private String content;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private InquiryStatus status;

    @Column(name = "assignee_admin_user_id", length = 40)
    private String assigneeAdminUserId;

    @Column(name = "assignee_admin_name", length = 80)
    private String assigneeAdminName;

    @Column(nullable = false)
    private boolean urgent;

    @Column(name = "reply_content", columnDefinition = "TEXT")
    private String replyContent;

    @Column(name = "replied_at")
    private LocalDateTime repliedAt;

    @Column(name = "replied_admin_user_id", length = 40)
    private String repliedAdminUserId;

    @Column(nullable = false)
    private LocalDateTime createdAt;

    @Column(nullable = false)
    private LocalDateTime updatedAt;

    @PrePersist
    void prePersist() {
        if (inquiryId == null) {
            inquiryId = "inq_" + UUID.randomUUID().toString().replace("-", "");
        }
        if (status == null) {
            status = InquiryStatus.RECEIVED;
        }
        LocalDateTime now = LocalDateTime.now();
        createdAt = now;
        updatedAt = now;
    }

    @PreUpdate
    void preUpdate() {
        updatedAt = LocalDateTime.now();
    }

    public void assignAdmin(String adminUserId, String adminName) {
        this.assigneeAdminUserId = adminUserId;
        this.assigneeAdminName = adminName;
        this.status = InquiryStatus.IN_PROGRESS;
        this.updatedAt = LocalDateTime.now();
    }

    public void updateStatus(InquiryStatus status) {
        this.status = status;
        this.updatedAt = LocalDateTime.now();
    }

    public void reply(String replyContent, String adminUserId, String adminName) {
        this.replyContent = replyContent;
        this.repliedAdminUserId = adminUserId;
        this.repliedAt = LocalDateTime.now();
        this.status = InquiryStatus.ANSWERED;
        this.updatedAt = LocalDateTime.now();
    }

    public enum InquiryStatus {
        RECEIVED, IN_PROGRESS, ANSWERED, CLOSED
    }
}
