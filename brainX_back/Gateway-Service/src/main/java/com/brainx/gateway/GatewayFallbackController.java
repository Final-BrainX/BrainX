package com.brainx.gateway;

import org.springframework.cloud.gateway.support.ServerWebExchangeUtils;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ServerWebExchange;
import reactor.core.publisher.Mono;

import java.util.LinkedHashMap;
import java.util.Map;

@RestController
@RequestMapping("/fallback")
public class GatewayFallbackController {

    @RequestMapping("/{service}")
    public Mono<ResponseEntity<Map<String, Object>>> serviceUnavailableAnyMethod(@PathVariable String service,
                                                                                ServerWebExchange exchange) {
        return Mono.just(ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE)
                .body(buildBody(service, exchange)));
    }

    private Map<String, Object> buildBody(String service, ServerWebExchange exchange) {
        Map<String, Object> error = new LinkedHashMap<>();
        error.put("code", "SERVICE_UNAVAILABLE");
        error.put("message", service + " is temporarily unavailable.");

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("success", false);
        body.put("service", service);
        body.put("path", exchange.getRequest().getPath().value());
        body.put("routeId", exchange.getAttribute(ServerWebExchangeUtils.GATEWAY_ROUTE_ATTR));
        body.put("error", error);
        return body;
    }
}
