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
import java.util.Set;

@Slf4j
@Service
@RequiredArgsConstructor
public class NotionApiService {

    private final RestTemplate restTemplate;
    private final AssetService assetService;
    private final NotionRateLimiter rateLimiter;

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

        String clientIdPrefix = clientId != null && clientId.length() >= 4 ? clientId.substring(0, 4) : clientId;
        String clientSecretPrefix = clientSecret != null && clientSecret.length() >= 4 ? clientSecret.substring(0, 4) : clientSecret;
        log.info("Notion 토큰 교환: clientId앞4자={}, clientSecret앞4자={}, redirectUri={}", clientIdPrefix, clientSecretPrefix, redirectUri);

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
            String notionBody = e.getResponseBodyAsString();
            log.error("Notion 토큰 교환 실패: status={}, body={}", e.getStatusCode(), notionBody);
            throw BrainXException.badRequest("NOTION_TOKEN_ERROR",
                    "Notion 인증 코드 교환에 실패했습니다. [status=" + e.getStatusCode() + ", body=" + notionBody + ", clientId앞4자=" + clientIdPrefix + ", secret앞4자=" + clientSecretPrefix + "]");
        } catch (Exception e) {
            log.error("Notion 토큰 교환 실패(기타 예외): type={}, msg={}", e.getClass().getSimpleName(), e.getMessage(), e);
            throw BrainXException.badRequest("NOTION_TOKEN_ERROR",
                    "Notion 인증 코드 교환에 실패했습니다. [type=" + e.getClass().getSimpleName() + ", msg=" + e.getMessage() + "]");
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
            rateLimiter.acquire();
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
            rateLimiter.acquire();
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
    public String getPageMarkdown(String pageId, String accessToken, String userId) {
        try {
            rateLimiter.acquire();
            ResponseEntity<Map> res = restTemplate.exchange(
                    NOTION_API + "/blocks/" + pageId + "/children?page_size=100",
                    HttpMethod.GET,
                    new HttpEntity<>(notionHeaders(accessToken)),
                    Map.class
            );
            List<Map<String, Object>> results = (List<Map<String, Object>>) res.getBody().get("results");
            return convertBlocksToMarkdown(results, accessToken, userId);
        } catch (Exception e) {
            log.warn("Notion 블록 조회 실패: {}", e.getMessage());
            return "";
        }
    }

    @SuppressWarnings("unchecked")
    private String convertBlocksToMarkdown(List<Map<String, Object>> blocks, String accessToken, String userId) {
        if (blocks == null) return "";
        StringBuilder sb = new StringBuilder();
        for (Map<String, Object> block : blocks) {
            String type = (String) block.get("type");
            String line = convertBlock(block, type, accessToken, userId);
            if (line != null) sb.append(line).append("\n");
        }
        return sb.toString();
    }

    @SuppressWarnings("unchecked")
    private String convertBlock(Map<String, Object> block, String type, String accessToken, String userId) {
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
                    String url = (String) imgObj.get("url");
                    yield "![](" + imageMarkdownUrl(imgType, url, userId) + ")";
                }
                case "child_page" -> {
                    Map<String, Object> childPage = (Map<String, Object>) block.get("child_page");
                    String childTitle = (String) childPage.get("title");
                    yield "[[" + childTitle + "]]";
                }
                case "child_database" -> {
                    // child_database 블록 자체에는 행(row) 데이터가 없고, 행은 일반 자식 블록이
                    // 아니라 databases/{id}/query API로만 조회된다. 각 행은 사실 Notion 페이지라
                    // 본문 블록을 가지고 있으므로(ImportService.importPageRecursive가 별도 노트로
                    // 만들고 createNoteLink로 이어준다) 여기서는 그 노트들로 가는 위키링크 목록만
                    // 인라인으로 남긴다.
                    String databaseId = (String) block.get("id");
                    Map<String, Object> childDb = (Map<String, Object>) block.get("child_database");
                    String dbTitle = (String) childDb.get("title");
                    List<ChildPageRef> rows = queryDatabaseRowRefs(databaseId, accessToken);
                    if (rows.isEmpty()) yield "**" + dbTitle + "**";
                    StringBuilder sb = new StringBuilder();
                    if (dbTitle != null && !dbTitle.isBlank()) sb.append("**").append(dbTitle).append("**\n");
                    for (ChildPageRef row : rows) sb.append("- [[").append(row.title()).append("]]\n");
                    yield sb.toString().stripTrailing();
                }
                case "column_list", "column" -> {
                    // 자식 블록 재귀 조회
                    if (Boolean.TRUE.equals(block.get("has_children"))) {
                        String blockId = (String) block.get("id");
                        yield getPageMarkdown(blockId, accessToken, userId);
                    }
                    yield null;
                }
                default -> null;
            };
        } catch (Exception e) {
            return null;
        }
    }

    /**
     * Notion이 "file" 타입으로 호스팅하는 이미지의 url은 S3 presigned GET URL이라
     * 1시간(X-Amz-Expires=3600) 후 만료된다 — 가져온 직후에는 보이다가 나중에 깨진다.
     * 그래서 다운로드해 우리 자산(Asset)으로 영구 저장하고, 절대 URL을 마크다운에 박아두는
     * 대신 PdfBlock/ImageBlock의 assetId 패턴과 같은 `asset://{assetId}` 의사 URL을 써서
     * 프론트가 렌더링 시점에 GET /api/v1/assets/{assetId}/file로 해석하게 한다
     * (NoteEditor.tsx markdownToHtml 참고). "external" 타입(사용자가 외부에 올린 이미지)은
     * 만료되지 않으므로 원본 url을 그대로 쓴다. 다운로드가 실패해도 가져오기 전체가 실패하지
     * 않도록 원본(만료될 수 있는) url로 폴백한다.
     */
    private String imageMarkdownUrl(String imgType, String url, String userId) {
        if (!"file".equals(imgType) || url == null) return url;
        int maxAttempts = 3;
        for (int attempt = 1; attempt <= maxAttempts; attempt++) {
            try {
                // String URL은 Spring이 내부에서 UriComponentsBuilder로 재인코딩해
                // %EC%A6%9D 같은 이미 인코딩된 경로를 %25EC%25A6%259D로 이중 인코딩한다.
                // S3 presigned URL은 서명이 원본 URL 기준이라 이중 인코딩 시 서명 검증 실패.
                // URI 객체로 넘기면 재인코딩 없이 그대로 사용한다.
                ResponseEntity<byte[]> res = restTemplate.getForEntity(java.net.URI.create(url), byte[].class);
                byte[] bytes = res.getBody();
                if (bytes == null || bytes.length == 0) {
                    if (attempt < maxAttempts) continue;
                    break;
                }
                MediaType contentType = res.getHeaders().getContentType();
                String fileName = fileNameFromUrl(url);
                String assetId = assetService.persistDerivedAsset(
                        userId, fileName, contentType != null ? contentType.toString() : "image/jpeg", bytes
                ).getAssetId();
                return "asset://" + assetId;
            } catch (Exception e) {
                log.warn("Notion 이미지 다운로드 실패 ({}/{}회): {}", attempt, maxAttempts, e.getMessage());
            }
        }
        log.warn("Notion 이미지 영구 저장 실패 ({}회 시도), 만료될 수 있는 원본 URL로 대체: {}", maxAttempts, url);
        return url;
    }

    private String fileNameFromUrl(String url) {
        try {
            String path = java.net.URI.create(url).getPath();
            String name = path.contains("/") ? path.substring(path.lastIndexOf('/') + 1) : path;
            return name.isBlank() ? "notion-image" : name;
        } catch (Exception e) {
            return "notion-image";
        }
    }

    @SuppressWarnings("unchecked")
    private String richText(Map<String, Object> content) {
        List<Map<String, Object>> texts = (List<Map<String, Object>>) content.get("rich_text");
        if (texts == null || texts.isEmpty()) return "";

        StringBuilder sb = new StringBuilder();
        for (Map<String, Object> rt : texts) {
            String rtType = (String) rt.get("type");

            // Notion 페이지 멘션(@페이지명)은 rich_text에 "text"가 아니라 "mention"으로 온다.
            // BrainX의 위키링크 문법([[제목]])으로 변환해 백링크가 그대로 이어지게 한다.
            if ("mention".equals(rtType)) {
                Map<String, Object> mention = (Map<String, Object>) rt.get("mention");
                String mentionType = mention != null ? (String) mention.get("type") : null;
                String plainText = (String) rt.get("plain_text");
                if (("page".equals(mentionType) || "database".equals(mentionType)) && plainText != null) {
                    sb.append("[[").append(plainText).append("]]");
                } else if (plainText != null) {
                    sb.append(plainText);
                }
                continue;
            }

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
            rateLimiter.acquire();
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

    /**
     * column_list / column 컨테이너 블록 안에 중첩된 child_database까지 모두 수집한다.
     * getPageMarkdown이 컨테이너를 재귀 처리하는 범위와 동일하게 탐색한다.
     */
    public List<ChildDatabaseRef> getAllChildDatabasesDeep(String pageId, String accessToken) {
        List<ChildDatabaseRef> refs = new ArrayList<>();
        Set<String> seenIds = new java.util.LinkedHashSet<>();
        collectChildDatabasesDeep(pageId, accessToken, refs, seenIds);
        return refs;
    }

    @SuppressWarnings("unchecked")
    private void collectChildDatabasesDeep(String blockId, String accessToken,
                                            List<ChildDatabaseRef> refs, Set<String> seenIds) {
        try {
            rateLimiter.acquire();
            ResponseEntity<Map> res = restTemplate.exchange(
                    NOTION_API + "/blocks/" + blockId + "/children?page_size=100",
                    HttpMethod.GET,
                    new HttpEntity<>(notionHeaders(accessToken)),
                    Map.class
            );
            List<Map<String, Object>> results = (List<Map<String, Object>>) res.getBody().get("results");
            if (results == null) return;

            for (Map<String, Object> block : results) {
                String type = (String) block.get("type");
                String id = (String) block.get("id");
                if ("child_database".equals(type) && seenIds.add(id)) {
                    Map<String, Object> db = (Map<String, Object>) block.get("child_database");
                    refs.add(new ChildDatabaseRef(id, (String) db.get("title")));
                } else if (List.of("column_list", "column").contains(type)
                           && Boolean.TRUE.equals(block.get("has_children"))) {
                    collectChildDatabasesDeep(id, accessToken, refs, seenIds);
                }
            }
        } catch (Exception e) {
            log.warn("child_database 재귀 탐색 실패: blockId={}, error={}", blockId, e.getMessage());
        }
    }

    /**
     * column_list / column / toggle 같은 컨테이너 블록 안에 중첩된 child_page까지 모두 수집한다.
     * getPageMarkdown이 컨테이너를 재귀 처리하는 범위와 동일하게 탐색하므로, 마크다운에 [[링크]]로
     * 변환된 하위 페이지는 이 메서드로 반드시 찾을 수 있다.
     */
    public List<ChildPageRef> getAllChildPagesDeep(String pageId, String accessToken) {
        List<ChildPageRef> refs = new ArrayList<>();
        Set<String> seenIds = new java.util.LinkedHashSet<>();
        collectChildPagesDeep(pageId, accessToken, refs, seenIds);
        return refs;
    }

    @SuppressWarnings("unchecked")
    private void collectChildPagesDeep(String blockId, String accessToken,
                                        List<ChildPageRef> refs, Set<String> seenIds) {
        try {
            rateLimiter.acquire();
            ResponseEntity<Map> res = restTemplate.exchange(
                    NOTION_API + "/blocks/" + blockId + "/children?page_size=100",
                    HttpMethod.GET,
                    new HttpEntity<>(notionHeaders(accessToken)),
                    Map.class
            );
            List<Map<String, Object>> results = (List<Map<String, Object>>) res.getBody().get("results");
            if (results == null) return;

            for (Map<String, Object> block : results) {
                String type = (String) block.get("type");
                String id = (String) block.get("id");
                if ("child_page".equals(type) && seenIds.add(id)) {
                    Map<String, Object> cp = (Map<String, Object>) block.get("child_page");
                    refs.add(new ChildPageRef(id, (String) cp.get("title")));
                } else if (List.of("column_list", "column").contains(type)
                           && Boolean.TRUE.equals(block.get("has_children"))) {
                    // getPageMarkdown이 재귀하는 컨테이너와 동일한 범위만 탐색
                    collectChildPagesDeep(id, accessToken, refs, seenIds);
                }
            }
        } catch (Exception e) {
            log.warn("child_page 재귀 탐색 실패: blockId={}, error={}", blockId, e.getMessage());
        }
    }

    /**
     * 페이지 내 rich_text의 mention.page(@멘션 링크) 참조를 수집한다.
     * child_page 블록으로 내장된 하위 페이지가 아니라, 본문에 인라인으로 삽입된 다른 페이지
     * 링크를 대상으로 한다. ImportService에서 child_page와 함께 임포트해 위키링크가 연결되게 한다.
     */
    @SuppressWarnings("unchecked")
    public List<ChildPageRef> getMentionPageRefs(String pageId, String accessToken) {
        List<ChildPageRef> refs = new ArrayList<>();
        Set<String> seenIds = new java.util.LinkedHashSet<>();
        try {
            rateLimiter.acquire();
            ResponseEntity<Map> res = restTemplate.exchange(
                    NOTION_API + "/blocks/" + pageId + "/children?page_size=100",
                    HttpMethod.GET,
                    new HttpEntity<>(notionHeaders(accessToken)),
                    Map.class
            );
            List<Map<String, Object>> results = (List<Map<String, Object>>) res.getBody().get("results");
            if (results == null) return refs;

            for (Map<String, Object> block : results) {
                String type = (String) block.get("type");
                // 블록 자체가 페이지/데이터베이스 참조이거나 rich_text가 없는 타입은 건너뜀
                if (List.of("child_page", "child_database", "column_list", "column",
                        "divider", "image", "video", "file", "pdf", "bookmark", "embed").contains(type)) continue;
                Map<String, Object> blockContent = (Map<String, Object>) block.get(type);
                if (blockContent == null) continue;
                List<Map<String, Object>> richTextList = (List<Map<String, Object>>) blockContent.get("rich_text");
                if (richTextList == null) continue;
                for (Map<String, Object> rt : richTextList) {
                    if (!"mention".equals(rt.get("type"))) continue;
                    Map<String, Object> mention = (Map<String, Object>) rt.get("mention");
                    if (mention == null || !"page".equals(mention.get("type"))) continue;
                    Map<String, Object> pageRef = (Map<String, Object>) mention.get("page");
                    if (pageRef == null) continue;
                    String mentionedId = (String) pageRef.get("id");
                    String plainText = (String) rt.get("plain_text");
                    if (mentionedId != null && plainText != null && !plainText.isBlank() && seenIds.add(mentionedId)) {
                        refs.add(new ChildPageRef(mentionedId, plainText));
                    }
                }
            }
        } catch (Exception e) {
            log.warn("mention 페이지 참조 수집 실패: pageId={}, error={}", pageId, e.getMessage());
        }
        return refs;
    }

    public record ChildPageRef(String id, String title) {}

    // 페이지 안에 임베드된 데이터베이스 블록 목록 조회
    @SuppressWarnings("unchecked")
    public List<ChildDatabaseRef> getChildDatabases(String pageId, String accessToken) {
        try {
            rateLimiter.acquire();
            ResponseEntity<Map> res = restTemplate.exchange(
                    NOTION_API + "/blocks/" + pageId + "/children?page_size=100",
                    HttpMethod.GET,
                    new HttpEntity<>(notionHeaders(accessToken)),
                    Map.class
            );
            List<Map<String, Object>> results = (List<Map<String, Object>>) res.getBody().get("results");
            if (results == null) return List.of();
            return results.stream()
                    .filter(block -> "child_database".equals(block.get("type")))
                    .map(block -> {
                        Map<String, Object> db = (Map<String, Object>) block.get("child_database");
                        return new ChildDatabaseRef((String) block.get("id"), (String) db.get("title"));
                    })
                    .toList();
        } catch (Exception e) {
            log.warn("Notion 하위 데이터베이스 목록 조회 실패: pageId={}, error={}", pageId, e.getMessage());
            return List.of();
        }
    }

    public record ChildDatabaseRef(String id, String title) {}

    // 데이터베이스 행을 (id, title) 참조 목록으로 조회한다. 행의 제목은 properties 중 type이
    // title인 속성 값이다(extractTitle은 /pages/{id} 응답과 databases/{id}/query 행 응답 둘 다
    // 같은 형태의 properties를 쓰므로 그대로 재사용한다).
    public List<ChildPageRef> queryDatabaseRowRefs(String databaseId, String accessToken) {
        return queryDatabaseRows(databaseId, accessToken).stream()
                .map(row -> new ChildPageRef((String) row.get("id"), extractTitle(row)))
                .toList();
    }

    // 데이터베이스의 모든 행(=페이지) 원본을 조회한다(페이지네이션 처리).
    // 행은 child_page 블록이 아니라 databases/{id}/query API로만 조회되므로
    // 일반 자식 블록 탐색에는 잡히지 않는다.
    @SuppressWarnings("unchecked")
    private List<Map<String, Object>> queryDatabaseRows(String databaseId, String accessToken) {
        HttpHeaders headers = notionHeaders(accessToken);
        headers.setContentType(MediaType.APPLICATION_JSON);
        List<Map<String, Object>> rows = new ArrayList<>();
        String startCursor = null;

        try {
            do {
                Map<String, Object> body = startCursor == null
                        ? Map.of("page_size", 100)
                        : Map.of("page_size", 100, "start_cursor", startCursor);

                rateLimiter.acquire();
                ResponseEntity<Map> res = restTemplate.postForEntity(
                        NOTION_API + "/databases/" + databaseId + "/query",
                        new HttpEntity<>(body, headers),
                        Map.class
                );
                Map<String, Object> resBody = res.getBody();
                List<Map<String, Object>> results = (List<Map<String, Object>>) resBody.get("results");
                if (results != null) rows.addAll(results);
                boolean hasMore = Boolean.TRUE.equals(resBody.get("has_more"));
                startCursor = hasMore ? (String) resBody.get("next_cursor") : null;
            } while (startCursor != null);
        } catch (Exception e) {
            log.warn("Notion 데이터베이스 행 조회 실패: databaseId={}, error={}", databaseId, e.getMessage());
        }
        return rows;
    }

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
