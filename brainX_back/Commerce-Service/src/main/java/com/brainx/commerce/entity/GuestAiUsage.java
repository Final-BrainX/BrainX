package com.brainx.commerce.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.time.Instant;

/**
 * 게스트(비회원) actor 하나가 지금까지 사용한 AI 기능 총 호출 횟수.
 * capability 종류와 무관하게 게스트 하나당 하나의 카운터로 합산한다.
 */
@Getter
@Entity
@NoArgsConstructor
@Table(name = "commerce_guest_ai_usage")
public class GuestAiUsage {
    @Id
    @Column(name = "guest_id")
    private String guestId;

    @Column(name = "used_count", nullable = false)
    private int usedCount;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;
}
