package com.brainx.ingestion.system;

import com.brainx.ingestion.dto.request.IngestionRequest.AssetUploadCompleteRequest;
import com.brainx.ingestion.dto.request.IngestionRequest.AssetUploadSessionCreateRequest;
import com.brainx.ingestion.dto.response.IngestionResponse.AssetUploadCompleteResponse;
import com.brainx.ingestion.dto.response.IngestionResponse.AssetUploadSessionResponse;
import com.brainx.ingestion.exception.BrainXException;
import com.brainx.ingestion.repository.AssetRepository;
import com.brainx.ingestion.service.AssetService;
import com.brainx.ingestion.service.AssetStorageService;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.web.client.RestTemplate;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doNothing;

/**
 * [시스템 테스트] 에셋 업로드 전체 흐름 — 세션 생성 · 바이너리 업로드 · 완료 E2E 검증
 *
 * 검증 범위:
 *   - 업로드 세션 생성 (AssetUploadSessionCreateRequest)
 *   - 바이너리 업로드 (MockMultipartFile)
 *   - 업로드 완료 및 URL 응답 검증
 *   - 파일 크기 초과 시 FILE_TOO_LARGE 오류
 *
 * AssetStorageService(S3/로컬 스토리지)는 MockBean으로 대체
 * Kafka는 test application.yml에서 autoconfigure 제외
 */
@SpringBootTest
@TestMethodOrder(MethodOrderer.OrderAnnotation.class)
class AssetUploadSystemTest {

    private static final String USER_ID = "sys-asset-user-001";

    @Autowired private AssetService assetService;
    @Autowired private AssetRepository assetRepository;
    @MockBean  private AssetStorageService storageService;
    @MockBean  private RestTemplate restTemplate;

    @BeforeEach
    void setUp() throws Exception {
        assetRepository.deleteAll();
        doNothing().when(storageService).store(any(), any());
        doNothing().when(storageService).delete(any());
    }

    private AssetUploadSessionCreateRequest sessionRequest(String fileName, String contentType, long sizeBytes) {
        AssetUploadSessionCreateRequest req = new AssetUploadSessionCreateRequest();
        ReflectionTestUtils.setField(req, "fileName", fileName);
        ReflectionTestUtils.setField(req, "contentType", contentType);
        ReflectionTestUtils.setField(req, "sizeBytes", sizeBytes);
        return req;
    }

    private AssetUploadCompleteRequest completeRequest(String checksum) {
        AssetUploadCompleteRequest req = new AssetUploadCompleteRequest();
        ReflectionTestUtils.setField(req, "checksum", checksum);
        ReflectionTestUtils.setField(req, "conversionMode", "NONE");
        return req;
    }

    @Test
    @Order(1)
    @DisplayName("[시스템] 업로드 세션 생성 — assetId·uploadUrl 반환 및 DB 저장 확인")
    void createUploadSession_returnsSessionWithUploadUrl() {
        // when
        AssetUploadSessionResponse response = assetService.createUploadSession(USER_ID,
                sessionRequest("테스트_이미지.png", "image/png", 1024L * 1024L));

        // then
        assertThat(response.getAssetId()).isNotBlank();
        assertThat(response.getUploadUrl()).isNotBlank();
        assertThat(assetRepository.findById(response.getAssetId())).isPresent();
    }

    @Test
    @Order(2)
    @DisplayName("[시스템] 바이너리 업로드 후 완료 처리 — 다운로드 URL 반환")
    void uploadBinaryAndComplete_returnsAccessibleUrl() {
        // given — 세션 생성
        AssetUploadSessionResponse session = assetService.createUploadSession(USER_ID,
                sessionRequest("document.pdf", "application/pdf", 512L * 1024L));

        // 바이너리 업로드
        MockMultipartFile file = new MockMultipartFile(
                "file", "document.pdf", "application/pdf", new byte[1024]);
        assetService.uploadBinary(USER_ID, session.getAssetId(), file);

        // when — 완료 처리
        AssetUploadCompleteResponse completed = assetService.completeUpload(USER_ID,
                session.getAssetId(), completeRequest("sha256-dummy-checksum"));

        // then
        assertThat(completed.getAssetId()).isEqualTo(session.getAssetId());
        assertThat(completed.getDownloadUrl()).isNotBlank();
    }

    @Test
    @Order(3)
    @DisplayName("[시스템] 허용 크기 초과 파일 — FILE_TOO_LARGE 예외 반환")
    void createUploadSession_withOversizedFile_throwsFileTooLarge() {
        // given — 기본 최대치 5GB 초과
        AssetUploadSessionCreateRequest req = sessionRequest(
                "huge_video.mp4", "video/mp4", 6L * 1024L * 1024L * 1024L);

        // when / then
        assertThatThrownBy(() -> assetService.createUploadSession(USER_ID, req))
                .isInstanceOf(BrainXException.class)
                .satisfies(ex -> assertThat(((BrainXException) ex).getCode())
                        .isEqualTo("FILE_TOO_LARGE"));
    }

    @Test
    @Order(4)
    @DisplayName("[시스템] 다른 사용자의 업로드 세션 완료 시도 — 권한 거부 예외")
    void completeUpload_byDifferentUser_throwsException() {
        // given — user-A가 세션 생성
        AssetUploadSessionResponse session = assetService.createUploadSession(USER_ID,
                sessionRequest("private.docx",
                        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                        100_000L));

        // 바이너리 업로드 (소유자가 수행)
        MockMultipartFile file = new MockMultipartFile("file", "private.docx",
                "application/octet-stream", new byte[100]);
        assetService.uploadBinary(USER_ID, session.getAssetId(), file);

        // when / then — user-B가 완료 시도 → 예외
        assertThatThrownBy(() -> assetService.completeUpload(
                "different-user-999",
                session.getAssetId(),
                completeRequest("sha256-checksum-123")))
                .isInstanceOf(BrainXException.class);
    }
}
