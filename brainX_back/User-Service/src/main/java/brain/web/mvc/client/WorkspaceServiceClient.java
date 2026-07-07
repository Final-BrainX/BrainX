package brain.web.mvc.client;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestTemplate;

@Slf4j
@Component
@RequiredArgsConstructor
public class WorkspaceServiceClient {
    private static final int MAX_ATTEMPTS = 3;
    private static final long RETRY_BACKOFF_MILLIS = 300L;

    private final RestTemplate restTemplate;

    @Value("${workspace-service.base-url:http://localhost:8082}")
    private String workspaceServiceBaseUrl;

    @Value("${brainx.service-token:local-service-token}")
    private String serviceToken;

    /** 회원가입/온보딩 직후 한 번뿐인 Best-Effort 호출이라, Workspace-Service가 아직 기동 중이거나
        일시적인 네트워크 문제로 실패하면 그대로 사용자가 Default Workspace 없이 남는 사례가
        있었다(재시도가 없어 실패가 곧 영구 누락으로 이어짐). 짧은 backoff로 최대 3회까지만
        재시도하고, 그래도 실패하면 그대로 예외를 던져 호출부(AuthService)의 best-effort
        catch/log가 최종 안전망 역할을 하도록 둔다. */
    public void provisionDefaultWorkspace(String userId) {
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);
        headers.set("X-Service-Token", serviceToken);

        RuntimeException lastFailure = null;
        for (int attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
            try {
                restTemplate.postForEntity(
                        workspaceServiceBaseUrl + "/internal/v1/workspace/users/" + userId + "/default-workspace",
                        new HttpEntity<>(headers),
                        Void.class
                );
                return;
            } catch (RuntimeException exception) {
                lastFailure = exception;
                log.warn("Default workspace provisioning attempt {}/{} failed for userId={}.", attempt, MAX_ATTEMPTS, userId, exception);
                if (attempt < MAX_ATTEMPTS) {
                    sleepBeforeRetry(attempt);
                }
            }
        }
        throw lastFailure;
    }

    private void sleepBeforeRetry(int attempt) {
        try {
            Thread.sleep(RETRY_BACKOFF_MILLIS * attempt);
        } catch (InterruptedException interruptedException) {
            Thread.currentThread().interrupt();
        }
    }
}
