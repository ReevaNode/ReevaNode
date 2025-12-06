# cognito.tf
# AWS Cognito User Pool configuration for authentication

# Cognito User Pool
resource "aws_cognito_user_pool" "main" {
  name = "aws-cognito-jwt-login-${var.environment}-pool"

  # Use email as username
  username_attributes      = ["email"]
  auto_verified_attributes = ["email"]

  # Password policy
  password_policy {
    minimum_length                   = 8
    require_lowercase                = true
    require_numbers                  = true
    require_symbols                  = false
    require_uppercase                = true
    temporary_password_validity_days = 7
  }

  # Account recovery via email
  account_recovery_setting {
    recovery_mechanism {
      name     = "verified_email"
      priority = 1
    }
  }

  # Email configuration
  email_configuration {
    email_sending_account = "COGNITO_DEFAULT"
  }

  # User attributes schema
  schema {
    name                = "email"
    attribute_data_type = "String"
    mutable             = true
    required            = true

    string_attribute_constraints {
      min_length = 1
      max_length = 256
    }
  }

  # Prevent user enumeration attacks
  username_configuration {
    case_sensitive = false
  }

  tags = local.common_tags
}

# Cognito User Pool Client
resource "aws_cognito_user_pool_client" "main" {
  name         = "aws-cognito-jwt-login-${var.environment}-app"
  user_pool_id = aws_cognito_user_pool.main.id

  # Auth flows
  explicit_auth_flows = [
    "ALLOW_USER_PASSWORD_AUTH",
    "ALLOW_REFRESH_TOKEN_AUTH",
    "ALLOW_USER_SRP_AUTH"
  ]

  # Token validity (matching existing configuration)
  refresh_token_validity = 30
  access_token_validity  = 5
  id_token_validity      = 5

  token_validity_units {
    refresh_token = "days"
    access_token  = "minutes"
    id_token      = "minutes"
  }

  # Security settings
  prevent_user_existence_errors = "ENABLED"
  enable_token_revocation       = true

  # Read and write attributes
  read_attributes = [
    "email",
    "email_verified"
  ]

  write_attributes = [
    "email"
  ]
}

# NOTE: Admin user and groups should be created manually or via AWS Console
# Terraform doesn't manage individual users to avoid state drift issues
# Use the credentials from Secrets Manager (dev-reeva-admin-credentials) to create the admin user
