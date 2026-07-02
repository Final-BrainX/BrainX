package com.brainx.gateway;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.reactive.WebFluxTest;
import org.springframework.test.web.reactive.server.WebTestClient;

@WebFluxTest(GatewayFallbackController.class)
class GatewayFallbackControllerTest {

    @Autowired
    private WebTestClient webTestClient;

    @Test
    void returnsServiceUnavailableForFallbackRequests() {
        webTestClient.get()
                .uri("/fallback/workspace")
                .exchange()
                .expectStatus().isEqualTo(503)
                .expectBody()
                .jsonPath("$.success").isEqualTo(false)
                .jsonPath("$.service").isEqualTo("workspace")
                .jsonPath("$.error.code").isEqualTo("SERVICE_UNAVAILABLE");
    }
}
