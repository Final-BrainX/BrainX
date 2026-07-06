create index if not exists idx_insight_reports_user_group_created
  on intelligence_insight_reports (user_id, document_group_id, created_at desc, report_id desc);
