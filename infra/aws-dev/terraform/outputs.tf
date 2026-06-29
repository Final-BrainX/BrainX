output "aws_region" {
  value = var.aws_region
}

output "github_actions_role_arn" {
  value = aws_iam_role.github_actions.arn
}

output "ec2_instance_id" {
  value = aws_instance.app.id
}

output "ec2_runtime_state" {
  value = var.ec2_runtime_state
}

output "ec2_public_ip" {
  value = aws_eip.app.public_ip
}

output "main_public_base_url" {
  value = var.public_domain_name != "" ? "https://${var.public_domain_name}" : "http://${aws_eip.app.public_ip}"
}

output "admin_public_base_url" {
  value = var.admin_domain_name != "" ? "https://${var.admin_domain_name}" : ""
}

output "public_site_address" {
  value = var.public_domain_name
}

output "admin_site_address" {
  value = var.admin_domain_name
}

output "acme_email" {
  value = var.acme_email
}

output "artifact_bucket_name" {
  value = aws_s3_bucket.deploy_artifacts.bucket
}

output "asset_bucket_name" {
  value = aws_s3_bucket.assets.bucket
}

output "asset_bucket_arn" {
  value = aws_s3_bucket.assets.arn
}

output "asset_bucket_region" {
  value = var.aws_region
}

output "ecr_registry" {
  value = "${data.aws_caller_identity.current.account_id}.dkr.ecr.${var.aws_region}.amazonaws.com"
}

output "ecr_repository_urls" {
  value = {
    for name, repository in aws_ecr_repository.services : name => repository.repository_url
  }
}

output "rds_address" {
  value = aws_db_instance.postgres.address
}

output "rds_port" {
  value = aws_db_instance.postgres.port
}

output "rds_runtime_state" {
  value = var.rds_runtime_state
}

output "rds_secret_arn" {
  value     = aws_db_instance.postgres.master_user_secret[0].secret_arn
  sensitive = true
}

output "ssm_parameter_prefix" {
  value = var.ssm_parameter_prefix
}
