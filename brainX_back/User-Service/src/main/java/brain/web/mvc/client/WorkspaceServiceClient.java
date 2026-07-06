package brain.web.mvc.client;

import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestTemplate;

@Component
@RequiredArgsConstructor
public class WorkspaceServiceClient {
    private final RestTemplate restTemplate;

    @Value("${workspace-service.base-url:http://localhost:8082}")
    private String workspaceServiceBaseUrl;

    @Value("${brainx.service-token:local-service-token}")
    private String serviceToken;

    public void provisionDefaultWorkspace(String userId) {
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);
        headers.set("X-Service-Token", serviceToken);

        restTemplate.postForEntity(
                workspaceServiceBaseUrl + "/internal/v1/workspace/users/" + userId + "/default-workspace",
                new HttpEntity<>(headers),
                Void.class
        );
    }
}
