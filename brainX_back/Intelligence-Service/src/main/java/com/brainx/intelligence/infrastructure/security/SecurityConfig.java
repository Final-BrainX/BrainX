package com.brainx.intelligence.infrastructure.security;

import java.io.IOException;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.env.Environment;
import org.springframework.core.env.Profiles;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.security.config.Customizer;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.authority.AuthorityUtils;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.web.authentication.AnonymousAuthenticationFilter;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.web.filter.OncePerRequestFilter;

import com.brainx.intelligence.infrastructure.web.ApiErrorResponse;
import com.fasterxml.jackson.databind.ObjectMapper;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

/**
 * Public API 최소 보안 설정입니다.
 */
@Configuration
public class SecurityConfig {

    @Bean
    SecurityFilterChain securityFilterChain(HttpSecurity http, ObjectMapper objectMapper, Environment environment) throws Exception {
        boolean localApiPermitAll = environment.acceptsProfiles(Profiles.of("local"));
        boolean devUi = environment.acceptsProfiles(Profiles.of("dev-ui"));

        http
            .formLogin(AbstractHttpConfigurer::disable)
            .httpBasic(Customizer.withDefaults())
            .exceptionHandling(exceptionHandling -> exceptionHandling
                .authenticationEntryPoint((request, response, exception) ->
                    writeError(response, objectMapper, HttpStatus.UNAUTHORIZED, "UNAUTHORIZED", "Authentication required."))
                .accessDeniedHandler((request, response, exception) ->
                    writeError(response, objectMapper, HttpStatus.FORBIDDEN, "FORBIDDEN", "Forbidden."))
            );

        if (devUi) {
            http.csrf(AbstractHttpConfigurer::disable);
        } else {
            http.csrf(csrf -> csrf.ignoringRequestMatchers("/api/v1/**"));
        }

        if (localApiPermitAll) {
            http.addFilterBefore(new LocalDevelopmentAuthenticationFilter(), AnonymousAuthenticationFilter.class);
        }

        return http
            .authorizeHttpRequests(authorize -> {
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

    private static final class LocalDevelopmentAuthenticationFilter extends OncePerRequestFilter {

        @Override
        protected void doFilterInternal(
            HttpServletRequest request,
            HttpServletResponse response,
            FilterChain filterChain
        ) throws ServletException, IOException {
            Authentication previousAuthentication = SecurityContextHolder.getContext().getAuthentication();
            if (previousAuthentication == null && request.getRequestURI().startsWith("/api/v1/")) {
                SecurityContextHolder.getContext().setAuthentication(new UsernamePasswordAuthenticationToken(
                    "anonymousUser",
                    "local-development",
                    AuthorityUtils.NO_AUTHORITIES
                ));
            }

            try {
                filterChain.doFilter(request, response);
            } finally {
                if (previousAuthentication == null) {
                    SecurityContextHolder.clearContext();
                } else {
                    SecurityContextHolder.getContext().setAuthentication(previousAuthentication);
                }
            }
        }
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
