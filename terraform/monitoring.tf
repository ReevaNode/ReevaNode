# monitoring.tf
# CloudWatch Alarms para monitoreo y redundancia
# Requerimiento del examen de Redes de Computadores

# ==================== SNS TOPIC PARA ALERTAS ====================
# Canal de notificaciones para todas las alarmas

resource "aws_sns_topic" "alerts" {
  name = "${local.app_name}-alerts"

  tags = {
    Name = "${local.app_name}-alerts-topic"
  }
}

# Suscripcion por email (opcional - requiere confirmacion manual)
# resource "aws_sns_topic_subscription" "alerts_email" {
#   topic_arn = aws_sns_topic.alerts.arn
#   protocol  = "email"
#   endpoint  = "admin@example.com"  # Cambiar por email real
# }

# ==================== ALARMAS DEL APPLICATION LOAD BALANCER ====================

# Alarma: Hosts no saludables en el Target Group
resource "aws_cloudwatch_metric_alarm" "alb_unhealthy_hosts" {
  alarm_name          = "${local.app_name}-alb-unhealthy-hosts"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = "2"
  metric_name         = "UnHealthyHostCount"
  namespace           = "AWS/ApplicationELB"
  period              = "60" # 1 minuto
  statistic           = "Average"
  threshold           = "0"
  alarm_description   = "Alerta cuando hay hosts no saludables en el Target Group"

  dimensions = {
    LoadBalancer = aws_lb.main.arn_suffix
    TargetGroup  = aws_lb_target_group.app.arn_suffix
  }

  alarm_actions = [aws_sns_topic.alerts.arn]
  ok_actions    = [aws_sns_topic.alerts.arn]

  tags = {
    Name = "${local.app_name}-alb-unhealthy-hosts-alarm"
  }
}

# Alarma: Tiempo de respuesta alto
resource "aws_cloudwatch_metric_alarm" "alb_target_response_time" {
  alarm_name          = "${local.app_name}-alb-high-response-time"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = "2"
  metric_name         = "TargetResponseTime"
  namespace           = "AWS/ApplicationELB"
  period              = "60"
  statistic           = "Average"
  threshold           = "2" # 2 segundos
  alarm_description   = "Alerta cuando el tiempo de respuesta promedio supera 2 segundos"

  dimensions = {
    LoadBalancer = aws_lb.main.arn_suffix
    TargetGroup  = aws_lb_target_group.app.arn_suffix
  }

  alarm_actions = [aws_sns_topic.alerts.arn]
  ok_actions    = [aws_sns_topic.alerts.arn]

  tags = {
    Name = "${local.app_name}-alb-response-time-alarm"
  }
}

# Alarma: Errores HTTP 5xx del ALB
resource "aws_cloudwatch_metric_alarm" "alb_5xx_errors" {
  alarm_name          = "${local.app_name}-alb-5xx-errors"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = "2"
  metric_name         = "HTTPCode_Target_5XX_Count"
  namespace           = "AWS/ApplicationELB"
  period              = "60"
  statistic           = "Sum"
  threshold           = "10" # Mas de 10 errores en 1 minuto
  alarm_description   = "Alerta cuando hay mas de 10 errores 5xx en un minuto"
  treat_missing_data  = "notBreaching"

  dimensions = {
    LoadBalancer = aws_lb.main.arn_suffix
    TargetGroup  = aws_lb_target_group.app.arn_suffix
  }

  alarm_actions = [aws_sns_topic.alerts.arn]
  ok_actions    = [aws_sns_topic.alerts.arn]

  tags = {
    Name = "${local.app_name}-alb-5xx-errors-alarm"
  }
}

# Alarma: Request Count muy bajo (posible problema de red/DNS)
resource "aws_cloudwatch_metric_alarm" "alb_low_request_count" {
  alarm_name          = "${local.app_name}-alb-low-request-count"
  comparison_operator = "LessThanThreshold"
  evaluation_periods  = "3"
  metric_name         = "RequestCount"
  namespace           = "AWS/ApplicationELB"
  period              = "300" # 5 minutos
  statistic           = "Sum"
  threshold           = "1"
  alarm_description   = "Alerta cuando no hay requests por 15 minutos (posible problema)"
  treat_missing_data  = "breaching"

  dimensions = {
    LoadBalancer = aws_lb.main.arn_suffix
  }

  alarm_actions = [aws_sns_topic.alerts.arn]

  tags = {
    Name = "${local.app_name}-alb-low-requests-alarm"
  }
}

# ==================== ALARMAS DE ECS FARGATE ====================

# Alarma: CPU Utilization alta
resource "aws_cloudwatch_metric_alarm" "ecs_cpu_high" {
  alarm_name          = "${local.app_name}-ecs-cpu-high"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = "2"
  metric_name         = "CPUUtilization"
  namespace           = "AWS/ECS"
  period              = "60"
  statistic           = "Average"
  threshold           = "80" # 80%
  alarm_description   = "Alerta cuando el uso de CPU promedio supera 80%"

  dimensions = {
    ClusterName = aws_ecs_cluster.main.name
    ServiceName = aws_ecs_service.app.name
  }

  alarm_actions = [aws_sns_topic.alerts.arn]
  ok_actions    = [aws_sns_topic.alerts.arn]

  tags = {
    Name = "${local.app_name}-ecs-cpu-alarm"
  }
}

# Alarma: Memory Utilization alta
resource "aws_cloudwatch_metric_alarm" "ecs_memory_high" {
  alarm_name          = "${local.app_name}-ecs-memory-high"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = "2"
  metric_name         = "MemoryUtilization"
  namespace           = "AWS/ECS"
  period              = "60"
  statistic           = "Average"
  threshold           = "80" # 80%
  alarm_description   = "Alerta cuando el uso de memoria promedio supera 80%"

  dimensions = {
    ClusterName = aws_ecs_cluster.main.name
    ServiceName = aws_ecs_service.app.name
  }

  alarm_actions = [aws_sns_topic.alerts.arn]
  ok_actions    = [aws_sns_topic.alerts.arn]

  tags = {
    Name = "${local.app_name}-ecs-memory-alarm"
  }
}

# Alarma: Task count muy bajo (menor que desired count)
resource "aws_cloudwatch_metric_alarm" "ecs_task_count_low" {
  alarm_name          = "${local.app_name}-ecs-task-count-low"
  comparison_operator = "LessThanThreshold"
  evaluation_periods  = "1"
  metric_name         = "RunningTaskCount"
  namespace           = "ECS/ContainerInsights"
  period              = "60"
  statistic           = "Average"
  threshold           = "2" # Menos de 2 tareas corriendo
  alarm_description   = "Alerta cuando hay menos de 2 tareas ECS corriendo"
  treat_missing_data  = "breaching"

  dimensions = {
    ClusterName = aws_ecs_cluster.main.name
    ServiceName = aws_ecs_service.app.name
  }

  alarm_actions = [aws_sns_topic.alerts.arn]

  tags = {
    Name = "${local.app_name}-ecs-task-count-alarm"
  }
}

# ==================== ALARMAS DE DYNAMODB ====================

# Alarma: Errores de throttling (usuario)
resource "aws_cloudwatch_metric_alarm" "dynamodb_user_throttle" {
  alarm_name          = "${local.app_name}-dynamodb-throttle-usuario"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = "2"
  metric_name         = "UserErrors"
  namespace           = "AWS/DynamoDB"
  period              = "60"
  statistic           = "Sum"
  threshold           = "10"
  alarm_description   = "Alerta cuando hay errores de throttling en tabla usuario"
  treat_missing_data  = "notBreaching"

  dimensions = {
    TableName = "usuario"
  }

  alarm_actions = [aws_sns_topic.alerts.arn]

  tags = {
    Name = "${local.app_name}-dynamodb-throttle-alarm"
  }
}

# ==================== DASHBOARD DE CLOUDWATCH ====================

resource "aws_cloudwatch_dashboard" "main" {
  dashboard_name = "${local.app_name}-dashboard"

  dashboard_body = jsonencode({
    widgets = [
      # ALB Metrics
      {
        type = "metric"
        properties = {
          metrics = [
            ["AWS/ApplicationELB", "RequestCount", { stat = "Sum", label = "Total Requests" }],
            [".", "TargetResponseTime", { stat = "Average", label = "Response Time (avg)" }],
            [".", "HTTPCode_Target_2XX_Count", { stat = "Sum", label = "2xx Responses" }],
            [".", "HTTPCode_Target_5XX_Count", { stat = "Sum", label = "5xx Errors" }]
          ]
          period = 60
          region = var.aws_region
          title  = "ALB Performance"
        }
      },
      # ECS Metrics
      {
        type = "metric"
        properties = {
          metrics = [
            ["AWS/ECS", "CPUUtilization", { stat = "Average", label = "CPU %" }],
            [".", "MemoryUtilization", { stat = "Average", label = "Memory %" }]
          ]
          period = 60
          region = var.aws_region
          title  = "ECS Resource Utilization"
        }
      },
      # Target Health
      {
        type = "metric"
        properties = {
          metrics = [
            ["AWS/ApplicationELB", "HealthyHostCount", { stat = "Average", label = "Healthy Hosts" }],
            [".", "UnHealthyHostCount", { stat = "Average", label = "Unhealthy Hosts" }]
          ]
          period = 60
          region = var.aws_region
          title  = "Target Group Health"
        }
      }
    ]
  })
}

# ==================== OUTPUTS ====================

output "sns_topic_arn" {
  description = "ARN del SNS Topic para alertas"
  value       = aws_sns_topic.alerts.arn
}

output "cloudwatch_dashboard_url" {
  description = "URL del CloudWatch Dashboard"
  value       = "https://console.aws.amazon.com/cloudwatch/home?region=${var.aws_region}#dashboards:name=${aws_cloudwatch_dashboard.main.dashboard_name}"
}

output "monitoring_summary" {
  description = "Resumen de monitoreo para evidencia de examen"
  value       = <<EOF

=== MONITOREO Y ALARMAS CLOUDWATCH ===

SNS TOPIC: ${aws_sns_topic.alerts.arn}
  - Canal de notificaciones para todas las alarmas

ALARMAS ALB:
  1. Unhealthy Hosts: ${aws_cloudwatch_metric_alarm.alb_unhealthy_hosts.alarm_name}
     - Threshold: > 0 hosts no saludables
  
  2. High Response Time: ${aws_cloudwatch_metric_alarm.alb_target_response_time.alarm_name}
     - Threshold: > 2 segundos promedio
  
  3. 5xx Errors: ${aws_cloudwatch_metric_alarm.alb_5xx_errors.alarm_name}
     - Threshold: > 10 errores por minuto
  
  4. Low Request Count: ${aws_cloudwatch_metric_alarm.alb_low_request_count.alarm_name}
     - Threshold: < 1 request en 15 minutos

ALARMAS ECS:
  1. High CPU: ${aws_cloudwatch_metric_alarm.ecs_cpu_high.alarm_name}
     - Threshold: > 80% utilization
  
  2. High Memory: ${aws_cloudwatch_metric_alarm.ecs_memory_high.alarm_name}
     - Threshold: > 80% utilization
  
  3. Low Task Count: ${aws_cloudwatch_metric_alarm.ecs_task_count_low.alarm_name}
     - Threshold: < 2 tareas corriendo

ALARMAS DYNAMODB:
  1. Throttling: ${aws_cloudwatch_metric_alarm.dynamodb_user_throttle.alarm_name}
     - Threshold: > 10 errores por minuto

DASHBOARD: ${aws_cloudwatch_dashboard.main.dashboard_name}
  - URL: https://console.aws.amazon.com/cloudwatch/home?region=${var.aws_region}#dashboards:name=${aws_cloudwatch_dashboard.main.dashboard_name}

BENEFICIOS:
  - Deteccion automatica de problemas
  - Notificaciones en tiempo real via SNS
  - Metricas historicas para analisis
  - Dashboard unificado para visualizacion
  - Cumple requisitos de observabilidad del examen

EOF
}
