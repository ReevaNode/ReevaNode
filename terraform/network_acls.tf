# network_acls.tf
# Network ACLs (stateless firewall) para subnets publicas y privadas
# Requerimiento del examen de Redes de Computadores

# ==================== NACL PARA SUBNETS PUBLICAS ====================
# Subnet publica contiene ALB (Application Load Balancer)

resource "aws_network_acl" "public" {
  vpc_id = aws_vpc.main.id
  subnet_ids = [
    aws_subnet.public[0].id,
    aws_subnet.public[1].id
  ]

  tags = {
    Name = "${local.app_name}-public-nacl"
    Type = "Public"
  }
}

# INBOUND RULES - SUBNET PUBLICA

# Regla 100: HTTP desde Internet (para ALB)
resource "aws_network_acl_rule" "public_inbound_http" {
  network_acl_id = aws_network_acl.public.id
  rule_number    = 100
  protocol       = "tcp"
  rule_action    = "allow"
  cidr_block     = "0.0.0.0/0"
  from_port      = 80
  to_port        = 80
  egress         = false
}

# Regla 110: HTTPS desde Internet (para ALB)
resource "aws_network_acl_rule" "public_inbound_https" {
  network_acl_id = aws_network_acl.public.id
  rule_number    = 110
  protocol       = "tcp"
  rule_action    = "allow"
  cidr_block     = "0.0.0.0/0"
  from_port      = 443
  to_port        = 443
  egress         = false
}

# Regla 120: Puertos efimeros (respuestas de conexiones salientes)
# Necesario para ALB comunicarse con Fargate y recibir respuestas
resource "aws_network_acl_rule" "public_inbound_ephemeral" {
  network_acl_id = aws_network_acl.public.id
  rule_number    = 120
  protocol       = "tcp"
  rule_action    = "allow"
  cidr_block     = "0.0.0.0/0"
  from_port      = 1024
  to_port        = 65535
  egress         = false
}

# OUTBOUND RULES - SUBNET PUBLICA

# Regla 100: HTTP hacia Internet (health checks, etc.)
resource "aws_network_acl_rule" "public_outbound_http" {
  network_acl_id = aws_network_acl.public.id
  rule_number    = 100
  protocol       = "tcp"
  rule_action    = "allow"
  cidr_block     = "0.0.0.0/0"
  from_port      = 80
  to_port        = 80
  egress         = true
}

# Regla 110: HTTPS hacia Internet
resource "aws_network_acl_rule" "public_outbound_https" {
  network_acl_id = aws_network_acl.public.id
  rule_number    = 110
  protocol       = "tcp"
  rule_action    = "allow"
  cidr_block     = "0.0.0.0/0"
  from_port      = 443
  to_port        = 443
  egress         = true
}

# Regla 120: Puertos efimeros hacia Internet (respuestas HTTP/HTTPS a clientes)
# CRITICO: Permite al ALB responder a usuarios de Internet
resource "aws_network_acl_rule" "public_outbound_ephemeral" {
  network_acl_id = aws_network_acl.public.id
  rule_number    = 120
  protocol       = "tcp"
  rule_action    = "allow"
  cidr_block     = "0.0.0.0/0"
  from_port      = 1024
  to_port        = 65535
  egress         = true
}

# Regla 130: Trafico hacia subnets privadas (ALB -> Fargate containers)
resource "aws_network_acl_rule" "public_outbound_to_private" {
  network_acl_id = aws_network_acl.public.id
  rule_number    = 130
  protocol       = "tcp"
  rule_action    = "allow"
  cidr_block     = "10.0.0.0/16" # Todo el VPC
  from_port      = 1024
  to_port        = 65535
  egress         = true
}

# ==================== NACL PARA SUBNETS PRIVADAS ====================
# Subnet privada contiene Fargate containers (ECS tasks)

# Private NACLs disabled - no private subnets in current architecture
# resource "aws_network_acl" "private" {
#   vpc_id = aws_vpc.main.id
#   subnet_ids = [
#     # No private subnets defined
#   ]
#  
#   tags = {
#     Name = "${local.app_name}-private-nacl"
#     Type = "Private"
#   }
# }

# INBOUND RULES - SUBNET PRIVADA (DISABLED)

# Regla 100: Trafico desde subnets publicas (ALB -> containers)
# resource "aws_network_acl_rule" "private_inbound_from_public" {
#   network_acl_id = aws_network_acl.private.id
#   rule_number    = 100
#   protocol       = "tcp"
#   rule_action    = "allow"
#   cidr_block     = "10.0.0.0/16"  # Todo el VPC
#   from_port      = 1024
#   to_port        = 65535
#   egress         = false
# }

# Regla 110: Puertos efimeros (respuestas de conexiones salientes)
# Necesario para recibir respuestas de DynamoDB, Cognito, etc.
# resource "aws_network_acl_rule" "private_inbound_ephemeral" {
#   network_acl_id = aws_network_acl.private.id
#   rule_number    = 110
#   protocol       = "tcp"
#   rule_action    = "allow"
#   cidr_block     = "0.0.0.0/0"
#   from_port      = 1024
#   to_port        = 65535
#   egress         = false
# }

# OUTBOUND RULES - SUBNET PRIVADA (DISABLED)

# Regla 100: HTTP hacia Internet (via NAT Gateway)
# Para descargar paquetes npm, conectar a APIs externas
# resource "aws_network_acl_rule" "private_outbound_http" {
#   network_acl_id = aws_network_acl.private.id
#   rule_number    = 100
#   protocol       = "tcp"
#   rule_action    = "allow"
#   cidr_block     = "0.0.0.0/0"
#   from_port      = 80
#   to_port        = 80
#   egress         = true
# }

# Regla 110: HTTPS hacia Internet
# Para conectar a DynamoDB, Cognito, SNS (via VPC Endpoint o NAT)
# resource "aws_network_acl_rule" "private_outbound_https" {
#   network_acl_id = aws_network_acl.private.id
#   rule_number    = 110
#   protocol       = "tcp"
#   rule_action    = "allow"
#   cidr_block     = "0.0.0.0/0"
#   from_port      = 443
#   to_port        = 443
#   egress         = true
# }

# Regla 120: Trafico hacia subnets publicas (respuestas a ALB)
# resource "aws_network_acl_rule" "private_outbound_to_public" {
#   network_acl_id = aws_network_acl.private.id
#   rule_number    = 120
#   protocol       = "tcp"
#   rule_action    = "allow"
#   cidr_block     = "10.0.0.0/16"
#   from_port      = 1024
#   to_port        = 65535
#   egress         = true
# }

# ==================== OUTPUTS ====================

output "public_nacl_id" {
  description = "ID de la Network ACL para subnets publicas"
  value       = aws_network_acl.public.id
}

# output "private_nacl_id" {
#   description = "ID de la Network ACL para subnets privadas"
#   value       = aws_network_acl.private.id
# }

output "nacl_summary" {
  description = "Resumen de Network ACLs para evidencia de examen"
  value       = <<EOF

=== NETWORK ACLs CONFIGURADAS ===

SUBNET PUBLICA (ALB):
  - Inbound: HTTP (80), HTTPS (443), Ephemeral (1024-65535)
  - Outbound: HTTP (80), HTTPS (443), To Private Subnets (1024-65535)
  - Subnets: ${aws_subnet.public[0].id}, ${aws_subnet.public[1].id}

SUBNET PRIVADA (Fargate Containers):
  - Inbound: From Public Subnets (1024-65535), Ephemeral (1024-65535)
  - Outbound: HTTP (80), HTTPS (443), To Public Subnets (1024-65535)
  - Private NACLs: Disabled (no private subnets)

Tipo: Stateless (requiere reglas explicitas para inbound y outbound)
Nivel: Subnet-level firewall (complementa Security Groups)

EOF
}
