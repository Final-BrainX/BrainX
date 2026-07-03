package com.brainx.workspace.service;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.scheduling.annotation.Scheduled;

import java.lang.reflect.Method;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.BDDMockito.given;
import static org.mockito.Mockito.verify;

/**
 * [WS-02] 단위 테스트: 드래프트 스케줄러 fixedDelayString 단위 오류 검증
 *
 * NoteDraftFlushScheduler.java:16
 *   @Scheduled(fixedDelayString = "${brainx.workspace.draft.flush-interval-seconds:30}000")
 *
 * 문제: 설정값 뒤에 "000"을 문자열로 붙여 ms 변환.
 *   - flush-interval-seconds=30 → "30000" ms (30초, 의도대로)
 *   - flush-interval-seconds=300 → "300000" ms (5분, 의도와 다름 — 단위가 초인데 큰 값 입력 시 폭발)
 *   - flush-interval-seconds=5000 → "5000000" ms = 83분 (ms 단위로 착각 시 치명적)
 *
 * 수정 방향: fixedDelayString = "${brainx.workspace.draft.flush-delay-ms}" 로 변경 후
 *            application.yml에서 ms 단위 직접 설정.
 */
@ExtendWith(MockitoExtension.class)
class NoteDraftFlushSchedulerTest {

    @InjectMocks
    private NoteDraftFlushScheduler scheduler;

    @Mock
    private NoteDraftPersistenceService noteDraftPersistenceService;

    @Test
    @DisplayName("[WS-02] @Scheduled fixedDelayString에 '000' 문자열 결합 방식 사용 중 — 단위 오류 확인")
    void scheduler_fixedDelayString_usesStringConcatenationForMs() throws NoSuchMethodException {
        // given — 리플렉션으로 실제 @Scheduled 애너테이션 값 확인
        Method method = NoteDraftFlushScheduler.class.getDeclaredMethod("flushIdleUserDrafts");
        Scheduled scheduled = method.getAnnotation(Scheduled.class);

        // when
        String fixedDelayString = scheduled.fixedDelayString();

        // then — 버그: "000"을 문자열로 붙이는 방식 사용 중
        assertThat(fixedDelayString).endsWith("000");
        assertThat(fixedDelayString).contains("flush-interval-seconds");

        /*
         * 단위 오류 시뮬레이션 (주석 형태로 재현):
         *   flush-interval-seconds=30   → fixedDelay = 30_000  ms (30초, 정상)
         *   flush-interval-seconds=300  → fixedDelay = 300_000 ms (5분, 의도와 다름)
         *   flush-interval-seconds=5000 → fixedDelay = 5_000_000 ms = 83분 (치명적 오류)
         */
    }

    @Test
    @DisplayName("[WS-02] 스케줄러 호출 시 NoteDraftPersistenceService.flushIdleUserDrafts 위임 확인")
    void scheduler_whenCalled_delegatesToPersistenceService() {
        // given
        given(noteDraftPersistenceService.flushIdleUserDrafts())
                .willReturn(new com.brainx.workspace.dto.WorkspaceDtos.NoteDraftFlushData(0, 0));

        // when
        scheduler.flushIdleUserDrafts();

        // then
        verify(noteDraftPersistenceService).flushIdleUserDrafts();
    }

    @Test
    @DisplayName("[WS-02] PersistenceService 예외 발생 시 스케줄러가 예외를 삼키고 계속 동작")
    void scheduler_whenPersistenceServiceThrows_doesNotPropagateException() {
        // given
        given(noteDraftPersistenceService.flushIdleUserDrafts())
                .willThrow(new RuntimeException("Redis 연결 실패"));

        // when / then — 예외가 전파되지 않아야 스케줄러가 멈추지 않음
        org.assertj.core.api.Assertions.assertThatCode(() -> scheduler.flushIdleUserDrafts())
                .doesNotThrowAnyException();
    }
}
