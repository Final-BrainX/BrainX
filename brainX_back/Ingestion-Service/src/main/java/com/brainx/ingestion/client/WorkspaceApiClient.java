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

        Map<String, Object> body = Map.of(
                "targetNoteId", targetNoteId, "targetTitle", targetTitle, "createIfMissing", true);
        try {
            restTemplate.postForEntity(
                    workspaceBaseUrl + "/api/v1/notes/" + sourceNoteId + "/links",
                    new HttpEntity<>(body, headers),
                    Map.class
            );
        } catch (Exception e) {
            log.warn("노트 링크 생성 실패: source={}, target={}, error={}", sourceNoteId, targetNoteId, e.getMessage());
        }
    }

    /** ZIP 가져오기에서 내부 디렉터리 구조를 그대로 폴더로 재현하기 위해 사용한다
        (Workspace-Service SSOT의 POST /api/v1/folders, FolderCreateRequest{name, parentFolderId}). */
    @SuppressWarnings("unchecked")
    public String createFolder(String name, String parentFolderId, String jwtToken) {
        HttpHeaders headers = new HttpHeaders();
        headers.set("Authorization", "Bearer " + jwtToken);
        headers.setContentType(MediaType.APPLICATION_JSON);

        Map<String, Object> body = new HashMap<>();
        body.put("name", name);
        if (parentFolderId != null) body.put("parentFolderId", parentFolderId);

        try {
            ResponseEntity<Map> res = restTemplate.postForEntity(
                    workspaceBaseUrl + "/api/v1/folders",
                    new HttpEntity<>(body, headers),
                    Map.class
            );
            Map<String, Object> data = (Map<String, Object>) res.getBody().get("data");
            String folderId = (String) data.get("folderId");
            log.info("폴더 생성 완료: folderId={}, name={}", folderId, name);
            return folderId;
        } catch (Exception e) {
            log.error("workspace-service 폴더 생성 실패: name={}, error={}", name, e.getMessage());
            throw BrainXException.internalError("폴더 생성에 실패했습니다: " + e.getMessage());
        }
    }

    @SuppressWarnings("unchecked")
    public NoteContent getNote(String noteId, String jwtToken) {
        HttpHeaders headers = new HttpHeaders();
        headers.set("Authorization", "Bearer " + jwtToken);

        try {
            ResponseEntity<Map> res = restTemplate.exchange(
                    workspaceBaseUrl + "/api/v1/notes/" + noteId,
                    HttpMethod.GET,
                    new HttpEntity<>(headers),
                    Map.class
            );
            Map<String, Object> data = (Map<String, Object>) res.getBody().get("data");
            return new NoteContent((String) data.get("title"), (String) data.get("markdown"));
        } catch (Exception e) {
            log.error("workspace-service 노트 조회 실패: noteId={}, error={}", noteId, e.getMessage());
            throw BrainXException.internalError("노트를 조회할 수 없습니다: " + e.getMessage());
        }
    }

    public record NoteContent(String title, String markdown) {
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
                    workspaceBaseUrl + "/api/v1/notes",
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
