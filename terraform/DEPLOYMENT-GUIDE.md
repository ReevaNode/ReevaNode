# Guía de Despliegue

## Prerequisitos

```bash
# Verificar herramientas instaladas
aws --version
terraform --version
docker --version
```

### Configurar AWS CLI

```bash
aws configure
# Access Key ID
# Secret Access Key
# Region: us-east-1
# Output: json

# Verificar
aws sts get-caller-identity
```

---

## Configurar Secretos

### Generar valores aleatorios

```bash
JWT_SECRET=$(openssl rand -hex 48)
SESSION_SECRET=$(openssl rand -hex 32)
```

### Crear secreto de aplicación

```bash
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
```

### Crear credenciales de admin

```bash
aws secretsmanager create-secret \
  --name dev-reeva-admin-credentials \
  --description "Usuario admin inicial" \
  --secret-string '{
    "ADMIN_EMAIL": "admin@ejemplo.com",
    "ADMIN_PASSWORD": "Password123!"
  }' \
  --region us-east-1
```

### Verificar

```bash
aws secretsmanager list-secrets --region us-east-1 --query 'SecretList[?contains(Name, `reeva`)].Name'
```

---

## Desplegar con Terraform

```bash
cd terraform

# Inicializar
terraform init

# Ver recursos a crear
terraform plan

# Crear infraestructura (5-10 min)
terraform apply

# Guardar outputs
terraform output alb_dns_name
terraform output ecr_repository_url
terraform output cognito_user_pool_id
```

---

## Build y Deploy Docker

```bash
cd ../Reeva_node

# Autenticar con ECR
aws ecr get-login-password --region us-east-1 | \
  docker login --username AWS --password-stdin \
  402341712953.dkr.ecr.us-east-1.amazonaws.com

# Build
docker build -t reeva-dev-app:latest .

# Tag y push
docker tag reeva-dev-app:latest 402341712953.dkr.ecr.us-east-1.amazonaws.com/reeva-dev-app:latest
docker push 402341712953.dkr.ecr.us-east-1.amazonaws.com/reeva-dev-app:latest
```

---

## Verificar Despliegue

### Forzar deployment

```bash
cd ../terraform
aws ecs update-service \
  --cluster reeva-dev-cluster \
  --service reeva-dev-service \
  --force-new-deployment \
  --region us-east-1
```

### Monitorear servicio

```bash
aws ecs describe-services \
  --cluster reeva-dev-cluster \
  --services reeva-dev-service \
  --query 'services[0].{runningCount:runningCount,desiredCount:desiredCount,status:status}' \
  --region us-east-1
```

### Health check

```bash
ALB_URL=$(terraform output -raw alb_dns_name)
curl -s http://$ALB_URL/health
```

### Verificar seed de tipoestado

```bash
aws dynamodb scan \
  --table-name tipoestado \
  --query 'Items[*].{ID:idTipoEstado.S,Estado:estado.S}' \
  --output table \
  --region us-east-1
```

---

## Login

```bash
# Obtener URL
terraform output alb_dns_name
```

Abrir en navegador: `http://[ALB_DNS]/login`

Credenciales: las configuradas en `dev-reeva-admin-credentials`

---

## Destruir y Recrear

```bash
# Destruir todo
terraform destroy

# Recrear
terraform apply
```

**Nota:** Después de recrear, hacer build y push de Docker nuevamente.

---

**Región:** us-east-1  
**Environment:** dev
