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

    @org.springframework.beans.factory.annotation.Value("${FRONTEND_BASE_URL:http://localhost:3000}")
    private String frontendBaseUrl;

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
                .requestMatchers("/actuator/health", "/actuator/prometheus").permitAll()
                .requestMatchers("/v1/publish-jobs/**").permitAll()
                // TEMP: 로그인 없이 가져오기 기능 테스트용. 실제 로그인 연동 완료 후 제거할 것.
                .requestMatchers("/api/v1/imports/notion/**").permitAll()
                .requestMatchers("/api/v1/imports/obsidian/**").permitAll()
                .requestMatchers("/api/v1/imports/file/**").permitAll()
                // proxy-image는 SSRF 방지를 AssetController에서 직접 수행(https 전용, 사설 IP 차단,
                // image/* 응답만 허용, 15MB 제한)하므로 여기서 인증을 요구하지 않는다.
                // 인증 없이 임의 URL을 가져오는 게 위험해 보이지만, 저 4가지 제약이 실질적 SSRF를
                // 막아주고 노트 PDF 내보내기 시 Notion S3 이미지를 프록시해야 해서 허용한다.
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
        cfg.setAllowedOriginPatterns(List.of("http://localhost:3000", "http://localhost:5173", frontendBaseUrl));
        cfg.setAllowedMethods(List.of("GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"));
        cfg.setAllowedHeaders(List.of("*"));
        cfg.setAllowCredentials(true);
        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/**", cfg);
        return source;
    }
}
