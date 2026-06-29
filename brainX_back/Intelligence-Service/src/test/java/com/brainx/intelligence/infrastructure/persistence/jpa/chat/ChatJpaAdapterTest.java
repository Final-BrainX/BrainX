package com.brainx.intelligence.infrastructure.persistence.jpa.chat;

import static org.assertj.core.api.Assertions.assertThat;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.boot.test.autoconfigure.orm.jpa.TestEntityManager;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.ActiveProfiles;

import com.brainx.intelligence.chat.application.port.outbound.ChatPersistencePort.ChatThreadSummaryCursor;
import com.brainx.intelligence.chat.domain.ChatCitation;
import com.brainx.intelligence.chat.domain.ChatMessage;
import com.brainx.intelligence.chat.domain.ChatRole;
import com.brainx.intelligence.chat.domain.ChatThread;
import com.brainx.intelligence.chat.domain.ChatTokenUsage;

@DataJpaTest
@ActiveProfiles("test")
@Import(ChatJpaAdapter.class)
class ChatJpaAdapterTest {

    @Autowired
    private ChatJpaAdapter chatJpaAdapter;

    @Autowired
    private TestEntityManager entityManager;

    @Test
    void saveAndFindThreadByUserAndThreadId() {
        chatJpaAdapter.saveThread(new ChatThread(
            "thread-1",
            "user-1",
            "group-1",
            "RAG 질문",
            "gpt-test",
            Instant.parse("2026-06-23T00:00:00Z")
        ));
        entityManager.flush();
        entityManager.clear();

        var found = chatJpaAdapter.findThreadByUserIdAndThreadId("user-1", "thread-1").orElseThrow();

        assertThat(found.threadId()).isEqualTo("thread-1");
        assertThat(found.documentGroupId()).isEqualTo("group-1");
        assertThat(found.title()).isEqualTo("RAG 질문");
    }

    @Test
    void saveAndFindMessagesPreservesJsonFieldsAndOrder() {
        chatJpaAdapter.saveThread(new ChatThread(
            "thread-1",
            "user-1",
            "group-1",
            "RAG 질문",
            "gpt-test",
            Instant.parse("2026-06-23T00:00:00Z")
        ));
        chatJpaAdapter.saveMessage(ChatMessage.user(
            "message-1",
            "thread-1",
            "user-1",
            "RAG란?",
            "gpt-test",
            Map.of("documentGroupId", "group-1", "noteIds", List.of("note-1")),
            Map.of(
                "mode", "SELECTION",
                "source", "RIGHT_SIDEBAR",
                "items", List.of(Map.of(
                    "type", "SELECTION",
                    "text", "선택 문맥"
                ))
            ),
            Instant.parse("2026-06-23T00:00:01Z")
        ));
        chatJpaAdapter.saveMessage(ChatMessage.assistant(
            "message-2",
            "thread-1",
            "user-1",
            "답변",
            "gpt-test",
            List.of(new ChatCitation(
                "note-1",
                "group-1",
                "note-1::0",
                0,
                "RAG note",
                "docs/rag.md",
                "rag.md",
                0.91d
            )),
            new ChatTokenUsage(
                10,
                0,
                10,
                5,
                0,
                15,
                new BigDecimal("0.001"),
                null,
                new BigDecimal("0.002"),
                new BigDecimal("0.003"),
                "USD"
            ),
            Instant.parse("2026-06-23T00:00:02Z")
        ));
        entityManager.flush();
        entityManager.clear();

        var messages = chatJpaAdapter.findMessagesByUserIdAndThreadId("user-1", "thread-1");

        assertThat(messages).hasSize(2);
        assertThat(messages.get(0).role()).isEqualTo(ChatRole.USER);
        assertThat(messages.get(0).noteScope()).containsEntry("noteIds", List.of("note-1"));
        assertThat(messages.get(0).clientContext()).containsEntry("mode", "SELECTION");
        assertThat(messages.get(1).role()).isEqualTo(ChatRole.ASSISTANT);
        assertThat(messages.get(1).citations()).hasSize(1);
        assertThat(messages.get(1).citations().getFirst().sourcePath()).isEqualTo("docs/rag.md");
        assertThat(messages.get(1).tokenUsage().inputTokens()).isEqualTo(10);
        assertThat(messages.get(1).tokenUsage().estimatedCost()).isEqualByComparingTo("0.003");
    }

    @Test
    void findThreadSummariesOrdersByLatestMessageAndSupportsCursor() {
        chatJpaAdapter.saveThread(new ChatThread(
            "thread-1",
            "user-1",
            "default",
            "첫 대화",
            "gpt-test",
            Instant.parse("2026-06-23T00:00:00Z")
        ));
        chatJpaAdapter.saveThread(new ChatThread(
            "thread-2",
            "user-1",
            "default",
            "메시지 없는 대화",
            "gpt-test",
            Instant.parse("2026-06-23T00:02:00Z")
        ));
        chatJpaAdapter.saveThread(new ChatThread(
            "thread-other",
            "user-2",
            "default",
            "다른 사용자",
            "gpt-test",
            Instant.parse("2026-06-23T00:05:00Z")
        ));
        chatJpaAdapter.saveMessage(ChatMessage.user(
            "message-1",
            "thread-1",
            "user-1",
            "오래된 질문",
            "gpt-test",
            Map.of(),
            Map.of(),
            Instant.parse("2026-06-23T00:01:00Z")
        ));
        chatJpaAdapter.saveMessage(ChatMessage.assistant(
            "message-2",
            "thread-1",
            "user-1",
            "최신 답변",
            "gpt-test",
            List.of(),
            null,
            Instant.parse("2026-06-23T00:04:00Z")
        ));
        entityManager.flush();
        entityManager.clear();

        var firstPage = chatJpaAdapter.findThreadSummariesByUserId("user-1", null, 1);

        assertThat(firstPage).hasSize(1);
        assertThat(firstPage.getFirst().threadId()).isEqualTo("thread-1");
        assertThat(firstPage.getFirst().lastMessageAt()).isEqualTo(Instant.parse("2026-06-23T00:04:00Z"));
        assertThat(firstPage.getFirst().lastMessagePreview()).isEqualTo("최신 답변");
        assertThat(firstPage.getFirst().messageCount()).isEqualTo(2);

        var secondPage = chatJpaAdapter.findThreadSummariesByUserId(
            "user-1",
            new ChatThreadSummaryCursor(firstPage.getFirst().lastMessageAt(), firstPage.getFirst().threadId()),
            10
        );

        assertThat(secondPage).hasSize(1);
        assertThat(secondPage.getFirst().threadId()).isEqualTo("thread-2");
        assertThat(secondPage.getFirst().lastMessageAt()).isEqualTo(Instant.parse("2026-06-23T00:02:00Z"));
        assertThat(secondPage.getFirst().lastMessagePreview()).isNull();
        assertThat(secondPage.getFirst().messageCount()).isZero();
    }
}
