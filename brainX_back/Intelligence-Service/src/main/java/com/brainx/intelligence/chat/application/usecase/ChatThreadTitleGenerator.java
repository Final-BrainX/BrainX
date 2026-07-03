package com.brainx.intelligence.chat.application.usecase;

import java.util.List;

import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import com.brainx.intelligence.shared.application.port.outbound.AiChatPort;
import com.brainx.intelligence.shared.application.port.outbound.AiChatPort.AiChatMessage;
import com.brainx.intelligence.shared.application.port.outbound.AiChatPort.AiChatRequest;
import com.brainx.intelligence.shared.application.port.outbound.AiChatPort.AiRole;
import com.brainx.intelligence.shared.application.port.outbound.EntitlementPort;
import com.brainx.intelligence.shared.application.port.outbound.EntitlementPort.EntitlementRequest;
import com.brainx.intelligence.shared.application.service.AiUsageRecorder;

@Service
public class ChatThreadTitleGenerator {

    static final String CHAT_THREAD_TITLE_FEATURE_ID = "chat-thread-title";
    private static final String RAG_CHAT_CAPABILITY = "RAG_CHAT";

    private final ChatTitleProperties properties;
    private final EntitlementPort entitlementPort;
    private final AiChatPort aiChatPort;
    private final AiUsageRecorder aiUsageRecorder;

    public ChatThreadTitleGenerator(
        ChatTitleProperties properties,
        EntitlementPort entitlementPort,
        AiChatPort aiChatPort,
        AiUsageRecorder aiUsageRecorder
    ) {
        this.properties = properties;
        this.entitlementPort = entitlementPort;
        this.aiChatPort = aiChatPort;
        this.aiUsageRecorder = aiUsageRecorder;
    }

    public String titleFor(String userId, String initialMessage, String fallbackTitle) {
        int maxLength = properties.getMaxLength();
        String fallback = fallbackTitle(fallbackTitle, initialMessage, maxLength);
        if (!properties.isEnabled() || !StringUtils.hasText(initialMessage)) {
            return fallback;
        }

        String modelId = properties.getModel();
        String userPrompt = userPrompt(initialMessage, maxLength);
        try {
            var entitlement = entitlementPort.checkEntitlement(new EntitlementRequest(
                userId,
                RAG_CHAT_CAPABILITY,
                estimateTokens(systemPrompt() + "\n" + userPrompt)
            ));
            if (!entitlement.allowed()) {
                return fallback;
            }

            var response = aiChatPort.generate(new AiChatRequest(
                modelId,
                List.of(
                    new AiChatMessage(AiRole.SYSTEM, systemPrompt()),
                    new AiChatMessage(AiRole.USER, userPrompt)
                )
            ));
            aiUsageRecorder.recordChatUsage(
                userId,
                CHAT_THREAD_TITLE_FEATURE_ID,
                modelId,
                null,
                response.tokenUsage()
            );
            String generated = sanitizeTitle(response.content(), maxLength);
            return StringUtils.hasText(generated) ? generated : fallback;
        } catch (RuntimeException exception) {
            return fallback;
        }
    }

    private static String systemPrompt() {
        return """
            You generate concise BrainX chat thread titles.
            Return only one Korean title. Do not explain.
            """;
    }

    private static String userPrompt(String initialMessage, int maxLength) {
        return """
            첫 사용자 메시지:
            %s

            제목 규칙:
            - 한국어 주제 명사구
            - 2-6어절
            - 최대 %d자
            - 따옴표, 마침표, 이모지, 번호, 접두사 금지
            - 제목만 출력
            """.formatted(normalizeWhitespace(initialMessage), maxLength);
    }

    private static String fallbackTitle(String fallbackTitle, String initialMessage, int maxLength) {
        String source = StringUtils.hasText(fallbackTitle) ? fallbackTitle : initialMessage;
        String normalized = sanitizeTitle(source, maxLength);
        return StringUtils.hasText(normalized) ? normalized : "새 대화";
    }

    private static String sanitizeTitle(String value, int maxLength) {
        if (!StringUtils.hasText(value)) {
            return "";
        }
        String title = normalizeWhitespace(value)
            .replaceFirst("^[#>*\\-\\d.\\s]+", "")
            .replaceFirst("(?i)^title\\s*[:：]\\s*", "")
            .replaceFirst("^제목\\s*[:：]\\s*", "")
            .trim();
        title = stripWrappingQuotes(title)
            .replaceAll("[.。!?！？]+$", "")
            .trim();
        if (title.length() > maxLength) {
            title = title.substring(0, maxLength).trim();
        }
        return title;
    }

    private static String stripWrappingQuotes(String value) {
        String title = value;
        boolean changed = true;
        while (changed && title.length() >= 2) {
            changed = false;
            if (isQuote(title.charAt(0)) && isQuote(title.charAt(title.length() - 1))) {
                title = title.substring(1, title.length() - 1).trim();
                changed = true;
            }
        }
        return title;
    }

    private static boolean isQuote(char value) {
        return value == '"'
            || value == '\''
            || value == '`'
            || value == '“'
            || value == '”'
            || value == '‘'
            || value == '’'
            || value == '「'
            || value == '」'
            || value == '『'
            || value == '』';
    }

    private static String normalizeWhitespace(String value) {
        return value.replace('\r', ' ')
            .replace('\n', ' ')
            .replaceAll("\\s+", " ")
            .trim();
    }

    private static int estimateTokens(String text) {
        if (!StringUtils.hasText(text)) {
            return 1;
        }
        return Math.max(1, text.length() / 4);
    }
}
