alter table intelligence_chat_messages
    add column if not exists route varchar(40);

alter table intelligence_chat_messages
    add column if not exists saved_draft_note_id varchar(120);
