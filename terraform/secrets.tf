# secrets.tf
# AWS Secrets Manager configuration for application secrets and admin credentials

# Data source for application secrets (JWT, API keys, etc.)
data "aws_secretsmanager_secret" "app_secrets" {
  name = "${var.environment}-reeva-app-secrets"
}

data "aws_secretsmanager_secret_version" "app_secrets" {
  secret_id = data.aws_secretsmanager_secret.app_secrets.id
}

# Data source for admin user credentials
data "aws_secretsmanager_secret" "admin_creds" {
  name = "${var.environment}-reeva-admin-credentials"
}

data "aws_secretsmanager_secret_version" "admin_creds" {
  secret_id = data.aws_secretsmanager_secret.admin_creds.id
}

# Parse JSON from secrets
locals {
  app_secrets = jsondecode(data.aws_secretsmanager_secret_version.app_secrets.secret_string)
  admin_creds = jsondecode(data.aws_secretsmanager_secret_version.admin_creds.secret_string)
}
