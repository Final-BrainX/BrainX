locals {
  name_prefix = "${var.project_name}-${var.environment}"

  service_repositories = {
    gateway-service      = "${local.name_prefix}-gateway-service"
    user-service         = "${local.name_prefix}-user-service"
    workspace-service    = "${local.name_prefix}-workspace-service"
    ingestion-service    = "${local.name_prefix}-ingestion-service"
    commerce-service     = "${local.name_prefix}-commerce-service"
    admin-service        = "${local.name_prefix}-admin-service"
    intelligence-service = "${local.name_prefix}-intelligence-service"
    frontend             = "${local.name_prefix}-frontend"
    admin-frontend       = "${local.name_prefix}-admin-frontend"
  }

  public_subnet_cidrs  = [cidrsubnet(var.vpc_cidr, 8, 0), cidrsubnet(var.vpc_cidr, 8, 1)]
  private_subnet_cidrs = [cidrsubnet(var.vpc_cidr, 8, 10), cidrsubnet(var.vpc_cidr, 8, 11)]
  availability_zones   = slice(data.aws_availability_zones.available.names, 0, 2)

  github_oidc_provider_arn = var.github_oidc_provider_arn != "" ? var.github_oidc_provider_arn : aws_iam_openid_connect_provider.github[0].arn
  asset_bucket_name        = var.asset_bucket_name != "" ? var.asset_bucket_name : "${local.name_prefix}-assets-${data.aws_caller_identity.current.account_id}-${var.aws_region}"
  asset_bucket_cors_allowed_origins = length(var.asset_bucket_cors_allowed_origins) > 0 ? var.asset_bucket_cors_allowed_origins : compact([
    var.public_domain_name != "" ? "https://${var.public_domain_name}" : "",
    var.admin_domain_name != "" ? "https://${var.admin_domain_name}" : ""
  ])

  tags = merge(
    {
      Project     = var.project_name
      Environment = var.environment
      ManagedBy   = "terraform"
    },
    var.tags
  )
}
