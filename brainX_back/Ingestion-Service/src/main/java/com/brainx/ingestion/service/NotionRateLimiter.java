package com.brainx.ingestion.service;

import jakarta.annotation.PreDestroy;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.Semaphore;
import java.util.concurrent.TimeUnit;

/**
 * Notion API는 "초당 평균 3회"를 권장 한도로 둔다. 페이지/데이터베이스 재귀 임포트는 짧은 시간에
 * 수십~수백 건의 호출을 만들어낼 수 있어, NotionApiService의 모든 api.notion.com 호출은 이 큐를
 * 거쳐 순차적으로 나가야 429(Too Many Requests)를 피할 수 있다. 매초 최대 3허가를 다시 채우는
 * 단순 토큰 버킷이며, 허가가 없으면 acquire()가 다음 충전까지 블로킹한다.
 */
@Slf4j
@Component
public class NotionRateLimiter {

    private static final int PERMITS_PER_SECOND = 3;

    private final Semaphore semaphore = new Semaphore(PERMITS_PER_SECOND);
    private final ScheduledExecutorService scheduler = Executors.newSingleThreadScheduledExecutor(r -> {
        Thread t = new Thread(r, "notion-rate-limiter");
        t.setDaemon(true);
        return t;
    });

    public NotionRateLimiter() {
        scheduler.scheduleAtFixedRate(() -> {
            int toRelease = PERMITS_PER_SECOND - semaphore.availablePermits();
            if (toRelease > 0) semaphore.release(toRelease);
        }, 1, 1, TimeUnit.SECONDS);
    }

    public void acquire() {
        try {
            semaphore.acquire();
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException("Notion rate limiter 대기 중 인터럽트됨", e);
        }
    }

    @PreDestroy
    public void shutdown() {
        scheduler.shutdownNow();
    }
}
