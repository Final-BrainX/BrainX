package com.brainx.workspace.repository;

import com.brainx.workspace.entity.EventOutbox;
import org.springframework.data.jpa.repository.JpaRepository;

public interface EventOutboxRepository extends JpaRepository<EventOutbox, String> {
}
