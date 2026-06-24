package com.brainx.workspace.security;

import jakarta.servlet.http.HttpServletRequest;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;

@Component
public class CurrentActor {
    public static final String USER_ID_HEADER = "X-User-Id";
    public static final String GUEST_ID_HEADER = "X-Guest-Id";

    private static final String DEV_TEST_USER_ID = "dev-test-user";

    private final HttpServletRequest request;

    public CurrentActor(HttpServletRequest request) {
        this.request = request;
    }

    public Actor actor() {
        String userId = request.getHeader(USER_ID_HEADER);
        if (hasText(userId)) {
            return new Actor(ActorType.USER, userId);
        }

        String guestId = request.getHeader(GUEST_ID_HEADER);
        if (hasText(guestId)) {
            return new Actor(ActorType.GUEST, guestId);
        }

        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        if (authentication != null && authentication.getPrincipal() instanceof AuthenticatedUser user) {
            return new Actor(ActorType.USER, user.userId());
        }

        // TEMP: direct Workspace-Service dev calls still fall back until the frontend fully routes through Gateway.
        return new Actor(ActorType.USER, DEV_TEST_USER_ID);
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
