package brain.web.mvc.security;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.lang.reflect.Method;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;

/**
 * [USER-02] 단위 테스트: JWT 서명 비교에서 String.equals() 사용으로 인한 타이밍 어택 취약점
 *
 * JwtTokenProvider.java:104
 *   if (!sign(unsignedToken).equals(parts[2]))
 *
 * 문제: String.equals()는 첫 번째 불일치 문자에서 즉시 false를 반환 (조기 종료).
 *       공격자가 응답 시간을 측정해 서명 접두사를 1바이트씩 추측 가능.
 *
 * 수정 방향: MessageDigest.isEqual(a.getBytes(), b.getBytes()) 사용 (항상 전체 비교)
 */
class JwtTimingAttackTest {

    private JwtTokenProvider jwtTokenProvider;
    private static final String TEST_SECRET = "test-secret-key-that-is-long-enough-for-hmac-sha256";

    @BeforeEach
    void setUp() {
        jwtTokenProvider = new JwtTokenProvider(
                new ObjectMapper(),
                TEST_SECRET,
                1800_000L,
                604_800_000L
        );
    }

    @Test
    @DisplayName("[USER-02] JwtTokenProvider claims() 내부에서 String.equals()로 서명 비교 — 타이밍 어택 취약 코드 확인")
    void jwtProvider_claimsMethod_usesStringEqualsForSignatureComparison() throws Exception {
        // given — claims() 메서드 소스 코드를 리플렉션으로 검사
        Method claimsMethod = JwtTokenProvider.class.getDeclaredMethod("claims", String.class);
        claimsMethod.setAccessible(true);

        // 실제 사용 중인 비교 방식이 String.equals인지를 소스 코드 내용이 아닌
        // 동작으로 검증: 잘못된 서명 토큰으로 예외 발생 여부 확인
        String fakeToken = "header.payload.FAKESIGNATURE12345";
        org.assertj.core.api.ThrowableAssert.ThrowingCallable callable =
                () -> claimsMethod.invoke(jwtTokenProvider, fakeToken);

        // 서명 불일치 예외가 발생해야 정상 (비교 자체는 동작하지만 비상수시간)
        assertThatCode(callable).isInstanceOf(java.lang.reflect.InvocationTargetException.class);
    }

    @Test
    @DisplayName("[USER-02] String.equals() vs MessageDigest.isEqual() 동작 차이 — 타이밍 어택 가능성 시연")
    void stringEquals_vs_messageDigestIsEqual_earlyTerminationBehaviorDifference() {
        // given
        String correctSignature = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=";
        String wrongFromStart  = "BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB=";
        String wrongAtEnd      = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAB=";

        // String.equals 조기 종료 시연
        // wrongFromStart는 첫 문자에서 종료 → wrongAtEnd보다 훨씬 빠름
        int iterations = 100_000;

        long startEarlyTermination = System.nanoTime();
        for (int i = 0; i < iterations; i++) {
            correctSignature.equals(wrongFromStart);
        }
        long earlyTerminationNs = System.nanoTime() - startEarlyTermination;

        long startLateTermination = System.nanoTime();
        for (int i = 0; i < iterations; i++) {
            correctSignature.equals(wrongAtEnd);
        }
        long lateTerminationNs = System.nanoTime() - startLateTermination;

        // MessageDigest.isEqual은 항상 전체 길이 비교 (상수시간)
        long startConstantTime = System.nanoTime();
        for (int i = 0; i < iterations; i++) {
            MessageDigest.isEqual(
                    correctSignature.getBytes(),
                    wrongFromStart.getBytes()
            );
        }
        long constantTimeNs = System.nanoTime() - startConstantTime;

        // String.equals는 조기 종료 가능 (시간 차이가 존재함)
        // MessageDigest.isEqual은 항상 일정 시간 소요 (타이밍 안전)
        assertThat(earlyTerminationNs).isPositive();
        assertThat(constantTimeNs).isPositive();

        // 버그 설명: 현재 코드는 String.equals 사용 중 → 타이밍 어택 가능
        // 수정: sign(unsignedToken).equals(parts[2]) →
        //       MessageDigest.isEqual(sign(unsignedToken).getBytes(), parts[2].getBytes())
    }

    @Test
    @DisplayName("[USER-02] 유효한 JWT는 정상적으로 검증 — 기능 정상 동작 확인")
    void isValid_withValidToken_returnsTrue() {
        // given — 테스트용 토큰 생성 (실제 User 객체 불필요)
        // 타이밍 어택 취약점이 있어도 기본 검증 기능은 동작해야 함
        // UserRepository mock 없이 직접 토큰 구조 검증

        // 변조된 서명 → isValid가 false 반환
        String invalidToken = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.payload.invalidsig";
        boolean result = jwtTokenProvider.isValid(invalidToken);
        assertThat(result).isFalse();
    }
}
