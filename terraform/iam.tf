# iam.tf
# roles y policies para fargate

# role para fargate task execution
resource "aws_iam_role" "ecs_task_execution" {
  name = "${local.app_name}-ecs-task-execution"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action = "sts:AssumeRole"
      Effect = "Allow"
      Principal = {
        Service = "ecs-tasks.amazonaws.com"
      }
    }]
  })

  tags = {
    Name = "${local.app_name}-ecs-task-execution-role"
  }
}

# attach managed policy para ecs task execution
resource "aws_iam_role_policy_attachment" "ecs_task_execution" {
  role       = aws_iam_role.ecs_task_execution.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

# role para fargate task (runtime)
resource "aws_iam_role" "ecs_task" {
  name = "${local.app_name}-ecs-task"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action = "sts:AssumeRole"
      Effect = "Allow"
      Principal = {
        Service = "ecs-tasks.amazonaws.com"
      }
    }]
  })

  tags = {
    Name = "${local.app_name}-ecs-task-role"
  }
}

# policy para acceso a dynamodb
resource "aws_iam_role_policy" "ecs_task_dynamodb" {
  name = "${local.app_name}-dynamodb-access"
  role = aws_iam_role.ecs_task.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Action = [
        "dynamodb:BatchGetItem",
        "dynamodb:BatchWriteItem",
        "dynamodb:PutItem",
        "dynamodb:DeleteItem",
        "dynamodb:GetItem",
        "dynamodb:Scan",
        "dynamodb:Query",
        "dynamodb:UpdateItem"
      ]
      Resource = [
        # Acceso a todas las tablas DynamoDB (wildcard ya que las tablas existen externamente)
        "arn:aws:dynamodb:${var.aws_region}:*:table/tipoprofesional",
        "arn:aws:dynamodb:${var.aws_region}:*:table/tipousuario",
        "arn:aws:dynamodb:${var.aws_region}:*:table/tipoconsulta",
        "arn:aws:dynamodb:${var.aws_region}:*:table/tipoestado",
        "arn:aws:dynamodb:${var.aws_region}:*:table/tipobox",
        "arn:aws:dynamodb:${var.aws_region}:*:table/tipoitem",
        "arn:aws:dynamodb:${var.aws_region}:*:table/personalizacion",
        "arn:aws:dynamodb:${var.aws_region}:*:table/estadobox",
        "arn:aws:dynamodb:${var.aws_region}:*:table/usuario",
        "arn:aws:dynamodb:${var.aws_region}:*:table/box",
        "arn:aws:dynamodb:${var.aws_region}:*:table/items",
        "arn:aws:dynamodb:${var.aws_region}:*:table/agenda",
        "arn:aws:dynamodb:${var.aws_region}:*:table/registroagenda",
        "arn:aws:dynamodb:${var.aws_region}:*:table/users",
        "arn:aws:dynamodb:${var.aws_region}:*:table/parameters-new",
        "arn:aws:dynamodb:${var.aws_region}:*:table/empresas-new",
        "arn:aws:dynamodb:${var.aws_region}:*:table/espacios",
        "arn:aws:dynamodb:${var.aws_region}:*:table/ocupantes",
        "arn:aws:dynamodb:${var.aws_region}:*:table/items-mesas",
        "arn:aws:dynamodb:${var.aws_region}:*:table/empresa-items",
        # indices globales
        "arn:aws:dynamodb:${var.aws_region}:*:table/agenda/index/*",
        "arn:aws:dynamodb:${var.aws_region}:*:table/users/index/*"
      ]
    }]
  })
}

# policy para cognito (autenticacion)
resource "aws_iam_role_policy" "ecs_task_cognito" {
  name = "${local.app_name}-cognito-access"
  role = aws_iam_role.ecs_task.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Action = [
        "cognito-idp:AdminGetUser",
        "cognito-idp:AdminSetUserAttributes",
        "cognito-idp:ListUsers",
        "cognito-idp:AdminUpdateUserAttributes",
        "cognito-idp:SignUp",
        "cognito-idp:AdminConfirmSignUp",
        "cognito-idp:AdminCreateUser",
        "cognito-idp:AdminSetUserPassword",
        "cognito-idp:AdminInitiateAuth",
        "cognito-idp:AdminRespondToAuthChallenge"
      ]
      Resource = aws_cognito_user_pool.main.arn
    }]
  })
}

# policy para secrets manager (task execution role)
resource "aws_iam_role_policy" "ecs_task_execution_secrets" {
  name = "${local.app_name}-task-execution-secrets"
  role = aws_iam_role.ecs_task_execution.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Action = [
        "secretsmanager:GetSecretValue"
      ]
      Resource = [
        data.aws_secretsmanager_secret.app_secrets.arn,
        data.aws_secretsmanager_secret.admin_creds.arn
      ]
    }]
  })
}

# policy para sns (notificaciones)
resource "aws_iam_role_policy" "ecs_task_sns" {
  name = "${local.app_name}-sns-access"
  role = aws_iam_role.ecs_task.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Action = [
        "sns:Publish",
        "sns:Subscribe",
        "sns:CreateTopic",
        "sns:ListTopics"
      ]
      Resource = "*"
    }]
  })
}

# policy para cloudwatch logs
resource "aws_iam_role_policy" "ecs_task_logs" {
  name = "${local.app_name}-logs-access"
  role = aws_iam_role.ecs_task.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Action = [
        "logs:CreateLogGroup",
        "logs:CreateLogStream",
        "logs:PutLogEvents"
      ]
      Resource = "arn:aws:logs:${var.aws_region}:${data.aws_caller_identity.current.account_id}:log-group:/ecs/${local.app_name}*"
    }]
  })
}
