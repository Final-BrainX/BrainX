package com.brainx.intelligence.chat.adapter.web;

import static org.hamcrest.Matchers.containsString;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.argThat;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.asyncDispatch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.request;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.Instant;
import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

import com.brainx.intelligence.chat.application.port.inbound.CreateChatThreadUseCase;
import com.brainx.intelligence.chat.application.port.inbound.CreateChatThreadUseCase.ChatThreadResult;
import com.brainx.intelligence.chat.application.port.inbound.CreateChatThreadUseCase.CreateChatThreadCommand;
import com.brainx.intelligence.chat.application.port.inbound.GetChatThreadUseCase;
import com.brainx.intelligence.chat.application.port.inbound.GetChatThreadUseCase.ChatThreadDetailResult;
import com.brainx.intelligence.chat.application.port.inbound.GetChatThreadUseCase.GetChatThreadQuery;
import com.brainx.intelligence.chat.application.port.inbound.GetChatThreadUseCase.ThreadView;
import com.brainx.intelligence.chat.application.port.inbound.ListChatThreadsUseCase;
import com.brainx.intelligence.chat.application.port.inbound.ListChatThreadsUseCase.ChatThreadListItem;
import com.brainx.intelligence.chat.application.port.inbound.ListChatThreadsUseCase.ChatThreadListPagination;
import com.brainx.intelligence.chat.application.port.inbound.ListChatThreadsUseCase.ChatThreadListResult;
import com.brainx.intelligence.chat.application.port.inbound.ListChatThreadsUseCase.ListChatThreadsQuery;
import com.brainx.intelligence.chat.application.port.inbound.RecordChatDraftNoteUseCase;
import com.brainx.intelligence.chat.application.port.inbound.RecordChatDraftNoteUseCase.ChatDraftNoteResult;
import com.brainx.intelligence.chat.application.port.inbound.RecordChatDraftNoteUseCase.RecordChatDraftNoteCommand;
import com.brainx.intelligence.chat.application.port.inbound.SendChatMessageUseCase;
import com.brainx.intelligence.chat.application.port.inbound.SendChatMessageUseCase.ChatStreamEvent;
import com.brainx.intelligence.chat.application.port.inbound.SendChatMessageUseCase.SendChatMessageCommand;
import com.brainx.intelligence.chat.application.port.inbound.UpdateChatThreadUseCase;
import com.brainx.intelligence.chat.application.port.inbound.UpdateChatThreadUseCase.ChatThreadDeleteResult;
import com.brainx.intelligence.chat.application.port.inbound.UpdateChatThreadUseCase.ChatThreadUpdateResult;
import com.brainx.intelligence.chat.application.port.inbound.UpdateChatThreadUseCase.DeleteChatThreadCommand;
import com.brainx.intelligence.chat.application.port.inbound.UpdateChatThreadUseCase.UpdateChatThreadCommand;
import com.brainx.intelligence.chat.domain.ChatConflictException;
import com.brainx.intelligence.chat.domain.ChatDomainException;
import com.brainx.intelligence.infrastructure.security.SecurityConfig;
import com.brainx.intelligence.infrastructure.web.GlobalApiExceptionHandler;

import reactor.core.publisher.Flux;

@WebMvcTest(ChatController.class)
@Import({SecurityConfig.class, GlobalApiExceptionHandler.class})
class ChatControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @MockitoBean
    private CreateChatThreadUseCase createChatThreadUseCase;

    @MockitoBean
    private ListChatThreadsUseCase listChatThreadsUseCase;

    @MockitoBean
    private SendChatMessageUseCase sendChatMessageUseCase;

    @MockitoBean
    private GetChatThreadUseCase getChatThreadUseCase;

    @MockitoBean
    private UpdateChatThreadUseCase updateChatThreadUseCase;

    @MockitoBean
    private RecordChatDraftNoteUseCase recordChatDraftNoteUseCase;

    @Test
    void createChatThreadReturnsCreatedWrappedData() throws Exception {
        Instant createdAt = Instant.parse("2026-06-23T00:00:00Z");
        when(createChatThreadUseCase.createChatThread(any(CreateChatThreadCommand.class)))
            .thenReturn(new ChatThreadResult("thread-1", "group-1", "RAG 질문", "gpt-test", createdAt));

        mockMvc.perform(post("/api/v1/ai/chat-threads")
                .with(user("user-1"))
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {
                      "documentGroupId": "group-1",
                      "title": "RAG 질문",
                      "initialMessage": "RAG에 대해 알려줘",
                      "modelId": "gpt-test"
                    }
                    """))
            .andExpect(status().isCreated())
            .andExpect(jsonPath("$.success").value(true))
            .andExpect(jsonPath("$.data.threadId").value("thread-1"))
            .andExpect(jsonPath("$.data.documentGroupId").value("group-1"))
            .andExpect(jsonPath("$.data.title").value("RAG 질문"))
            .andExpect(jsonPath("$.data.modelId").value("gpt-test"));

        verify(createChatThreadUseCase).createChatThread(argThat(command ->
            command.userId().equals("user-1")
                && command.documentGroupId().equals("group-1")
                && command.title().equals("RAG 질문")
                && command.initialMessage().equals("RAG에 대해 알려줘")
                && command.modelId().equals("gpt-test")
        ));
    }

    @Test
    void listChatThreadsReturnsPagedWrappedData() throws Exception {
        Instant createdAt = Instant.parse("2026-06-23T00:00:00Z");
        Instant lastMessageAt = Instant.parse("2026-06-23T00:01:00Z");
        when(listChatThreadsUseCase.listChatThreads(any(ListChatThreadsQuery.class)))
            .thenReturn(new ChatThreadListResult(
                List.of(new ChatThreadListItem(
                    "thread-1",
                    "group-1",
                    "RAG 질문",
                    "gpt-test",
                    createdAt,
                    lastMessageAt,
                    "최근 답변",
                    2
                )),
                new ChatThreadListPagination(10, "next-cursor", true)
            ));

        mockMvc.perform(get("/api/v1/ai/chat-threads")
                .with(user("user-1"))
                .param("limit", "10")
                .param("cursor", "cursor-1")
                .param("status", "archived"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.success").value(true))
            .andExpect(jsonPath("$.data.threads[0].threadId").value("thread-1"))
            .andExpect(jsonPath("$.data.threads[0].lastMessagePreview").value("최근 답변"))
            .andExpect(jsonPath("$.data.threads[0].messageCount").value(2))
            .andExpect(jsonPath("$.data.pagination.limit").value(10))
            .andExpect(jsonPath("$.data.pagination.nextCursor").value("next-cursor"))
            .andExpect(jsonPath("$.data.pagination.hasMore").value(true));

        verify(listChatThreadsUseCase).listChatThreads(argThat(query ->
            query.userId().equals("user-1")
                && query.limit().equals(10)
                && query.cursor().equals("cursor-1")
                && query.status().name().equals("ARCHIVED")
        ));
    }

    @Test
    void listChatThreadsInvalidCursorReturnsBadRequestWrapper() throws Exception {
        when(listChatThreadsUseCase.listChatThreads(any(ListChatThreadsQuery.class)))
            .thenThrow(new ChatDomainException("Invalid chat thread cursor."));

        mockMvc.perform(get("/api/v1/ai/chat-threads")
                .with(user("user-1"))
                .param("cursor", "bad"))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.success").value(false))
            .andExpect(jsonPath("$.error.code").value("BAD_REQUEST"));
    }

    @Test
    void sendChatMessageReturnsSseDeltaAndDoneEvents() throws Exception {
        when(sendChatMessageUseCase.sendChatMessage(any(SendChatMessageCommand.class)))
            .thenReturn(Flux.just(
                ChatStreamEvent.delta("answer"),
                ChatStreamEvent.done("message-2")
            ));

        MvcResult result = mockMvc.perform(post("/api/v1/ai/chat-threads/thread-1/messages")
                .with(user("user-1"))
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {
                      "message": "What is RAG?",
                      "noteScope": {
                        "documentGroupId": "group-1"
                      },
                      "clientContext": {
                        "mode": "SELECTION",
                        "source": "RIGHT_SIDEBAR",
                        "items": [
                          {
                            "type": "SELECTION",
                            "noteId": "note-1",
                            "documentGroupId": "group-1",
                            "text": "selected context",
                            "truncated": false,
                            "metadata": {
                              "sourceRange": {
                                "from": 1,
                                "to": 8
                              }
                            }
                          }
                        ]
                      },
                      "modelId": "gpt-test"
                    }
                    """))
            .andExpect(request().asyncStarted())
            .andReturn();

        mockMvc.perform(asyncDispatch(result))
            .andExpect(status().isOk())
            .andExpect(content().contentTypeCompatibleWith(MediaType.TEXT_EVENT_STREAM))
            .andExpect(content().string(containsString("event:delta")))
            .andExpect(content().string(containsString("data:{\"text\":\"answer\"}")))
            .andExpect(content().string(containsString("event:done")))
            .andExpect(content().string(containsString("data:{\"messageId\":\"message-2\"}")));

        verify(sendChatMessageUseCase).sendChatMessage(argThat(command ->
            command.userId().equals("user-1")
                && command.threadId().equals("thread-1")
                && command.message().equals("What is RAG?")
                && command.noteScope().get("documentGroupId").equals("group-1")
                && command.clientContext().get("mode").equals("SELECTION")
                && command.clientContext().get("source").equals("RIGHT_SIDEBAR")
                && ((Map<?, ?>) ((List<?>) command.clientContext().get("items")).getFirst())
                    .get("text").equals("selected context")
                && command.modelId().equals("gpt-test")
        ));
    }

    @Test
    void sendChatMessageWithoutAuthenticationIsRejectedBeforeAsyncDispatch() throws Exception {
        mockMvc.perform(post("/api/v1/ai/chat-threads/thread-1/messages")
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {
                      "message": "What is RAG?",
                      "modelId": "gpt-test"
                    }
                    """))
            .andExpect(status().isUnauthorized())
            .andExpect(jsonPath("$.success").value(false))
            .andExpect(jsonPath("$.error.code").value("UNAUTHORIZED"));
    }

    @Test
    void recordChatDraftNoteReturnsWrappedMapping() throws Exception {
        when(recordChatDraftNoteUseCase.recordChatDraftNote(any(RecordChatDraftNoteCommand.class)))
            .thenReturn(new ChatDraftNoteResult("thread-1", "message-2", "note-1"));

        mockMvc.perform(put("/api/v1/ai/chat-threads/thread-1/messages/message-2/draft-note")
                .with(user("user-1"))
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {
                      "noteId": "note-1"
                    }
                    """))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.success").value(true))
            .andExpect(jsonPath("$.data.threadId").value("thread-1"))
            .andExpect(jsonPath("$.data.messageId").value("message-2"))
            .andExpect(jsonPath("$.data.noteId").value("note-1"));

        verify(recordChatDraftNoteUseCase).recordChatDraftNote(argThat(command ->
            command.userId().equals("user-1")
                && command.threadId().equals("thread-1")
                && command.messageId().equals("message-2")
                && command.noteId().equals("note-1")
        ));
    }

    @Test
    void recordChatDraftNoteConflictReturnsConflictWrapper() throws Exception {
        when(recordChatDraftNoteUseCase.recordChatDraftNote(any(RecordChatDraftNoteCommand.class)))
            .thenThrow(new ChatConflictException("Chat message cannot be saved as a draft note."));

        mockMvc.perform(put("/api/v1/ai/chat-threads/thread-1/messages/message-2/draft-note")
                .with(user("user-1"))
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {
                      "noteId": "note-1"
                    }
                    """))
            .andExpect(status().isConflict())
            .andExpect(jsonPath("$.success").value(false))
            .andExpect(jsonPath("$.error.code").value("CONFLICT"));
    }

    @Test
    void getChatThreadReturnsThreadAndOpenMessages() throws Exception {
        Instant createdAt = Instant.parse("2026-06-23T00:00:00Z");
        when(getChatThreadUseCase.getChatThread(any(GetChatThreadQuery.class)))
            .thenReturn(new ChatThreadDetailResult(
                new ThreadView("thread-1", "group-1", "RAG 질문", "gpt-test", createdAt),
                List.of(Map.of(
                    "messageId", "message-1",
                    "role", "USER",
                    "content", "RAG란?"
                ))
            ));

        mockMvc.perform(get("/api/v1/ai/chat-threads/thread-1")
                .with(user("user-1")))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.data.thread.threadId").value("thread-1"))
            .andExpect(jsonPath("$.data.thread.documentGroupId").value("group-1"))
            .andExpect(jsonPath("$.data.messages[0].messageId").value("message-1"))
            .andExpect(jsonPath("$.data.messages[0].role").value("USER"));

        verify(getChatThreadUseCase).getChatThread(argThat(query ->
            query.userId().equals("user-1") && query.threadId().equals("thread-1")
        ));
    }

    @Test
    void updateChatThreadReturnsWrappedThread() throws Exception {
        Instant createdAt = Instant.parse("2026-06-23T00:00:00Z");
        Instant archivedAt = Instant.parse("2026-06-23T00:02:00Z");
        when(updateChatThreadUseCase.updateChatThread(any(UpdateChatThreadCommand.class)))
            .thenReturn(new ChatThreadUpdateResult(
                "thread-1",
                "group-1",
                "RAG 질문",
                "gpt-test",
                createdAt,
                archivedAt,
                null
            ));

        mockMvc.perform(patch("/api/v1/ai/chat-threads/thread-1")
                .with(user("user-1"))
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {
                      "archived": true
                    }
                    """))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.success").value(true))
            .andExpect(jsonPath("$.data.threadId").value("thread-1"))
            .andExpect(jsonPath("$.data.archivedAt").value("2026-06-23T00:02:00Z"));

        verify(updateChatThreadUseCase).updateChatThread(argThat(command ->
            command.userId().equals("user-1")
                && command.threadId().equals("thread-1")
                && command.archived()
        ));
    }

    @Test
    void deleteChatThreadReturnsWrappedDeleteData() throws Exception {
        Instant deletedAt = Instant.parse("2026-06-23T00:03:00Z");
        when(updateChatThreadUseCase.deleteChatThread(any(DeleteChatThreadCommand.class)))
            .thenReturn(new ChatThreadDeleteResult("thread-1", deletedAt));

        mockMvc.perform(delete("/api/v1/ai/chat-threads/thread-1")
                .with(user("user-1")))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.success").value(true))
            .andExpect(jsonPath("$.data.threadId").value("thread-1"))
            .andExpect(jsonPath("$.data.deletedAt").value("2026-06-23T00:03:00Z"));

        verify(updateChatThreadUseCase).deleteChatThread(argThat(command ->
            command.userId().equals("user-1") && command.threadId().equals("thread-1")
        ));
    }
}
