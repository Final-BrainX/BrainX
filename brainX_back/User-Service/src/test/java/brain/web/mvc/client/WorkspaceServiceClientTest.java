package brain.web.mvc.client;

import org.junit.jupiter.api.Test;
import org.springframework.http.ResponseEntity;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.web.client.ResourceAccessException;
import org.springframework.web.client.RestTemplate;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.BDDMockito.given;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;

class WorkspaceServiceClientTest {

    @Test
    void provisionDefaultWorkspaceRetriesOnTransientFailureThenSucceeds() {
        RestTemplate restTemplate = mock(RestTemplate.class);
        WorkspaceServiceClient client = new WorkspaceServiceClient(restTemplate);
        ReflectionTestUtils.setField(client, "workspaceServiceBaseUrl", "http://localhost:8082");
        ReflectionTestUtils.setField(client, "serviceToken", "local-service-token");

        given(restTemplate.postForEntity(anyString(), any(), any(Class.class)))
                .willThrow(new ResourceAccessException("connection refused"))
                .willThrow(new ResourceAccessException("connection refused"))
                .willReturn(ResponseEntity.ok().build());

        client.provisionDefaultWorkspace("usr_retry_ok");

        verify(restTemplate, times(3)).postForEntity(anyString(), any(), any(Class.class));
    }

    @Test
    void provisionDefaultWorkspaceGivesUpAfterMaxAttempts() {
        RestTemplate restTemplate = mock(RestTemplate.class);
        WorkspaceServiceClient client = new WorkspaceServiceClient(restTemplate);
        ReflectionTestUtils.setField(client, "workspaceServiceBaseUrl", "http://localhost:8082");
        ReflectionTestUtils.setField(client, "serviceToken", "local-service-token");

        given(restTemplate.postForEntity(anyString(), any(), any(Class.class)))
                .willThrow(new ResourceAccessException("connection refused"));

        assertThatThrownBy(() -> client.provisionDefaultWorkspace("usr_retry_fail"))
                .isInstanceOf(ResourceAccessException.class);
        verify(restTemplate, times(3)).postForEntity(anyString(), any(), any(Class.class));
    }
}
