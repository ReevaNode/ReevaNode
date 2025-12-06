# cognito-seed.tf
# Automatically create admin user after Cognito User Pool is created

resource "null_resource" "create_admin_user" {
  # This ensures the script runs after the User Pool and users table are created
  depends_on = [
    aws_cognito_user_pool.main,
    aws_dynamodb_table.users
  ]

  # Trigger to run every time the User Pool ID changes
  triggers = {
    user_pool_id = aws_cognito_user_pool.main.id
    users_table  = aws_dynamodb_table.users.name
  }

  provisioner "local-exec" {
    command     = "${path.module}/../scripts/create-admin-user.sh ${aws_cognito_user_pool.main.id} ${local.admin_creds.ADMIN_EMAIL} ${local.admin_creds.ADMIN_PASSWORD} ${aws_dynamodb_table.users.name}"
    working_dir = path.module
  }
}
