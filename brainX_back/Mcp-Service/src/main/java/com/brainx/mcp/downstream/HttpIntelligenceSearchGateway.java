package com.brainx.mcp.downstream;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import java.util.List;
import java.util.Map;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestClientResponseException;

@Component
public class HttpIntelligenceSearchGateway implements IntelligenceSearchGateway {

    static final String SERVICE_TOKEN_HEADER = "X-Service-Token";

    private final RestClient restClient;
    private final BrainxServiceProperties serviceProperties;

    @Autowired
    public HttpIntelligenceSearchGateway(
        IntelligenceClientProperties properties,
        BrainxServiceProperties serviceProperties
    ) {
        this(createRestClient(properties), serviceProperties);
    }

    HttpIntelligenceSearchGateway(RestClient restClient, BrainxServiceProperties serviceProperties) {
        this.restClient = restClient;
        this.serviceProperties = serviceProperties;
    }

    @Override
    public SearchResponse search(String userId, SearchQuery query) {
        var request = new InternalSemanticSearchRequest(
            userId,
            query.scope(),
            query.documentGroupId(),
            query.query(),
            Map.of(),
            query.limit(),
            List.of()
        );
        try {
            ApiEnvelope<SearchResponse> response = restClient.post()
                .uri("/internal/v1/intelligence/semantic-search")
                .header(SERVICE_TOKEN_HEADER, serviceProperties.getServiceToken())
                .body(request)
                .retrieve()
                .body(new ParameterizedTypeReference<ApiEnvelope<SearchResponse>>() {
                });
            if (response == null || response.data() == null) {
                throw new DownstreamServiceException("Intelligence semantic search response did not include data.");
            }
            return response.data();
        } catch (RestClientResponseException exception) {
            throw new DownstreamServiceException(
                "Intelligence semantic search failed with status " + exception.getStatusCode().value() + ".",
                exception
            );
        } catch (RestClientException exception) {
            throw new DownstreamServiceException("Intelligence semantic search failed.", exception);
        }
    }

    private static RestClient createRestClient(IntelligenceClientProperties properties) {
        var requestFactory = new SimpleClientHttpRequestFactory();
        requestFactory.setConnectTimeout(properties.getTimeout());
        requestFactory.setReadTimeout(properties.getTimeout());
        return RestClient.builder()
            .baseUrl(properties.getBaseUrl().toString())
            .requestFactory(requestFactory)
            .build();
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    record ApiEnvelope<T>(
        boolean success,
        T data,
        String message
    ) {
    }

    record InternalSemanticSearchRequest(
        String userId,
        String scope,
        String documentGroupId,
        String query,
        Map<String, Object> filters,
        Integer limit,
        List<String> hybridWithClientKeywordIds
    ) {
    }
}
