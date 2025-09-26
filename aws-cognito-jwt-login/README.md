# Ejemplo: Login con Cognito y JWT (Serverless + Node.js)

Backend mínimo que crea un **Cognito User Pool** y expone tres endpoints:
- `POST /auth/login` → autentica `username/password` y devuelve **JWTs** (id/access/refresh)
- `POST /auth/refresh` → devuelve nuevos `id/access` usando **refresh_token**
- `GET /me` → endpoint **protegido** por JWT Authorizer; devuelve las **claims** del token

> API Gateway valida el JWT de Cognito automáticamente (no necesitas verificarlo en tu Lambda).

## Requisitos
- Node.js 18+
- Credenciales AWS (`aws configure`) con permisos para CloudFormation/Lambda/API GW/Cognito
- Serverless Framework v3 (o usa `npx serverless ...`)

## Despliegue rápido (dev/us-east-1)
```bash
npm i
npm run deploy
# o
npx serverless deploy --stage dev --region us-east-1
```

Obtén las URLs:
```bash
npm run info
```

## Crear un usuario de prueba (vía AWS CLI)
Primero, recupera los IDs (también están en la salida del deploy):
```bash
USER_POOL_ID=$(aws cloudformation describe-stacks --stack-name aws-cognito-jwt-login-dev   --query "Stacks[0].Outputs[?OutputKey=='UserPoolId'].OutputValue" --output text)

CLIENT_ID=$(aws cloudformation describe-stacks --stack-name aws-cognito-jwt-login-dev   --query "Stacks[0].Outputs[?OutputKey=='UserPoolClientId'].OutputValue" --output text)
```

Crea usuario y asigna contraseña permanente (sin correo de verificación, para pruebas):
```bash
aws cognito-idp admin-create-user   --user-pool-id "$USER_POOL_ID"   --username "alice@example.com"   --user-attributes Name=email,Value="alice@example.com"   --message-action SUPPRESS

aws cognito-idp admin-set-user-password   --user-pool-id "$USER_POOL_ID"   --username "alice@example.com"   --password "Passw0rd!"   --permanent
```

## Probar login y endpoints
Guarda la URL base de tu API (HttpApiUrl) en una variable `BASE`:
```bash
BASE=$(npx serverless info --verbose | grep HttpApiUrl | awk '{print $2}')
```

### 1) Login
```bash
TOKENS=$(curl -s -X POST "$BASE/auth/login"   -H 'content-type: application/json'   -d '{"username":"alice@example.com","password":"Passw0rd!"}')

echo $TOKENS | jq
ID_TOKEN=$(echo $TOKENS | jq -r .idToken)
ACCESS_TOKEN=$(echo $TOKENS | jq -r .accessToken)
REFRESH_TOKEN=$(echo $TOKENS | jq -r .refreshToken)
```

### 2) Llamar un endpoint protegido
```bash
curl -s "$BASE/me" -H "authorization: Bearer $ID_TOKEN" | jq
```

### 3) Refrescar tokens
```bash
curl -s -X POST "$BASE/auth/refresh"   -H 'content-type: application/json'   -d "{"refreshToken":"$REFRESH_TOKEN"}" | jq
```

## Notas
- El authorizer de API Gateway valida **firma**, **audience (ClientId)** y **issuer (UserPool)**.
- Si obtienes `403` con `challenge: NEW_PASSWORD_REQUIRED`, el usuario requiere cambio de contraseña (flujo no cubierto aquí).
- Para **signup/confirmación** con correo/SMS, usa los endpoints de Cognito `SignUp`/`ConfirmSignUp` o el Hosted UI.
- `serverless offline` no emula el JWT authorizer; usa despliegue real para `/me`.

## Limpieza
```bash
npm run remove
```
