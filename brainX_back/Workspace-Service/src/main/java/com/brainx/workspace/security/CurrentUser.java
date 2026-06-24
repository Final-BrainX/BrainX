package com.brainx.workspace.security;

import org.springframework.stereotype.Component;

@Component
public class CurrentUser {
    private final CurrentActor currentActor;

    public CurrentUser(CurrentActor currentActor) {
        this.currentActor = currentActor;
    }

    public String userId() {
        return currentActor.actor().id();
    }

    public CurrentActor.Actor actor() {
        return currentActor.actor();
    }
}
