with ranked_cluster_jobs as (
  select cluster_job_id,
         row_number() over (
           partition by user_id, idempotency_key
           order by
             case status when 'COMPLETED' then 0 when 'RUNNING' then 1 else 2 end,
             coalesce(completed_at, created_at) desc,
             created_at desc,
             cluster_job_id desc
         ) as duplicate_rank
    from intelligence_cluster_jobs
   where idempotency_key is not null
)
update intelligence_cluster_jobs as jobs
   set idempotency_key = null
  from ranked_cluster_jobs as ranked
 where jobs.cluster_job_id = ranked.cluster_job_id
   and ranked.duplicate_rank > 1;

with ranked_insight_reports as (
  select report_id,
         row_number() over (
           partition by user_id, idempotency_key
           order by
             case status when 'COMPLETED' then 0 when 'RUNNING' then 1 else 2 end,
             coalesce(completed_at, created_at) desc,
             created_at desc,
             report_id desc
         ) as duplicate_rank
    from intelligence_insight_reports
   where idempotency_key is not null
)
update intelligence_insight_reports as reports
   set idempotency_key = null
  from ranked_insight_reports as ranked
 where reports.report_id = ranked.report_id
   and ranked.duplicate_rank > 1;

drop index if exists idx_cluster_jobs_user_idempotency;
alter table intelligence_cluster_jobs
  add constraint uk_cluster_jobs_user_idempotency
  unique (user_id, idempotency_key);

drop index if exists idx_insight_reports_user_idempotency;
alter table intelligence_insight_reports
  add constraint uk_insight_reports_user_idempotency
  unique (user_id, idempotency_key);
