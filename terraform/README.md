# Reeva - Terraform Infrastructure

Infraestructura como codigo para desplegar Reeva en AWS Fargate.

## Arquitectura

- **ECS Fargate**: Container corriendo la app Node.js
- **Application Load Balancer**: Endpoint publico (reemplaza ngrok)
- **DynamoDB**: 13 tablas (agenda, box, usuarios, etc)
- **ECR**: Repositorio privado para imagenes Docker
- **VPC**: Networking aislado con subnets publicas
- **CloudWatch**: Logs y monitoreo

## Costos Estimados

- Fargate Spot (1 replica): ~$7/mes
- ALB: ~$8/mes
- DynamoDB (free tier): $0-2/mes
- **Total: ~$15-17/mes** (cubierto por creditos gratis)

## Prerequisites

1. AWS CLI configurado:
```bash
aws configure
```

2. Terraform instalado:
```bash
# linux
wget https://releases.hashicorp.com/terraform/1.9.0/terraform_1.9.0_linux_amd64.zip
unzip terraform_1.9.0_linux_amd64.zip
sudo mv terraform /usr/local/bin/
terraform version
```

3. Docker instalado y corriendo

## Setup

1. Copiar archivo de variables:
```bash
cd terraform/
cp terraform.tfvars.example terraform.tfvars
```

2. Editar `terraform.tfvars` con tus credenciales:
```hcl
twilio_account_sid = "ACxxxxxxxxxx"
twilio_auth_token = "xxxxxxxx"
twilio_whatsapp_from = "whatsapp:+14155238886"
openai_api_key = "sk-proj-xxxxxxxx"
jwt_secret = "tu-secret-seguro"
```

3. Inicializar Terraform:
```bash
terraform init
```

## Deployment

### 1. Preview de cambios
```bash
terraform plan
```

### 2. Desplegar infraestructura
```bash
terraform apply
# escribir "yes" cuando pregunte
```

Esto crea:
- VPC + Subnets + Security Groups
- 13 tablas DynamoDB
- ECS Cluster + Task Definition + Service
- Application Load Balancer
- ECR Repository
- IAM Roles
- CloudWatch Logs
- Budget Alarm

**Tiempo estimado: 3-5 minutos**

### 3. Build y push de imagen Docker

Copiar comandos del output de terraform o ejecutar:

```bash
cd ../Reeva_node

# login a ecr
aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin <ECR_URL>

# build
docker build -t reeva-dev .

# tag
docker tag reeva-dev:latest <ECR_URL>:latest

# push
docker push <ECR_URL>:latest
```

### 4. Force redeploy del servicio

```bash
aws ecs update-service \
  --cluster reeva-dev-cluster \
  --service reeva-dev-service \
  --force-new-deployment
```

### 5. Verificar deployment

```bash
# ver logs en tiempo real
aws logs tail /ecs/reeva-dev --follow

# check service status
aws ecs describe-services \
  --cluster reeva-dev-cluster \
  --services reeva-dev-service \
  --query 'services[0].deployments'
```

### 6. Probar la app

```bash
# obtener ALB URL del output
terraform output alb_url

# health check
curl http://<ALB-DNS>/health

# test chatbot
curl -X POST http://<ALB-DNS>/chatbot/test \
  -H "Content-Type: application/json" \
  -d '{"message": "hola"}'
```

### 7. Configurar Twilio Webhook

1. Ir a Twilio Console > WhatsApp > Sandbox
2. Webhook URL: `http://<ALB-DNS>/chatbot/webhook`
3. Method: POST
4. Guardar

## Manageme

nt

### Ver logs
```bash
aws logs tail /ecs/reeva-dev --follow
```

### Escalar servicio
```bash
# escalar a 2 replicas
aws ecs update-service \
  --cluster reeva-dev-cluster \
  --service reeva-dev-service \
  --desired-count 2

# pausar (0 replicas, no se cobra fargate)
aws ecs update-service \
  --cluster reeva-dev-cluster \
  --service reeva-dev-service \
  --desired-count 0
```

### Actualizar imagen
```bash
# rebuild y push
docker build -t reeva-dev .
docker tag reeva-dev:latest <ECR_URL>:latest
docker push <ECR_URL>:latest

# force redeploy
aws ecs update-service \
  --cluster reeva-dev-cluster \
  --service reeva-dev-service \
  --force-new-deployment
```

### Destruir TODO
```bash
# WARNING: elimina toda la infraestructura
terraform destroy
```

## Variables de Entorno

El task definition inyecta automaticamente:
- `NODE_ENV=dev`
- `PORT=3001`
- `AWS_REGION=us-east-1`
- Todas las tablas DynamoDB
- Credenciales de Twilio
- API Key de OpenAI
- JWT Secret
- `CHATBOT_URL_BASE=http://<ALB-DNS>`

## Troubleshooting

### Service no inicia
```bash
# ver eventos del service
aws ecs describe-services \
  --cluster reeva-dev-cluster \
  --services reeva-dev-service \
  --query 'services[0].events[:5]'

# ver logs
aws logs tail /ecs/reeva-dev --follow
```

### Health check failing
```bash
# verificar que /health responda
curl http://<ALB-DNS>/health

# ver target health
aws elbv2 describe-target-health \
  --target-group-arn <TARGET-GROUP-ARN>
```

### Costos muy altos
```bash
# ver costos actuales
aws ce get-cost-and-usage \
  --time-period Start=2025-01-01,End=2025-01-31 \
  --granularity MONTHLY \
  --metrics UnblendedCost

# pausar servicio
aws ecs update-service --desired-count 0
```

## Estructura de Archivos

```
terraform/
├── main.tf              # provider config
├── variables.tf         # variables
├── outputs.tf           # outputs
├── terraform.tfvars     # valores (NO commitear)
├── vpc.tf              # networking
├── ecr.tf              # container registry
├── iam.tf              # roles y policies
├── dynamodb.tf         # tablas
├── alb.tf              # load balancer
├── ecs.tf              # fargate
└── budget.tf           # alertas de costo
```

## Security

- **NO commitear `terraform.tfvars`** (contiene secrets)
- Task execution role tiene minimos permisos
- Security groups solo permiten trafico necesario
- DynamoDB usa encryption at rest por defecto

## Next Steps

1. Agregar dominio personalizado (Route53 + ACM)
2. HTTPS en ALB
3. Auto-scaling basado en CPU
4. Secrets Manager para credenciales
5. CI/CD con GitHub Actions
