package com.brainx.intelligence.infrastructure.security;

import java.io.IOException;
import java.util.List;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnWebApplication;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.env.Environment;
import org.springframework.core.env.Profiles;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.authority.AuthorityUtils;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.AnonymousAuthenticationFilter;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import org.springframework.web.filter.OncePerRequestFilter;

import com.brainx.intelligence.infrastructure.web.ApiErrorResponse;
import com.fasterxml.jackson.databind.ObjectMapper;

import jakarta.servlet.DispatcherType;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

/**
 * Public API 최소 보안 설정입니다.
 */
@Configuration
public class SecurityConfig {

    private static final String DEV_USER_ID_HEADER = "X-User-Id";

    @Bean
    JwtTokenVerifier jwtTokenVerifier(
        ObjectMapper objectMapper,
        @Value("${brainx.jwt.secret}") String jwtSecret
    ) {
        return new JwtTokenVerifier(objectMapper, jwtSecret);
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
        String serviceToken = environment.getProperty("brainx.service-token", "local-service-token");

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

    private static final class ServiceTokenAuthenticationFilter extends OncePerRequestFilter {

        private static final String SERVICE_TOKEN_HEADER = "X-Service-Token";

        private final String serviceToken;

        private ServiceTokenAuthenticationFilter(String serviceToken) {
            this.serviceToken = hasText(serviceToken) ? serviceToken : "local-service-token";
        }

        @Override
        protected void doFilterInternal(
            HttpServletRequest request,
            HttpServletResponse response,
            FilterChain filterChain
        ) throws ServletException, IOException {
            String requestedToken = request.getHeader(SERVICE_TOKEN_HEADER);
            if (hasText(requestedToken) && requestedToken.equals(serviceToken)) {
                SecurityContextHolder.getContext().setAuthentication(new UsernamePasswordAuthenticationToken(
                    "internal-service",
                    null,
                    List.of(new SimpleGrantedAuthority("ROLE_SERVICE"))
                ));
            }
            filterChain.doFilter(request, response);
        }
    }

    private static final class LocalDevelopmentAuthenticationFilter extends OncePerRequestFilter {

        private final String devUserId;

        private LocalDevelopmentAuthenticationFilter(String devUserId) {
            this.devUserId = hasText(devUserId) ? devUserId : "dev-test-user";
        }

        @Override
        protected void doFilterInternal(
            HttpServletRequest request,
            HttpServletResponse response,
            FilterChain filterChain
        ) throws ServletException, IOException {
            Authentication previousAuthentication = SecurityContextHolder.getContext().getAuthentication();
            if (previousAuthentication == null && request.getRequestURI().startsWith("/api/v1/")) {
                SecurityContextHolder.getContext().setAuthentication(new UsernamePasswordAuthenticationToken(
                    userId(request),
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

        private String userId(HttpServletRequest request) {
            String userId = request.getHeader(DEV_USER_ID_HEADER);
            return hasText(userId) ? userId : devUserId;
        }
    }

    private static boolean hasText(String value) {
        return value != null && !value.isBlank();
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
