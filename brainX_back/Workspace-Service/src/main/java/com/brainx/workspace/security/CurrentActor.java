package com.brainx.workspace.security;

import com.brainx.workspace.exception.WorkspaceException;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;

@Component
public class CurrentActor {
    public static final String USER_ID_HEADER = "X-User-Id";
    public static final String GUEST_ID_HEADER = "X-Guest-Id";

    private static final String DEV_TEST_USER_ID = "dev-test-user";

    private final HttpServletRequest request;

    @Value("${brainx.workspace.dev-fallback-enabled:false}")
    private boolean devFallbackEnabled;

    public CurrentActor(HttpServletRequest request) {
        this.request = request;
    }

    public Actor actor() {
        String userId = request.getHeader(USER_ID_HEADER);
        if (hasText(userId)) {
            return new Actor(ActorType.USER, userId);
        }

        // JWT 인증을 X-Guest-Id보다 먼저 확인한다 — guest draft claim(POST
        // /api/v1/notes/drafts/claim)은 "지금 로그인한 회원"과 "승계할 guest"를 동시에 식별해야
        // 해서 Authorization Bearer JWT와 X-Guest-Id를 한 요청에 같이 실어 보낸다. 이 순서가
        // 바뀌면(X-Guest-Id를 먼저 보면) 로그인 사용자의 claim 요청이 GUEST actor로 잘못
        // 판정되어 memberUserId()가 403을 던진다 — 다른 엔드포인트는 두 헤더를 동시에 보내지
        // 않으므로 이 순서 변경이 기존 동작에 영향을 주지 않는다.
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        if (authentication != null && authentication.getPrincipal() instanceof AuthenticatedUser user) {
            return new Actor(ActorType.USER, user.userId());
        }

        String guestId = request.getHeader(GUEST_ID_HEADER);
        if (hasText(guestId)) {
            return new Actor(ActorType.GUEST, guestId);
        }

        // brainx.workspace.dev-fallback-enabled는 기본 false다 — 로컬 개발에서 Gateway를 거치지
        // 않고 Workspace-Service(8082)를 직접 호출할 때만 명시적으로 켜서 쓴다. 운영에서는 절대
        // 켜면 안 된다: X-User-Id/X-Guest-Id/JWT가 전부 없으면 식별 실패로 처리해야 한다.
        if (devFallbackEnabled) {
            return new Actor(ActorType.USER, DEV_TEST_USER_ID);
        }

        throw new WorkspaceException(HttpStatus.UNAUTHORIZED, "ACTOR_IDENTIFICATION_FAILED",
                "X-User-Id, X-Guest-Id, or a valid Authorization token is required.");
    }

    private boolean hasText(String value) {
        return value != null && !value.isBlank();
    }

    public enum ActorType {
        USER,
        GUEST
    }

    public record Actor(ActorType type, String id) {
    }
}
