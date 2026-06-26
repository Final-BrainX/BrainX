package com.brainx.admin.security;

import org.springframework.stereotype.Component;

import java.security.SecureRandom;

/** 신규 관리자 계정에 발급하는 임시 비밀번호 생성기. 4종 문자군을 모두 포함하는 16자리를 만든다. */
@Component
public class StrongPasswordGenerator {
    private static final String UPPER = "ABCDEFGHJKLMNPQRSTUVWXYZ";
    private static final String LOWER = "abcdefghijkmnopqrstuvwxyz";
    private static final String DIGITS = "23456789";
    private static final String SYMBOLS = "!@#$%^&*";
    private static final String ALL = UPPER + LOWER + DIGITS + SYMBOLS;
    private static final int LENGTH = 16;

    private final SecureRandom random = new SecureRandom();

    public String generate() {
        char[] password = new char[LENGTH];
        password[0] = randomChar(UPPER);
        password[1] = randomChar(LOWER);
        password[2] = randomChar(DIGITS);
        password[3] = randomChar(SYMBOLS);
        for (int i = 4; i < LENGTH; i++) {
            password[i] = randomChar(ALL);
        }
        for (int i = password.length - 1; i > 0; i--) {
            int swapIndex = random.nextInt(i + 1);
            char temp = password[i];
            password[i] = password[swapIndex];
            password[swapIndex] = temp;
        }
        return new String(password);
    }

    private char randomChar(String pool) {
        return pool.charAt(random.nextInt(pool.length()));
    }
}
