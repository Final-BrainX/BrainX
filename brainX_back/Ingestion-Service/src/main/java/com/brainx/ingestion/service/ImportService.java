package com.brainx.ingestion.service;

import com.brainx.ingestion.client.WorkspaceApiClient;
import com.brainx.ingestion.dto.request.IngestionRequest.*;
import com.brainx.ingestion.dto.response.IngestionResponse.*;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import com.brainx.ingestion.entity.Asset;
import com.brainx.ingestion.entity.ImportJob;
import com.brainx.ingestion.entity.ImportJob.ImportMode;
import com.brainx.ingestion.entity.ImportJob.JobStatus;
import com.brainx.ingestion.entity.ImportJob.SourceType;
import com.brainx.ingestion.entity.IntegrationAccount;
import com.brainx.ingestion.entity.IntegrationAccount.Provider;
import com.brainx.ingestion.exception.BrainXException;
import com.brainx.ingestion.repository.ImportJobRepository;
import com.brainx.ingestion.repository.IntegrationAccountRepository;
import com.brainx.ingestion.service.ContentConverter.ZipEntryContent;
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
    private final AssetService assetService;
    private final ContentConverter contentConverter;

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

        String encodedRedirectUri;
        try {
            encodedRedirectUri = java.net.URLEncoder.encode(notionRedirectUri, "UTF-8");
        } catch (java.io.UnsupportedEncodingException e) {
            encodedRedirectUri = notionRedirectUri;
        }

        String authorizationUrl = notionOauthUrl
                + "?client_id=" + notionClientId
                + "&response_type=code"
                + "&owner=user"
                + "&redirect_uri=" + encodedRedirectUri
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
        log.info("Notion 토큰 교환 시도: redirectUri={}, codeLen={}, codePrefix={}",
                account.getRedirectUri(),
                request.getCode() == null ? -1 : request.getCode().length(),
                request.getCode() == null ? "null" : request.getCode().substring(0, Math.min(8, request.getCode().length())));
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
                    userId, request.getSourceId(), request.getTargetFolderId(), accessToken, jwtToken);

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

    private List<String> importPageRecursive(String userId, String pageId, String folderId,
                                             String accessToken, String jwtToken) {
        List<String> allNoteIds = new ArrayList<>();

        String title = notionApiService.getPageTitle(pageId, accessToken);
        String markdown = notionApiService.getPageMarkdown(pageId, accessToken, userId);
        String noteId = workspaceApiClient.createNote(title, markdown, folderId, null, jwtToken);
        allNoteIds.add(noteId);

        List<NotionApiService.ChildPageRef> childPages = notionApiService.getChildPages(pageId, accessToken);
        for (NotionApiService.ChildPageRef child : childPages) {
            try {
                List<String> childNoteIds = importPageRecursive(userId, child.id(), folderId, accessToken, jwtToken);
                if (!childNoteIds.isEmpty()) {
                    workspaceApiClient.createNoteLink(noteId, childNoteIds.get(0), child.title(), jwtToken);
                    allNoteIds.addAll(childNoteIds);
                }
            } catch (Exception e) {
                log.warn("하위 페이지 가져오기 실패: childPageId={}, error={}", child.id(), e.getMessage());
            }
        }

        // 페이지 안에 임베드된 데이터베이스 블록의 행들도 일반 하위 페이지가 아니라
        // databases/{id}/query로만 조회되므로 별도로 순회한다. 행 하나하나가 실제로는 Notion
        // 페이지이므로 importPageRecursive를 그대로 재사용하면 본문 블록 변환과 행 안의
        // child_page/child_database 재귀까지 동일하게 처리된다.
        List<NotionApiService.ChildDatabaseRef> childDatabases = notionApiService.getChildDatabases(pageId, accessToken);
        for (NotionApiService.ChildDatabaseRef db : childDatabases) {
            List<NotionApiService.ChildPageRef> rows = notionApiService.queryDatabaseRowRefs(db.id(), accessToken);
            for (NotionApiService.ChildPageRef row : rows) {
                try {
                    List<String> rowNoteIds = importPageRecursive(userId, row.id(), folderId, accessToken, jwtToken);
                    if (!rowNoteIds.isEmpty()) {
                        workspaceApiClient.createNoteLink(noteId, rowNoteIds.get(0), row.title(), jwtToken);
                        allNoteIds.addAll(rowNoteIds);
                    }
                } catch (Exception e) {
                    log.warn("데이터베이스 행(노트) 가져오기 실패: databaseId={}, rowPageId={}, error={}",
                            db.id(), row.id(), e.getMessage());
                }
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

    // ── Obsidian / ZIP Import ──────────────────────────────────────────────

    @Transactional
    public ImportJobCreatedResponse createObsidianImportJob(String userId, ObsidianImportJobRequest request, String jwtToken) {
        ImportJob job = ImportJob.builder()
                .userId(userId)
                .sourceType(SourceType.OBSIDIAN)
                .mode(ImportMode.IMPORT)
                .uploadedZipAssetId(request.getUploadedZipAssetId())
                .targetFolderId(request.getTargetFolderId())
                .build();
        importJobRepository.save(job);

        try {
            Asset asset = assetService.getOwnedAsset(userId, request.getUploadedZipAssetId());
            byte[] zipBytes = assetService.readBytes(asset);
            List<ZipEntryContent> entries = contentConverter.convertZip(zipBytes);

            List<String> noteIds = new ArrayList<>();
            List<String> failed = new ArrayList<>();
            importZipEntries(userId, entries, request.getTargetFolderId(), jwtToken, noteIds, failed);

            job.setStatus(noteIds.isEmpty() && !entries.isEmpty() ? JobStatus.FAILED : JobStatus.COMPLETED);
            job.setCreatedNoteIds(String.join(",", noteIds));
            if (!failed.isEmpty()) job.setFailedFiles(String.join(",", failed));
            log.info("ZIP 가져오기 완료: jobId={}, 생성 노트 수={}, 실패 수={}",
                    job.getImportJobId(), noteIds.size(), failed.size());
        } catch (Exception e) {
            job.setStatus(JobStatus.FAILED);
            job.setFailedFiles("ZIP 가져오기 실패: " + e.getMessage());
            log.error("ZIP 가져오기 실패: jobId={}, error={}", job.getImportJobId(), e.getMessage());
        }
        importJobRepository.save(job);
        return ImportJobCreatedResponse.from(job);
    }

    // ── 단일 파일 가져오기 ───────────────────────────────────────────────────

    @Transactional
    public ImportJobCreatedResponse createFileImportJob(String userId, FileImportJobRequest request, String jwtToken) {
        ImportJob job = ImportJob.builder()
                .userId(userId)
                .sourceType(SourceType.FILE)
                .mode(ImportMode.IMPORT)
                .uploadedZipAssetId(request.getUploadedAssetId())
                .targetFolderId(request.getTargetFolderId())
                .build();
        importJobRepository.save(job);

        try {
            Asset asset = assetService.getOwnedAsset(userId, request.getUploadedAssetId());
            byte[] bytes = assetService.readBytes(asset);

            if (contentConverter.isZip(asset.getFileName(), asset.getContentType())) {
                List<ZipEntryContent> entries = contentConverter.convertZip(bytes);
                List<String> noteIds = new ArrayList<>();
                List<String> failed = new ArrayList<>();
                importZipEntries(userId, entries, request.getTargetFolderId(), jwtToken, noteIds, failed);
                job.setStatus(noteIds.isEmpty() && !entries.isEmpty() ? JobStatus.FAILED : JobStatus.COMPLETED);
                job.setCreatedNoteIds(String.join(",", noteIds));
                if (!failed.isEmpty()) job.setFailedFiles(String.join(",", failed));
            } else {
                String title = stripExtension(asset.getFileName());
                ContentConverter.EmbedKind embedKind =
                        contentConverter.embedKindOf(asset.getFileName(), asset.getContentType());
                String content = switch (embedKind) {
                    case PDF -> {
                        assetService.ensureContentType(asset, "application/pdf");
                        yield buildPdfEmbedHtml(asset.getAssetId(), asset.getFileName());
                    }
                    case IMAGE -> {
                        assetService.ensureContentType(asset, contentConverter.contentTypeFor(embedKind, asset.getFileName()));
                        yield buildImageEmbedHtml(asset.getAssetId(), asset.getFileName());
                    }
                    case HTML -> {
                        assetService.ensureContentType(asset, "text/html");
                        yield buildHtmlEmbedHtml(asset.getAssetId(), asset.getFileName());
                    }
                    case NONE -> contentConverter.convertSingleFile(asset.getFileName(), asset.getContentType(), bytes);
                };
                String noteId = workspaceApiClient.createNote(title, content, request.getTargetFolderId(), null, jwtToken);
                job.setStatus(JobStatus.COMPLETED);
                job.setCreatedNoteIds(noteId);
            }
            log.info("파일 가져오기 완료: jobId={}, fileName={}", job.getImportJobId(), asset.getFileName());
        } catch (Exception e) {
            job.setStatus(JobStatus.FAILED);
            job.setFailedFiles("파일 가져오기 실패: " + e.getMessage());
            log.error("파일 가져오기 실패: jobId={}, error={}", job.getImportJobId(), e.getMessage());
        }
        importJobRepository.save(job);
        return ImportJobCreatedResponse.from(job);
    }

    private String stripExtension(String fileName) {
        int dot = fileName.lastIndexOf('.');
        return dot > 0 ? fileName.substring(0, dot) : fileName;
    }

    /**
     * 옵시디언처럼 PDF 원본을 노트 안에서 그대로 볼 수 있도록, 노트 본문을 PDF 임베드 블록
     * (brainx-next의 PdfBlock 노드가 인식하는 data-pdf-block div) 하나로만 채운다. 추출
     * 텍스트는 더 이상 본문에 덧붙이지 않는다(뷰어만 보여달라는 요청). NoteEditor는 콘텐츠가
     * "<"로 시작하면 이미 HTML로 간주하고 그대로 로드하므로(markdownToHtml을 다시 타지 않음),
     * 이 메서드는 markdown이 아니라 완전한 HTML 문자열을 반환해야 한다.
     */
    private String buildPdfEmbedHtml(String assetId, String fileName) {
        return "<div data-pdf-block=\"true\" data-asset-id=\"" + assetId
                + "\" data-file-name=\"" + escapeHtml(fileName) + "\"></div>";
    }

    /** PDF와 동일하게, 이미지도 텍스트로 풀어쓰지 않고 brainx-next의 ImageBlock 노드가
        인식하는 자산 참조 블록 하나로만 본문을 채운다(원본이 그대로 보여야 한다). */
    private String buildImageEmbedHtml(String assetId, String fileName) {
        return "<div data-image-block=\"true\" data-asset-id=\"" + assetId
                + "\" data-file-name=\"" + escapeHtml(fileName) + "\"></div>";
    }

    /** HTML도 텍스트 추출 대신, brainx-next의 HtmlBlock 노드가 iframe으로 원본 화면을
        그대로 띄워주도록 자산 참조 블록만 본문에 채운다. */
    private String buildHtmlEmbedHtml(String assetId, String fileName) {
        return "<div data-html-block=\"true\" data-asset-id=\"" + assetId
                + "\" data-file-name=\"" + escapeHtml(fileName) + "\"></div>";
    }

    /** ZIP 항목 하나를 노트 본문으로 변환한다. PDF/이미지/HTML은 먼저 파생 자산으로
        저장해 원본 바이너리를 보존한 뒤 임베드 블록을 만들고, 그 외에는 이미 변환된
        마크다운을 그대로 쓴다. */
    private String buildZipEntryContent(String userId, ZipEntryContent entry) {
        if (entry.embedKind() == ContentConverter.EmbedKind.NONE) {
            return entry.markdown();
        }
        String assetId = assetService.persistDerivedAsset(
                userId, entry.fullFileName(), entry.embedContentType(), entry.embedBytes()).getAssetId();
        return switch (entry.embedKind()) {
            case PDF -> buildPdfEmbedHtml(assetId, entry.fullFileName());
            case IMAGE -> buildImageEmbedHtml(assetId, entry.fullFileName());
            case HTML -> buildHtmlEmbedHtml(assetId, entry.fullFileName());
            case NONE -> entry.markdown();
        };
    }

    private String escapeHtml(String s) {
        return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;");
    }

    /** ZIP 항목들을 노트로 만들면서, ZIP 안의 디렉터리 구조를 Workspace-Service 폴더로
        그대로 재현한다(이전에는 전부 targetFolderId 하나에 평탄하게 쌓였다). 디렉터리 경로별로
        폴더 생성을 한 번만 하도록 캐시(folderIdByPath)를 두고, 상위 폴더부터 재귀적으로
        만든다. */
    private void importZipEntries(String userId, List<ZipEntryContent> entries, String targetFolderId,
                                   String jwtToken, List<String> noteIds, List<String> failed) {
        Map<String, String> folderIdByPath = new HashMap<>();
        folderIdByPath.put("", targetFolderId);
        for (ZipEntryContent entry : entries) {
            try {
                String dirPath = dirPathOf(entry.fullFileName());
                String folderId = resolveFolderId(dirPath, folderIdByPath, jwtToken);
                String content = buildZipEntryContent(userId, entry);
                noteIds.add(workspaceApiClient.createNote(entry.fileName(), content, folderId, null, jwtToken));
            } catch (Exception e) {
                log.warn("ZIP 항목 노트 생성 실패: file={}, error={}", entry.fileName(), e.getMessage());
                failed.add(entry.fileName());
            }
        }
    }

    private String dirPathOf(String fullFileName) {
        int idx = fullFileName.lastIndexOf('/');
        return idx >= 0 ? fullFileName.substring(0, idx) : "";
    }

    private String resolveFolderId(String dirPath, Map<String, String> folderIdByPath, String jwtToken) {
        if (folderIdByPath.containsKey(dirPath)) return folderIdByPath.get(dirPath);
        int idx = dirPath.lastIndexOf('/');
        String parentPath = idx >= 0 ? dirPath.substring(0, idx) : "";
        String name = idx >= 0 ? dirPath.substring(idx + 1) : dirPath;
        String parentFolderId = resolveFolderId(parentPath, folderIdByPath, jwtToken);
        String folderId = workspaceApiClient.createFolder(name, parentFolderId, jwtToken);
        folderIdByPath.put(dirPath, folderId);
        return folderId;
    }

    // ── 상태 조회 ─────────────────────────────────────────────────────────

    public ImportJobStatusResponse getImportJobStatus(String userId, String importJobId) {
        ImportJob job = importJobRepository
                .findByImportJobIdAndUserId(importJobId, userId)
                .orElseThrow(() -> BrainXException.notFound("가져오기 작업을 찾을 수 없습니다"));
        return ImportJobStatusResponse.from(job);
    }
}