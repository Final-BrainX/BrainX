package com.brainx.workspace.service;

import com.brainx.workspace.dto.WorkspaceDtos.NoteDraftSaveRequest;
import com.brainx.workspace.security.CurrentActor.Actor;
import com.brainx.workspace.security.CurrentActor.ActorType;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.data.redis.core.Cursor;
import org.springframework.data.redis.core.ScanOptions;
import org.springframework.data.redis.core.SetOperations;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.ValueOperations;
import org.springframework.test.util.ReflectionTestUtils;

import java.time.Duration;
import java.time.Instant;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentCaptor.forClass;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class NoteDraftServiceTest {
    @Test
    void saveDraftSeparatesRedisKeysByActorTypeAndId() {
        StringRedisTemplate redisTemplate = mock(StringRedisTemplate.class);
        ValueOperations<String, String> valueOperations = mock(ValueOperations.class);
        SetOperations<String, String> setOperations = mock(SetOperations.class);
        when(redisTemplate.opsForValue()).thenReturn(valueOperations);
        when(redisTemplate.opsForSet()).thenReturn(setOperations);

        NoteDraftService service = new NoteDraftService(redisTemplate, new ObjectMapper());
        ReflectionTestUtils.setField(service, "draftTtlSeconds", 60L);

        NoteDraftSaveRequest request = new NoteDraftSaveRequest("dgrp_default_usr_123", "Draft title", "hello draft", null, 3, Instant.parse("2026-06-25T00:00:00Z"));

        var userResult = service.saveDraft(new Actor(ActorType.USER, "usr_123"), "note_1", request);
        var guestResult = service.saveDraft(new Actor(ActorType.GUEST, "gst_abc"), "note_1", request);

        verify(valueOperations).set(eq("workspace:note:draft:user:usr_123:note_1"), any(String.class), eq(Duration.ofSeconds(60)));
        verify(valueOperations).set(eq("workspace:note:draft:guest:gst_abc:note_1"), any(String.class), eq(Duration.ofSeconds(60)));
        verify(setOperations).add("workspace:note:dirty:user:usr_123", "note_1");
        verify(setOperations).add("workspace:note:dirty:guest:gst_abc", "note_1");
        assertThat(userResult.documentGroupId()).isEqualTo("dgrp_default_usr_123");
        assertThat(guestResult.documentGroupId()).isEqualTo("dgrp_default_usr_123");
        assertThat(userResult.actorType()).isEqualTo("USER");
        assertThat(guestResult.actorType()).isEqualTo("GUEST");
    }

    @Test
    void getDraftReturnsNullWhenDraftDoesNotExist() {
        StringRedisTemplate redisTemplate = mock(StringRedisTemplate.class);
        ValueOperations<String, String> valueOperations = mock(ValueOperations.class);
        when(redisTemplate.opsForValue()).thenReturn(valueOperations);
        when(valueOperations.get("workspace:note:draft:guest:gst_abc:note_1")).thenReturn(null);

        NoteDraftService service = new NoteDraftService(redisTemplate, new ObjectMapper());

        var result = service.getDraft(new Actor(ActorType.GUEST, "gst_abc"), "note_1");

        assertThat(result).isNull();
    }

    @Test
    void getDraftReturnsStoredDraftForActorKey() {
        StringRedisTemplate redisTemplate = mock(StringRedisTemplate.class);
        ValueOperations<String, String> valueOperations = mock(ValueOperations.class);
        when(redisTemplate.opsForValue()).thenReturn(valueOperations);
        when(valueOperations.get("workspace:note:draft:user:usr_123:note_1")).thenReturn("""
                {"actorType":"USER","actorId":"usr_123","noteId":"note_1","documentGroupId":"dgrp_default_usr_123","title":"Draft title","markdown":"hello draft","baseVersion":3,"clientSavedAt":"2026-06-25T00:00:00Z","savedAt":"2026-06-25T00:00:01Z"}
                """);
        when(redisTemplate.getExpire("workspace:note:draft:user:usr_123:note_1")).thenReturn(30L);

        NoteDraftService service = new NoteDraftService(redisTemplate, new ObjectMapper());
        ReflectionTestUtils.setField(service, "draftTtlSeconds", 60L);

        var result = service.getDraft(new Actor(ActorType.USER, "usr_123"), "note_1");

        assertThat(result).isNotNull();
        assertThat(result.documentGroupId()).isEqualTo("dgrp_default_usr_123");
        assertThat(result.actorType()).isEqualTo("USER");
        assertThat(result.title()).isEqualTo("Draft title");
        assertThat(result.markdown()).isEqualTo("hello draft");
        assertThat(result.baseVersion()).isEqualTo(3);
    }

    @Test
    void issueDraftIdReturnsServerNoteIdWithoutRedisWrite() {
        StringRedisTemplate redisTemplate = mock(StringRedisTemplate.class);
        NoteDraftService service = new NoteDraftService(redisTemplate, new ObjectMapper());

        var result = service.issueDraftId(new Actor(ActorType.GUEST, "gst_abc"));

        assertThat(result.noteId()).startsWith("note_");
        assertThat(result.actorType()).isEqualTo("GUEST");
        assertThat(result.status()).isEqualTo("DRAFT_ID_ISSUED");
    }

    @Test
    void listDraftsReturnsCurrentActorDirtyDrafts() {
        StringRedisTemplate redisTemplate = mock(StringRedisTemplate.class);
        ValueOperations<String, String> valueOperations = mock(ValueOperations.class);
        SetOperations<String, String> setOperations = mock(SetOperations.class);
        when(redisTemplate.opsForValue()).thenReturn(valueOperations);
        when(redisTemplate.opsForSet()).thenReturn(setOperations);
        when(setOperations.members("workspace:note:dirty:guest:gst_abc")).thenReturn(Set.of("note_1", "note_2"));
        when(valueOperations.get("workspace:note:draft:guest:gst_abc:note_1")).thenReturn("""
                {"actorType":"GUEST","actorId":"gst_abc","noteId":"note_1","title":"Older title","markdown":"older","baseVersion":1,"clientSavedAt":"2026-06-25T00:00:00Z","savedAt":"2026-06-25T00:00:01Z"}
                """);
        when(valueOperations.get("workspace:note:draft:guest:gst_abc:note_2")).thenReturn("""
                {"actorType":"GUEST","actorId":"gst_abc","noteId":"note_2","title":"Newer title","markdown":"newer","baseVersion":1,"clientSavedAt":"2026-06-25T00:00:00Z","savedAt":"2026-06-25T00:00:03Z"}
                """);
        when(redisTemplate.getExpire("workspace:note:draft:guest:gst_abc:note_1")).thenReturn(30L);
        when(redisTemplate.getExpire("workspace:note:draft:guest:gst_abc:note_2")).thenReturn(30L);

        NoteDraftService service = new NoteDraftService(redisTemplate, new ObjectMapper());
        ReflectionTestUtils.setField(service, "draftTtlSeconds", 60L);

        var result = service.listDrafts(new Actor(ActorType.GUEST, "gst_abc"));

        assertThat(result.drafts()).extracting("noteId").containsExactly("note_2", "note_1");
        assertThat(result.drafts()).extracting("title").containsExactly("Newer title", "Older title");
    }

    @Test
    void deleteDraftRemovesDraftValueAndDirtySetMember() {
        StringRedisTemplate redisTemplate = mock(StringRedisTemplate.class);
        SetOperations<String, String> setOperations = mock(SetOperations.class);
        when(redisTemplate.opsForSet()).thenReturn(setOperations);

        NoteDraftService service = new NoteDraftService(redisTemplate, new ObjectMapper());

        service.deleteDraft(new Actor(ActorType.GUEST, "gst_abc"), "note_1");

        verify(redisTemplate).delete("workspace:note:draft:guest:gst_abc:note_1");
        verify(setOperations).remove("workspace:note:dirty:guest:gst_abc", "note_1");
    }

    @Test
    void userIdsWithDirtyDraftsReturnsUserIdsFromDirtyKeys() {
        StringRedisTemplate redisTemplate = mock(StringRedisTemplate.class);
        Cursor<String> cursor = mock(Cursor.class);
        when(redisTemplate.scan(any(ScanOptions.class))).thenReturn(cursor);
        when(cursor.hasNext()).thenReturn(true, true, true, false);
        when(cursor.next()).thenReturn(
                "workspace:note:dirty:user:usr_1",
                "workspace:note:dirty:user:usr_2",
                "workspace:note:dirty:user:usr_1"
        );

        NoteDraftService service = new NoteDraftService(redisTemplate, new ObjectMapper());

        assertThat(service.userIdsWithDirtyDrafts()).containsExactly("usr_1", "usr_2");
        var scanOptionsCaptor = forClass(ScanOptions.class);
        verify(redisTemplate).scan(scanOptionsCaptor.capture());
        assertThat(scanOptionsCaptor.getValue().getPattern()).isEqualTo("workspace:note:dirty:user:*");
        assertThat(scanOptionsCaptor.getValue().getCount()).isEqualTo(500L);
        verify(redisTemplate, never()).keys(any(String.class));
        verify(cursor).close();
    }

    @Test
    void userIdsWithDirtyDraftsReturnsEmptyListWhenScanHasNoDirtyKeys() {
        StringRedisTemplate redisTemplate = mock(StringRedisTemplate.class);
        Cursor<String> cursor = mock(Cursor.class);
        when(redisTemplate.scan(any(ScanOptions.class))).thenReturn(cursor);
        when(cursor.hasNext()).thenReturn(false);

        NoteDraftService service = new NoteDraftService(redisTemplate, new ObjectMapper());

        assertThat(service.userIdsWithDirtyDrafts()).isEmpty();
        var scanOptionsCaptor = forClass(ScanOptions.class);
        verify(redisTemplate).scan(scanOptionsCaptor.capture());
        assertThat(scanOptionsCaptor.getValue().getPattern()).isEqualTo("workspace:note:dirty:user:*");
        assertThat(scanOptionsCaptor.getValue().getCount()).isEqualTo(500L);
        verify(redisTemplate, never()).keys(any(String.class));
        verify(cursor).close();
    }

    @Test
    void userIdsWithDirtyDraftsSkipsMalformedKeysWithUnexpectedSegments() {
        StringRedisTemplate redisTemplate = mock(StringRedisTemplate.class);
        Cursor<String> cursor = mock(Cursor.class);
        when(redisTemplate.scan(any(ScanOptions.class))).thenReturn(cursor);
        when(cursor.hasNext()).thenReturn(true, true, true, false);
        when(cursor.next()).thenReturn(
                "workspace:note:dirty:user:usr_1",
                "workspace:note:dirty:user:usr_2:extra",
                "workspace:note:dirty:user:usr_3"
        );

        NoteDraftService service = new NoteDraftService(redisTemplate, new ObjectMapper());

        assertThat(service.userIdsWithDirtyDrafts()).containsExactly("usr_1", "usr_3");
        verify(redisTemplate).scan(any(ScanOptions.class));
        verify(cursor).close();
    }
}
