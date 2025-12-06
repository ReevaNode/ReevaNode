# Terraform - Infraestructura Reeva

## Prerequisitos

### 1. Configurar AWS CLI

```bash
aws configure
# Access Key ID
# Secret Access Key
# Region: us-east-1
# Output: json

# Verificar
aws sts get-caller-identity
```

### 2. Crear secretos en AWS Secrets Manager

Ver guía completa: [`SECRETS-SETUP.md`](./SECRETS-SETUP.md)

```bash
# Generar JWT y SESSION secrets
JWT_SECRET=$(openssl rand -hex 48)
SESSION_SECRET=$(openssl rand -hex 32)

# Crear secreto de aplicación
aws secretsmanager create-secret \
  --name dev-reeva-app-secrets \
  --description "Secretos de la app Reeva" \
  --secret-string "{
    \"JWT_SECRET\": \"$JWT_SECRET\",
    \"SESSION_SECRET\": \"$SESSION_SECRET\",
    \"TWILIO_ACCOUNT_SID\": \"ACxxxxxxxx\",
    \"TWILIO_AUTH_TOKEN\": \"xxxxxxxx\",
    \"OPENAI_API_KEY\": \"sk-proj-xxxxx\"
  }" \
  --region us-east-1

# Crear credenciales de admin
aws secretsmanager create-secret \
  --name dev-reeva-admin-credentials \
  --description "Usuario admin inicial" \
  --secret-string '{
    "ADMIN_EMAIL": "admin@ejemplo.com",
    "ADMIN_PASSWORD": "Password123!"
  }' \
  --region us-east-1
```

### 3. Desplegar infraestructura

```bash
terraform init
terraform plan
terraform apply
```

---

## Archivos principales

- `main.tf` - Provider AWS
- `variables.tf` - Variables
- `outputs.tf` - Outputs
- `secrets.tf` - Secrets Manager
- `cognito.tf` - Autenticación
- `dynamodb.tf` - 20 tablas
- `vpc.tf` - Networking
- `alb.tf` - Load balancer
- `ecs.tf` - Containers
- `iam.tf` - Permisos
- `security_groups.tf` - Firewall
- `cloudwatch.tf` - Monitoreo
- `waf.tf` - Protección web

---

## Recursos creados

- 20 tablas DynamoDB
- Cognito User Pool + admin user
- VPC completa
- Application Load Balancer
- ECS Cluster + Service
- Security Groups + NACL
- CloudWatch Alarms
- WAF
- VPC Endpoints

**Total: ~60-65 recursos**

---

## Costos estimados

- ECS Fargate: ~$15-20/mes
- ALB: ~$20/mes
- DynamoDB: ~$5/mes
- Secrets Manager: ~$1/mes
- **Total: ~$45-50/mes**

---

## Comandos útiles

```bash
# Ver outputs
terraform output

# Ver cambios
terraform plan

# Aplicar cambios
terraform apply

# Destruir todo
terraform destroy
```

---

## Documentación

- [Guía de despliegue](../seguridad-nube/DEPLOYMENT-GUIDE.md)
- [Configuración de secretos](./SECRETS-SETUP.md)
- [Arquitectura](../seguridad-nube/ARQUITECTURA-EXPLICADA.md)
