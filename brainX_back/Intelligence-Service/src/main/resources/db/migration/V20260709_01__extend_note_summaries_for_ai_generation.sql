alter table exploration_note_summaries
  add column if not exists document_group_id varchar(120);

alter table exploration_note_summaries
  add column if not exists markdown_hash varchar(160);

alter table exploration_note_summaries
  add column if not exists generated_at timestamp(6) with time zone;

alter table exploration_note_summaries
  add column if not exists model_id varchar(120);

create index if not exists idx_exploration_note_summaries_user_group_note
  on exploration_note_summaries (user_id, document_group_id, note_id);

create index if not exists idx_exploration_note_summaries_user_group_note_hash
  on exploration_note_summaries (user_id, document_group_id, note_id, markdown_hash);
