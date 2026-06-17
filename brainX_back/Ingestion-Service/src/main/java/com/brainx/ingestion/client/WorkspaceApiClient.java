package com.brainx.ingestion.client;

import com.brainx.ingestion.exception.BrainXException;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.*;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestTemplate;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

@Slf4j
@Component
@RequiredArgsConstructor
public class WorkspaceApiClient {

    private final RestTemplate restTemplate;

    @Value("${workspace-service.base-url:http://localhost:8082}")
    private String workspaceBaseUrl;

    public void createNoteLink(String sourceNoteId, String targetNoteId,
                               String targetTitle, String jwtToken) {
        HttpHeaders headers = new HttpHeaders();
        headers.set("Authorization", "Bearer " + jwtToken);
        headers.setContentType(MediaType.APPLICATION_JSON);

        Map<String, Object> body = Map.of("targetNoteId", targetNoteId, "targetTitle", targetTitle);
        try {
            restTemplate.postForEntity(
                    workspaceBaseUrl + "/v1/notes/" + sourceNoteId + "/links",
                    new HttpEntity<>(body, headers),
                    Map.class
            );
        } catch (Exception e) {
            log.warn("노트 링크 생성 실패: source={}, target={}, error={}", sourceNoteId, targetNoteId, e.getMessage());
        }
    }

    @SuppressWarnings("unchecked")
    public String createNote(String title, String markdown, String folderId,
                             List<String> tags, String jwtToken) {
        HttpHeaders headers = new HttpHeaders();
        headers.set("Authorization", "Bearer " + jwtToken);
        headers.setContentType(MediaType.APPLICATION_JSON);

        Map<String, Object> body = new HashMap<>();
        body.put("title", title);
        body.put("markdown", markdown != null ? markdown : "");
        if (folderId != null) body.put("folderId", folderId);
        if (tags != null && !tags.isEmpty()) body.put("tags", tags);

        try {
            ResponseEntity<Map> res = restTemplate.postForEntity(
                    workspaceBaseUrl + "/v1/notes",
                    new HttpEntity<>(body, headers),
                    Map.class
            );
            Map<String, Object> data = (Map<String, Object>) res.getBody().get("data");
            String noteId = (String) data.get("noteId");
            log.info("노트 생성 완료: noteId={}", noteId);
            return noteId;
        } catch (Exception e) {
            log.error("workspace-service 노트 생성 실패: {}", e.getMessage());
            throw BrainXException.internalError("노트 생성에 실패했습니다: " + e.getMessage());
        }
    }
}
