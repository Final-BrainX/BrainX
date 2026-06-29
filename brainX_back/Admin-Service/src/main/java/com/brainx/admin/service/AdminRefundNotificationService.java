package com.brainx.admin.service;

import jakarta.mail.internet.MimeMessage;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.mail.javamail.MimeMessageHelper;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.math.BigDecimal;
import java.text.NumberFormat;
import java.time.OffsetDateTime;
import java.util.Locale;
import java.util.logging.Logger;

@Service
public class AdminRefundNotificationService {
    private static final Logger LOGGER = Logger.getLogger(AdminRefundNotificationService.class.getName());

    private final JavaMailSender javaMailSender;

    public AdminRefundNotificationService(JavaMailSender javaMailSender) {
        this.javaMailSender = javaMailSender;
    }

    @Value("${spring.mail.username:}")
    private String mailUsername;

    @Value("${brainx.email.from:}")
    private String mailFrom;

    public void sendRefundCompletedMail(
            String email,
            String userName,
            String paymentId,
            String planId,
            BigDecimal amount,
            String method,
            String reason,
            OffsetDateTime refundedAt
    ) {
        if (!StringUtils.hasText(email)) {
            return;
        }
        if (!StringUtils.hasText(mailUsername)) {
            LOGGER.info(() -> "Mail username is empty. Refund notification skipped for paymentId=" + paymentId + ", email=" + email);
            return;
        }

        try {
            MimeMessage message = javaMailSender.createMimeMessage();
            MimeMessageHelper helper = new MimeMessageHelper(message, true, "UTF-8");
            helper.setTo(email);
            if (StringUtils.hasText(mailFrom)) {
                helper.setFrom(mailFrom);
            }
            helper.setSubject("[BrainX] 결제 환불이 완료되었습니다");
            helper.setText(mailContent(userName, paymentId, planId, amount, method, reason, refundedAt), true);
            javaMailSender.send(message);
        } catch (Exception exception) {
            LOGGER.warning("Refund notification mail failed: paymentId=" + paymentId + ", email=" + email + ", error=" + exception.getMessage());
        }
    }

    private String mailContent(
            String userName,
            String paymentId,
            String planId,
            BigDecimal amount,
            String method,
            String reason,
            OffsetDateTime refundedAt
    ) {
        String displayName = StringUtils.hasText(userName) ? userName : "고객";
        String displayReason = StringUtils.hasText(reason) ? reason : "관리자 요청 환불";
        String displayMethod = StringUtils.hasText(method) ? method : "기타";
        String displayAmount = NumberFormat.getNumberInstance(Locale.KOREA).format(amount);
        return """
                <html>
                  <body style="font-family: Arial, sans-serif; line-height: 1.7; color: #111827;">
                    <h2>BrainX 결제 환불 안내</h2>
                    <p>%s님, 요청하신 결제 환불이 정상적으로 완료되었습니다.</p>
                    <table style="border-collapse: collapse; margin-top: 16px;">
                      <tr><td style="padding: 6px 12px 6px 0; color: #6b7280;">거래 ID</td><td>%s</td></tr>
                      <tr><td style="padding: 6px 12px 6px 0; color: #6b7280;">플랜</td><td>%s</td></tr>
                      <tr><td style="padding: 6px 12px 6px 0; color: #6b7280;">환불 금액</td><td>₩%s</td></tr>
                      <tr><td style="padding: 6px 12px 6px 0; color: #6b7280;">결제 수단</td><td>%s</td></tr>
                      <tr><td style="padding: 6px 12px 6px 0; color: #6b7280;">환불 사유</td><td>%s</td></tr>
                      <tr><td style="padding: 6px 12px 6px 0; color: #6b7280;">환불 시각</td><td>%s</td></tr>
                    </table>
                    <p style="margin-top: 18px; color: #6b7280;">문의가 필요하시면 BrainX 고객지원으로 연락해 주세요.</p>
                  </body>
                </html>
                """.formatted(
                displayName,
                paymentId,
                planId,
                displayAmount,
                displayMethod,
                displayReason,
                refundedAt
        );
    }
}
