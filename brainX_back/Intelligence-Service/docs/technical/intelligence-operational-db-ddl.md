# Intelligence-Service 운영 DB DDL 기준

이 문서는 `Intelligence-Service` 운영 PostgreSQL schema의 기준서다. 기본 profile에서는 Flyway가 `src/main/resources/db/migration`의 migration을 적용하고, Hibernate는 `spring.jpa.hibernate.ddl-auto=validate`로 schema/entity 불일치만 검증한다. 아래 DDL은 migration 작성 기준과 장애 시 수동 점검/복구용 reference로 유지한다.

기준 시점: 2026-07-10

## 적용 원칙

- 이 문서는 public OpenAPI/AsyncAPI 계약이나 런타임 설정을 바꾸지 않는다.
- baseline DDL은 현재 `src/main/java/com/brainx/intelligence/infrastructure/persistence/jpa`의 JPA entity를 기준으로 한다.
- `@Lob` 또는 JSON converter 필드는 운영 PostgreSQL에서 다루기 쉬운 `text`로 둔다. 환경별 Hibernate validation 결과가 다르면 운영 DB에 적용하기 전에 staging에서 `ddl-auto=validate`로 확인한다.
- 기존 운영 DB에 Hibernate legacy `oid` LOB 컬럼이 남아 있으면 migration에서 `lo_get(oid)`로 UTF-8 text를 복구하고, 복구 실패 시 nullable/text JSON 기본값으로 보정한 뒤 `text` 컬럼으로 고정한다.
- `Instant` 필드는 PostgreSQL `timestamp(6) with time zone`으로 둔다.
- Qdrant vector collection schema는 `brainx.vector.qdrant.*` 설정과 vector store 초기화가 담당하므로 이 RDB DDL에 포함하지 않는다.

## 테이블 목록

| 영역 | 테이블 |
| --- | --- |
| settings/model | `ai_models`, `user_ai_model_settings`, `user_style_profiles` |
| consumed event/projection | `event_consumption_records`, `intelligence_capture_projections`, `intelligence_folder_projections`, `intelligence_note_link_projections`, `intelligence_user_deletion_requests` |
| note/RAG index | `intelligence_note_projections`, `intelligence_note_index_chunks`, `exploration_note_summaries` |
| chat | `intelligence_chat_threads`, `intelligence_chat_messages` |
| agent | `intelligence_agent_threads`, `intelligence_agent_messages`, `intelligence_agent_actions` |
| clustering/insight | `intelligence_cluster_jobs`, `intelligence_insight_reports` |
| llmops | `intelligence_llm_runs`, `intelligence_llm_feedback`, `intelligence_prompt_definitions`, `intelligence_prompt_versions`, `intelligence_eval_sets`, `intelligence_eval_scenarios`, `intelligence_eval_runs`, `intelligence_eval_results` |

## Baseline DDL

```sql
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

-- user_style_profiles.style JSON shape:
-- {"conversationTone": {...}, "writingStyle": {...}}
-- Legacy assistanceStyle keys are removed by Flyway migration.

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
  document_group_id varchar(120) not null,
  note_id varchar(120) not null,
  title varchar(500) not null,
  folder_id varchar(120),
  tags text not null,
  note_version integer not null,
  markdown_hash varchar(160),
  markdown text,
  content_pending boolean not null,
  archived boolean not null,
  trashed boolean not null,
  deleted boolean not null,
  last_event_id varchar(160),
  updated_at timestamp(6) with time zone not null,
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
  document_group_id varchar(120),
  note_id varchar(100) not null,
  summary text not null,
  source varchar(20) not null,
  markdown_hash varchar(160),
  generated_at timestamp(6) with time zone,
  model_id varchar(120)
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
  llm_run_id varchar(120),
  route varchar(40),
  saved_draft_note_id varchar(120),
  note_scope text not null,
  client_context text not null,
  citations text not null,
  web_sources text not null default '[]',
  token_usage text,
  created_at timestamp(6) with time zone not null
);

create table if not exists intelligence_agent_threads (
  thread_id varchar(120) primary key,
  user_id varchar(120) not null,
  document_group_id varchar(120) not null,
  title varchar(500) not null,
  model_id varchar(120) not null,
  created_at timestamp(6) with time zone not null
);

create table if not exists intelligence_agent_messages (
  message_id varchar(120) primary key,
  thread_id varchar(120) not null,
  user_id varchar(120) not null,
  role varchar(20) not null,
  content text not null,
  model_id varchar(120),
  llm_run_id varchar(120),
  client_context text not null default '{}',
  created_at timestamp(6) with time zone not null,
  constraint fk_agent_messages_thread
    foreign key (thread_id) references intelligence_agent_threads(thread_id)
    on delete cascade
);

create table if not exists intelligence_agent_actions (
  action_id varchar(120) primary key,
  user_id varchar(120) not null,
  thread_id varchar(120) not null,
  message_id varchar(120) not null,
  action_type varchar(40) not null,
  status varchar(40) not null,
  title varchar(500) not null,
  summary varchar(1000) not null,
  preview_markdown text not null,
  document_group_id varchar(120) not null,
  target_json text not null default '{}',
  payload_json text not null default '{}',
  result_json text,
  error_json text,
  created_at timestamp(6) with time zone not null,
  decided_at timestamp(6) with time zone,
  executed_at timestamp(6) with time zone,
  constraint fk_agent_actions_thread
    foreign key (thread_id) references intelligence_agent_threads(thread_id)
    on delete cascade,
  constraint fk_agent_actions_message
    foreign key (message_id) references intelligence_agent_messages(message_id)
    on delete cascade
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
  llm_run_id varchar(120),
  idempotency_key varchar(200),
  failure_message varchar(1000),
  created_at timestamp(6) with time zone not null,
  completed_at timestamp(6) with time zone,
  constraint uk_cluster_jobs_user_idempotency unique (user_id, idempotency_key)
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
  llm_run_id varchar(120),
  idempotency_key varchar(200),
  failure_message varchar(1000),
  created_at timestamp(6) with time zone not null,
  completed_at timestamp(6) with time zone,
  constraint uk_insight_reports_user_idempotency unique (user_id, idempotency_key)
);

create table if not exists intelligence_llm_runs (
  llm_run_id varchar(120) primary key,
  user_id varchar(120),
  feature_id varchar(120),
  target_type varchar(80),
  target_id varchar(160),
  prompt_key varchar(160),
  prompt_version varchar(40),
  model_id varchar(120),
  provider varchar(80),
  status varchar(40) not null,
  latency_ms bigint,
  input_tokens integer,
  cached_input_tokens integer,
  billable_input_tokens integer,
  output_tokens integer,
  reasoning_tokens integer,
  total_tokens integer,
  estimated_input_cost numeric(18, 8),
  estimated_cached_input_cost numeric(18, 8),
  estimated_output_cost numeric(18, 8),
  estimated_cost numeric(18, 8),
  cost_currency varchar(3),
  input_preview_json text not null default '{}',
  output_preview_json text not null default '{}',
  metadata_json text not null default '{}',
  error_code varchar(120),
  error_message varchar(1000),
  started_at timestamp(6) with time zone not null,
  completed_at timestamp(6) with time zone
);

create table if not exists intelligence_llm_feedback (
  feedback_id varchar(120) primary key,
  user_id varchar(120) not null,
  llm_run_id varchar(120) not null,
  rating varchar(20) not null,
  reason_code varchar(80),
  comment varchar(1000),
  created_at timestamp(6) with time zone not null,
  updated_at timestamp(6) with time zone not null,
  constraint uk_llm_feedback_user_run unique (user_id, llm_run_id)
);

create table if not exists intelligence_prompt_definitions (
  prompt_key varchar(160) primary key,
  feature_id varchar(120),
  description varchar(1000),
  variable_schema_json text not null default '{}',
  created_at timestamp(6) with time zone not null,
  updated_at timestamp(6) with time zone not null
);

create table if not exists intelligence_prompt_versions (
  prompt_version_id varchar(220) primary key,
  prompt_key varchar(160) not null,
  version integer not null,
  status varchar(40) not null,
  template text not null,
  variable_schema_json text not null default '{}',
  created_at timestamp(6) with time zone not null,
  activated_at timestamp(6) with time zone,
  constraint uk_prompt_versions_key_version unique (prompt_key, version)
);

create table if not exists intelligence_eval_sets (
  eval_set_id varchar(120) primary key,
  name varchar(240) not null,
  description varchar(1000),
  created_at timestamp(6) with time zone not null
);

create table if not exists intelligence_eval_scenarios (
  scenario_id varchar(120) primary key,
  eval_set_id varchar(120) not null,
  scenario_type varchar(60) not null,
  name varchar(240) not null,
  input_json text not null default '{}',
  validation_json text not null default '{}',
  created_at timestamp(6) with time zone not null
);

create table if not exists intelligence_eval_runs (
  eval_run_id varchar(120) primary key,
  eval_set_id varchar(120) not null,
  status varchar(40) not null,
  model_id varchar(120),
  scenario_count integer not null,
  passed_count integer not null,
  failed_count integer not null,
  failure_type varchar(40),
  failure_message varchar(1000),
  created_at timestamp(6) with time zone not null,
  completed_at timestamp(6) with time zone
);

create table if not exists intelligence_eval_results (
  result_id varchar(120) primary key,
  eval_run_id varchar(120) not null,
  scenario_id varchar(120) not null,
  status varchar(40) not null,
  output_json text not null default '{}',
  failure_type varchar(40),
  failure_message varchar(1000),
  llm_run_id varchar(120),
  latency_ms bigint,
  created_at timestamp(6) with time zone not null
);
```

## 인덱스 권장안

아래 인덱스는 현재 repository lookup과 pageable query를 기준으로 한다. primary key만으로 충분한 단일 ID 조회는 제외했다.

```sql
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

create index if not exists idx_exploration_note_summaries_user_group_note
  on exploration_note_summaries (user_id, document_group_id, note_id);

create index if not exists idx_exploration_note_summaries_user_group_note_hash
  on exploration_note_summaries (user_id, document_group_id, note_id, markdown_hash);

create index if not exists idx_chat_threads_user_thread
  on intelligence_chat_threads (user_id, thread_id);

create index if not exists idx_chat_threads_user_state_created
  on intelligence_chat_threads (user_id, deleted_at, archived_at, created_at desc, thread_id desc);

create index if not exists idx_chat_messages_user_thread_created
  on intelligence_chat_messages (user_id, thread_id, created_at, message_id);

create index if not exists idx_agent_threads_user_created
  on intelligence_agent_threads (user_id, created_at desc, thread_id desc);

create index if not exists idx_agent_messages_user_thread_created
  on intelligence_agent_messages (user_id, thread_id, created_at asc, message_id asc);

create index if not exists idx_agent_actions_user_thread_created
  on intelligence_agent_actions (user_id, thread_id, created_at asc, action_id asc);

create index if not exists idx_agent_actions_user_status_created
  on intelligence_agent_actions (user_id, status, created_at desc, action_id desc);

create index if not exists idx_cluster_jobs_user_job
  on intelligence_cluster_jobs (user_id, cluster_job_id);

create index if not exists idx_insight_reports_user_report
  on intelligence_insight_reports (user_id, report_id);

create index if not exists idx_insight_reports_user_group_created
  on intelligence_insight_reports (user_id, document_group_id, created_at desc, report_id desc);

create index if not exists idx_llm_runs_user_started
  on intelligence_llm_runs (user_id, started_at desc, llm_run_id desc);

create index if not exists idx_llm_runs_feature_started
  on intelligence_llm_runs (feature_id, started_at desc, llm_run_id desc);

create index if not exists idx_llm_feedback_run
  on intelligence_llm_feedback (llm_run_id, updated_at desc);

create index if not exists idx_prompt_versions_active
  on intelligence_prompt_versions (prompt_key, status);

create index if not exists idx_eval_scenarios_set_created
  on intelligence_eval_scenarios (eval_set_id, created_at, scenario_id);

create index if not exists idx_eval_runs_set_created
  on intelligence_eval_runs (eval_set_id, created_at desc, eval_run_id desc);

create index if not exists idx_eval_results_run_created
  on intelligence_eval_results (eval_run_id, created_at, result_id);
```

## 부분 적용 DB 체크리스트

`V20260710_01__enforce_ai_job_idempotency.sql`은 기존 중복 key가 있으면 완료된 최신 결과를 우선 survivor로 남기고 나머지 row의 `idempotency_key`만 `NULL`로 바꾼 뒤 위 unique constraint를 추가한다. 분석 결과 row 자체는 삭제하지 않는다. 운영 적용 전에는 `(user_id, idempotency_key)` 중복 건수를 확인하고, 적용 후 `uk_cluster_jobs_user_idempotency`, `uk_insight_reports_user_idempotency` constraint 존재 여부를 확인한다.

`V20260703_01__baseline_and_repair_intelligence_schema.sql`는 아래 보강 항목을 idempotent하게 포함한다. 운영 장애 대응 중 수동 확인이 필요할 때만 이 체크리스트를 사용한다.

이미 일부 table이 있는 운영 DB에서는 baseline을 그대로 실행하기보다 `information_schema.columns`로 누락 컬럼을 확인한다. `not null` 컬럼은 기존 row가 있을 수 있으므로 default/backfill 후 제약을 조정한다.

자주 누락될 수 있는 최근 기능 컬럼:

```sql
alter table ai_models
  add column if not exists vendor_cached_input_cost_per_1k_tokens numeric(12, 6),
  add column if not exists vendor_cost_currency varchar(3) not null default 'USD';

alter table intelligence_note_projections
  add column if not exists document_group_id varchar(120) not null default 'default',
  add column if not exists markdown text,
  add column if not exists content_pending boolean not null default false,
  add column if not exists search_index_status varchar(40),
  add column if not exists indexed_version integer,
  add column if not exists indexed_markdown_hash varchar(160),
  add column if not exists indexed_at timestamp(6) with time zone,
  add column if not exists last_index_attempt_at timestamp(6) with time zone,
  add column if not exists next_index_retry_at timestamp(6) with time zone,
  add column if not exists index_attempt_count integer not null default 0,
  add column if not exists last_index_error_code varchar(120),
  add column if not exists last_index_error_message varchar(1000);

create index if not exists idx_note_projection_index_retry
  on intelligence_note_projections (next_index_retry_at, updated_at desc, note_id)
  where archived = false
    and trashed = false
    and deleted = false
    and (
      search_index_status in ('NOT_INDEXED', 'PROVISIONAL', 'STALE', 'FAILED')
      or content_pending = true
    );

alter table intelligence_chat_messages
  add column if not exists client_context text not null default '{}',
  add column if not exists web_sources text not null default '[]',
  add column if not exists llm_run_id varchar(120),
  add column if not exists route varchar(40),
  add column if not exists saved_draft_note_id varchar(120);

alter table intelligence_chat_threads
  add column if not exists archived_at timestamp(6) with time zone,
  add column if not exists deleted_at timestamp(6) with time zone;

create index if not exists idx_chat_threads_user_state_created
  on intelligence_chat_threads (user_id, deleted_at, archived_at, created_at desc, thread_id desc);

create table if not exists intelligence_agent_threads (
  thread_id varchar(120) primary key,
  user_id varchar(120) not null,
  document_group_id varchar(120) not null,
  title varchar(500) not null,
  model_id varchar(120) not null,
  created_at timestamp(6) with time zone not null
);

create table if not exists intelligence_agent_messages (
  message_id varchar(120) primary key,
  thread_id varchar(120) not null,
  user_id varchar(120) not null,
  role varchar(20) not null,
  content text not null,
  model_id varchar(120),
  llm_run_id varchar(120),
  client_context text not null default '{}',
  created_at timestamp(6) with time zone not null
);

create table if not exists intelligence_agent_actions (
  action_id varchar(120) primary key,
  user_id varchar(120) not null,
  thread_id varchar(120) not null,
  message_id varchar(120) not null,
  action_type varchar(40) not null,
  status varchar(40) not null,
  title varchar(500) not null,
  summary varchar(1000) not null,
  preview_markdown text not null,
  document_group_id varchar(120) not null,
  target_json text not null default '{}',
  payload_json text not null default '{}',
  result_json text,
  error_json text,
  created_at timestamp(6) with time zone not null,
  decided_at timestamp(6) with time zone,
  executed_at timestamp(6) with time zone
);

create index if not exists idx_agent_threads_user_created
  on intelligence_agent_threads (user_id, created_at desc, thread_id desc);

create index if not exists idx_agent_messages_user_thread_created
  on intelligence_agent_messages (user_id, thread_id, created_at asc, message_id asc);

create index if not exists idx_agent_actions_user_thread_created
  on intelligence_agent_actions (user_id, thread_id, created_at asc, action_id asc);

create index if not exists idx_agent_actions_user_status_created
  on intelligence_agent_actions (user_id, status, created_at desc, action_id desc);

alter table intelligence_agent_messages
  add column if not exists llm_run_id varchar(120);

alter table intelligence_cluster_jobs
  add column if not exists llm_run_id varchar(120);

alter table intelligence_insight_reports
  add column if not exists llm_run_id varchar(120);
```

신규 기능 table이 통째로 없으면 `Baseline DDL`의 `create table if not exists` 블록을 적용한다. 이미 생성된 table에 필수 컬럼을 추가해야 하고 default를 둘 수 없다면 다음 순서를 따른다.

LLMOps v1은 `V20260706_02__add_llmops_tables.sql`의 `intelligence_llm_runs`, `intelligence_llm_feedback`, `intelligence_prompt_definitions`, `intelligence_prompt_versions`, `intelligence_eval_sets`, `intelligence_eval_scenarios`, `intelligence_eval_runs`, `intelligence_eval_results`와 관련 인덱스가 모두 필요하다.

```sql
alter table target_table add column if not exists new_column varchar(120);
update target_table set new_column = '<backfill value>' where new_column is null;
alter table target_table alter column new_column set not null;
```

운영 적용 후에는 최소한 다음을 확인한다.

```sql
select table_name
from information_schema.tables
where table_schema = 'public'
  and table_name in (
    'ai_models',
    'user_ai_model_settings',
    'user_style_profiles',
    'event_consumption_records',
    'intelligence_capture_projections',
    'intelligence_folder_projections',
    'intelligence_note_link_projections',
    'intelligence_user_deletion_requests',
    'intelligence_note_projections',
    'intelligence_note_index_chunks',
    'exploration_note_summaries',
    'intelligence_chat_threads',
    'intelligence_chat_messages',
    'intelligence_agent_threads',
    'intelligence_agent_messages',
    'intelligence_agent_actions',
    'intelligence_cluster_jobs',
    'intelligence_insight_reports',
    'intelligence_llm_runs',
    'intelligence_llm_feedback',
    'intelligence_prompt_definitions',
    'intelligence_prompt_versions',
    'intelligence_eval_sets',
    'intelligence_eval_scenarios',
    'intelligence_eval_runs',
    'intelligence_eval_results'
  )
order by table_name;
```

마지막으로 staging 또는 운영 배포 전 점검 환경에서 `spring.jpa.hibernate.ddl-auto=validate`로 application startup validation을 통과시키고, 모델 catalog seed와 `vendor_*_cost_per_1k_tokens` 값이 1,000 token 기준인지 확인한다.
