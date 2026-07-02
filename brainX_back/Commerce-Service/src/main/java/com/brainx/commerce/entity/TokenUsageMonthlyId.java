package com.brainx.commerce.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Embeddable;
import lombok.AllArgsConstructor;
import lombok.EqualsAndHashCode;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.io.Serializable;

@Getter
@EqualsAndHashCode
@NoArgsConstructor
@AllArgsConstructor
@Embeddable
public class TokenUsageMonthlyId implements Serializable {
    @Column(name = "user_id")
    private String userId;
    @Column(name = "year_month", length = 7)
    private String yearMonth;
    @Column(name = "feature_id")
    private String featureId;
}
