package com.brainx.intelligence.agent.application.port.outbound;

import java.time.Instant;
import java.util.List;
import java.util.Optional;

import com.brainx.intelligence.agent.domain.AgentAction;
import com.brainx.intelligence.agent.domain.AgentMessage;
import com.brainx.intelligence.agent.domain.AgentThread;
import com.brainx.intelligence.agent.domain.AgentThreadSummary;

public interface AgentPersistencePort {

    AgentThread saveThread(AgentThread thread);

    Optional<AgentThread> findThreadByUserIdAndThreadId(String userId, String threadId);

    List<AgentThreadSummary> findThreadSummariesByUserId(String userId, int limit);

    AgentMessage saveMessage(AgentMessage message);

    List<AgentMessage> findMessagesByUserIdAndThreadId(String userId, String threadId);

    AgentAction saveAction(AgentAction action);

    Optional<AgentAction> findActionByUserIdAndActionId(String userId, String actionId);

    Optional<AgentAction> claimPendingActionForExecution(String userId, String actionId, Instant decidedAt);

    Optional<AgentAction> rejectPendingAction(String userId, String actionId, Instant decidedAt);

    List<AgentAction> findActionsByUserIdAndThreadId(String userId, String threadId);
}
