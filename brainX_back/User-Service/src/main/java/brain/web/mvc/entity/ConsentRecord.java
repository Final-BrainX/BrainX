package brain.web.mvc.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.MapsId;
import jakarta.persistence.OneToOne;
import jakarta.persistence.PrePersist;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

@Getter
@Builder
@Entity
@Table(name = "consent_records")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor(access = AccessLevel.PRIVATE)
public class ConsentRecord {

    @Id
    @Column(name = "user_id", length = 40)
    private String userId;

    @MapsId
    @OneToOne
    @JoinColumn(name = "user_id")
    private User user;

    @Column(nullable = false)
    private boolean termsRequired;

    @Column(nullable = false)
    private boolean privacyRequired;

    @Column(nullable = false)
    private boolean marketingOptional;

    @Column(nullable = false)
    private boolean behaviorAnalyticsOptional;

    @Column(nullable = false)
    private LocalDateTime consentedAt;

    @PrePersist
    void prePersist() {
        if (consentedAt == null) {
            consentedAt = LocalDateTime.now();
        }
    }

    public void update(boolean termsRequired, boolean privacyRequired, boolean marketingOptional, boolean behaviorAnalyticsOptional) {
        this.termsRequired = termsRequired;
        this.privacyRequired = privacyRequired;
        this.marketingOptional = marketingOptional;
        this.behaviorAnalyticsOptional = behaviorAnalyticsOptional;
        this.consentedAt = LocalDateTime.now();
    }
}
