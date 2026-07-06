package com.brainx.ingestion.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.EnableAsync;
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;

import java.util.concurrent.Executor;
import java.util.concurrent.RejectedExecutionException;

@Configuration
@EnableAsync
public class AsyncConfig {

    /**
     * Notion 재귀 임포트 전용 워커 풀. NotionRateLimiter가 이미 초당 3허가로 상한을 걸어주므로
     * 풀 크기를 그보다 키워봐야 남는 스레드는 세마포어 대기로 블로킹될 뿐이다. core=max=4로
     * 고정해 "요청 스레드/DB 커넥션을 오래 붙잡는 문제"를 이 작은 전용 풀 안에 격리한다.
     * 큐를 무제한으로 두면 순간적으로 몰린 요청이 쌓여 OOM으로 이어지므로 50으로 제한하고,
     * 초과분은 CallerRunsPolicy(호출자=Tomcat 스레드에서 대신 실행) 대신 즉시 예외로
     * 실패시켜 원래 문제(요청 스레드 점유)가 다른 경로로 재발하지 않게 한다.
     */
    @Bean("notionImportExecutor")
    public Executor notionImportExecutor() {
        ThreadPoolTaskExecutor executor = new ThreadPoolTaskExecutor();
        executor.setCorePoolSize(4);
        executor.setMaxPoolSize(4);
        executor.setQueueCapacity(50);
        executor.setThreadNamePrefix("notion-import-");
        executor.setRejectedExecutionHandler((runnable, exec) -> {
            throw new RejectedExecutionException(
                    "Notion import queue is full (capacity=50)");
        });
        executor.initialize();
        return executor;
    }
}
