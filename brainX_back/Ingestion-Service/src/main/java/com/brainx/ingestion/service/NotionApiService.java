package com.brainx.ingestion.service;

import com.brainx.ingestion.exception.BrainXException;
import lombok.Getter;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.*;
import org.springframework.stereotype.Service;
import org.springframework.web.client.HttpClientErrorException;
import org.springframework.web.client.RestTemplate;

import java.util.ArrayList;
import java.util.Base64;
import java.util.List;
import java.util.Map;

@Slf4j
@Service
@RequiredArgsConstructor
public class NotionApiService {

    private final RestTemplate restTemplate;

    @Value("${notion.client-id}")
    private String clientId;

    @Value("${notion.client-secret}")
    private String clientSecret;

    @Value("${notion.token-url}")
    private String tokenUrl;

    private static final String NOTION_VERSION = "2022-06-28";
    private static final String NOTION_API = "https://api.notion.com/v1";

    // code → access_token 교환
    public NotionTokenResult exchangeToken(String code, String redirectUri) {
        HttpHeaders headers = new HttpHeaders();
        String credentials = Base64.getEncoder()
                .encodeToString((clientId + ":" + clientSecret).getBytes());
        headers.set("Authorization", "Basic " + credentials);
        headers.setContentType(MediaType.APPLICATION_JSON);

        Map<String, String> body = Map.of(
                "grant_type", "authorization_code",
                "code", code,
                "redirect_uri", redirectUri
        );

        try {
            ResponseEntity<Map> res = restTemplate.postForEntity(
                    tokenUrl, new HttpEntity<>(body, headers), Map.class);
            Map<String, Object> data = res.getBody();
            return new NotionTokenResult(
                    (String) data.get("access_token"),
                    (String) data.get("workspace_id"),
                    (String) data.get("workspace_name")
            );
        } catch (HttpClientErrorException e) {
            log.error("Notion 토큰 교환 실패: {}", e.getResponseBodyAsString());
            throw BrainXException.badRequest("NOTION_TOKEN_ERROR", "Notion 인증 코드 교환에 실패했습니다.");
        }
    }

    // 워크스페이스 페이지 목록 조회
    @SuppressWarnings("unchecked")
    public List<NotionPageItem> searchPages(String accessToken) {
        HttpHeaders headers = notionHeaders(accessToken);
        headers.setContentType(MediaType.APPLICATION_JSON);

        Map<String, Object> body = Map.of(
                "filter", Map.of("value", "page", "property", "object"),
                "sort", Map.of("direction", "descending", "timestamp", "last_edited_time"),
                "page_size", 50
        );

        try {
            ResponseEntity<Map> res = restTemplate.postForEntity(
                    NOTION_API + "/search",
                    new HttpEntity<>(body, headers),
                    Map.class
            );
            List<Map<String, Object>> results = (List<Map<String, Object>>) res.getBody().get("results");
            List<NotionPageItem> pages = new ArrayList<>();
            if (results == null) return pages;

            for (Map<String, Object> page : results) {
                String id = (String) page.get("id");
                String title = extractTitle(page);
                String lastEdited = (String) page.get("last_edited_time");
                String icon = extractIcon(page);
                pages.add(new NotionPageItem(id, title, lastEdited, icon));
            }
            return pages;
        } catch (Exception e) {
            log.error("Notion 페이지 목록 조회 실패: {}", e.getMessage());
            throw BrainXException.internalError("Notion 페이지 목록을 가져오지 못했습니다.");
        }
    }

    @SuppressWarnings("unchecked")
    private String extractIcon(Map<String, Object> page) {
        try {
            Map<String, Object> icon = (Map<String, Object>) page.get("icon");
            if (icon == null) return null;
            String type = (String) icon.get("type");
            if ("emoji".equals(type)) return (String) icon.get("emoji");
        } catch (Exception ignored) {}
        return null;
    }

    // 페이지 제목 조회
    public String getPageTitle(String pageId, String accessToken) {
        try {
            ResponseEntity<Map> res = restTemplate.exchange(
                    NOTION_API + "/pages/" + pageId,
                    HttpMethod.GET,
                    new HttpEntity<>(notionHeaders(accessToken)),
                    Map.class
            );
            return extractTitle(res.getBody());
        } catch (Exception e) {
            log.warn("Notion 페이지 제목 조회 실패: {}", e.getMessage());
            return "Notion에서 가져온 페이지";
        }
    }

    // 페이지 블록 → Markdown 변환
    @SuppressWarnings("unchecked")
    public String getPageMarkdown(String pageId, String accessToken) {
        try {
            ResponseEntity<Map> res = restTemplate.exchange(
                    NOTION_API + "/blocks/" + pageId + "/children?page_size=100",
                    HttpMethod.GET,
                    new HttpEntity<>(notionHeaders(accessToken)),
                    Map.class
            );
            List<Map<String, Object>> results = (List<Map<String, Object>>) res.getBody().get("results");
            return convertBlocksToMarkdown(results, accessToken);
        } catch (Exception e) {
            log.warn("Notion 블록 조회 실패: {}", e.getMessage());
            return "";
        }
    }

    @SuppressWarnings("unchecked")
    private String convertBlocksToMarkdown(List<Map<String, Object>> blocks, String accessToken) {
        if (blocks == null) return "";
        StringBuilder sb = new StringBuilder();
        for (Map<String, Object> block : blocks) {
            String type = (String) block.get("type");
            String line = convertBlock(block, type, accessToken);
            if (line != null) sb.append(line).append("\n");
        }
        return sb.toString();
    }

    @SuppressWarnings("unchecked")
    private String convertBlock(Map<String, Object> block, String type, String accessToken) {
        try {
            return switch (type) {
                case "paragraph" -> richText((Map<String, Object>) block.get("paragraph"));
                case "heading_1" -> "# " + richText((Map<String, Object>) block.get("heading_1"));
                case "heading_2" -> "## " + richText((Map<String, Object>) block.get("heading_2"));
                case "heading_3" -> "### " + richText((Map<String, Object>) block.get("heading_3"));
                case "bulleted_list_item" -> "- " + richText((Map<String, Object>) block.get("bulleted_list_item"));
                case "numbered_list_item" -> "1. " + richText((Map<String, Object>) block.get("numbered_list_item"));
                case "to_do" -> {
                    Map<String, Object> todo = (Map<String, Object>) block.get("to_do");
                    boolean checked = Boolean.TRUE.equals(todo.get("checked"));
                    yield (checked ? "- [x] " : "- [ ] ") + richText(todo);
                }
                case "quote" -> "> " + richText((Map<String, Object>) block.get("quote"));
                case "callout" -> "> 💡 " + richText((Map<String, Object>) block.get("callout"));
                case "code" -> {
                    Map<String, Object> code = (Map<String, Object>) block.get("code");
                    String lang = (String) code.getOrDefault("language", "");
                    yield "```" + lang + "\n" + richText(code) + "\n```";
                }
                case "divider" -> "---";
                case "image" -> {
                    Map<String, Object> img = (Map<String, Object>) block.get("image");
                    String imgType = (String) img.get("type");
                    Map<String, Object> imgObj = (Map<String, Object>) img.get(imgType);
                    yield "![](" + imgObj.get("url") + ")";
                }
                case "child_page" -> {
                    Map<String, Object> childPage = (Map<String, Object>) block.get("child_page");
                    String childTitle = (String) childPage.get("title");
                    yield "[[" + childTitle + "]]";
                }
                case "column_list", "column" -> {
                    // 자식 블록 재귀 조회
                    if (Boolean.TRUE.equals(block.get("has_children"))) {
                        String blockId = (String) block.get("id");
                        yield getPageMarkdown(blockId, accessToken);
                    }
                    yield null;
                }
                default -> null;
            };
        } catch (Exception e) {
            return null;
        }
    }

    @SuppressWarnings("unchecked")
    private String richText(Map<String, Object> content) {
        List<Map<String, Object>> texts = (List<Map<String, Object>>) content.get("rich_text");
        if (texts == null || texts.isEmpty()) return "";

        StringBuilder sb = new StringBuilder();
        for (Map<String, Object> rt : texts) {
            Map<String, Object> textObj = (Map<String, Object>) rt.get("text");
            if (textObj == null) continue;
            String text = (String) textObj.get("content");

            Map<String, Object> ann = (Map<String, Object>) rt.get("annotations");
            if (ann != null) {
                if (Boolean.TRUE.equals(ann.get("code"))) text = "`" + text + "`";
                if (Boolean.TRUE.equals(ann.get("bold"))) text = "**" + text + "**";
                if (Boolean.TRUE.equals(ann.get("italic"))) text = "_" + text + "_";
                if (Boolean.TRUE.equals(ann.get("strikethrough"))) text = "~~" + text + "~~";
            }

            Map<String, Object> link = (Map<String, Object>) textObj.get("link");
            if (link != null) text = "[" + text + "](" + link.get("url") + ")";

            sb.append(text);
        }
        return sb.toString();
    }

    @SuppressWarnings("unchecked")
    private String extractTitle(Map<String, Object> page) {
        try {
            Map<String, Object> props = (Map<String, Object>) page.get("properties");
            for (Map.Entry<String, Object> entry : props.entrySet()) {
                Map<String, Object> prop = (Map<String, Object>) entry.getValue();
                if ("title".equals(prop.get("type"))) {
                    List<Map<String, Object>> title = (List<Map<String, Object>>) prop.get("title");
                    if (title != null && !title.isEmpty()) {
                        Map<String, Object> text = (Map<String, Object>) title.get(0).get("text");
                        return (String) text.get("content");
                    }
                }
            }
        } catch (Exception ignored) {}
        return "Notion에서 가져온 페이지";
    }

    private HttpHeaders notionHeaders(String accessToken) {
        HttpHeaders headers = new HttpHeaders();
        headers.set("Authorization", "Bearer " + accessToken);
        headers.set("Notion-Version", NOTION_VERSION);
        return headers;
    }

    @SuppressWarnings("unchecked")
    public List<ChildPageRef> getChildPages(String pageId, String accessToken) {
        try {
            ResponseEntity<Map> res = restTemplate.exchange(
                    NOTION_API + "/blocks/" + pageId + "/children?page_size=100",
                    HttpMethod.GET,
                    new HttpEntity<>(notionHeaders(accessToken)),
                    Map.class
            );
            List<Map<String, Object>> results = (List<Map<String, Object>>) res.getBody().get("results");
            if (results == null) return List.of();
            return results.stream()
                    .filter(block -> "child_page".equals(block.get("type")))
                    .map(block -> {
                        Map<String, Object> cp = (Map<String, Object>) block.get("child_page");
                        return new ChildPageRef((String) block.get("id"), (String) cp.get("title"));
                    })
                    .toList();
        } catch (Exception e) {
            log.warn("Notion 하위 페이지 목록 조회 실패: pageId={}, error={}", pageId, e.getMessage());
            return List.of();
        }
    }

    public record ChildPageRef(String id, String title) {}

    @Getter
    public static class NotionPageItem {
        private final String id;
        private final String title;
        private final String lastEditedTime;
        private final String icon;

        public NotionPageItem(String id, String title, String lastEditedTime, String icon) {
            this.id = id;
            this.title = title;
            this.lastEditedTime = lastEditedTime;
            this.icon = icon;
        }
    }

    @Getter
    public static class NotionTokenResult {
        private final String accessToken;
        private final String workspaceId;
        private final String workspaceName;

        public NotionTokenResult(String accessToken, String workspaceId, String workspaceName) {
            this.accessToken = accessToken;
            this.workspaceId = workspaceId;
            this.workspaceName = workspaceName;
        }
    }
}
