package com.brainx.intelligence.infrastructure.persistence.jpa.agent;

import java.sql.Timestamp;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Optional;

import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

import com.brainx.intelligence.agent.application.port.outbound.AgentPersistencePort;
import com.brainx.intelligence.agent.domain.AgentAction;
import com.brainx.intelligence.agent.domain.AgentActionStatus;
import com.brainx.intelligence.agent.domain.AgentMessage;
import com.brainx.intelligence.agent.domain.AgentThread;
import com.brainx.intelligence.agent.domain.AgentThreadSummary;

@Repository
public class AgentJpaAdapter implements AgentPersistencePort {

    private final AgentThreadJpaRepository threadRepository;
    private final AgentMessageJpaRepository messageRepository;
    private final AgentActionJpaRepository actionRepository;

    public AgentJpaAdapter(
        AgentThreadJpaRepository threadRepository,
        AgentMessageJpaRepository messageRepository,
        AgentActionJpaRepository actionRepository
    ) {
        this.threadRepository = threadRepository;
        this.messageRepository = messageRepository;
        this.actionRepository = actionRepository;
    }

    @Override
    @Transactional
    public AgentThread saveThread(AgentThread thread) {
        return threadRepository.save(AgentThreadJpaEntity.fromDomain(thread)).toDomain();
    }

    @Override
    @Transactional(readOnly = true)
    public Optional<AgentThread> findThreadByUserIdAndThreadId(String userId, String threadId) {
        return threadRepository.findByUserIdAndThreadId(userId, threadId)
            .map(AgentThreadJpaEntity::toDomain);
    }

    @Override
    @Transactional(readOnly = true)
    public List<AgentThreadSummary> findThreadSummariesByUserId(String userId, int limit) {
        return threadRepository.findThreadSummariesByUserId(userId, limit).stream()
            .map(projection -> new AgentThreadSummary(
                projection.getThreadId(),
                projection.getUserId(),
                projection.getDocumentGroupId(),
                projection.getTitle(),
                projection.getModelId(),
                instantValue(projection.getCreatedAt()),
                instantValue(projection.getLastMessageAt()),
                latestMessagePreview(userId, projection.getThreadId()),
                longValue(projection.getMessageCount())
            ))
            .toList();
    }

    @Override
    @Transactional
    public AgentMessage saveMessage(AgentMessage message) {
        return messageRepository.save(AgentMessageJpaEntity.fromDomain(message)).toDomain();
    }

    @Override
    @Transactional(readOnly = true)
    public List<AgentMessage> findMessagesByUserIdAndThreadId(String userId, String threadId) {
        return messageRepository.findByUserIdAndThreadIdOrderByCreatedAtAsc(userId, threadId).stream()
            .map(AgentMessageJpaEntity::toDomain)
            .toList();
    }

    @Override
    @Transactional
    public AgentAction saveAction(AgentAction action) {
        return actionRepository.save(AgentActionJpaEntity.fromDomain(action)).toDomain();
    }

    @Override
    @Transactional(readOnly = true)
    public Optional<AgentAction> findActionByUserIdAndActionId(String userId, String actionId) {
        return actionRepository.findByUserIdAndActionId(userId, actionId)
            .map(AgentActionJpaEntity::toDomain);
    }

    @Override
    @Transactional
    public Optional<AgentAction> claimPendingActionForExecution(String userId, String actionId, Instant decidedAt) {
        int updated = actionRepository.updateStatusIfCurrent(
            userId,
            actionId,
            AgentActionStatus.PENDING_APPROVAL,
            AgentActionStatus.EXECUTING,
            decidedAt
        );
        if (updated != 1) {
            return Optional.empty();
        }
        return findActionByUserIdAndActionId(userId, actionId);
    }

    @Override
    @Transactional
    public Optional<AgentAction> rejectPendingAction(String userId, String actionId, Instant decidedAt) {
        int updated = actionRepository.updateStatusIfCurrent(
            userId,
            actionId,
            AgentActionStatus.PENDING_APPROVAL,
            AgentActionStatus.REJECTED,
            decidedAt
        );
        if (updated != 1) {
            return Optional.empty();
        }
        return findActionByUserIdAndActionId(userId, actionId);
    }

    @Override
    @Transactional(readOnly = true)
    public List<AgentAction> findActionsByUserIdAndThreadId(String userId, String threadId) {
        return actionRepository.findByUserIdAndThreadIdOrderByCreatedAtAsc(userId, threadId).stream()
            .map(AgentActionJpaEntity::toDomain)
            .toList();
    }

    private String latestMessagePreview(String userId, String threadId) {
        return messageRepository
            .findFirstByUserIdAndThreadIdOrderByCreatedAtDescMessageIdDesc(userId, threadId)
            .map(AgentMessageJpaEntity::content)
            .orElse(null);
    }

    private static Instant instantValue(Object value) {
        if (value instanceof Instant instant) {
            return instant;
        }
        if (value instanceof OffsetDateTime offsetDateTime) {
            return offsetDateTime.toInstant();
        }
        if (value instanceof Timestamp timestamp) {
            return timestamp.toInstant();
        }
        if (value instanceof LocalDateTime localDateTime) {
            return localDateTime.toInstant(ZoneOffset.UTC);
        }
        if (value != null) {
            return Instant.parse(value.toString());
        }
        return Instant.EPOCH;
    }

    private static long longValue(Object value) {
        if (value instanceof Number number) {
            return number.longValue();
        }
        if (value != null) {
            return Long.parseLong(value.toString());
        }
        return 0L;
    }
}
