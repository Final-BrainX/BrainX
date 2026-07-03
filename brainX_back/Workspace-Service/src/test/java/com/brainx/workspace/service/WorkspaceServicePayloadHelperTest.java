package com.brainx.workspace.service;

import com.brainx.workspace.event.WorkspaceEventPublisher;
import com.brainx.workspace.graph.Neo4jGraphQueryService;
import com.brainx.workspace.repository.*;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.util.ReflectionTestUtils;

import java.lang.reflect.InvocationTargetException;
import java.lang.reflect.Method;
import java.util.Map;

import static org.assertj.core.api.Assertions.*;

/**
 * [WS-06] 단위 테스트: WorkspaceService.payload() 헬퍼 홀수 인수 전달 시 AIOOBE 버그 재현
 *
 * WorkspaceService.java:704-710
 *   private Map<String, Object> payload(Object... keyValues) {
 *       for (int i = 0; i < keyValues.length; i += 2) {
 *           result.put((String) keyValues[i], keyValues[i + 1]); // 홀수 인수 시 AIOOBE
 *       }
 *   }
 *
 * 발생 조건: keyValues 길이가 홀수일 때 마지막 순회에서 i+1이 배열 범위 초과
 */
@ExtendWith(MockitoExtension.class)
class WorkspaceServicePayloadHelperTest {

    @InjectMocks
    private WorkspaceService workspaceService;

    @Mock private NoteRepository noteRepository;
    @Mock private NoteVersionRepository noteVersionRepository;
    @Mock private FolderRepository folderRepository;
    @Mock private NoteLinkRepository noteLinkRepository;
    @Mock private FavoriteRepository favoriteRepository;
    @Mock private RecentActivityRepository recentActivityRepository;
    @Mock private GraphLayoutRepository graphLayoutRepository;
    @Mock private ShareLinkRepository shareLinkRepository;
    @Mock private WorkspaceEventPublisher eventPublisher;
    @Mock private ObjectMapper objectMapper;
    @Mock private Neo4jGraphQueryService neo4jGraphQueryService;

    private Method payloadMethod;

    @BeforeEach
    void setUp() throws NoSuchMethodException {
        ReflectionTestUtils.setField(workspaceService, "publicBaseUrl", "https://brainx.p-e.kr");
        payloadMethod = WorkspaceService.class.getDeclaredMethod("payload", Object[].class);
        payloadMethod.setAccessible(true);
    }

    @Test
    @DisplayName("[WS-06] payload() 홀수 인수(1개) 전달 시 ArrayIndexOutOfBoundsException 발생 — 버그 재현")
    void payload_withOddArguments_throwsArrayIndexOutOfBoundsException() {
        // when / then — keyValues.length=1, 마지막 순회에서 keyValues[1] 접근 → AIOOBE
        assertThatThrownBy(() -> {
            try {
                payloadMethod.invoke(workspaceService, (Object) new Object[]{"orphanKey"});
            } catch (InvocationTargetException e) {
                throw e.getCause();
            }
        }).isInstanceOf(ArrayIndexOutOfBoundsException.class);
    }

    @Test
    @DisplayName("[WS-06] payload() 홀수 인수(3개) 전달 시 ArrayIndexOutOfBoundsException 발생 — 버그 재현")
    void payload_withThreeArguments_throwsArrayIndexOutOfBoundsException() {
        // when / then — keyValues.length=3, 마지막 순회(i=2)에서 keyValues[3] 접근 → AIOOBE
        assertThatThrownBy(() -> {
            try {
                payloadMethod.invoke(workspaceService, (Object) new Object[]{"key1", "value1", "orphanKey"});
            } catch (InvocationTargetException e) {
                throw e.getCause();
            }
        }).isInstanceOf(ArrayIndexOutOfBoundsException.class);
    }

    @Test
    @DisplayName("[WS-06] payload() 짝수 인수(2개) 정상 동작 — 기준 케이스 확인")
    @SuppressWarnings("unchecked")
    void payload_withEvenArguments_returnsCorrectMap() throws Exception {
        // when
        Object result = payloadMethod.invoke(
                workspaceService,
                (Object) new Object[]{"noteId", "note-123", "userId", "user-456"}
        );

        // then
        assertThat(result).isInstanceOf(Map.class);
        Map<String, Object> map = (Map<String, Object>) result;
        assertThat(map).containsEntry("noteId", "note-123");
        assertThat(map).containsEntry("userId", "user-456");
    }

    @Test
    @DisplayName("[WS-06] payload() 빈 인수 전달 시 빈 맵 반환 — 경계 케이스")
    @SuppressWarnings("unchecked")
    void payload_withZeroArguments_returnsEmptyMap() throws Exception {
        // when
        Object result = payloadMethod.invoke(workspaceService, (Object) new Object[]{});

        // then
        assertThat(result).isInstanceOf(Map.class);
        assertThat((Map<String, Object>) result).isEmpty();
    }
}
