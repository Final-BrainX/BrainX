package com.brainx.intelligence.infrastructure.persistence.jpa.agent;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Instant;
import java.util.Map;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.boot.test.autoconfigure.orm.jpa.TestEntityManager;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.ActiveProfiles;

import com.brainx.intelligence.agent.domain.AgentAction;
import com.brainx.intelligence.agent.domain.AgentActionStatus;
import com.brainx.intelligence.agent.domain.AgentActionType;
import com.brainx.intelligence.agent.domain.AgentMessage;
import com.brainx.intelligence.agent.domain.AgentThread;
import com.brainx.intelligence.shared.domain.DocumentGroups;

@DataJpaTest
@ActiveProfiles("test")
@Import(AgentJpaAdapter.class)
class AgentJpaAdapterTest {

    @Autowired
    private AgentJpaAdapter agentJpaAdapter;

    @Autowired
    private TestEntityManager entityManager;

    @Test
    void claimPendingActionForExecutionUpdatesOnlyPendingAction() {
        savePendingAction();
        Instant decidedAt = Instant.parse("2026-07-06T00:10:00Z");

        AgentAction claimed = agentJpaAdapter
            .claimPendingActionForExecution("user-1", "action-1", decidedAt)
            .orElseThrow();
        entityManager.flush();
        entityManager.clear();

        assertThat(claimed.status()).isEqualTo(AgentActionStatus.EXECUTING);
        assertThat(claimed.decidedAt()).isEqualTo(decidedAt);
        assertThat(agentJpaAdapter.claimPendingActionForExecution("user-1", "action-1", decidedAt)).isEmpty();
        assertThat(agentJpaAdapter.rejectPendingAction("user-1", "action-1", decidedAt)).isEmpty();
    }

    @Test
    void rejectPendingActionUpdatesOnlyPendingAction() {
        savePendingAction();
        Instant decidedAt = Instant.parse("2026-07-06T00:11:00Z");

        AgentAction rejected = agentJpaAdapter
            .rejectPendingAction("user-1", "action-1", decidedAt)
            .orElseThrow();
        entityManager.flush();
        entityManager.clear();

        assertThat(rejected.status()).isEqualTo(AgentActionStatus.REJECTED);
        assertThat(rejected.decidedAt()).isEqualTo(decidedAt);
        assertThat(agentJpaAdapter.rejectPendingAction("user-1", "action-1", decidedAt)).isEmpty();
        assertThat(agentJpaAdapter.claimPendingActionForExecution("user-1", "action-1", decidedAt)).isEmpty();
    }

    private void savePendingAction() {
        agentJpaAdapter.saveThread(new AgentThread(
            "thread-1",
            "user-1",
            DocumentGroups.DEFAULT_DOCUMENT_GROUP_ID,
            "Agent thread",
            "gpt-test",
            Instant.parse("2026-07-06T00:00:00Z")
        ));
        agentJpaAdapter.saveMessage(AgentMessage.agent(
            "message-1",
            "thread-1",
            "user-1",
            "I can propose this action.",
            "gpt-test",
            Instant.parse("2026-07-06T00:01:00Z")
        ));
        agentJpaAdapter.saveAction(new AgentAction(
            "action-1",
            "user-1",
            "thread-1",
            "message-1",
            AgentActionType.CREATE_NOTE,
            AgentActionStatus.PENDING_APPROVAL,
            "Create note",
            "Create a note.",
            "# Note",
            DocumentGroups.DEFAULT_DOCUMENT_GROUP_ID,
            Map.of(),
            Map.of("title", "Note", "markdown", "# Note"),
            null,
            null,
            Instant.parse("2026-07-06T00:02:00Z"),
            null,
            null
        ));
        entityManager.flush();
        entityManager.clear();
    }
}
