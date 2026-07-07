package com.brainx.intelligence.infrastructure.entitlement;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestClientResponseException;

import com.brainx.intelligence.shared.application.port.outbound.EntitlementPort;

/**
 * Commerce-Service의 POST /internal/v1/entitlements/check를 호출해 AI 호출 전 preflight를
 * 수행한다. actorId가 게스트(gst_ 접두)인지 회원인지는 Commerce-Service가 판정하므로 여기서는
 * 구분 없이 userId 필드에 실어 보낸다.
 *
 * 판정 서비스 장애 시에는 fail-closed(차단)한다 — 과금/한도 오판정보다 일시적인 AI 기능 불가가
 * 더 안전하다.
 */
@Component
public class ExternalEntitlementAdapter implements EntitlementPort {

    private static final Logger log = LoggerFactory.getLogger(ExternalEntitlementAdapter.class);
    private static final String SERVICE_TOKEN_HEADER = "X-Service-Token";
    private static final String SERVICE_UNAVAILABLE_REASON = "ENTITLEMENT_SERVICE_UNAVAILABLE";

    private final RestClient restClient;
    private final EntitlementClientProperties properties;

    @Autowired
    public ExternalEntitlementAdapter(EntitlementClientProperties properties) {
        this(createRestClient(properties), properties);
    }

    ExternalEntitlementAdapter(RestClient restClient, EntitlementClientProperties properties) {
        this.restClient = restClient;
        this.properties = properties;
    }

    @Override
    public EntitlementDecision checkEntitlement(EntitlementRequest request) {
        try {
            CheckResponse response = restClient.post()
                .uri("/internal/v1/entitlements/check")
                .header(SERVICE_TOKEN_HEADER, properties.getServiceToken())
                .body(new CheckRequest(request.userId(), request.capability(), request.requestedTokenEstimate()))
                .retrieve()
                .body(CheckResponse.class);
            if (response == null || response.data() == null) {
                log.warn("Entitlement check response did not include data; failing closed.");
                return new EntitlementDecision(false, SERVICE_UNAVAILABLE_REASON, null);
            }
            CheckData data = response.data();
            return new EntitlementDecision(data.allowed(), data.reason(), data.remaining());
        } catch (RestClientResponseException exception) {
            log.warn("Entitlement check failed with status {}; failing closed.", exception.getStatusCode().value());
            return new EntitlementDecision(false, SERVICE_UNAVAILABLE_REASON, null);
        } catch (RestClientException exception) {
            log.warn("Entitlement check call failed; failing closed.", exception);
            return new EntitlementDecision(false, SERVICE_UNAVAILABLE_REASON, null);
        }
    }

    private static RestClient createRestClient(EntitlementClientProperties properties) {
        var requestFactory = new SimpleClientHttpRequestFactory();
        requestFactory.setConnectTimeout(properties.getTimeout());
        requestFactory.setReadTimeout(properties.getTimeout());
        return RestClient.builder()
            .baseUrl(properties.getBaseUrl().toString())
            .requestFactory(requestFactory)
            .build();
    }

    record CheckRequest(String userId, String capability, Integer quantity) {
    }

    record CheckResponse(boolean success, String message, CheckData data) {
    }

    record CheckData(boolean allowed, String reason, Integer remaining, Integer entitlementSnapshotVersion) {
    }
}
