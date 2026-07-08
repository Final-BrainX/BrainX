create table if not exists intelligence_legacy_default_document_group_repairs (
  repair_id varchar(260) primary key,
  user_id varchar(120) not null,
  note_id varchar(120) not null,
  created_at timestamp with time zone not null default now(),
  vector_cleanup_attempted_at timestamp with time zone,
  vector_cleanup_status varchar(40),
  vector_cleanup_error varchar(1000)
);

create index if not exists idx_legacy_default_dgrp_repairs_status
  on intelligence_legacy_default_document_group_repairs (vector_cleanup_status, created_at);

do $$
declare
  target_count integer;
  chunk_delete_count integer;
  projection_delete_count integer;
begin
  with targets as (
    select legacy.user_id, legacy.note_id
    from intelligence_note_projections legacy
    where legacy.document_group_id = 'default'
      and exists (
        select 1
        from intelligence_note_projections current_projection
        where current_projection.user_id = legacy.user_id
          and current_projection.note_id = legacy.note_id
          and current_projection.document_group_id <> 'default'
      )
    union
    select legacy_chunk.user_id, legacy_chunk.note_id
    from intelligence_note_index_chunks legacy_chunk
    where legacy_chunk.document_group_id = 'default'
      and exists (
        select 1
        from intelligence_note_projections current_projection
        where current_projection.user_id = legacy_chunk.user_id
          and current_projection.note_id = legacy_chunk.note_id
          and current_projection.document_group_id <> 'default'
      )
  )
  insert into intelligence_legacy_default_document_group_repairs (
    repair_id,
    user_id,
    note_id
  )
  select user_id || '::default::' || note_id, user_id, note_id
  from targets
  on conflict (repair_id) do nothing;

  select count(*)
  into target_count
  from intelligence_legacy_default_document_group_repairs;

  delete from intelligence_note_index_chunks legacy_chunk
  where legacy_chunk.document_group_id = 'default'
    and exists (
      select 1
      from intelligence_legacy_default_document_group_repairs target
      where target.user_id = legacy_chunk.user_id
        and target.note_id = legacy_chunk.note_id
    );
  get diagnostics chunk_delete_count = row_count;

  delete from intelligence_note_projections legacy_projection
  where legacy_projection.document_group_id = 'default'
    and exists (
      select 1
      from intelligence_legacy_default_document_group_repairs target
      where target.user_id = legacy_projection.user_id
        and target.note_id = legacy_projection.note_id
    );
  get diagnostics projection_delete_count = row_count;

  raise notice 'Legacy default document group cleanup targets recorded: %', target_count;
  raise notice 'Legacy default note index chunk rows deleted: %', chunk_delete_count;
  raise notice 'Legacy default note projection rows deleted: %', projection_delete_count;
end $$;
