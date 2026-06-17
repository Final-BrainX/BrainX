package com.brainx.workspace.security;

import com.brainx.workspace.exception.WorkspaceException;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;

@Component
public class CurrentUser {
    public String userId() {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        if (authentication != null && authentication.getPrincipal() instanceof AuthenticatedUser user) {
            return user.userId();
        }
        throw new WorkspaceException(HttpStatus.UNAUTHORIZED, "AUTHENTICATION_REQUIRED", "Authentication required.");
    }
}
