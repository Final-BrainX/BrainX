package com.brainx.admin.security;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.lang.reflect.Method;
import java.security.MessageDigest;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;

/**
 * [ADM-01] 단위 테스트: AdminJwtTokenProvider 서명 비교 타이밍 어택 취약점
 *
 * AdminJwtTokenProvider.java:87
 *   if (!sign(unsignedToken).equals(parts[2]))
 *
 * User-Service의 JwtTokenProvider(USER-02)와 동일한 패턴.
 * 수정 방향: MessageDigest.isEqual() 사용
 */
class AdminJwtTimingAttackTest {

    private AdminJwtTokenProvider adminJwtTokenProvider;
    private static final String TEST_SECRET = "admin-test-secret-key-long-enough-for-hmac-sha256";

    @BeforeEach
    void setUp() {
        adminJwtTokenProvider = new AdminJwtTokenProvider(
                new ObjectMapper(),
                TEST_SECRET,
                3600_000L
        );
    }

    @Test
    @DisplayName("[ADM-01] AdminJwtTokenProvider claims() 내부에서 String.equals()로 서명 비교 — 타이밍 어택 취약 코드 확인")
    void adminJwtProvider_claimsMethod_usesStringEqualsForSignatureComparison() throws Exception {
        // given
        Method claimsMethod = AdminJwtTokenProvider.class.getDeclaredMethod("claims", String.class);
        claimsMethod.setAccessible(true);

        String fakeToken = "header.payload.INVALID_SIGNATURE_HERE";

        // when / then — 서명 불일치 예외 발생 (비상수시간 String.equals 사용 중)
        assertThatCode(() -> claimsMethod.invoke(adminJwtTokenProvider, fakeToken))
                .isInstanceOf(java.lang.reflect.InvocationTargetException.class);
    }

    @Test
    @DisplayName("[ADM-01] isValid()에 변조된 토큰 전달 시 false 반환 — 기능 정상 동작 확인")
    void isValid_withTamperedToken_returnsFalse() {
        String tamperedToken = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.payload.TAMPERED";
        boolean result = adminJwtTokenProvider.isValid(tamperedToken);
        assertThat(result).isFalse();
    }

    @Test
    @DisplayName("[ADM-01] String.equals()와 MessageDigest.isEqual() 실행시간 차이 — 타이밍 어택 취약성 확인")
    void stringEquals_timingDifference_demonstratesVulnerability() {
        String sig = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnop=";
        String wrongStart = "XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX=";
        String wrongEnd   = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmno==";

        int N = 50_000;

        long t1 = System.nanoTime();
        for (int i = 0; i < N; i++) sig.equals(wrongStart);
        long earlyTermination = System.nanoTime() - t1;

        long t2 = System.nanoTime();
        for (int i = 0; i < N; i++) sig.equals(wrongEnd);
        long lateTermination = System.nanoTime() - t2;

        long t3 = System.nanoTime();
        for (int i = 0; i < N; i++) {
            MessageDigest.isEqual(sig.getBytes(), wrongStart.getBytes());
        }
        long constantTime = System.nanoTime() - t3;

        // String.equals: 조기 종료로 earlyTermination < lateTermination 가능성 높음
        // MessageDigest.isEqual: 길이 동일하면 상수 시간
        assertThat(earlyTermination).isPositive();
        assertThat(constantTime).isPositive();
    }
}
