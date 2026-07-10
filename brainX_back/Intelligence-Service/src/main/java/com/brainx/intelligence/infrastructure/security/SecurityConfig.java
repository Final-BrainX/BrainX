package com.brainx.intelligence.infrastructure.security;

import java.io.IOException;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnWebApplication;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.env.Environment;
import org.springframework.core.env.Profiles;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.AnonymousAuthenticationFilter;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;

import com.brainx.intelligence.infrastructure.web.ApiErrorResponse;
import com.fasterxml.jackson.databind.ObjectMapper;

import jakarta.servlet.DispatcherType;
import jakarta.servlet.http.HttpServletResponse;

/**
 * Public API 최소 보안 설정입니다.
 */
@Configuration
public class SecurityConfig {

    @Bean
    JwtTokenVerifier jwtTokenVerifier(
        ObjectMapper objectMapper,
        @Value("${brainx.jwt.secret:}") String jwtSecret,
        Environment environment
    ) {
        return new JwtTokenVerifier(objectMapper, RuntimeSecretValidator.requireJwtSecret(jwtSecret, environment));
    }

    @Bean
    JwtAuthenticationFilter jwtAuthenticationFilter(JwtTokenVerifier jwtTokenVerifier) {
        return new JwtAuthenticationFilter(jwtTokenVerifier);
    }

    @Bean
    @ConditionalOnWebApplication(type = ConditionalOnWebApplication.Type.SERVLET)
    SecurityFilterChain securityFilterChain(
        HttpSecurity http,
        ObjectMapper objectMapper,
        Environment environment,
        JwtAuthenticationFilter jwtAuthenticationFilter
    ) throws Exception {
        boolean localApiPermitAll = environment.acceptsProfiles(Profiles.of("local"))
            || environment.getProperty("brainx.security.dev-auth.enabled", Boolean.class, false);
        boolean devUi = environment.acceptsProfiles(Profiles.of("dev-ui"));
        String devUserId = environment.getProperty("brainx.security.dev-auth.user-id", "dev-test-user");
        String serviceToken = RuntimeSecretValidator.requireServiceToken(
            environment.getProperty("brainx.service-token", ""),
            environment
        );

        http
            .formLogin(AbstractHttpConfigurer::disable)
            .httpBasic(AbstractHttpConfigurer::disable)
            .sessionManagement(session -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
            .exceptionHandling(exceptionHandling -> exceptionHandling
                .authenticationEntryPoint((request, response, exception) ->
                    writeError(response, objectMapper, HttpStatus.UNAUTHORIZED, "UNAUTHORIZED", "Authentication required."))
                .accessDeniedHandler((request, response, exception) ->
                    writeError(response, objectMapper, HttpStatus.FORBIDDEN, "FORBIDDEN", "Forbidden."))
            );

        http.addFilterBefore(new ServiceTokenAuthenticationFilter(serviceToken), UsernamePasswordAuthenticationFilter.class);
        http.addFilterBefore(jwtAuthenticationFilter, UsernamePasswordAuthenticationFilter.class);

        if (devUi) {
            http.csrf(AbstractHttpConfigurer::disable);
        } else {
            http.csrf(csrf -> csrf.ignoringRequestMatchers("/api/v1/**", "/internal/v1/**"));
        }

        if (localApiPermitAll) {
            http.addFilterBefore(new LocalDevelopmentAuthenticationFilter(devUserId), AnonymousAuthenticationFilter.class);
        }

        return http
            .authorizeHttpRequests(authorize -> {
                authorize.dispatcherTypeMatchers(DispatcherType.ASYNC, DispatcherType.ERROR).permitAll();
                authorize.requestMatchers("/internal/v1/**").hasRole("SERVICE");
                var apiRequests = authorize.requestMatchers("/api/v1/**");
                if (localApiPermitAll) {
                    apiRequests.permitAll();
                } else {
                    apiRequests.authenticated();
                }
                authorize.anyRequest().permitAll();
            })
            .build();
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
        objectMapper.writeValue(response.getOutputStream(), ApiErrorResponse.of(code, message));
    }
}
