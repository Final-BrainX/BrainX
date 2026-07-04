package com.brainx.ingestion.service;

import lombok.extern.slf4j.Slf4j;
import org.apache.commons.compress.archivers.zip.ZipArchiveEntry;
import org.apache.commons.compress.archivers.zip.ZipFile;
import org.apache.commons.csv.CSVFormat;
import org.apache.commons.csv.CSVParser;
import org.apache.commons.csv.CSVRecord;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.text.PDFTextStripper;
import org.apache.poi.xwpf.extractor.XWPFWordExtractor;
import org.apache.poi.xwpf.usermodel.XWPFDocument;
import org.jsoup.Jsoup;
import org.jsoup.nodes.Document;
import org.springframework.stereotype.Component;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Enumeration;
import java.util.List;
import java.util.Set;

/**
 * 업로드된 파일을 BrainX 노트 마크다운으로 변환한다.
 * ZIP은 내부 각 파일을 개별 페이지(노트)로 변환하기 위해 ZipEntryContent 목록을 반환한다.
 * PDF/이미지/HTML처럼 원본을 그대로 보여줘야 하는 파일은 텍스트로 변환하지 않고
 * EmbedKind로 표시해 ImportService가 자산 임베드 블록을 만들 수 있게 한다.
 */
@Slf4j
@Component
public class ContentConverter {

    public enum EmbedKind { NONE, PDF, IMAGE, HTML, PPTX }

    private static final Set<String> IMAGE_EXTENSIONS =
            Set.of("png", "jpg", "jpeg", "gif", "webp", "bmp", "svg");

    public record ZipEntryContent(
            String fileName, String fullFileName, String markdown,
            EmbedKind embedKind, byte[] embedBytes, String embedContentType) {}

    public String convertSingleFile(String fileName, String contentType, byte[] bytes) {
        String ext = extensionOf(fileName);
        try {
            if (isZip(fileName, contentType)) {
                throw new IllegalArgumentException("ZIP 파일은 convertZip을 사용해야 합니다");
            }
            String converted = switch (ext) {
                case "txt", "md", "markdown" -> new String(bytes, StandardCharsets.UTF_8);
                case "html", "htm" -> htmlToMarkdown(new String(bytes, StandardCharsets.UTF_8));
                case "csv" -> csvToMarkdownTable(bytes);
                case "pdf" -> pdfToText(bytes);
                case "docx" -> docxToText(bytes);
                default -> new String(bytes, StandardCharsets.UTF_8);
            };
            return sanitize(converted);
        } catch (Exception e) {
            log.error("파일 변환 실패: fileName={}, error={}", fileName, e.getMessage());
            throw new RuntimeException("파일을 변환하지 못했습니다: " + fileName + " (" + e.getMessage() + ")", e);
        }
    }

    public EmbedKind embedKindOf(String fileName, String contentType) {
        if (isPptx(fileName, contentType)) return EmbedKind.PPTX;
        if (isPdf(fileName, contentType)) return EmbedKind.PDF;
        if (isImage(fileName, contentType)) return EmbedKind.IMAGE;
        if (isHtml(fileName, contentType)) return EmbedKind.HTML;
        return EmbedKind.NONE;
    }

    public String contentTypeFor(EmbedKind kind, String fileName) {
        return switch (kind) {
            case PDF -> "application/pdf";
            case HTML -> "text/html";
            case IMAGE -> imageContentType(extensionOf(fileName));
            case PPTX -> "application/vnd.openxmlformats-officedocument.presentationml.presentation";
            case NONE -> "application/octet-stream";
        };
    }

    private String imageContentType(String ext) {
        return switch (ext) {
            case "png" -> "image/png";
            case "jpg", "jpeg" -> "image/jpeg";
            case "gif" -> "image/gif";
            case "webp" -> "image/webp";
            case "bmp" -> "image/bmp";
            case "svg" -> "image/svg+xml";
            default -> "application/octet-stream";
        };
    }

    /**
     * 윈도우 탐색기로 만든 ZIP은 한글 등 비-ASCII 파일명에 UTF-8 플래그를 켜지 않고
     * 시스템 코드페이지(CP949)로 인코딩한다. java.util.zip.ZipFile은 모든 엔트리 이름을
     * UTF-8로만 해석해서 이런 ZIP을 열자마자 "invalid CEN header (bad entry name)"로
     * 전체가 실패하므로, 엔트리별 UTF-8 플래그를 확인해 폴백 인코딩을 쓰는
     * commons-compress ZipFile을 사용한다.
     */
    public List<ZipEntryContent> convertZip(byte[] zipBytes) {
        List<ZipEntryContent> results = new ArrayList<>();
        try {
            var tempFile = java.nio.file.Files.createTempFile("brainx-import-", ".zip");
            java.nio.file.Files.write(tempFile, zipBytes);
            try (ZipFile zipFile = new ZipFile(tempFile.toFile(), "CP949")) {
                Enumeration<ZipArchiveEntry> entries = zipFile.getEntries();
                while (entries.hasMoreElements()) {
                    ZipArchiveEntry entry = entries.nextElement();
                    if (entry.isDirectory()) continue;
                    String name = entry.getName();
                    if (name.contains("/__MACOSX") || name.startsWith("__MACOSX") || name.endsWith(".DS_Store")) {
                        continue;
                    }
                    try (var in = zipFile.getInputStream(entry)) {
                        byte[] entryBytes = in.readAllBytes();
                        if (entryBytes.length == 0) continue;
                        EmbedKind embedKind = embedKindOf(name, null);
                        // 이미지/PDF/HTML은 원본 그대로 임베드해서 보여줄 것이라 텍스트 변환이
                        // 불필요할 뿐 아니라, 이미지 바이너리를 UTF-8 문자열로 바꾸면 내용이 깨진다.
                        String markdown = embedKind == EmbedKind.NONE ? convertSingleFile(name, null, entryBytes) : "";
                        results.add(new ZipEntryContent(
                                baseName(name), name, markdown, embedKind,
                                embedKind != EmbedKind.NONE ? entryBytes : null,
                                embedKind != EmbedKind.NONE ? contentTypeFor(embedKind, name) : null));
                    } catch (Exception e) {
                        log.warn("ZIP 내부 파일 변환 실패: entry={}, error={}", name, e.getMessage());
                    }
                }
            } finally {
                java.nio.file.Files.deleteIfExists(tempFile);
            }
        } catch (IOException e) {
            throw new RuntimeException("ZIP 파일을 열 수 없습니다: " + e.getMessage(), e);
        }
        return results;
    }

    /**
     * PDFBox/POI 추출 결과에 가끔 섞여 나오는 NUL(0x00) 및 기타 제어문자를 제거한다.
     * PostgreSQL의 UTF8 텍스트 컬럼은 0x00을 포함한 문자열을 거부(invalid byte sequence)하므로,
     * Workspace-Service에 노트를 생성하기 전에 반드시 정리해야 한다.
     */
    private String sanitize(String text) {
        if (text == null) return "";
        return text.replaceAll("[\\x00-\\x08\\x0B\\x0C\\x0E-\\x1F]", "");
    }

    public boolean isZip(String fileName, String contentType) {
        return extensionOf(fileName).equals("zip")
                || (contentType != null && contentType.contains("zip"));
    }

    public boolean isPptx(String fileName, String contentType) {
        return extensionOf(fileName).equals("pptx")
                || (contentType != null && contentType.contains("presentationml"));
    }

    public boolean isPdf(String fileName, String contentType) {
        return extensionOf(fileName).equals("pdf")
                || (contentType != null && contentType.contains("pdf"));
    }

    public boolean isImage(String fileName, String contentType) {
        return IMAGE_EXTENSIONS.contains(extensionOf(fileName))
                || (contentType != null && contentType.startsWith("image/"));
    }

    public boolean isHtml(String fileName, String contentType) {
        String ext = extensionOf(fileName);
        return ext.equals("html") || ext.equals("htm")
                || (contentType != null && contentType.contains("html"));
    }

    private String htmlToMarkdown(String html) {
        Document doc = Jsoup.parse(html);
        doc.select("script, style").remove();
        return doc.body() != null ? doc.body().wholeText().trim() : doc.text();
    }

    private String csvToMarkdownTable(byte[] bytes) throws IOException {
        StringBuilder md = new StringBuilder();
        try (CSVParser parser = CSVParser.parse(
                new InputStreamReader(new ByteArrayInputStream(bytes), StandardCharsets.UTF_8),
                CSVFormat.DEFAULT)) {
            boolean header = true;
            for (CSVRecord record : parser) {
                md.append("| ").append(String.join(" | ", record)).append(" |\n");
                if (header) {
                    md.append("|").append(" --- |".repeat(record.size())).append("\n");
                    header = false;
                }
            }
        }
        return md.toString();
    }

    private String pdfToText(byte[] bytes) throws IOException {
        try (PDDocument document = PDDocument.load(new ByteArrayInputStream(bytes))) {
            return new PDFTextStripper().getText(document);
        }
    }

    private String docxToText(byte[] bytes) throws IOException {
        try (XWPFDocument document = new XWPFDocument(new ByteArrayInputStream(bytes));
             XWPFWordExtractor extractor = new XWPFWordExtractor(document)) {
            return extractor.getText();
        }
    }

    private String extensionOf(String fileName) {
        int dot = fileName.lastIndexOf('.');
        return dot >= 0 ? fileName.substring(dot + 1).toLowerCase() : "";
    }

    private String baseName(String path) {
        String name = path.contains("/") ? path.substring(path.lastIndexOf('/') + 1) : path;
        int dot = name.lastIndexOf('.');
        return dot > 0 ? name.substring(0, dot) : name;
    }
}
