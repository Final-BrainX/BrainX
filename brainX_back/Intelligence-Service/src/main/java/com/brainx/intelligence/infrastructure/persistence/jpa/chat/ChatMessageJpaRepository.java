package com.brainx.intelligence.infrastructure.persistence.jpa.chat;

import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;

interface ChatMessageJpaRepository extends JpaRepository<ChatMessageJpaEntity, String> {

    List<ChatMessageJpaEntity> findByUserIdAndThreadIdOrderByCreatedAtAsc(String userId, String threadId);

    Optional<ChatMessageJpaEntity> findFirstByUserIdAndThreadIdOrderByCreatedAtDescMessageIdDesc(
        String userId,
        String threadId
    );
}
