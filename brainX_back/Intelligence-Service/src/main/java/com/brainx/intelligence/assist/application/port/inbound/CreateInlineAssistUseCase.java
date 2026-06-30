package com.brainx.intelligence.assist.application.port.inbound;

import com.brainx.intelligence.assist.domain.InlineAssistAction;

public interface CreateInlineAssistUseCase {

    InlineAssistResult createInlineAssist(InlineAssistCommand command);

    record InlineAssistCommand(
        String userId,
        String noteId,
        String selectedText,
        String contextBefore,
        String contextAfter,
        InlineAssistAction action,
        String language,
        String draftPrompt,
        Integer targetLength
    ) {
        public InlineAssistCommand(
            String userId,
            String noteId,
            String selectedText,
            String contextBefore,
            String contextAfter,
            InlineAssistAction action,
            String language
        ) {
            this(userId, noteId, selectedText, contextBefore, contextAfter, action, language, null, null);
        }
    }

    record InlineAssistResult(
        String suggestionId,
        InlineAssistAction action,
        String modelId,
        String text
    ) {
    }
}
