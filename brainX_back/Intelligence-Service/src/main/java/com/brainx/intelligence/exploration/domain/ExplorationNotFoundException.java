package com.brainx.intelligence.exploration.domain;

/**
 * 요청 사용자의 경계 안에서 노트 또는 탐색 리소스를 찾을 수 없음을 표현합니다.
 */
public class ExplorationNotFoundException extends RuntimeException {

    public ExplorationNotFoundException(String message) {
        super(message);
    }
}
