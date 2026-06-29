package com.brainx.commerce.client;

import com.brainx.commerce.exception.CommerceException;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.Getter;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Component;
import org.springframework.web.client.HttpClientErrorException;
import org.springframework.web.client.RestTemplate;

import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.Map;

@Slf4j
@Component
public class TossPaymentsClient {

    private final RestTemplate restTemplate;
    private final ObjectMapper objectMapper;
    private final String secretKey;
    private final String confirmUrl;
    private final String cancelUrl;

    public TossPaymentsClient(
            RestTemplate restTemplate,
            ObjectMapper objectMapper,
            @Value("${toss.secret-key}") String secretKey,
            @Value("${toss.confirm-url}") String confirmUrl,
            @Value("${toss.cancel-url:https://api.tosspayments.com/v1/payments/%s/cancel}") String cancelUrl
    ) {
        this.restTemplate = restTemplate;
        this.objectMapper = objectMapper;
        this.secretKey = secretKey;
        this.confirmUrl = confirmUrl;
        this.cancelUrl = cancelUrl;
    }

    @SuppressWarnings("unchecked")
    public TossConfirmResult confirm(String paymentKey, String orderId, long amount) {
        HttpHeaders headers = authHeaders();
        Map<String, Object> body = Map.of(
                "paymentKey", paymentKey,
                "orderId", orderId,
                "amount", amount
        );

        try {
            ResponseEntity<Map> response = restTemplate.postForEntity(confirmUrl, new HttpEntity<>(body, headers), Map.class);
            Map<String, Object> data = response.getBody();
            String status = data == null ? null : (String) data.get("status");
            String paymentMethod = resolvePaymentMethod(data);
            return new TossConfirmResult(true, status, paymentMethod, null, null);
        } catch (HttpClientErrorException exception) {
            String responseBody = exception.getResponseBodyAsString();
            log.warn("Toss 결제 승인 실패: orderId={}, status={}, body={}", orderId, exception.getStatusCode(), responseBody);
            Map<String, Object> errorBody = parseErrorBody(responseBody);
            String code = (String) errorBody.getOrDefault("code", "TOSS_CONFIRM_FAILED");
            String message = (String) errorBody.getOrDefault("message", "결제 승인에 실패했습니다.");
            return new TossConfirmResult(false, null, null, code, message);
        } catch (Exception exception) {
            log.error("Toss 결제 승인 호출 중 오류: orderId={}, error={}", orderId, exception.getMessage());
            throw CommerceException.paymentFailed("결제 승인 호출에 실패했습니다: " + exception.getMessage());
        }
    }

    @SuppressWarnings("unchecked")
    public TossCancelResult cancel(String paymentKey, BigDecimal amount, String reason) {
        HttpHeaders headers = authHeaders();
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("cancelReason", reason == null || reason.isBlank() ? "관리자 요청 환불" : reason);
        if (amount != null) {
            body.put("cancelAmount", amount.longValue());
        }

        try {
            ResponseEntity<Map> response = restTemplate.postForEntity(
                    cancelUrl.formatted(paymentKey),
                    new HttpEntity<>(body, headers),
                    Map.class
            );
            Map<String, Object> data = response.getBody();
            String status = data == null ? null : (String) data.get("status");
            return new TossCancelResult(true, status, null, null);
        } catch (HttpClientErrorException exception) {
            String responseBody = exception.getResponseBodyAsString();
            log.warn("Toss 결제 환불 실패: paymentKey={}, status={}, body={}", paymentKey, exception.getStatusCode(), responseBody);
            Map<String, Object> errorBody = parseErrorBody(responseBody);
            String code = (String) errorBody.getOrDefault("code", "TOSS_CANCEL_FAILED");
            String message = (String) errorBody.getOrDefault("message", "결제 환불에 실패했습니다.");
            return new TossCancelResult(false, null, code, message);
        } catch (Exception exception) {
            log.error("Toss 결제 환불 호출 중 오류: paymentKey={}, error={}", paymentKey, exception.getMessage());
            throw CommerceException.paymentFailed("결제 환불 호출에 실패했습니다: " + exception.getMessage());
        }
    }

    private HttpHeaders authHeaders() {
        HttpHeaders headers = new HttpHeaders();
        headers.set("Authorization", "Basic " + Base64.getEncoder().encodeToString((secretKey + ":").getBytes(StandardCharsets.UTF_8)));
        headers.setContentType(MediaType.APPLICATION_JSON);
        return headers;
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> parseErrorBody(String responseBody) {
        if (responseBody == null || responseBody.isBlank()) {
            return Map.of();
        }
        try {
            return objectMapper.readValue(responseBody, Map.class);
        } catch (Exception exception) {
            return Map.of();
        }
    }

    private String resolvePaymentMethod(Map<String, Object> data) {
        if (data == null) {
            return "기타";
        }

        Object method = data.get("method");
        if ("간편결제".equals(method)) {
            Object easyPay = data.get("easyPay");
            if (easyPay instanceof Map<?, ?> easyPayMap) {
                Object provider = easyPayMap.get("provider");
                if (provider instanceof String providerName && !providerName.isBlank()) {
                    return providerName;
                }
            }
            return "간편결제";
        }

        Object card = data.get("card");
        if (card instanceof Map<?, ?> cardMap) {
            Object cardType = cardMap.get("cardType");
            if ("체크".equals(cardType)) {
                return "체크카드";
            }
            if ("신용".equals(cardType)) {
                return "신용카드";
            }
        }

        if (method instanceof String methodName && !methodName.isBlank()) {
            return methodName;
        }
        return "기타";
    }

    @Getter
    public static class TossConfirmResult {
        private final boolean approved;
        private final String status;
        private final String paymentMethod;
        private final String errorCode;
        private final String errorMessage;

        public TossConfirmResult(boolean approved, String status, String paymentMethod, String errorCode, String errorMessage) {
            this.approved = approved;
            this.status = status;
            this.paymentMethod = paymentMethod;
            this.errorCode = errorCode;
            this.errorMessage = errorMessage;
        }
    }

    @Getter
    public static class TossCancelResult {
        private final boolean refunded;
        private final String status;
        private final String errorCode;
        private final String errorMessage;

        public TossCancelResult(boolean refunded, String status, String errorCode, String errorMessage) {
            this.refunded = refunded;
            this.status = status;
            this.errorCode = errorCode;
            this.errorMessage = errorMessage;
        }
    }
}
