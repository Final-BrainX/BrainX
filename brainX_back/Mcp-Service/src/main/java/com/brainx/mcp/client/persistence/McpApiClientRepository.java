package com.brainx.mcp.client.persistence;

import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface McpApiClientRepository extends JpaRepository<McpApiClientEntity, String> {

    List<McpApiClientEntity> findByUserIdOrderByCreatedAtDesc(String userId);
}
