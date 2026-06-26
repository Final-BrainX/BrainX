package com.brainx.ingestion.entity;

import jakarta.persistence.*;
import lombok.*;
import org.springframework.data.annotation.CreatedDate;
import org.springframework.data.annotation.LastModifiedDate;
import org.springframework.data.jpa.domain.support.AuditingEntityListener;

import java.time.LocalDateTime;

@Entity
@Table(name = "export_jobs", indexes = {
        @Index(name = "idx_export_jobs_user_id", columnList = "user_id")
})
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
@EntityListeners(AuditingEntityListener.class)
public class ExportJob {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    @Column(name = "export_job_id", length = 36)
    private String exportJobId;

    @Column(name = "user_id", nullable = false, length = 36)
    private String userId;

    // Workspace-Service의 실제 노트 ID는 "note_" + UUID(하이픈 포함) = 41자라 36으로는 부족해서
    // INSERT가 "value too long for type character varying(36)"으로 매번 실패했다.
    @Column(name = "note_id", nullable = false, length = 64)
    private String noteId;

    @Enumerated(EnumType.STRING)
    @Column(name = "format", nullable = false, length = 10)
    private ExportFormat format;

    @Enumerated(EnumType.STRING)
    @Column(name = "client_type", length = 10)
    @Builder.Default
    private ClientType clientType = ClientType.WEB;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false, length = 20)
    @Builder.Default
    private JobStatus status = JobStatus.PENDING;

    @Column(name = "download_url", length = 1000)
    private String downloadUrl;

    @Column(name = "storage_path", length = 1000)
    private String storagePath;

    @Column(name = "error_message", length = 500)
    private String errorMessage;

    @CreatedDate
    @Column(name = "created_at", updatable = false)
    private LocalDateTime createdAt;

    @LastModifiedDate
    @Column(name = "updated_at")
    private LocalDateTime updatedAt;

    public enum ExportFormat {
        PDF, TXT, MD
    }

    public enum ClientType {
        WEB, APP
    }

    public enum JobStatus {
        PENDING, PROCESSING, COMPLETED, FAILED
    }
}
