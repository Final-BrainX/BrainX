package com.brainx.intelligence.exploration.domain;

/**
 * 지식 탐색 도메인 규칙 위반을 표현하는 예외입니다.
 */
public class ExplorationDomainException extends RuntimeException {

    public ExplorationDomainException(String message) {
        super(message);
    }
}
