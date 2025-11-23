# outputs.tf
# outputs importantes despues del deploy

output "ecr_repository_url" {
  description = "url del repositorio ecr para pushear imagenes"
  value       = aws_ecr_repository.app.repository_url
}

output "alb_dns_name" {
  description = "dns del alb (usar para twilio webhook)"
  value       = aws_lb.main.dns_name
}

output "alb_url" {
  description = "url completa del alb"
  value       = "http://${aws_lb.main.dns_name}"
}

output "chatbot_webhook_url" {
  description = "url del webhook para twilio"
  value       = "http://${aws_lb.main.dns_name}/chatbot/webhook"
}

output "ecs_cluster_name" {
  description = "nombre del cluster ecs"
  value       = aws_ecs_cluster.main.name
}

output "ecs_service_name" {
  description = "nombre del service ecs"
  value       = aws_ecs_service.app.name
}

output "cloudwatch_log_group" {
  description = "log group para ver logs"
  value       = aws_cloudwatch_log_group.app.name
}

output "dynamodb_tables" {
  description = "nombres de las tablas dynamodb creadas"
  value = {
    agenda           = aws_dynamodb_table.agenda.name
    box              = aws_dynamodb_table.box.name
    estadobox        = aws_dynamodb_table.estadobox.name
    items            = aws_dynamodb_table.items.name
    personalizacion  = aws_dynamodb_table.personalizacion.name
    registroagenda   = aws_dynamodb_table.registroagenda.name
    tipobox          = aws_dynamodb_table.tipobox.name
    tipoconsulta     = aws_dynamodb_table.tipoconsulta.name
    tipoestado       = aws_dynamodb_table.tipoestado.name
    tipoitem         = aws_dynamodb_table.tipoitem.name
    tipoprofesional  = aws_dynamodb_table.tipoprofesional.name
    tipousuario      = aws_dynamodb_table.tipousuario.name
    usuario          = aws_dynamodb_table.usuario.name
  }
}

output "deployment_instructions" {
  description = "instrucciones para deployment"
  value = <<EOF

=== NEXT STEPS ===

1. Build and push Docker image:
   cd ../Reeva_node
   aws ecr get-login-password --region ${var.aws_region} | docker login --username AWS --password-stdin ${aws_ecr_repository.app.repository_url}
   docker build -t ${local.app_name} .
   docker tag ${local.app_name}:latest ${aws_ecr_repository.app.repository_url}:latest
   docker push ${aws_ecr_repository.app.repository_url}:latest

2. Force ECS service to redeploy:
   aws ecs update-service --cluster ${aws_ecs_cluster.main.name} --service ${aws_ecs_service.app.name} --force-new-deployment

3. Configure Twilio webhook:
   URL: http://${aws_lb.main.dns_name}/chatbot/webhook

4. View logs:
   aws logs tail ${aws_cloudwatch_log_group.app.name} --follow

5. Check service status:
   aws ecs describe-services --cluster ${aws_ecs_cluster.main.name} --services ${aws_ecs_service.app.name}

EOF
}
