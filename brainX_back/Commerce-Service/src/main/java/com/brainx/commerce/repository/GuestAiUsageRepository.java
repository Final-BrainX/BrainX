package com.brainx.commerce.repository;

import com.brainx.commerce.entity.GuestAiUsage;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface GuestAiUsageRepository extends JpaRepository<GuestAiUsage, String> {

    /**
     * 첫 호출이면 항상 성공(row 생성, used_count=1)한다. 이미 존재하는 게스트는 현재
     * used_count가 limit 미만일 때만 증가한다 — WHERE 절이 ON CONFLICT DO UPDATE 분기에만
     * 적용되므로 신규 게스트의 최초 삽입은 limit 체크 없이 항상 반영된다.
     * 반환값이 0이면 이미 한도에 도달해 이번 호출은 반영되지 않은 것이다.
     */
    @Modifying
    @Query(value = """
            INSERT INTO commerce_guest_ai_usage (guest_id, used_count, updated_at)
            VALUES (:guestId, 1, now())
            ON CONFLICT (guest_id)
            DO UPDATE SET used_count = commerce_guest_ai_usage.used_count + 1, updated_at = now()
            WHERE commerce_guest_ai_usage.used_count < :limit
            """, nativeQuery = true)
    int incrementIfUnderLimit(@Param("guestId") String guestId, @Param("limit") int limit);
}
