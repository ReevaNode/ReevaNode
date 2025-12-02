# ecs.tf
# ecs cluster, task definition y service

# cloudwatch log group
resource "aws_cloudwatch_log_group" "app" {
  name              = "/ecs/${local.app_name}"
  retention_in_days = 7

  tags = {
    Name = "${local.app_name}-logs"
  }
}

# ecs cluster
resource "aws_ecs_cluster" "main" {
  name = "${local.app_name}-cluster"

  setting {
    name  = "containerInsights"
    value = "disabled" # disabled para ahorrar costos
  }

  tags = {
    Name = "${local.app_name}-cluster"
  }
}

# task definition
resource "aws_ecs_task_definition" "app" {
  family                   = "${local.app_name}-task"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = var.fargate_cpu
  memory                   = var.fargate_memory
  execution_role_arn       = aws_iam_role.ecs_task_execution.arn
  task_role_arn            = aws_iam_role.ecs_task.arn

  container_definitions = jsonencode([{
    name      = "${local.app_name}-container"
    image     = "${aws_ecr_repository.app.repository_url}:latest"
    essential = true

    portMappings = [{
      containerPort = var.container_port
      hostPort      = var.container_port
      protocol      = "tcp"
    }]

    environment = [
      { name = "NODE_ENV", value = var.environment },
      { name = "PORT", value = tostring(var.container_port) },
      { name = "AWS_REGION", value = var.aws_region },
      # Cognito configuration
      { name = "USER_POOL_ID", value = "us-east-1_nGDzbmgag" },
      { name = "USER_POOL_CLIENT_ID", value = "4997r28ubt0nnqkfv6lbjdspos" },
      { name = "COGNITO_USER_POOL_ID", value = "us-east-1_nGDzbmgag" },
      { name = "COGNITO_CLIENT_ID", value = "4997r28ubt0nnqkfv6lbjdspos" },
      { name = "COGNITO_REGION", value = var.aws_region },
      # Tablas DynamoDB (existentes, creadas por serverless)
      { name = "TIPO_PROFESIONAL_TABLE", value = "tipoprofesional" },
      { name = "TIPO_USUARIO_TABLE", value = "tipousuario" },
      { name = "TIPO_CONSULTA_TABLE", value = "tipoconsulta" },
      { name = "TIPO_ESTADO_TABLE", value = "tipoestado" },
      { name = "TIPO_BOX_TABLE", value = "tipobox" },
      { name = "TIPO_ITEM_TABLE", value = "tipoitem" },
      { name = "PERSONALIZACION_TABLE", value = "personalizacion" },
      { name = "ESTADO_BOX_TABLE", value = "estadobox" },
      { name = "USUARIO_TABLE", value = "usuario" },
      { name = "BOX_TABLE", value = "box" },
      { name = "ITEMS_TABLE", value = "empresa-items" },
      { name = "AGENDA_TABLE", value = "agenda" },
      { name = "REGISTRO_AGENDA_TABLE", value = "registroagenda" },
      { name = "USER_TABLE", value = "users" },
      { name = "PARAMETERS_TABLE", value = "parameters-new" },
      { name = "EMPRESAS_TABLE", value = "empresas-new" },
      { name = "ESPACIOS_TABLE", value = "espacios" },
      { name = "OCUPANTES_TABLE", value = "ocupantes" },
      { name = "ITEMS_MESAS_TABLE", value = "items-mesas" },
      { name = "EMPRESA_ITEMS_TABLE", value = "empresa-items" },
      # Twilio configuration
      { name = "TWILIO_ACCOUNT_SID", value = var.twilio_account_sid },
      { name = "TWILIO_AUTH_TOKEN", value = var.twilio_auth_token },
      { name = "TWILIO_WHATSAPP_FROM", value = var.twilio_whatsapp_from },
      # OpenAI configuration
      { name = "OPENAI_API_KEY", value = var.openai_api_key },
      # Security
      { name = "JWT_SECRET", value = var.jwt_secret },
      { name = "SESSION_SECRET", value = var.session_secret },
      # Base URLs
      { name = "CHATBOT_URL_BASE", value = "http://${aws_lb.main.dns_name}" }
    ]

    logConfiguration = {
      logDriver = "awslogs"
      options = {
        "awslogs-group"         = aws_cloudwatch_log_group.app.name
        "awslogs-region"        = var.aws_region
        "awslogs-stream-prefix" = "ecs"
      }
    }

    healthCheck = {
      command     = ["CMD-SHELL", "wget --no-verbose --tries=1 --spider http://localhost:${var.container_port}${var.health_check_path} || exit 1"]
      interval    = 30
      timeout     = 5
      retries     = 3
      startPeriod = 60
    }
  }])

  tags = {
    Name = "${local.app_name}-task"
  }
}

# ecs service
resource "aws_ecs_service" "app" {
  name            = "${local.app_name}-service"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.app.arn
  desired_count   = var.desired_count
  launch_type     = var.use_fargate_spot ? null : "FARGATE"

  # fargate spot configuration
  dynamic "capacity_provider_strategy" {
    for_each = var.use_fargate_spot ? [1] : []
    content {
      capacity_provider = "FARGATE_SPOT"
      weight            = 100
      base              = 0
    }
  }

  network_configuration {
    subnets          = aws_subnet.public[*].id
    security_groups  = [aws_security_group.fargate.id]
    assign_public_ip = true # necesario para fargate sin nat
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.app.arn
    container_name   = "${local.app_name}-container"
    container_port   = var.container_port
  }

  # deployment_configuration {
  #   maximum_percent         = 200
  #   minimum_healthy_percent = 100
  # }

  health_check_grace_period_seconds = 60

  # esperar a que el alb este listo
  depends_on = [
    aws_lb_listener.http,
    aws_iam_role_policy.ecs_task_dynamodb
  ]

  tags = {
    Name = "${local.app_name}-service"
  }
}
