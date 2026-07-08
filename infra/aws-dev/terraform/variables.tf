variable "aws_region" {
  description = "AWS region for the dev environment."
  type        = string
  default     = "ap-northeast-2"
}

variable "project_name" {
  description = "Short project name used in AWS resource names."
  type        = string
  default     = "brainx"
}

variable "environment" {
  description = "Environment name used in AWS resource names."
  type        = string
  default     = "dev"
}

variable "github_repository" {
  description = "GitHub repository allowed to assume the deployment role."
  type        = string
  default     = "Final-BrainX/BrainX"
}

variable "github_branch" {
  description = "GitHub branch allowed to deploy."
  type        = string
  default     = "main"
}

variable "github_oidc_provider_arn" {
  description = "Existing GitHub OIDC provider ARN. Leave empty to let this stack create one."
  type        = string
  default     = ""
}

variable "github_oidc_thumbprints" {
  description = "Thumbprints for the GitHub OIDC provider when this stack creates it."
  type        = list(string)
  default     = ["6938fd4d98bab03faadb97b34396831e3780aea1"]
}

variable "instance_type" {
  description = "Single EC2 instance type for all dev containers."
  type        = string
  default     = "m8i.xlarge"
}

variable "ec2_root_volume_gb" {
  description = "EC2 root gp3 volume size."
  type        = number
  default     = 200
}

variable "ec2_runtime_state" {
  description = "Desired EC2 runtime state for the dev app host. Use stopped to pause instance-hour cost without destroying the instance."
  type        = string
  default     = "running"

  validation {
    condition     = contains(["running", "stopped"], var.ec2_runtime_state)
    error_message = "ec2_runtime_state must be either running or stopped."
  }
}

variable "rds_instance_class" {
  description = "RDS PostgreSQL instance class."
  type        = string
  default     = "db.t4g.medium"
}

variable "rds_allocated_storage_gb" {
  description = "RDS allocated gp3 storage."
  type        = number
  default     = 50
}

variable "rds_username" {
  description = "RDS master username. Password is managed by RDS Secrets Manager."
  type        = string
  default     = "brainx_admin"
}

variable "asset_bucket_name" {
  description = "Optional explicit S3 bucket name for user-uploaded assets. Leave empty to use the default BrainX dev name."
  type        = string
  default     = ""
}

variable "asset_bucket_force_destroy" {
  description = "Whether Terraform can delete non-empty user asset buckets. Keep false unless intentionally tearing down dev data."
  type        = bool
  default     = false
}

variable "asset_bucket_cors_allowed_origins" {
  description = "Allowed browser origins for future direct-to-S3 upload/download flows. Empty uses configured public/admin domains."
  type        = list(string)
  default     = []
}

variable "rds_runtime_state" {
  description = "Desired RDS runtime state for the dev PostgreSQL instance. Use stopped to pause DB instance-hour cost; storage and backups still incur cost."
  type        = string
  default     = "running"

  validation {
    condition     = contains(["running", "stopped"], var.rds_runtime_state)
    error_message = "rds_runtime_state must be either running or stopped."
  }
}

variable "rds_runtime_state_operation_nonce" {
  description = "Bump this value to re-run the RDS start/stop helper without changing the desired rds_runtime_state."
  type        = string
  default     = "0"
}

variable "vpc_cidr" {
  description = "CIDR block for the dev VPC."
  type        = string
  default     = "10.42.0.0/16"
}

variable "allowed_http_cidr_blocks" {
  description = "CIDR blocks allowed to access the public frontend ports."
  type        = list(string)
  default     = ["0.0.0.0/0"]
}

variable "public_domain_name" {
  description = "Public application domain name. Leave empty until external DNS is configured."
  type        = string
  default     = ""
}

variable "admin_domain_name" {
  description = "Admin frontend domain name. Leave empty until external DNS is configured."
  type        = string
  default     = ""
}

variable "acme_email" {
  description = "Optional contact email for ACME certificate issuance."
  type        = string
  default     = ""
}

variable "ssm_parameter_prefix" {
  description = "SSM Parameter Store prefix for runtime app secrets."
  type        = string
  default     = "/brainx/dev"
}

variable "tags" {
  description = "Additional AWS resource tags."
  type        = map(string)
  default     = {}
}
