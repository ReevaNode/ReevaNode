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
        aws_dynamodb_table.tipoprofesional.arn,
        aws_dynamodb_table.tipousuario.arn,
        aws_dynamodb_table.tipoconsulta.arn,
        aws_dynamodb_table.tipoestado.arn,
        aws_dynamodb_table.tipobox.arn,
        aws_dynamodb_table.tipoitem.arn,
        aws_dynamodb_table.personalizacion.arn,
        aws_dynamodb_table.estadobox.arn,
        aws_dynamodb_table.usuario.arn,
        aws_dynamodb_table.box.arn,
        aws_dynamodb_table.items.arn,
        aws_dynamodb_table.agenda.arn,
        aws_dynamodb_table.registroagenda.arn,
        "${aws_dynamodb_table.agenda.arn}/index/*"
      ]
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
