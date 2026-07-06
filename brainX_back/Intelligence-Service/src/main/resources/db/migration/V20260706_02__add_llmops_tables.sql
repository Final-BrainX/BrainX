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

alter table intelligence_chat_messages
    add column if not exists llm_run_id varchar(120);

alter table intelligence_agent_messages
    add column if not exists llm_run_id varchar(120);

alter table intelligence_cluster_jobs
    add column if not exists llm_run_id varchar(120);

alter table intelligence_insight_reports
  add column if not exists llm_run_id varchar(120);

create index if not exists idx_llm_runs_user_started
  on intelligence_llm_runs (user_id, started_at desc, llm_run_id desc);

create index if not exists idx_llm_runs_feature_started
  on intelligence_llm_runs (feature_id, started_at desc, llm_run_id desc);

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

create index if not exists idx_llm_feedback_run
  on intelligence_llm_feedback (llm_run_id, updated_at desc);

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

create index if not exists idx_prompt_versions_active
  on intelligence_prompt_versions (prompt_key, status);

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

create index if not exists idx_eval_scenarios_set_created
  on intelligence_eval_scenarios (eval_set_id, created_at, scenario_id);

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

create index if not exists idx_eval_runs_set_created
  on intelligence_eval_runs (eval_set_id, created_at desc, eval_run_id desc);

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

create index if not exists idx_eval_results_run_created
  on intelligence_eval_results (eval_run_id, created_at, result_id);
