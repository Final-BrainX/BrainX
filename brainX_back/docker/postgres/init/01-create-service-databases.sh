#!/bin/sh
set -e

create_database() {
  db_name="$1"

  if [ -z "$db_name" ]; then
    return
  fi

  host_args=""
  if [ -n "${POSTGRES_HOST:-}" ]; then
    host_args="--host=$POSTGRES_HOST"
  fi

  # shellcheck disable=SC2086
  psql $host_args --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" --set dbname="$db_name" <<-'EOSQL'
SELECT format('CREATE DATABASE %I', :'dbname')
WHERE NOT EXISTS (
  SELECT FROM pg_database WHERE datname = :'dbname'
)\gexec
EOSQL
}

create_database "${USER_DB_NAME:-brainx_user}"
create_database "${WORKSPACE_DB_NAME:-brainx_workspace}"
create_database "${INGESTION_DB_NAME:-brainx_ingestion}"
create_database "${COMMERCE_DB_NAME:-brainx_commerce}"
create_database "${ADMIN_DB_NAME:-brainx_admin}"
create_database "${INTELLIGENCE_DB_NAME:-intelligence_service}"
create_database "${MCP_DB_NAME:-brainx_mcp}"
