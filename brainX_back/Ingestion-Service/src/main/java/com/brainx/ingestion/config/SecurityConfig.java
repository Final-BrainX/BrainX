package com.brainx.ingestion.config;

import com.brainx.ingestion.filter.JwtAuthenticationFilter;
import lombok.RequiredArgsConstructor;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

import java.util.List;

@Configuration
@EnableWebSecurity
@RequiredArgsConstructor
public class SecurityConfig {

    private final JwtAuthenticationFilter jwtAuthenticationFilter;

    @Bean
    public SecurityFilterChain securityFilterChain(HttpSecurity http) throws Exception {
        http
            .csrf(AbstractHttpConfigurer::disable)
            .cors(cors -> cors.configurationSource(corsConfigurationSource()))
            // 노트 안 PDF 임베드 뷰어(iframe)가 GET /api/v1/assets/{assetId}/file을 그리려면
            // 기본 X-Frame-Options: DENY를 풀어야 한다. frame-ancestors로 brainx-next 오리진만 허용.
            .headers(headers -> headers
                .frameOptions(frameOptions -> frameOptions.disable())
                .contentSecurityPolicy(csp -> csp.policyDirectives(
                    "frame-ancestors 'self' http://localhost:3000 http://localhost:5173"))
            )
            .sessionManagement(s -> s.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
            .authorizeHttpRequests(auth -> auth
                .requestMatchers("/actuator/health").permitAll()
                .requestMatchers("/v1/publish-jobs/**").permitAll()
                // TEMP: 로그인 없이 가져오기 기능 테스트용. 실제 로그인 연동 완료 후 제거할 것.
                .requestMatchers("/api/v1/imports/notion/**").permitAll()
                .requestMatchers("/api/v1/imports/obsidian/**").permitAll()
                .requestMatchers("/api/v1/imports/file/**").permitAll()
                // 임의 URL을 서버가 대신 가져오는 프록시라 나머지 자산 엔드포인트와 달리
                // 로그인한 사용자만 쓸 수 있게 한다 — permitAll 규칙보다 먼저 와야 한다.
                .requestMatchers("/api/v1/assets/proxy-image").authenticated()
                .requestMatchers("/api/v1/assets/**").permitAll()
                .requestMatchers(org.springframework.http.HttpMethod.GET, "/api/v1/imports/*").permitAll()
                .anyRequest().authenticated()
            )
            .addFilterBefore(jwtAuthenticationFilter, UsernamePasswordAuthenticationFilter.class);
        return http.build();
    }

    @Bean
    public CorsConfigurationSource corsConfigurationSource() {
        CorsConfiguration cfg = new CorsConfiguration();
        cfg.setAllowedOriginPatterns(List.of("http://localhost:3000", "http://localhost:5173"));
        cfg.setAllowedMethods(List.of("GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"));
        cfg.setAllowedHeaders(List.of("*"));
        cfg.setAllowCredentials(true);
        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/**", cfg);
        return source;
    }
}