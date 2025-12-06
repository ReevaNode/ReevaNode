# Configuración de Secretos

## Prerequisitos

- AWS CLI configurado
- Permisos en Secrets Manager

## Secretos requeridos

### 1. dev-reeva-app-secrets

```bash
# Generar JWT y SESSION secrets
JWT_SECRET=$(openssl rand -hex 48)
SESSION_SECRET=$(openssl rand -hex 32)

# Crear secreto
aws secretsmanager create-secret \
  --name dev-reeva-app-secrets \
  --description "Secretos de la app Reeva" \
  --secret-string "{
    \"JWT_SECRET\": \"$JWT_SECRET\",
    \"SESSION_SECRET\": \"$SESSION_SECRET\",
    \"TWILIO_ACCOUNT_SID\": \"ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx\",
    \"TWILIO_AUTH_TOKEN\": \"xxxxxxxx\",
    \"OPENAI_API_KEY\": \"sk-proj-xxxxx\"
  }" \
  --region us-east-1
```

**Campos:**
- `JWT_SECRET`: 48+ caracteres
- `SESSION_SECRET`: 32+ caracteres
- `TWILIO_ACCOUNT_SID`: Account SID de Twilio
- `TWILIO_AUTH_TOKEN`: Auth Token de Twilio
- `OPENAI_API_KEY`: API key de OpenAI

### 2. dev-reeva-admin-credentials

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

**Requisitos de contraseña:**
- Mínimo 8 caracteres
- Al menos una mayúscula
- Al menos una minúscula
- Al menos un número

---

## Verificar

```bash
# Listar secretos
aws secretsmanager list-secrets --region us-east-1

# Ver metadata
aws secretsmanager describe-secret --secret-id dev-reeva-app-secrets --region us-east-1

# Ver valor
aws secretsmanager get-secret-value --secret-id dev-reeva-app-secrets --region us-east-1 --query SecretString --output text
```

---

## Actualizar

```bash
aws secretsmanager put-secret-value \
  --secret-id dev-reeva-app-secrets \
  --secret-string '{
    "JWT_SECRET": "nuevo-valor",
    "SESSION_SECRET": "nuevo-valor",
    "TWILIO_ACCOUNT_SID": "ACxxxxxxxx",
    "TWILIO_AUTH_TOKEN": "xxxxxxxx",
    "OPENAI_API_KEY": "sk-proj-xxxxx"
  }' \
  --region us-east-1

# Reiniciar ECS para aplicar cambios
cd terraform
aws ecs update-service \
  --cluster $(terraform output -raw ecs_cluster_name) \
  --service $(terraform output -raw ecs_service_name) \
  --force-new-deployment
```

---

## Eliminar

```bash
aws secretsmanager delete-secret \
  --secret-id dev-reeva-app-secrets \
  --force-delete-without-recovery \
  --region us-east-1
```

---

## Costos

- $0.40 por secreto/mes
- $0.05 por 10,000 llamadas API

**Total: ~$0.80/mes**

---

## Errores comunes

### "Secret already exists"

```bash
# Eliminar
aws secretsmanager delete-secret --secret-id <nombre> --force-delete-without-recovery

# O actualizar
aws secretsmanager put-secret-value --secret-id <nombre> --secret-string '{...}'
```

### "AccessDeniedException"

Permisos IAM requeridos:
```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Action": [
      "secretsmanager:CreateSecret",
      "secretsmanager:PutSecretValue",
      "secretsmanager:GetSecretValue",
      "secretsmanager:DescribeSecret"
    ],
    "Resource": "*"
  }]
}
```

### "Secret not found"

Verificar:
- Nombre exacto: `dev-reeva-app-secrets`
- Región: `us-east-1`
- `aws secretsmanager list-secrets`
