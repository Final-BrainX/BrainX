package com.brainx.intelligence.infrastructure.security;

import java.io.IOException;
import java.util.List;
import java.util.regex.Pattern;

import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.filter.OncePerRequestFilter;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

public class JwtAuthenticationFilter extends OncePerRequestFilter {

    private static final String BEARER_PREFIX = "Bearer ";
    private static final String GUEST_ID_HEADER = "X-Guest-Id";
    private static final Pattern GUEST_ID_PATTERN = Pattern.compile("gst_[A-Za-z0-9_-]{16,80}");

    private final JwtTokenVerifier jwtTokenVerifier;

    public JwtAuthenticationFilter(JwtTokenVerifier jwtTokenVerifier) {
        this.jwtTokenVerifier = jwtTokenVerifier;
    }

    @Override
    protected void doFilterInternal(
        HttpServletRequest request,
        HttpServletResponse response,
        FilterChain filterChain
    ) throws ServletException, IOException {
        String authorization = request.getHeader("Authorization");
        if (authorization != null && authorization.startsWith(BEARER_PREFIX)) {
            boolean authenticated = authenticate(authorization.substring(BEARER_PREFIX.length()));
            if (!authenticated) {
                authenticateGuest(request.getHeader(GUEST_ID_HEADER));
            }
        } else {
            // Gateway가 로그인 요청에서는 X-Guest-Id를 세팅하지 않고, 게스트 요청에서는
            // 클라이언트가 보낸 값을 지우고 자신이 발급한 gst_ 접두 id로 다시 세팅한다 —
            // 즉 이 헤더는 Gateway를 거친 요청에서만 신뢰할 수 있다(Workspace-Service의
            // CurrentActor와 동일한 신뢰 모델).
            authenticateGuest(request.getHeader(GUEST_ID_HEADER));
        }
        filterChain.doFilter(request, response);
    }

    private boolean authenticate(String token) {
        try {
            JwtTokenVerifier.JwtClaims claims = jwtTokenVerifier.verifyAccessToken(token.trim());
            UsernamePasswordAuthenticationToken authentication = new UsernamePasswordAuthenticationToken(
                claims.userId(),
                null,
                List.of(new SimpleGrantedAuthority("ROLE_USER"))
            );
            SecurityContextHolder.getContext().setAuthentication(authentication);
            return true;
        } catch (IllegalArgumentException exception) {
            SecurityContextHolder.clearContext();
            return false;
        }
    }

    private void authenticateGuest(String guestId) {
        if (guestId == null || guestId.isBlank()) {
            return;
        }
        String normalizedGuestId = guestId.trim();
        if (!GUEST_ID_PATTERN.matcher(normalizedGuestId).matches()) {
            return;
        }
        UsernamePasswordAuthenticationToken authentication = new UsernamePasswordAuthenticationToken(
            normalizedGuestId,
            null,
            List.of(new SimpleGrantedAuthority("ROLE_GUEST"))
        );
        SecurityContextHolder.getContext().setAuthentication(authentication);
    }
}
