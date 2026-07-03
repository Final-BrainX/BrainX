package com.brainx.intelligence.chat.domain;

public class ChatConflictException extends RuntimeException {

    public ChatConflictException(String message) {
        super(message);
    }
}
