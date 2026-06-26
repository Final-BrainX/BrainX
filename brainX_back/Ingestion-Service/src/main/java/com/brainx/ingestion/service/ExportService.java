package com.brainx.ingestion.service;

import com.brainx.ingestion.client.WorkspaceApiClient;
import com.brainx.ingestion.client.WorkspaceApiClient.NoteContent;
import com.brainx.ingestion.dto.request.IngestionRequest.ExportJobRequest;
import com.brainx.ingestion.dto.response.IngestionResponse.ExportJobCreatedResponse;
import com.brainx.ingestion.dto.response.IngestionResponse.ExportJobStatusResponse;
import com.brainx.ingestion.entity.ExportJob;
import com.brainx.ingestion.entity.ExportJob.ClientType;
import com.brainx.ingestion.entity.ExportJob.ExportFormat;
import com.brainx.ingestion.exception.BrainXException;
import com.brainx.ingestion.repository.ExportJobRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.pdmodel.font.PDFont;
import org.apache.pdfbox.pdmodel.font.PDType1Font;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;

@Slf4j
@Service
@RequiredArgsConstructor
public class ExportService {

    private static final float PDF_MARGIN = 50f;
    private static final float PDF_TITLE_SIZE = 16f;
    private static final float PDF_BODY_SIZE = 11f;
    private static final float PDF_LINE_HEIGHT = 16f;

    private final ExportJobRepository exportJobRepository;
    private final WorkspaceApiClient workspaceApiClient;
    private final AssetStorageService assetStorageService;

    @Value("${cdn.base-url}")
    private String cdnBaseUrl;

    @Transactional
    public ExportJobCreatedResponse createExportJob(String userId, ExportJobRequest request, String jwtToken) {
        ExportFormat format;
        try {
            format = ExportFormat.valueOf(request.getFormat().toUpperCase());
        } catch (IllegalArgumentException e) {
            throw BrainXException.badRequest("INVALID_FORMAT", "지원하지 않는 형식입니다. PDF, TXT, MD 중 하나를 선택하세요.");
        }

        ClientType clientType = ClientType.WEB;
        if (request.getClientType() != null) {
            try {
                clientType = ClientType.valueOf(request.getClientType().toUpperCase());
            } catch (IllegalArgumentException ignored) {}
        }

        ExportJob job = ExportJob.builder()
                .userId(userId)
                .noteId(request.getNoteId())
                .format(format)
                .clientType(clientType)
                .status(ExportJob.JobStatus.PROCESSING)
                .build();
        exportJobRepository.save(job);

        try {
            NoteContent note = workspaceApiClient.getNote(request.getNoteId(), jwtToken);
            byte[] content = renderContent(note, format);

            String fileName = job.getExportJobId() + "." + format.name().toLowerCase();
            Path target = assetStorageService.resolvePath(job.getExportJobId(), fileName);
            assetStorageService.store(target, new ByteArrayInputStream(content));

            job.setStoragePath(target.toString());
            job.setDownloadUrl("/api/v1/exports/" + job.getExportJobId() + "/file");
            job.setStatus(ExportJob.JobStatus.COMPLETED);
        } catch (Exception e) {
            log.error("내보내기 콘텐츠 생성 실패: jobId={}, noteId={}, error={}", job.getExportJobId(), request.getNoteId(), e.getMessage());
            job.setStatus(ExportJob.JobStatus.FAILED);
            job.setErrorMessage(e.getMessage());
        }
        exportJobRepository.save(job);

        log.info("내보내기 작업 생성: jobId={}, userId={}, format={}, status={}", job.getExportJobId(), userId, format, job.getStatus());
        return ExportJobCreatedResponse.from(job);
    }

    public ExportJobStatusResponse getExportJobStatus(String userId, String exportJobId) {
        ExportJob job = exportJobRepository
                .findByExportJobIdAndUserId(exportJobId, userId)
                .orElseThrow(() -> BrainXException.notFound("내보내기 작업을 찾을 수 없습니다"));
        return ExportJobStatusResponse.from(job);
    }

    public ExportJob getExportJobForDownload(String userId, String exportJobId) {
        return exportJobRepository
                .findByExportJobIdAndUserId(exportJobId, userId)
                .orElseThrow(() -> BrainXException.notFound("내보내기 작업을 찾을 수 없습니다"));
    }

    public byte[] readExportedFile(ExportJob job) {
        if (job.getStoragePath() == null) {
            throw BrainXException.notFound("내보내기 파일이 아직 준비되지 않았습니다");
        }
        return assetStorageService.read(job.getStoragePath());
    }

    private byte[] renderContent(NoteContent note, ExportFormat format) {
        String title = note.title() != null ? note.title() : "Untitled";
        String markdown = note.markdown() != null ? note.markdown() : "";

        return switch (format) {
            case MD -> ("# " + title + "\n\n" + markdown).getBytes(StandardCharsets.UTF_8);
            case TXT -> (title + "\n\n" + toPlainText(markdown)).getBytes(StandardCharsets.UTF_8);
            case PDF -> renderPdf(title, toPlainText(markdown));
        };
    }

    /** 마크다운 기호(#, *, _, 링크 문법 등)를 제거해 TXT/PDF에서 읽기 좋은 평문으로 만든다. */
    private String toPlainText(String markdown) {
        return markdown
                .replaceAll("(?m)^#{1,6}\\s*", "")
                .replaceAll("\\*\\*([^*]+)\\*\\*", "$1")
                .replaceAll("\\*([^*]+)\\*", "$1")
                .replaceAll("`([^`]+)`", "$1")
                .replaceAll("\\[([^\\]]+)]\\([^)]+\\)", "$1")
                .replaceAll("\\[\\[([^\\]]+)]]", "$1");
    }

    /**
     * PDFBox 표준 폰트(Helvetica)는 WinAnsiEncoding만 지원해 한글 등 비라틴 문자를 그릴 수 없다.
     * 별도 유니코드 폰트를 내장하기 전까지는 지원 범위 밖 문자를 '?'로 치환해 PDF 생성이
     * 깨지지 않도록 한다(완전한 한글 렌더링은 추후 폰트 임베딩 후속 작업으로 분리).
     */
    private String sanitizeForStandardFont(String text) {
        StringBuilder sb = new StringBuilder(text.length());
        for (int i = 0; i < text.length(); i++) {
            char c = text.charAt(i);
            if (c == '\n' || c == '\r' || (c >= 0x20 && c <= 0x7E) || (c >= 0xA0 && c <= 0xFF)) {
                sb.append(c);
            } else {
                sb.append('?');
            }
        }
        return sb.toString();
    }

    private byte[] renderPdf(String title, String body) {
        try (PDDocument document = new PDDocument(); ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            PDFont titleFont = PDType1Font.HELVETICA_BOLD;
            PDFont bodyFont = PDType1Font.HELVETICA;

            PDPage page = new PDPage(PDRectangle.A4);
            document.addPage(page);
            PDPageContentStream stream = new PDPageContentStream(document, page);
            float y = page.getMediaBox().getHeight() - PDF_MARGIN;
            float maxWidth = page.getMediaBox().getWidth() - PDF_MARGIN * 2;

            y = drawWrappedLines(document, stream, page, wrapText(sanitizeForStandardFont(title), titleFont, PDF_TITLE_SIZE, maxWidth), titleFont, PDF_TITLE_SIZE, y, maxWidth);
            y -= PDF_LINE_HEIGHT;

            List<String> bodyLines = new ArrayList<>();
            for (String paragraph : sanitizeForStandardFont(body).split("\n")) {
                bodyLines.addAll(wrapText(paragraph, bodyFont, PDF_BODY_SIZE, maxWidth));
                bodyLines.add("");
            }

            CursorState cursor = new CursorState(stream, page, y);
            for (String line : bodyLines) {
                cursor = drawLine(document, cursor, line, bodyFont, PDF_BODY_SIZE, maxWidth);
            }
            cursor.stream().close();

            document.save(out);
            return out.toByteArray();
        } catch (IOException e) {
            throw BrainXException.internalError("PDF 생성에 실패했습니다: " + e.getMessage());
        }
    }

    private float drawWrappedLines(PDDocument document, PDPageContentStream stream, PDPage page, List<String> lines, PDFont font, float fontSize, float startY, float maxWidth) throws IOException {
        float y = startY;
        for (String line : lines) {
            stream.beginText();
            stream.setFont(font, fontSize);
            stream.newLineAtOffset(PDF_MARGIN, y);
            stream.showText(line);
            stream.endText();
            y -= PDF_LINE_HEIGHT;
        }
        return y;
    }

    private record CursorState(PDPageContentStream stream, PDPage page, float y) {
    }

    private CursorState drawLine(PDDocument document, CursorState cursor, String line, PDFont font, float fontSize, float maxWidth) throws IOException {
        PDPageContentStream stream = cursor.stream();
        PDPage page = cursor.page();
        float y = cursor.y();

        if (y < PDF_MARGIN) {
            stream.close();
            page = new PDPage(PDRectangle.A4);
            document.addPage(page);
            stream = new PDPageContentStream(document, page);
            y = page.getMediaBox().getHeight() - PDF_MARGIN;
        }

        if (!line.isBlank()) {
            stream.beginText();
            stream.setFont(font, fontSize);
            stream.newLineAtOffset(PDF_MARGIN, y);
            stream.showText(line);
            stream.endText();
        }

        return new CursorState(stream, page, y - PDF_LINE_HEIGHT);
    }

    private List<String> wrapText(String text, PDFont font, float fontSize, float maxWidth) throws IOException {
        List<String> lines = new ArrayList<>();
        if (text.isBlank()) {
            lines.add("");
            return lines;
        }
        StringBuilder current = new StringBuilder();
        for (String word : text.split(" ")) {
            String candidate = current.isEmpty() ? word : current + " " + word;
            if (font.getStringWidth(candidate) / 1000 * fontSize > maxWidth && !current.isEmpty()) {
                lines.add(current.toString());
                current = new StringBuilder(word);
            } else {
                current = new StringBuilder(candidate);
            }
        }
        if (!current.isEmpty()) {
            lines.add(current.toString());
        }
        return lines;
    }
}
