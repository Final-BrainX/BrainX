package com.brainx.ingestion.service;

import com.brainx.ingestion.entity.ImportJob;
import com.brainx.ingestion.entity.ImportJob.JobStatus;
import com.brainx.ingestion.repository.ImportJobRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

/**
 * 비동기 워커 스레드에서 ImportJob 상태를 짧은 트랜잭션 단위로 갱신하기 위한 전용 컴포넌트.
 * ImportService 안에 @Transactional 메서드를 두고 같은 클래스에서 this.xxx()로 호출하면
 * Spring AOP 프록시를 거치지 않아(self-invocation) 트랜잭션이 전혀 걸리지 않는 문제가 있어
 * 별도 빈으로 분리했다.
 */
@Component
@RequiredArgsConstructor
public class ImportJobStatusUpdater {

    private final ImportJobRepository importJobRepository;

    @Transactional
    public void markProcessing(String jobId) {
        importJobRepository.findById(jobId).ifPresent(job -> {
            job.setStatus(JobStatus.PROCESSING);
            importJobRepository.save(job);
        });
    }

    @Transactional
    public void markCompleted(String jobId, List<String> noteIds, List<String> failedItems) {
        importJobRepository.findById(jobId).ifPresent(job -> {
            job.setStatus(JobStatus.COMPLETED);
            job.setCreatedNoteIds(String.join(",", noteIds));
            if (!failedItems.isEmpty()) {
                job.setFailedFiles(String.join(",", failedItems));
            }
            importJobRepository.save(job);
        });
    }

    @Transactional
    public void markFailed(String jobId, String message) {
        importJobRepository.findById(jobId).ifPresent(job -> {
            job.setStatus(JobStatus.FAILED);
            job.setFailedFiles(message);
            importJobRepository.save(job);
        });
    }
}
