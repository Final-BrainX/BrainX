package com.brainx.ingestion.service;

import com.brainx.ingestion.dto.request.IngestionRequest.PublishJobRequest;
import com.brainx.ingestion.dto.response.IngestionResponse.PublishJobResponse;
import com.brainx.ingestion.exception.BrainXException;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.util.UUID;

@Slf4j
@Service
public class PublishService {

    private static final String OPEN_URL_TISTORY = "https://www.tistory.com/";
    private static final String OPEN_URL_NOTION  = "https://www.notion.so/";

    public PublishJobResponse createPublishJob(String userId, PublishJobRequest request) {
        String platform = request.getPlatform().toLowerCase();
        if (!platform.equals("tistory") && !platform.equals("notion") && !platform.equals("copy")) {
            throw BrainXException.badRequest("INVALID_PLATFORM", "지원하지 않는 플랫폼입니다. tistory, notion, copy 중 하나를 선택하세요.");
        }

        String markdown = request.getNoteContent();
        if (markdown == null || markdown.isBlank()) {
            throw BrainXException.badRequest("EMPTY_CONTENT", "noteContent가 비어 있습니다.");
        }

        String publishJobId = "pub_" + UUID.randomUUID().toString().replace("-", "").substring(0, 16);

        String clipboardContent;
        String clipboardContentType;
        String openUrl;

        if (platform.equals("copy")) {
            clipboardContent = markdown;
            clipboardContentType = "text/markdown";
            openUrl = null;
        } else if (platform.equals("notion")) {
            clipboardContent = markdown;
            clipboardContentType = "text/markdown";
            openUrl = OPEN_URL_NOTION;
        } else {
            clipboardContent = convertMarkdownToHtml(markdown);
            clipboardContentType = "text/html";
            openUrl = OPEN_URL_TISTORY;
        }

        log.info("발행 작업 완료: jobId={}, userId={}, platform={}", publishJobId, userId, platform);

        return PublishJobResponse.builder()
                .publishJobId(publishJobId)
                .status("COMPLETED")
                .clipboardContent(clipboardContent)
                .clipboardContentType(clipboardContentType)
                .openUrl(openUrl)
                .build();
    }

    private String convertMarkdownToHtml(String markdown) {
        String[] lines = markdown.split("\n");
        StringBuilder html = new StringBuilder();
        boolean inList = false;
        boolean inCode = false;
        StringBuilder codeBlock = new StringBuilder();
        String codeLang = "";

        for (String line : lines) {
            if (line.startsWith("```")) {
                if (inCode) {
                    html.append("<pre><code>").append(escapeHtml(codeBlock.toString().stripTrailing())).append("</code></pre>\n");
                    codeBlock.setLength(0);
                    codeLang = "";
                    inCode = false;
                } else {
                    if (inList) { html.append("</ul>\n"); inList = false; }
                    codeLang = line.substring(3).trim();
                    inCode = true;
                }
                continue;
            }
            if (inCode) {
                codeBlock.append(line).append("\n");
                continue;
            }

            if (inList && !line.startsWith("- ") && !line.startsWith("* ")) {
                html.append("</ul>\n");
                inList = false;
            }

            if (line.startsWith("### ")) {
                html.append("<h3>").append(inline(line.substring(4))).append("</h3>\n");
            } else if (line.startsWith("## ")) {
                html.append("<h2>").append(inline(line.substring(3))).append("</h2>\n");
            } else if (line.startsWith("# ")) {
                html.append("<h1>").append(inline(line.substring(2))).append("</h1>\n");
            } else if (line.startsWith("- ") || line.startsWith("* ")) {
                if (!inList) { html.append("<ul>\n"); inList = true; }
                html.append("<li>").append(inline(line.substring(2))).append("</li>\n");
            } else if (line.startsWith("> ")) {
                html.append("<blockquote>").append(inline(line.substring(2))).append("</blockquote>\n");
            } else if (line.isBlank()) {
                // 빈 줄은 단락 구분으로만 사용
            } else {
                html.append("<p>").append(inline(line)).append("</p>\n");
            }
        }

        if (inList) html.append("</ul>\n");
        if (inCode) html.append("<pre><code>").append(escapeHtml(codeBlock.toString())).append("</code></pre>\n");

        return html.toString();
    }

    private String inline(String text) {
        text = text.replaceAll("\\*\\*(.+?)\\*\\*", "<strong>$1</strong>");
        text = text.replaceAll("__(.+?)__",          "<strong>$1</strong>");
        text = text.replaceAll("\\*(.+?)\\*",        "<em>$1</em>");
        text = text.replaceAll("_(.+?)_",            "<em>$1</em>");
        text = text.replaceAll("`(.+?)`",            "<code>$1</code>");
        text = text.replaceAll("\\[\\[([^\\]]+)\\]\\]", "$1");
        return text;
    }

    private String escapeHtml(String text) {
        return text.replace("&", "&amp;")
                   .replace("<", "&lt;")
                   .replace(">", "&gt;");
    }
}
