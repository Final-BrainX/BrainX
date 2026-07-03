package com.brainx.commerce.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Embeddable;
import lombok.AllArgsConstructor;
import lombok.EqualsAndHashCode;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.io.Serializable;
import java.time.LocalDate;

@Getter
@EqualsAndHashCode
@NoArgsConstructor
@AllArgsConstructor
@Embeddable
public class TokenUsageDailyId implements Serializable {
    @Column(name = "user_id")
    private String userId;
    @Column(name = "usage_date")
    private LocalDate usageDate;
    @Column(name = "feature_id")
    private String featureId;
}
