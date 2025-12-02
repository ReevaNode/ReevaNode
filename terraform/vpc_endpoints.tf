# vpc_endpoints.tf
# VPC Endpoints para acceso privado a servicios de AWS sin Internet
# Requerimiento del examen de Redes de Computadores

# ==================== VPC ENDPOINT PARA DYNAMODB ====================
# Endpoint tipo Gateway (sin costo adicional)
# Permite a Fargate containers acceder a DynamoDB sin pasar por NAT Gateway

resource "aws_vpc_endpoint" "dynamodb" {
  vpc_id       = aws_vpc.main.id
  service_name = "com.amazonaws.${var.aws_region}.dynamodb"

  # Gateway endpoints se asocian con route tables
  route_table_ids = [
    aws_route_table.public.id
  ]

  # Policy para acceso total a DynamoDB
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = "*"
      Action = [
        "dynamodb:BatchGetItem",
        "dynamodb:BatchWriteItem",
        "dynamodb:PutItem",
        "dynamodb:DeleteItem",
        "dynamodb:GetItem",
        "dynamodb:Query",
        "dynamodb:Scan",
        "dynamodb:UpdateItem",
        "dynamodb:DescribeTable"
      ]
      Resource = "*"
    }]
  })

  tags = {
    Name = "${local.app_name}-dynamodb-endpoint"
    Type = "Gateway"
  }
}

# ==================== VPC ENDPOINT PARA S3 ====================
# Endpoint tipo Gateway (sin costo adicional)
# Util para descargar paquetes npm desde mirrors en S3, backups, etc.

resource "aws_vpc_endpoint" "s3" {
  vpc_id       = aws_vpc.main.id
  service_name = "com.amazonaws.${var.aws_region}.s3"

  route_table_ids = [
    aws_route_table.public.id # Only public route table (no private subnets)
  ]

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = "*"
      Action    = "s3:*"
      Resource  = "*"
    }]
  })

  tags = {
    Name = "${local.app_name}-s3-endpoint"
    Type = "Gateway"
  }
}

# ==================== VPC ENDPOINT PARA ECR API ====================
# Endpoint tipo Interface (con costo por hora + GB transferencia)
# Necesario para que Fargate pueda descargar imagenes de ECR sin Internet

resource "aws_vpc_endpoint" "ecr_api" {
  vpc_id            = aws_vpc.main.id
  service_name      = "com.amazonaws.${var.aws_region}.ecr.api"
  vpc_endpoint_type = "Interface"

  # Interface endpoints requieren subnets y security group
  subnet_ids = [
    aws_subnet.public[0].id,
    aws_subnet.public[1].id
  ]

  security_group_ids = [
    aws_security_group.vpc_endpoints.id
  ]

  # Habilitar DNS privado para resolver nombres de ECR
  private_dns_enabled = true

  tags = {
    Name = "${local.app_name}-ecr-api-endpoint"
    Type = "Interface"
  }
}

# ==================== VPC ENDPOINT PARA ECR DKR ====================
# Endpoint para descargar las capas de imagenes Docker desde ECR

resource "aws_vpc_endpoint" "ecr_dkr" {
  vpc_id            = aws_vpc.main.id
  service_name      = "com.amazonaws.${var.aws_region}.ecr.dkr"
  vpc_endpoint_type = "Interface"

  subnet_ids = [
    aws_subnet.public[0].id,
    aws_subnet.public[1].id
  ]

  security_group_ids = [
    aws_security_group.vpc_endpoints.id
  ]

  private_dns_enabled = true

  tags = {
    Name = "${local.app_name}-ecr-dkr-endpoint"
    Type = "Interface"
  }
}

# ==================== VPC ENDPOINT PARA CLOUDWATCH LOGS ====================
# Para que Fargate pueda enviar logs sin Internet

resource "aws_vpc_endpoint" "logs" {
  vpc_id            = aws_vpc.main.id
  service_name      = "com.amazonaws.${var.aws_region}.logs"
  vpc_endpoint_type = "Interface"

  subnet_ids = [
    aws_subnet.public[0].id,
    aws_subnet.public[1].id
  ]

  security_group_ids = [
    aws_security_group.vpc_endpoints.id
  ]

  private_dns_enabled = true

  tags = {
    Name = "${local.app_name}-logs-endpoint"
    Type = "Interface"
  }
}

# ==================== SECURITY GROUP PARA VPC ENDPOINTS ====================
# Permite trafico HTTPS desde subnets privadas

resource "aws_security_group" "vpc_endpoints" {
  name        = "${local.app_name}-vpc-endpoints-sg"
  description = "Security group para VPC Endpoints (Interface type)"
  vpc_id      = aws_vpc.main.id

  # Permitir trafico HTTPS desde VPC
  ingress {
    description = "HTTPS from VPC"
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = [aws_vpc.main.cidr_block]
  }

  # Permitir todo el trafico saliente
  egress {
    description = "All outbound traffic"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "${local.app_name}-vpc-endpoints-sg"
  }
}

# ==================== OUTPUTS ====================

output "vpc_endpoints_summary" {
  description = "Resumen de VPC Endpoints para evidencia de examen"
  value       = <<EOF

=== VPC ENDPOINTS CONFIGURADOS ===

GATEWAY ENDPOINTS (sin costo):
  - DynamoDB: ${aws_vpc_endpoint.dynamodb.id}
    * Permite acceso privado a todas las tablas DynamoDB
    * Evita trafico por NAT Gateway (ahorro de costos)
  
  - S3: ${aws_vpc_endpoint.s3.id}
    * Acceso privado a buckets S3
    * Util para npm packages, backups, etc.

INTERFACE ENDPOINTS (con costo):
  - ECR API: ${aws_vpc_endpoint.ecr_api.id}
    * Autenticacion con ECR
  
  - ECR DKR: ${aws_vpc_endpoint.ecr_dkr.id}
    * Descarga de imagenes Docker
  
  - CloudWatch Logs: ${aws_vpc_endpoint.logs.id}
    * Envio de logs desde containers

Security Group: ${aws_security_group.vpc_endpoints.id}
  - Ingress: HTTPS (443) desde VPC (${aws_vpc.main.cidr_block})
  - Egress: All traffic

BENEFICIOS:
  - Mayor seguridad (trafico nunca sale de la red AWS)
  - Mejor rendimiento (menor latencia)
  - Ahorro de costos (sin NAT Gateway para DynamoDB/S3)
  - Cumple requisitos de compliance (datos privados)

EOF
}

output "dynamodb_endpoint_id" {
  description = "ID del VPC Endpoint para DynamoDB"
  value       = aws_vpc_endpoint.dynamodb.id
}

output "s3_endpoint_id" {
  description = "ID del VPC Endpoint para S3"
  value       = aws_vpc_endpoint.s3.id
}
