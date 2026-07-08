package com.brainx.intelligence.chat.application.port.inbound;

public interface RecordChatDraftNoteUseCase {

    ChatDraftNoteResult recordChatDraftNote(RecordChatDraftNoteCommand command);

    record RecordChatDraftNoteCommand(
        String userId,
        String threadId,
        String messageId,
        String noteId
    ) {
    }

    record ChatDraftNoteResult(
        String threadId,
        String messageId,
        String noteId
    ) {
    }
}
