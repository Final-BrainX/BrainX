package com.brainx.ingestion.controller;

import com.brainx.ingestion.dto.request.IngestionRequest.AssetUploadCompleteRequest;
import com.brainx.ingestion.dto.request.IngestionRequest.AssetUploadSessionCreateRequest;
import com.brainx.ingestion.dto.response.ApiResponse;
import com.brainx.ingestion.dto.response.IngestionResponse.AssetDetailResponse;
import com.brainx.ingestion.dto.response.IngestionResponse.AssetUploadCompleteResponse;
import com.brainx.ingestion.dto.response.IngestionResponse.AssetUploadSessionResponse;
import com.brainx.ingestion.entity.Asset;
import com.brainx.ingestion.exception.BrainXException;
import com.brainx.ingestion.service.AssetService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpRange;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.net.InetAddress;
import java.net.URI;
import java.net.URISyntaxException;
import java.net.UnknownHostException;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.Arrays;
import java.util.List;

@Slf4j
@RestController
@RequestMapping("/api/v1/assets")
@RequiredArgsConstructor
public class AssetController {

    private static final long MAX_PROXY_IMAGE_BYTES = 15L * 1024 * 1024;

    private final AssetService assetService;
    private final com.brainx.ingestion.service.PptxSlideService pptxSlideService;

    // TEMP: 로그인 없이 테스트할 때 쓰는 고정 사용자 ID. 실제 로그인 연동 완료 후 제거할 것.
    private static final String DEV_TEST_USER_ID = "dev-test-user";

    private static String resolveUserId(Authentication auth) {
        return auth != null ? auth.getName() : DEV_TEST_USER_ID;
    }

    // POST /api/v1/assets/upload-sessions
    @PostMapping("/upload-sessions")
    public ResponseEntity<ApiResponse<AssetUploadSessionResponse>> createUploadSession(
            Authentication auth,
            @Valid @RequestBody AssetUploadSessionCreateRequest request) {
        AssetUploadSessionResponse data = assetService.createUploadSession(resolveUserId(auth), request);
        return ResponseEntity.ok(ApiResponse.success(data, "업로드 세션이 생성되었습니다."));
    }

    // PUT /api/v1/assets/upload-sessions/{uploadSessionId}/binary
    // SSOT의 uploadUrl이 가리키는 자체 바이너리 업로드 엔드포인트 (사전 서명 URL 인프라 부재로 임시 대체).
    @PutMapping(value = "/upload-sessions/{uploadSessionId}/binary", consumes = "multipart/form-data")
    public ResponseEntity<ApiResponse<Void>> uploadBinary(
            Authentication auth,
            @PathVariable String uploadSessionId,
            @RequestParam("file") MultipartFile file) {
        assetService.uploadBinary(resolveUserId(auth), uploadSessionId, file);
        return ResponseEntity.ok(ApiResponse.success(null, "파일이 업로드되었습니다."));
    }

    // POST /api/v1/assets/upload-sessions/{uploadSessionId}/complete
    @PostMapping("/upload-sessions/{uploadSessionId}/complete")
    public ResponseEntity<ApiResponse<AssetUploadCompleteResponse>> completeUpload(
            Authentication auth,
            @PathVariable String uploadSessionId,
            @Valid @RequestBody AssetUploadCompleteRequest request) {
        AssetUploadCompleteResponse data = assetService.completeUpload(resolveUserId(auth), uploadSessionId, request);
        return ResponseEntity.ok(ApiResponse.success(data, "업로드가 완료되었습니다."));
    }

    // GET /api/v1/assets/{assetId}
    // 노트 뷰어가 일반 네비게이션(iframe/img 등)으로 불러올 수 있어 소유자 검증을 하지 않는다.
    @GetMapping("/{assetId}")
    public ResponseEntity<ApiResponse<AssetDetailResponse>> getAsset(@PathVariable String assetId) {
        AssetDetailResponse data = assetService.getAssetDetail(assetId);
        return ResponseEntity.ok(ApiResponse.success(data, "파일 조회 성공"));
    }

    // GET /api/v1/assets/{assetId}/file
    // 원본 바이너리를 그대로 스트리밍한다. 노트 안의 PDF 임베드 뷰어(iframe)가 src로 사용하며,
    // 브라우저의 일반 네비게이션은 Authorization 헤더를 보내지 않으므로 소유자 검증을 하지 않는다.
    @GetMapping("/{assetId}/file")
    public ResponseEntity<byte[]> getAssetFile(@PathVariable String assetId) {
        Asset asset = assetService.getAssetForViewing(assetId);
        byte[] bytes = assetService.readBytes(asset);
        MediaType mediaType = asset.getContentType() != null
                ? MediaType.parseMediaType(asset.getContentType())
                : MediaType.APPLICATION_OCTET_STREAM;
        return ResponseEntity.ok()
                .contentType(mediaType)
                .header(HttpHeaders.CONTENT_DISPOSITION,
                        ContentDisposition.inline().filename(asset.getFileName()).build().toString())
                .body(bytes);
    }

    // GET /api/v1/assets/{assetId}/slides/{slideIndex}
    // PPTX 슬라이드를 PNG 이미지로 렌더링해 반환한다. slideIndex는 0-based.
    @GetMapping("/{assetId}/slides/{slideIndex}")
    public ResponseEntity<byte[]> getPptxSlide(
            @PathVariable String assetId,
            @PathVariable int slideIndex) {
        Asset asset = assetService.getAssetForViewing(assetId);
        byte[] pptxBytes = assetService.readBytes(asset);
        try {
            byte[] png = pptxSlideService.renderSlide(pptxBytes, slideIndex);
            return ResponseEntity.ok()
                    .contentType(MediaType.IMAGE_PNG)
                    .body(png);
        } catch (IllegalArgumentException e) {
            throw BrainXException.badRequest("INVALID_SLIDE_INDEX", e.getMessage());
        } catch (Exception e) {
            log.error("슬라이드 렌더링 실패: assetId={}, slideIndex={}, error={}", assetId, slideIndex, e.getMessage());
            throw BrainXException.internalError("슬라이드를 렌더링하지 못했습니다");
        }
    }

    // GET /api/v1/assets/{assetId}/slides/{slideIndex}/video
    // 슬라이드에 삽입된 영상 원본을 반환한다. 브라우저 재생을 위해 Range Request를 지원한다.
    @GetMapping("/{assetId}/slides/{slideIndex}/video")
    public ResponseEntity<byte[]> getPptxSlideVideo(
            @RequestHeader HttpHeaders httpHeaders,
            @PathVariable String assetId,
            @PathVariable int slideIndex) {
        Asset asset = assetService.getAssetForViewing(assetId);
        byte[] pptxBytes = assetService.readBytes(asset);
        try {
            byte[] videoBytes = pptxSlideService.extractSlideVideo(pptxBytes, slideIndex);
            if (videoBytes == null || videoBytes.length == 0) {
                return ResponseEntity.notFound().build();
            }
            String contentType = pptxSlideService.getSlideVideoContentType(pptxBytes, slideIndex);
            MediaType mediaType = contentType != null
                    ? MediaType.parseMediaType(contentType)
                    : MediaType.parseMediaType("video/mp4");

            List<HttpRange> ranges = httpHeaders.getRange();
            if (!ranges.isEmpty()) {
                HttpRange range = ranges.get(0);
                long start = range.getRangeStart(videoBytes.length);
                long end = range.getRangeEnd(videoBytes.length);
                byte[] chunk = Arrays.copyOfRange(videoBytes, (int) start, (int) end + 1);
                return ResponseEntity.status(org.springframework.http.HttpStatus.PARTIAL_CONTENT)
                        .contentType(mediaType)
                        .header(HttpHeaders.ACCEPT_RANGES, "bytes")
                        .header(HttpHeaders.CONTENT_RANGE,
                                "bytes " + start + "-" + end + "/" + videoBytes.length)
                        .header(HttpHeaders.CACHE_CONTROL, "public, max-age=3600")
                        .body(chunk);
            }

            return ResponseEntity.ok()
                    .contentType(mediaType)
                    .header(HttpHeaders.ACCEPT_RANGES, "bytes")
                    .header(HttpHeaders.CACHE_CONTROL, "public, max-age=3600")
                    .body(videoBytes);
        } catch (Exception e) {
            log.error("슬라이드 영상 추출 실패: assetId={}, slideIndex={}, error={}", assetId, slideIndex, e.getMessage());
            return ResponseEntity.notFound().build();
        }
    }

    /**
     * GET /api/v1/assets/proxy-image?url=...
     * 노션 등에서 가져온 이미지가 서명 URL 만료나 그 호스트의 CORS 정책 때문에 브라우저가
     * 직접 못 받아올 때(노트 PDF 내보내기 등), 서버가 대신 가져와서 전달한다 — 서버 대
     * 서버 호출에는 브라우저의 CORS 제약이 적용되지 않는다.
     * SecurityConfig에서 이 경로만 별도로 인증을 요구한다(임의 URL을 대신 가져오는 기능이라
     * /api/v1/assets/** 의 나머지처럼 비로그인 허용으로 두지 않음). https만 허용하고,
     * 사설/루프백/링크로컬 주소(클라우드 메타데이터 169.254.169.254 등)는 SSRF 방지를 위해
     * 차단한다. 응답이 image/*가 아니거나 너무 크면 거부한다.
     */
    @GetMapping("/proxy-image")
    public ResponseEntity<byte[]> proxyImage(Authentication auth, @RequestParam String url) {
        URI uri = validateProxyUrl(url);
        try {
            HttpClient client = HttpClient.newBuilder()
                    .connectTimeout(Duration.ofSeconds(5))
                    .build();
            HttpRequest request = HttpRequest.newBuilder(uri)
                    .timeout(Duration.ofSeconds(10))
                    .GET()
                    .build();
            HttpResponse<byte[]> response = client.send(request, HttpResponse.BodyHandlers.ofByteArray());
            if (response.statusCode() != 200) {
                throw BrainXException.notFound("이미지를 가져오지 못했습니다");
            }
            byte[] body = response.body();
            if (body == null || body.length == 0) {
                throw BrainXException.notFound("이미지를 가져오지 못했습니다");
            }
            if (body.length > MAX_PROXY_IMAGE_BYTES) {
                throw BrainXException.badRequest("IMAGE_TOO_LARGE", "이미지가 너무 큽니다");
            }
            String contentType = response.headers().firstValue("Content-Type").orElse("");
            if (!contentType.toLowerCase().startsWith("image/")) {
                throw BrainXException.badRequest("INVALID_CONTENT_TYPE", "이미지가 아닙니다");
            }
            log.info("이미지 프록시 성공: userId={}, host={}, bytes={}", auth != null ? auth.getName() : "anonymous", uri.getHost(), body.length);
            return ResponseEntity.ok().contentType(MediaType.parseMediaType(contentType)).body(body);
        } catch (IOException | InterruptedException e) {
            log.warn("이미지 프록시 실패: url={}, error={}", url, e.getMessage());
            throw BrainXException.internalError("이미지를 가져오는 중 오류가 발생했습니다");
        }
    }

    private URI validateProxyUrl(String url) {
        URI uri;
        try {
            uri = new URI(url);
        } catch (URISyntaxException e) {
            throw BrainXException.badRequest("INVALID_URL", "올바른 URL이 아닙니다");
        }
        if (!"https".equalsIgnoreCase(uri.getScheme())) {
            throw BrainXException.badRequest("INVALID_URL", "https URL만 허용됩니다");
        }
        String host = uri.getHost();
        if (host == null || host.isBlank()) {
            throw BrainXException.badRequest("INVALID_URL", "올바른 URL이 아닙니다");
        }
        try {
            for (InetAddress addr : InetAddress.getAllByName(host)) {
                if (addr.isLoopbackAddress() || addr.isLinkLocalAddress() || addr.isSiteLocalAddress()
                        || addr.isMulticastAddress() || addr.isAnyLocalAddress()) {
                    throw BrainXException.badRequest("INVALID_URL", "허용되지 않는 주소입니다");
                }
            }
        } catch (UnknownHostException e) {
            throw BrainXException.badRequest("INVALID_URL", "호스트를 찾을 수 없습니다");
        }
        return uri;
    }
}
