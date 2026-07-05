create table if not exists ai_models (
  model_id varchar(100) primary key,
  name varchar(200) not null,
  provider varchar(100) not null,
  vendor_input_cost_per_1k_tokens numeric(12, 6),
  vendor_cached_input_cost_per_1k_tokens numeric(12, 6),
  vendor_output_cost_per_1k_tokens numeric(12, 6),
  vendor_cost_currency varchar(3) not null default 'USD'
);

create table if not exists user_ai_model_settings (
  user_id varchar(100) primary key,
  default_model_id varchar(100) not null,
  user_api_keys text not null
);

create table if not exists user_style_profiles (
  user_id varchar(100) primary key,
  style text not null,
  detected_from_notes_at timestamp(6) with time zone
);

create table if not exists event_consumption_records (
  event_id varchar(160) primary key,
  event_type varchar(120) not null,
  status varchar(30) not null,
  event_version integer,
  producer varchar(120),
  tenant_id varchar(120),
  user_id varchar(120),
  note_id varchar(120),
  correlation_id varchar(160),
  causation_id varchar(160),
  idempotency_key varchar(160),
  payload_hash varchar(64) not null,
  attempts integer not null,
  error_code varchar(80),
  error_message text,
  received_at timestamp(6) with time zone not null,
  processed_at timestamp(6) with time zone,
  failed_at timestamp(6) with time zone
);

create table if not exists intelligence_capture_projections (
  capture_id varchar(160) primary key,
  user_id varchar(120) not null,
  url varchar(1024) not null,
  title varchar(512) not null,
  note_id varchar(120),
  last_event_id varchar(160) not null,
  updated_at timestamp(6) with time zone not null
);

create table if not exists intelligence_folder_projections (
  folder_id varchar(160) primary key,
  user_id varchar(120) not null,
  name varchar(512),
  parent_folder_id varchar(160),
  folder_order integer,
  deleted boolean not null,
  child_note_action varchar(32),
  target_folder_id varchar(160),
  last_event_id varchar(160) not null,
  updated_at timestamp(6) with time zone not null
);

create table if not exists intelligence_note_link_projections (
  link_id varchar(160) primary key,
  user_id varchar(120) not null,
  source_note_id varchar(120) not null,
  target_note_id varchar(120) not null,
  link_type varchar(64),
  active boolean not null,
  last_event_id varchar(160) not null,
  updated_at timestamp(6) with time zone not null
);

create table if not exists intelligence_user_deletion_requests (
  user_id varchar(120) primary key,
  reason varchar(1024),
  deletion_scheduled_at timestamp(6) with time zone not null,
  last_event_id varchar(160) not null,
  updated_at timestamp(6) with time zone not null
);

create table if not exists intelligence_note_projections (
  projection_id varchar(240) primary key,
  user_id varchar(120) not null,
  document_group_id varchar(120) not null default 'default',
  note_id varchar(120) not null,
  title varchar(500) not null,
  folder_id varchar(120),
  tags text not null default '[]',
  note_version integer not null default 0,
  markdown_hash varchar(160),
  markdown text,
  content_pending boolean not null default false,
  archived boolean not null default false,
  trashed boolean not null default false,
  deleted boolean not null default false,
  last_event_id varchar(160),
  updated_at timestamp(6) with time zone not null default now(),
  search_index_status varchar(40),
  indexed_version integer,
  indexed_markdown_hash varchar(160),
  indexed_at timestamp(6) with time zone,
  last_index_attempt_at timestamp(6) with time zone,
  next_index_retry_at timestamp(6) with time zone,
  index_attempt_count integer not null default 0,
  last_index_error_code varchar(120),
  last_index_error_message varchar(1000)
);

create table if not exists intelligence_note_index_chunks (
  manifest_id varchar(620) primary key,
  user_id varchar(120) not null,
  document_group_id varchar(120) not null,
  note_id varchar(120) not null,
  chunk_id varchar(260) not null,
  chunk_index integer not null,
  embedding_text_hash varchar(64) not null,
  payload_hash varchar(64) not null,
  chunker_version integer not null,
  indexed_version integer,
  indexed_markdown_hash varchar(160),
  indexed_at timestamp(6) with time zone not null
);

create table if not exists exploration_note_summaries (
  summary_id varchar(240) primary key,
  user_id varchar(100) not null,
  note_id varchar(100) not null,
  summary text not null,
  source varchar(20) not null
);

create table if not exists intelligence_chat_threads (
  thread_id varchar(120) primary key,
  user_id varchar(120) not null,
  document_group_id varchar(120) not null,
  title varchar(500) not null,
  model_id varchar(120) not null,
  created_at timestamp(6) with time zone not null,
  archived_at timestamp(6) with time zone,
  deleted_at timestamp(6) with time zone
);

create table if not exists intelligence_chat_messages (
  message_id varchar(120) primary key,
  thread_id varchar(120) not null,
  user_id varchar(120) not null,
  role varchar(20) not null,
  content text not null,
  model_id varchar(120),
  note_scope text not null default '{}',
  client_context text not null default '{}',
  citations text not null default '[]',
  token_usage text,
  created_at timestamp(6) with time zone not null
);

create table if not exists intelligence_cluster_jobs (
  cluster_job_id varchar(120) primary key,
  user_id varchar(120) not null,
  document_group_id varchar(120) not null,
  status varchar(40) not null,
  scope_json text not null,
  algorithm_options_json text not null,
  clusters_json text not null,
  model_id varchar(120) not null,
  idempotency_key varchar(200),
  failure_message varchar(1000),
  created_at timestamp(6) with time zone not null,
  completed_at timestamp(6) with time zone
);

create table if not exists intelligence_insight_reports (
  report_id varchar(120) primary key,
  user_id varchar(120) not null,
  document_group_id varchar(120) not null,
  status varchar(40) not null,
  scope_json text not null,
  include_learning_recommendations boolean not null,
  summary text,
  knowledge_gaps_json text not null,
  recommendations_json text not null,
  model_id varchar(120) not null,
  idempotency_key varchar(200),
  failure_message varchar(1000),
  created_at timestamp(6) with time zone not null,
  completed_at timestamp(6) with time zone
);

create or replace function brainx_legacy_lob_to_text(value oid, fallback text)
returns text
language plpgsql
as $$
begin
  if value is null then
    return fallback;
  end if;

  return convert_from(lo_get(value), 'UTF8');
exception
  when others then
    return fallback;
end;
$$;

create or replace function brainx_repair_lob_text_column(table_name text, column_name text, fallback text)
returns void
language plpgsql
as $$
declare
  current_type text;
begin
  select columns.udt_name
    into current_type
    from information_schema.columns columns
   where columns.table_schema = 'public'
     and columns.table_name = brainx_repair_lob_text_column.table_name
     and columns.column_name = brainx_repair_lob_text_column.column_name;

  if current_type is null then
    return;
  end if;

  if current_type = 'oid' then
    execute format(
      'alter table %I alter column %I drop default',
      table_name,
      column_name
    );
    execute format(
      'alter table %I alter column %I type text using brainx_legacy_lob_to_text(%I, %L)',
      table_name,
      column_name,
      column_name,
      fallback
    );
  elsif current_type <> 'text' then
    execute format(
      'alter table %I alter column %I type text using %I::text',
      table_name,
      column_name,
      column_name
    );
  end if;
end;
$$;

select brainx_repair_lob_text_column('user_ai_model_settings', 'user_api_keys', '{}');
select brainx_repair_lob_text_column('user_style_profiles', 'style', '{}');
select brainx_repair_lob_text_column('event_consumption_records', 'error_message', null);
select brainx_repair_lob_text_column('intelligence_note_projections', 'tags', '[]');
select brainx_repair_lob_text_column('intelligence_note_projections', 'markdown', null);
select brainx_repair_lob_text_column('exploration_note_summaries', 'summary', '');
select brainx_repair_lob_text_column('intelligence_chat_messages', 'content', '');
select brainx_repair_lob_text_column('intelligence_chat_messages', 'note_scope', '{}');
select brainx_repair_lob_text_column('intelligence_chat_messages', 'client_context', '{}');
select brainx_repair_lob_text_column('intelligence_chat_messages', 'citations', '[]');
select brainx_repair_lob_text_column('intelligence_chat_messages', 'token_usage', null);
select brainx_repair_lob_text_column('intelligence_cluster_jobs', 'scope_json', '{}');
select brainx_repair_lob_text_column('intelligence_cluster_jobs', 'algorithm_options_json', '{}');
select brainx_repair_lob_text_column('intelligence_cluster_jobs', 'clusters_json', '[]');
select brainx_repair_lob_text_column('intelligence_insight_reports', 'scope_json', '{}');
select brainx_repair_lob_text_column('intelligence_insight_reports', 'summary', null);
select brainx_repair_lob_text_column('intelligence_insight_reports', 'knowledge_gaps_json', '[]');
select brainx_repair_lob_text_column('intelligence_insight_reports', 'recommendations_json', '[]');

alter table ai_models
  add column if not exists vendor_cached_input_cost_per_1k_tokens numeric(12, 6),
  add column if not exists vendor_cost_currency varchar(3);
update ai_models set vendor_cost_currency = 'USD' where vendor_cost_currency is null or trim(vendor_cost_currency::text) = '';
alter table ai_models
  alter column vendor_cost_currency set default 'USD',
  alter column vendor_cost_currency set not null;

alter table intelligence_note_projections
  add column if not exists document_group_id varchar(120),
  add column if not exists markdown text,
  add column if not exists content_pending boolean,
  add column if not exists search_index_status varchar(40),
  add column if not exists indexed_version integer,
  add column if not exists indexed_markdown_hash varchar(160),
  add column if not exists indexed_at timestamp(6) with time zone,
  add column if not exists last_index_attempt_at timestamp(6) with time zone,
  add column if not exists next_index_retry_at timestamp(6) with time zone,
  add column if not exists index_attempt_count integer,
  add column if not exists last_index_error_code varchar(120),
  add column if not exists last_index_error_message varchar(1000);
update intelligence_note_projections set document_group_id = 'default' where document_group_id is null or trim(document_group_id::text) = '';
update intelligence_note_projections set content_pending = false where content_pending is null;
update intelligence_note_projections set index_attempt_count = 0 where index_attempt_count is null;
alter table intelligence_note_projections
  alter column document_group_id set default 'default',
  alter column document_group_id set not null,
  alter column content_pending set default false,
  alter column content_pending set not null,
  alter column index_attempt_count set default 0,
  alter column index_attempt_count set not null;

alter table intelligence_chat_messages
  add column if not exists client_context text;
update intelligence_chat_messages set client_context = '{}' where client_context is null or trim(client_context::text) = '';
alter table intelligence_chat_messages
  alter column client_context set default '{}',
  alter column client_context set not null;

alter table intelligence_chat_threads
  add column if not exists archived_at timestamp(6) with time zone,
  add column if not exists deleted_at timestamp(6) with time zone;

create index if not exists idx_event_consumption_user
  on event_consumption_records (user_id);

create index if not exists idx_event_consumption_status
  on event_consumption_records (status, received_at);

create index if not exists idx_note_projection_user_group_note
  on intelligence_note_projections (user_id, document_group_id, note_id);

create index if not exists idx_note_projection_searchable
  on intelligence_note_projections (
    user_id,
    document_group_id,
    search_index_status,
    updated_at desc,
    note_id
  )
  where archived = false
    and trashed = false
    and deleted = false
    and content_pending = false
    and markdown is not null;

create index if not exists idx_note_projection_searchable_folder
  on intelligence_note_projections (
    user_id,
    document_group_id,
    folder_id,
    search_index_status,
    updated_at desc,
    note_id
  )
  where archived = false
    and trashed = false
    and deleted = false
    and content_pending = false
    and markdown is not null;

create index if not exists idx_note_projection_index_retry
  on intelligence_note_projections (next_index_retry_at, updated_at desc, note_id)
  where archived = false
    and trashed = false
    and deleted = false
    and (
      search_index_status in ('NOT_INDEXED', 'PROVISIONAL', 'STALE', 'FAILED')
      or content_pending = true
    );

create index if not exists idx_note_index_chunks_note
  on intelligence_note_index_chunks (user_id, document_group_id, note_id, chunk_index);

create index if not exists idx_exploration_note_summaries_user_note
  on exploration_note_summaries (user_id, note_id);

create index if not exists idx_chat_threads_user_thread
  on intelligence_chat_threads (user_id, thread_id);

create index if not exists idx_chat_threads_user_state_created
  on intelligence_chat_threads (user_id, deleted_at, archived_at, created_at desc, thread_id desc);

create index if not exists idx_chat_messages_user_thread_created
  on intelligence_chat_messages (user_id, thread_id, created_at, message_id);

create index if not exists idx_cluster_jobs_user_job
  on intelligence_cluster_jobs (user_id, cluster_job_id);

create index if not exists idx_cluster_jobs_user_idempotency
  on intelligence_cluster_jobs (user_id, idempotency_key)
  where idempotency_key is not null;

create index if not exists idx_insight_reports_user_report
  on intelligence_insight_reports (user_id, report_id);

create index if not exists idx_insight_reports_user_idempotency
  on intelligence_insight_reports (user_id, idempotency_key)
  where idempotency_key is not null;

drop function if exists brainx_repair_lob_text_column(text, text, text);
drop function if exists brainx_legacy_lob_to_text(oid, text);
