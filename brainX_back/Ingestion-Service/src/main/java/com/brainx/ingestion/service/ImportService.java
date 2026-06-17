package com.brainx.ingestion.service;

import com.brainx.ingestion.client.WorkspaceApiClient;
import com.brainx.ingestion.dto.request.IngestionRequest.*;
import com.brainx.ingestion.dto.response.IngestionResponse.*;
import java.util.ArrayList;
import java.util.List;
import com.brainx.ingestion.entity.ImportJob;
import com.brainx.ingestion.entity.ImportJob.ImportMode;
import com.brainx.ingestion.entity.ImportJob.JobStatus;
import com.brainx.ingestion.entity.ImportJob.SourceType;
import com.brainx.ingestion.entity.IntegrationAccount;
import com.brainx.ingestion.entity.IntegrationAccount.Provider;
import com.brainx.ingestion.exception.BrainXException;
import com.brainx.ingestion.repository.ImportJobRepository;
import com.brainx.ingestion.repository.IntegrationAccountRepository;
import com.brainx.ingestion.service.NotionApiService.NotionTokenResult;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.UUID;

@Slf4j
@Service
@RequiredArgsConstructor
public class ImportService {

    private final IntegrationAccountRepository integrationAccountRepository;
    private final ImportJobRepository importJobRepository;
    private final NotionApiService notionApiService;
    private final WorkspaceApiClient workspaceApiClient;

    @Value("${notion.client-id}")
    private String notionClientId;

    @Value("${notion.oauth-url}")
    private String notionOauthUrl;

    @Value("${notion.redirect-uri:http://localhost:5173/import/notion/callback}")
    private String notionRedirectUri;

    // ── Notion OAuth ──────────────────────────────────────────────────────

    @Transactional
    public NotionAuthorizeResponse generateNotionOAuthUrl(String userId) {
        String state = "st_" + UUID.randomUUID().toString().replace("-", "").substring(0, 12);

        IntegrationAccount pending = IntegrationAccount.builder()
                .userId(userId)
                .provider(Provider.NOTION)
                .state(state)
                .redirectUri(notionRedirectUri)
                .build();
        integrationAccountRepository.save(pending);

        String authorizationUrl = notionOauthUrl
                + "?client_id=" + notionClientId
                + "&response_type=code"
                + "&owner=user"
                + "&redirect_uri=" + notionRedirectUri
                + "&state=" + state;

        log.info("Notion OAuth URL 생성: userId={}, state={}", userId, state);
        return NotionAuthorizeResponse.builder()
                .authorizationUrl(authorizationUrl)
                .state(state)
                .build();
    }

    @Transactional
    public IntegrationConnectedResponse handleNotionCallback(String userId, NotionOAuthCallbackRequest request) {
        IntegrationAccount account = integrationAccountRepository
                .findByStateAndUserId(request.getState(), userId)
                .orElseThrow(() -> BrainXException.badRequest("INVALID_STATE", "유효하지 않은 state입니다"));

        // 이미 토큰 교환이 완료된 경우 (StrictMode 중복 요청 등) 바로 반환
        if (account.getAccessToken() != null) {
            return IntegrationConnectedResponse.from(account);
        }

        // 실제 Notion API로 code → access_token 교환
        NotionTokenResult token = notionApiService.exchangeToken(
                request.getCode(), account.getRedirectUri());

        account.setAccessToken(token.getAccessToken());
        account.setWorkspaceId(token.getWorkspaceId());
        account.setWorkspaceName(token.getWorkspaceName());
        account.setState(null);
        integrationAccountRepository.save(account);

        log.info("Notion 연동 완료: userId={}, workspace={}", userId, token.getWorkspaceName());
        return IntegrationConnectedResponse.from(account);
    }

    // ── Notion Import ─────────────────────────────────────────────────────

    @Transactional
    public ImportJobCreatedResponse createNotionImportJob(String userId,
                                                          NotionImportJobRequest request,
                                                          String jwtToken) {
        IntegrationAccount account = integrationAccountRepository
                .findByIntegrationAccountIdAndUserId(request.getIntegrationAccountId(), userId)
                .orElseThrow(() -> BrainXException.notFound("연동 계정을 찾을 수 없습니다"));

        ImportMode mode;
        try {
            mode = ImportMode.valueOf(request.getMode());
        } catch (IllegalArgumentException e) {
            throw BrainXException.badRequest("INVALID_MODE", "지원하지 않는 mode입니다. IMPORT 또는 FORK만 가능합니다.");
        }

        ImportJob job = ImportJob.builder()
                .userId(userId)
                .sourceType(SourceType.NOTION)
                .mode(mode)
                .integrationAccountId(request.getIntegrationAccountId())
                .sourceId(request.getSourceId())
                .targetFolderId(request.getTargetFolderId())
                .build();
        importJobRepository.save(job);

        // 실제 Notion 페이지 가져오기 (하위 페이지 재귀 포함)
        try {
            String accessToken = account.getAccessToken();
            List<String> allNoteIds = importPageRecursive(
                    request.getSourceId(), request.getTargetFolderId(), accessToken, jwtToken);

            job.setStatus(JobStatus.COMPLETED);
            job.setCreatedNoteIds(String.join(",", allNoteIds));
            log.info("Notion 가져오기 완료: jobId={}, 생성 노트 수={}", job.getImportJobId(), allNoteIds.size());
        } catch (Exception e) {
            job.setStatus(JobStatus.FAILED);
            job.setFailedFiles("페이지 가져오기 실패: " + e.getMessage());
            log.error("Notion 가져오기 실패: jobId={}, error={}", job.getImportJobId(), e.getMessage());
        }
        importJobRepository.save(job);

        return ImportJobCreatedResponse.from(job);
    }

    // ── Notion 재귀 임포트 ────────────────────────────────────────────────

    private List<String> importPageRecursive(String pageId, String folderId,
                                             String accessToken, String jwtToken) {
        List<String> allNoteIds = new ArrayList<>();

        String title = notionApiService.getPageTitle(pageId, accessToken);
        String markdown = notionApiService.getPageMarkdown(pageId, accessToken);
        String noteId = workspaceApiClient.createNote(title, markdown, folderId, null, jwtToken);
        allNoteIds.add(noteId);

        List<NotionApiService.ChildPageRef> childPages = notionApiService.getChildPages(pageId, accessToken);
        for (NotionApiService.ChildPageRef child : childPages) {
            try {
                List<String> childNoteIds = importPageRecursive(child.id(), folderId, accessToken, jwtToken);
                if (!childNoteIds.isEmpty()) {
                    workspaceApiClient.createNoteLink(noteId, childNoteIds.get(0), child.title(), jwtToken);
                    allNoteIds.addAll(childNoteIds);
                }
            } catch (Exception e) {
                log.warn("하위 페이지 가져오기 실패: childPageId={}, error={}", child.id(), e.getMessage());
            }
        }

        return allNoteIds;
    }

    // ── Notion 페이지 목록 조회 ───────────────────────────────────────────

    public List<NotionApiService.NotionPageItem> getNotionPages(String userId, String integrationAccountId) {
        IntegrationAccount account = integrationAccountRepository
                .findByIntegrationAccountIdAndUserId(integrationAccountId, userId)
                .orElseThrow(() -> BrainXException.notFound("연동 계정을 찾을 수 없습니다"));
        return notionApiService.searchPages(account.getAccessToken());
    }

    // ── Obsidian Import ───────────────────────────────────────────────────

    @Transactional
    public ImportJobCreatedResponse createObsidianImportJob(String userId, ObsidianImportJobRequest request) {
        ImportJob job = ImportJob.builder()
                .userId(userId)
                .sourceType(SourceType.OBSIDIAN)
                .mode(ImportMode.IMPORT)
                .uploadedZipAssetId(request.getUploadedZipAssetId())
                .targetFolderId(request.getTargetFolderId())
                .build();
        importJobRepository.save(job);
        log.info("Obsidian 가져오기 작업 생성: jobId={}", job.getImportJobId());
        return ImportJobCreatedResponse.from(job);
    }

    // ── 상태 조회 ─────────────────────────────────────────────────────────

    public ImportJobStatusResponse getImportJobStatus(String userId, String importJobId) {
        ImportJob job = importJobRepository
                .findByImportJobIdAndUserId(importJobId, userId)
                .orElseThrow(() -> BrainXException.notFound("가져오기 작업을 찾을 수 없습니다"));
        return ImportJobStatusResponse.from(job);
    }
}
