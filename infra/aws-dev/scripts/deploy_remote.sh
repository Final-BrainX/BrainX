#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/brainx}"
CURRENT_DIR="$APP_DIR/current"
ENV_DIR="$APP_DIR/env"
STATE_DIR="$APP_DIR/state"
RUNTIME_ENV="$ENV_DIR/runtime.env"
TAG_STATE="$STATE_DIR/image-tags.env"
DB_BOOTSTRAP_STATE="$STATE_DIR/database-bootstrap.env"
PARAMETER_CACHE="$STATE_DIR/ssm-parameters.json"
COMPOSE_FILE="$CURRENT_DIR/docker-compose.yml"

required_env() {
  name="$1"
  value="${!name:-}"
  if [ -z "$value" ]; then
    echo "Missing required environment variable: $name" >&2
    exit 1
  fi
}

required_env AWS_REGION
required_env ECR_REGISTRY
required_env IMAGE_TAG
required_env RDS_SECRET_ARN
required_env RDS_HOST
required_env RDS_PORT
required_env SSM_PARAMETER_PREFIX
required_env PUBLIC_BASE_URL
required_env ADMIN_PUBLIC_BASE_URL
required_env PUBLIC_SITE_ADDRESS
required_env ADMIN_SITE_ADDRESS

mkdir -p "$CURRENT_DIR" "$ENV_DIR" "$STATE_DIR"
chmod 700 "$ENV_DIR"

if [ -n "${ARTIFACT_BUCKET:-}" ] && [ -n "${ARTIFACT_KEY:-}" ]; then
  bundle="/tmp/brainx-deploy-bundle.tgz"
  rm -rf /tmp/brainx-deploy-bundle
  mkdir -p /tmp/brainx-deploy-bundle
  aws s3 cp "s3://$ARTIFACT_BUCKET/$ARTIFACT_KEY" "$bundle" --region "$AWS_REGION"
  tar -xzf "$bundle" -C /tmp/brainx-deploy-bundle
  cp /tmp/brainx-deploy-bundle/deploy/docker-compose.yml "$COMPOSE_FILE"
  cp /tmp/brainx-deploy-bundle/deploy/Caddyfile "$CURRENT_DIR/Caddyfile"
  cp -R /tmp/brainx-deploy-bundle/deploy/prometheus "$CURRENT_DIR/"
  cp -R /tmp/brainx-deploy-bundle/deploy/grafana "$CURRENT_DIR/"
fi

if [ ! -f "$COMPOSE_FILE" ]; then
  echo "Missing compose file: $COMPOSE_FILE" >&2
  exit 1
fi

load_parameters() {
  aws ssm get-parameters-by-path \
    --path "$SSM_PARAMETER_PREFIX" \
    --with-decryption \
    --recursive \
    --query 'Parameters[].{Name:Name,Value:Value}' \
    --output json \
    --region "$AWS_REGION" > "$PARAMETER_CACHE"
  chmod 600 "$PARAMETER_CACHE"
}

get_parameter() {
  name="$1"
  default_value="${2:-}"
  set +e
  value="$(
    PARAMETER_CACHE="$PARAMETER_CACHE" \
    SSM_PARAMETER_PREFIX="$SSM_PARAMETER_PREFIX" \
    PARAMETER_NAME="$name" \
    python3 - <<'PY'
import json
import os
import sys

cache_path = os.environ["PARAMETER_CACHE"]
prefix = os.environ["SSM_PARAMETER_PREFIX"].rstrip("/")
name = os.environ["PARAMETER_NAME"]
target = f"{prefix}/{name}"

try:
    with open(cache_path, "r", encoding="utf-8") as fp:
        parameters = json.load(fp)
except FileNotFoundError:
    parameters = []

for parameter in parameters:
    if parameter.get("Name") == target:
        print(parameter.get("Value", ""))
        sys.exit(0)

sys.exit(1)
PY
  )"
  status=$?
  set -e
  if [ "$status" -eq 0 ]; then
    printf '%s' "$value"
  else
    printf '%s' "$default_value"
  fi
}

require_parameter() {
  name="$1"
  value="$(get_parameter "$name")"
  if [ -z "$value" ]; then
    echo "Missing required SSM parameter: $SSM_PARAMETER_PREFIX/$name" >&2
    exit 1
  fi
  printf '%s' "$value"
}

load_parameters

rds_secret_json="$(aws secretsmanager get-secret-value --secret-id "$RDS_SECRET_ARN" --query SecretString --output text --region "$AWS_REGION")"
POSTGRES_USER="$(RDS_SECRET_JSON="$rds_secret_json" python3 - <<'PY'
import json, os
print(json.loads(os.environ["RDS_SECRET_JSON"])["username"])
PY
)"
POSTGRES_PASSWORD="$(RDS_SECRET_JSON="$rds_secret_json" python3 - <<'PY'
import json, os
print(json.loads(os.environ["RDS_SECRET_JSON"])["password"])
PY
)"

JWT_SECRET="$(require_parameter JWT_SECRET)"
SERVICE_TOKEN="$(require_parameter SERVICE_TOKEN)"
NEO4J_PASSWORD="$(require_parameter NEO4J_PASSWORD)"
SEED_ADMIN_PASSWORD="$(require_parameter SEED_ADMIN_PASSWORD)"

OPENAI_API_KEY="$(get_parameter OPENAI_API_KEY)"
VOYAGE_API_KEY="$(get_parameter VOYAGE_API_KEY)"
TOSS_CLIENT_KEY="$(get_parameter TOSS_CLIENT_KEY)"
TOSS_SECRET_KEY="$(get_parameter TOSS_SECRET_KEY)"
TOSS_CONFIRM_URL="$(get_parameter TOSS_CONFIRM_URL 'https://api.tosspayments.com/v1/payments/confirm')"
GOOGLE_CLIENT_ID="$(get_parameter GOOGLE_CLIENT_ID)"
GOOGLE_CLIENT_SECRET="$(get_parameter GOOGLE_CLIENT_SECRET)"
KAKAO_CLIENT_ID="$(get_parameter KAKAO_CLIENT_ID)"
KAKAO_CLIENT_SECRET="$(get_parameter KAKAO_CLIENT_SECRET)"
NAVER_CLIENT_ID="$(get_parameter NAVER_CLIENT_ID)"
NAVER_CLIENT_SECRET="$(get_parameter NAVER_CLIENT_SECRET)"
EUREKA_CLIENT_SERVICE_URL_DEFAULTZONE="$(get_parameter EUREKA_CLIENT_SERVICE_URL_DEFAULTZONE 'http://discovery-service:8761/eureka/')"
ADMIN_DB_NAME="$(get_parameter ADMIN_DB_NAME brainx_admin)"
GATEWAY_SERVICE_URL="$(get_parameter GATEWAY_SERVICE_URL 'http://Gateway-Service')"
USER_SERVICE_URL="$(get_parameter USER_SERVICE_URL 'http://User-Service')"
COMMERCE_SERVICE_URL="$(get_parameter COMMERCE_SERVICE_URL 'http://Commerce-Service')"
WORKSPACE_SERVICE_URL="$(get_parameter WORKSPACE_SERVICE_URL 'http://Workspace-Service')"
INGESTION_SERVICE_URL="$(get_parameter INGESTION_SERVICE_URL 'http://Ingestion-Service')"
INTELLIGENCE_SERVICE_URL="$(get_parameter INTELLIGENCE_SERVICE_URL 'http://Intelligence-Service')"
MCP_SERVICE_URL="$(get_parameter MCP_SERVICE_URL 'http://Mcp-Service')"
MAIL_HOST="$(get_parameter MAIL_HOST 'smtp.gmail.com')"
MAIL_PORT="$(get_parameter MAIL_PORT 587)"
MAIL_USERNAME="$(get_parameter MAIL_USERNAME)"
MAIL_PASSWORD="$(get_parameter MAIL_PASSWORD)"
MAIL_FROM="$(get_parameter MAIL_FROM)"
NOTION_CLIENT_ID="$(get_parameter NOTION_CLIENT_ID)"
NOTION_CLIENT_SECRET="$(get_parameter NOTION_CLIENT_SECRET)"
NOTION_REDIRECT_URI="$(get_parameter NOTION_REDIRECT_URI "${PUBLIC_BASE_URL}/notion-callback")"
CDN_BASE_URL="$(get_parameter CDN_BASE_URL "$PUBLIC_BASE_URL")"
ASSET_STORAGE_DIR="$(get_parameter ASSET_STORAGE_DIR "/app/asset-storage")"
SEED_ADMIN_LOGIN_ID="$(get_parameter SEED_ADMIN_LOGIN_ID admin)"
SEED_ADMIN_NAME="$(get_parameter SEED_ADMIN_NAME 'BrainX Admin')"

touch "$TAG_STATE"
chmod 600 "$TAG_STATE"

set_tag() {
  key="$1"
  value="$2"
  if grep -q "^${key}=" "$TAG_STATE"; then
    tmp="$TAG_STATE.tmp"
    sed "s|^${key}=.*|${key}=${value}|" "$TAG_STATE" > "$tmp"
    mv "$tmp" "$TAG_STATE"
  else
    printf '%s=%s\n' "$key" "$value" >> "$TAG_STATE"
  fi
}

ensure_tag() {
  key="$1"
  if ! grep -q "^${key}=" "$TAG_STATE"; then
    printf '%s=dev-latest\n' "$key" >> "$TAG_STATE"
  fi
}

quote_env_value() {
  python3 - "$1" <<'PY'
import sys

value = sys.argv[1]
print("'" + value.replace("\\", "\\\\").replace("'", "\\'") + "'")
PY
}

write_env() {
  key="$1"
  value="$2"
  printf '%s=%s\n' "$key" "$(quote_env_value "$value")"
}

for key in \
  DISCOVERY_SERVICE_TAG GATEWAY_SERVICE_TAG USER_SERVICE_TAG WORKSPACE_SERVICE_TAG INGESTION_SERVICE_TAG \
  COMMERCE_SERVICE_TAG ADMIN_SERVICE_TAG INTELLIGENCE_SERVICE_TAG MCP_SERVICE_TAG \
  FRONTEND_TAG ADMIN_FRONTEND_TAG; do
  ensure_tag "$key"
done

services="${CHANGED_SERVICES:-}"

if [ -z "$services" ] && [ "${DEPLOY_CONFIG_CHANGED:-false}" != "true" ]; then
  echo "No services requested for deployment."
  exit 0
fi

for service in $services; do
  case "$service" in
    discovery-service) set_tag DISCOVERY_SERVICE_TAG "$IMAGE_TAG" ;;
    gateway-service) set_tag GATEWAY_SERVICE_TAG "$IMAGE_TAG" ;;
    user-service) set_tag USER_SERVICE_TAG "$IMAGE_TAG" ;;
    workspace-service) set_tag WORKSPACE_SERVICE_TAG "$IMAGE_TAG" ;;
    ingestion-service) set_tag INGESTION_SERVICE_TAG "$IMAGE_TAG" ;;
    commerce-service) set_tag COMMERCE_SERVICE_TAG "$IMAGE_TAG" ;;
    admin-service) set_tag ADMIN_SERVICE_TAG "$IMAGE_TAG" ;;
    intelligence-service) set_tag INTELLIGENCE_SERVICE_TAG "$IMAGE_TAG" ;;
    mcp-service) set_tag MCP_SERVICE_TAG "$IMAGE_TAG" ;;
    frontend) set_tag FRONTEND_TAG "$IMAGE_TAG" ;;
    admin-frontend) set_tag ADMIN_FRONTEND_TAG "$IMAGE_TAG" ;;
    caddy) ;;
    *) echo "Unknown service: $service" >&2; exit 1 ;;
  esac
done

{
  write_env AWS_REGION "$AWS_REGION"
  write_env ECR_REGISTRY "$ECR_REGISTRY"
  write_env EUREKA_CLIENT_SERVICE_URL_DEFAULTZONE "$EUREKA_CLIENT_SERVICE_URL_DEFAULTZONE"
  write_env PUBLIC_BASE_URL "$PUBLIC_BASE_URL"
  write_env ADMIN_PUBLIC_BASE_URL "$ADMIN_PUBLIC_BASE_URL"
  write_env PUBLIC_SITE_ADDRESS "$PUBLIC_SITE_ADDRESS"
  write_env ADMIN_SITE_ADDRESS "$ADMIN_SITE_ADDRESS"
  write_env ACME_EMAIL "${ACME_EMAIL:-}"
  write_env RDS_HOST "$RDS_HOST"
  write_env RDS_PORT "$RDS_PORT"
  write_env POSTGRES_USER "$POSTGRES_USER"
  write_env POSTGRES_PASSWORD "$POSTGRES_PASSWORD"
  write_env JWT_SECRET "$JWT_SECRET"
  write_env SERVICE_TOKEN "$SERVICE_TOKEN"
  write_env NEO4J_PASSWORD "$NEO4J_PASSWORD"
  write_env ADMIN_DB_NAME "$ADMIN_DB_NAME"
  write_env GATEWAY_SERVICE_URL "$GATEWAY_SERVICE_URL"
  write_env USER_SERVICE_URL "$USER_SERVICE_URL"
  write_env COMMERCE_SERVICE_URL "$COMMERCE_SERVICE_URL"
  write_env WORKSPACE_SERVICE_URL "$WORKSPACE_SERVICE_URL"
  write_env INGESTION_SERVICE_URL "$INGESTION_SERVICE_URL"
  write_env INTELLIGENCE_SERVICE_URL "$INTELLIGENCE_SERVICE_URL"
  write_env MCP_SERVICE_URL "$MCP_SERVICE_URL"
  write_env MAIL_HOST "$MAIL_HOST"
  write_env MAIL_PORT "$MAIL_PORT"
  write_env SEED_ADMIN_PASSWORD "$SEED_ADMIN_PASSWORD"
  write_env SEED_ADMIN_LOGIN_ID "$SEED_ADMIN_LOGIN_ID"
  write_env SEED_ADMIN_NAME "$SEED_ADMIN_NAME"
  write_env KAFKA_BOOTSTRAP_SERVERS "${KAFKA_BOOTSTRAP_SERVERS:-kafka:9092}"
  write_env BRAINX_KAFKA_MONITORING_CONSUMER_GROUP_ID "${BRAINX_KAFKA_MONITORING_CONSUMER_GROUP_ID:-intelligence-service}"
  write_env OPENAI_API_KEY "$OPENAI_API_KEY"
  write_env VOYAGE_API_KEY "$VOYAGE_API_KEY"
  write_env TOSS_CLIENT_KEY "$TOSS_CLIENT_KEY"
  write_env TOSS_SECRET_KEY "$TOSS_SECRET_KEY"
  write_env TOSS_CONFIRM_URL "$TOSS_CONFIRM_URL"
  write_env GOOGLE_CLIENT_ID "$GOOGLE_CLIENT_ID"
  write_env GOOGLE_CLIENT_SECRET "$GOOGLE_CLIENT_SECRET"
  write_env KAKAO_CLIENT_ID "$KAKAO_CLIENT_ID"
  write_env KAKAO_CLIENT_SECRET "$KAKAO_CLIENT_SECRET"
  write_env NAVER_CLIENT_ID "$NAVER_CLIENT_ID"
  write_env NAVER_CLIENT_SECRET "$NAVER_CLIENT_SECRET"
  write_env MAIL_USERNAME "$MAIL_USERNAME"
  write_env MAIL_PASSWORD "$MAIL_PASSWORD"
  write_env MAIL_FROM "$MAIL_FROM"
  write_env NOTION_CLIENT_ID "$NOTION_CLIENT_ID"
  write_env NOTION_CLIENT_SECRET "$NOTION_CLIENT_SECRET"
  write_env NOTION_REDIRECT_URI "$NOTION_REDIRECT_URI"
  write_env CDN_BASE_URL "$CDN_BASE_URL"
  write_env ASSET_STORAGE_DIR "$ASSET_STORAGE_DIR"
  cat "$TAG_STATE"
} > "$RUNTIME_ENV"
chmod 600 "$RUNTIME_ENV"

create_database() {
  db_name="$1"
  PGPASSWORD="$POSTGRES_PASSWORD" psql \
    --host "$RDS_HOST" \
    --port "$RDS_PORT" \
    --username "$POSTGRES_USER" \
    --dbname postgres \
    --set dbname="$db_name" <<'SQL'
SELECT format('CREATE DATABASE %I', :'dbname')
WHERE NOT EXISTS (
  SELECT FROM pg_database WHERE datname = :'dbname'
)\gexec
SQL
}

database_bootstrap_fingerprint() {
  printf 'RDS_HOST=%s\n' "$RDS_HOST"
  printf 'RDS_PORT=%s\n' "$RDS_PORT"
  printf 'POSTGRES_USER=%s\n' "$POSTGRES_USER"
  printf 'DB_NAMES=%s\n' "brainx_user brainx_workspace brainx_ingestion brainx_commerce brainx_admin brainx_intelligence brainx_mcp"
}

run_database_bootstrap=true
if [ -f "$DB_BOOTSTRAP_STATE" ] && [ "$(cat "$DB_BOOTSTRAP_STATE")" = "$(database_bootstrap_fingerprint)" ]; then
  run_database_bootstrap=false
fi

if [ "$run_database_bootstrap" = "true" ]; then
  if ! command -v psql >/dev/null 2>&1; then
    apt-get update
    DEBIAN_FRONTEND=noninteractive apt-get install -y postgresql-client
  fi

  for db_name in brainx_user brainx_workspace brainx_ingestion brainx_commerce brainx_admin brainx_intelligence brainx_mcp; do
    create_database "$db_name"
  done

  database_bootstrap_fingerprint > "$DB_BOOTSTRAP_STATE"
  chmod 600 "$DB_BOOTSTRAP_STATE"
else
  echo "Database bootstrap already completed for current RDS target."
fi

aws ecr get-login-password --region "$AWS_REGION" | docker login --username AWS --password-stdin "$ECR_REGISTRY"

cd "$CURRENT_DIR"

if [ "${DEPLOY_CONFIG_CHANGED:-false}" = "true" ]; then
  if [ -n "$services" ]; then
    docker compose --env-file "$RUNTIME_ENV" -f "$COMPOSE_FILE" pull $services
  else
    echo "Config-only deployment; skipping image pull."
  fi
  docker compose --env-file "$RUNTIME_ENV" -f "$COMPOSE_FILE" up -d --remove-orphans --force-recreate
else
  docker compose --env-file "$RUNTIME_ENV" -f "$COMPOSE_FILE" pull $services
  docker compose --env-file "$RUNTIME_ENV" -f "$COMPOSE_FILE" up -d --no-deps $services
fi

docker compose --env-file "$RUNTIME_ENV" -f "$COMPOSE_FILE" ps
docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'

echo "Discovery health:"
discovery_healthy=false
for attempt in $(seq 1 24); do
  if curl -fsS --max-time 10 http://127.0.0.1:8761/actuator/health >/dev/null; then
    echo "Discovery health is UP on attempt $attempt"
    discovery_healthy=true
    break
  fi
  echo "Discovery health attempt $attempt failed"
  sleep 5
done

if [ "$discovery_healthy" != "true" ]; then
  echo "Discovery health did not become available." >&2
  exit 1
fi

echo "Gateway health:"
curl -fsS --max-time 10 -H "Host: $PUBLIC_SITE_ADDRESS" http://127.0.0.1:80/api/v1/plans >/dev/null || true
curl -fsS --max-time 10 -H "Host: $PUBLIC_SITE_ADDRESS" http://127.0.0.1:80/ >/dev/null || true
curl -fsS --max-time 10 -H "Host: $ADMIN_SITE_ADDRESS" http://127.0.0.1:80/ >/dev/null || true
