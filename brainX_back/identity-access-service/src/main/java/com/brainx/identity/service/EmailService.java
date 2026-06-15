package com.brainx.identity.service;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;

@Slf4j
@Service
@RequiredArgsConstructor
public class EmailService {

    private final JavaMailSender mailSender;

    @Async
    public void sendVerificationCode(String to, String code) {
        try {
            SimpleMailMessage message = new SimpleMailMessage();
            message.setTo(to);
            message.setSubject("[BrainX] 이메일 인증 코드");
            message.setText(String.format(
                    "BrainX 이메일 인증 코드입니다.\n\n인증 코드: %s\n\n이 코드는 10분 후 만료됩니다.\n\nBrainX 팀 드림", code));
            mailSender.send(message);
            log.info("인증 이메일 발송 완료: {}", to);
        } catch (Exception e) {
            log.error("이메일 발송 실패: to={}, error={}", to, e.getMessage());
        }
    }
}
