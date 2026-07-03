package com.brainx.mcp.security;

import com.brainx.mcp.api.ApiResponse;
import com.brainx.mcp.client.application.ApiKeyAuthenticator;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;

@Configuration
public class SecurityConfig {

    @Bean
    JwtTokenVerifier jwtTokenVerifier(ObjectMapper objectMapper, @Value("${brainx.jwt.secret}") String jwtSecret) {
        return new JwtTokenVerifier(objectMapper, jwtSecret);
    }

    @Bean
    PasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder();
    }

    @Bean
    SecurityFilterChain securityFilterChain(
        HttpSecurity http,
        ObjectMapper objectMapper,
        JwtTokenVerifier jwtTokenVerifier,
        ApiKeyAuthenticator apiKeyAuthenticator,
        @Value("${brainx.mcp.api-key.prefix}") String apiKeyPrefix,
        @Value("${brainx.oauth.issuer}") String oauthIssuer,
        @Value("${brainx.oauth.resource}") String oauthResource,
        @Value("${brainx.oauth.protected-resource-metadata-url}") String protectedResourceMetadataUrl
    ) throws Exception {
        http
            .csrf(AbstractHttpConfigurer::disable)
            .formLogin(AbstractHttpConfigurer::disable)
            .httpBasic(AbstractHttpConfigurer::disable)
            .sessionManagement(session -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
            .exceptionHandling(exceptionHandling -> exceptionHandling
                .authenticationEntryPoint((request, response, exception) -> {
                    if (isMcpProtectedPath(request.getRequestURI())) {
                        response.setHeader(
                            "WWW-Authenticate",
                            "Bearer resource_metadata=\"" + protectedResourceMetadataUrl + "\", scope=\"whoami notes:read ai:search notes:write\""
                        );
                    }
                    writeError(response, objectMapper, HttpStatus.UNAUTHORIZED, "UNAUTHORIZED", "Authentication required.");
                })
                .accessDeniedHandler((request, response, exception) ->
                    writeError(response, objectMapper, HttpStatus.FORBIDDEN, "FORBIDDEN", "Forbidden."))
            )
            .authorizeHttpRequests(authorize -> authorize
                .requestMatchers(HttpMethod.OPTIONS, "/**").permitAll()
                .requestMatchers("/actuator/health", "/actuator/info").permitAll()
                .requestMatchers("/.well-known/oauth-protected-resource").permitAll()
                .requestMatchers("/api/v1/mcp/api-clients/**").hasRole("USER")
                .requestMatchers("/api/v1/mcp/whoami", "/mcp", "/mcp/**").hasRole("MCP_CLIENT")
                .anyRequest().denyAll()
            );

        http.addFilterBefore(
            new ApiKeyAuthenticationFilter(apiKeyAuthenticator, apiKeyPrefix),
            UsernamePasswordAuthenticationFilter.class
        );
        http.addFilterBefore(
            new OAuthMcpAuthenticationFilter(jwtTokenVerifier, apiKeyPrefix, oauthIssuer, oauthResource),
            UsernamePasswordAuthenticationFilter.class
        );
        http.addFilterBefore(
            new JwtAuthenticationFilter(jwtTokenVerifier, apiKeyPrefix),
            UsernamePasswordAuthenticationFilter.class
        );

        return http.build();
    }

    private static boolean isMcpProtectedPath(String path) {
        return path != null && (path.equals("/mcp") || path.startsWith("/mcp/") || path.equals("/api/v1/mcp/whoami"));
    }

    private static void writeError(
        HttpServletResponse response,
        ObjectMapper objectMapper,
        HttpStatus status,
        String code,
        String message
    ) throws IOException {
        response.setStatus(status.value());
        response.setContentType(MediaType.APPLICATION_JSON_VALUE);
        objectMapper.writeValue(response.getOutputStream(), ApiResponse.failure(code, message, null));
    }
}
