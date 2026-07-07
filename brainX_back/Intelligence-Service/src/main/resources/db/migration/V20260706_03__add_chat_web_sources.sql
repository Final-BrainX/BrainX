alter table intelligence_chat_messages
  add column if not exists web_sources text not null default '[]';
