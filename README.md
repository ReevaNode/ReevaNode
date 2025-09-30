# Reeva - Sistema de Gestión Hospitalaria

Sistema de gestión para hospitales que permite administrar boxes, agendas médicas, usuarios y elementos de inventario usando Node.js, Express, DynamoDB y AWS Cognito.

## Tabla de Contenidos

- [Arquitectura del Sistema](#arquitectura-del-sistema)
- [Prerrequisitos](#prerrequisitos)
- [Configuración Inicial](#configuración-inicial)
- [Despliegue de Base de Datos (DynamoDB)](#despliegue-de-base-de-datos-dynamodb)
- [Configuración de Autenticación (AWS Cognito)](#configuración-de-autenticación-aws-cognito)
- [Ejecución de la Aplicación](#ejecución-de-la-aplicación)
- [Uso del Sistema](#uso-del-sistema)
- [API Endpoints](#api-endpoints)
- [Estructura del Proyecto](#estructura-del-proyecto)
- [Troubleshooting](#troubleshooting)

## Arquitectura del Sistema

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Frontend      │    │   Backend       │    │   AWS Services  │
│   (EJS Views)   │◄──►│   (Express.js)  │◄──►│                 │
│                 │    │                 │    │  • DynamoDB     │
└─────────────────┘    └─────────────────┘    │  • Cognito      │
                                              │  • Lambda       │
                                              └─────────────────┘
```

## Prerrequisitos

### Software Requerido
- **Node.js** v18+ y npm
- **AWS CLI** configurado
- **Git**
- **Serverless Framework** v4+

### Cuentas y Credenciales
- Cuenta de AWS con permisos para DynamoDB, Lambda, Cognito y CloudFormation
- AWS CLI configurado con credenciales válidas

### Verificación de Instalación
```bash
# Verificar versiones
node --version          # v18+
npm --version          # 8+
aws --version          # 2.0+
serverless --version   # 4.0+

# Verificar configuración AWS
aws sts get-caller-identity
```

## Configuración Inicial

### 1. Clonar el Repositorio
```bash
git clone [URL_DEL_REPOSITORIO]
cd ReevaNode/Reeva_node
```

### 2. Instalar Dependencias de la Aplicación Principal
```bash
# Instalar dependencias del backend
npm install

# Instalar dependencias del módulo serverless-dynamo
cd serverless-dynamo
npm install
cd ..

# Instalar dependencias del módulo cognito (si existe)
cd aws-cognito-jwt-login
npm install
cd ..
```

### 3. Configurar Variables de Entorno
```bash
# Crear archivo .env en la raíz del proyecto
cp .env.example .env

# Editar .env con tus configuraciones
```

**Ejemplo de .env:**
```env
# AWS Configuration
AWS_REGION=us-east-1
AWS_ACCOUNT_ID=XXXXXXXXXXXX

# DynamoDB Tables
AGENDA_TABLE=agenda
BOX_TABLE=box
USUARIO_TABLE=usuario

# Cognito Configuration
USER_POOL_ID=us-east-1_XXXXXXXXX
CLIENT_ID=your-cognito-client-id

# Application
PORT=3000
NODE_ENV=development
```

## Despliegue de Base de Datos (DynamoDB)

### 1. Navegar al Directorio Serverless
```bash
cd serverless-dynamo
```

### 2. Configurar AWS CLI (si no está configurado)
```bash
aws configure
# Ingresa:
# AWS Access Key ID: [tu-access-key]
# AWS Secret Access Key: [tu-secret-key]
# Default region: us-east-1
# Default output format: json
```

### 3. Desplegar Infraestructura y Poblar Datos
```bash
# Ejecutar script completo de despliegue
bash deploy-seed.sh

# O paso a paso:
# 1. Desplegar infraestructura
npx serverless deploy --stage dev --region us-east-1

# 2. Poblar tablas (en orden)
npx serverless invoke --function seedTipoProfesional --stage dev --region us-east-1
npx serverless invoke --function seedTipoUsuario --stage dev --region us-east-1
npx serverless invoke --function seedTipoConsulta --stage dev --region us-east-1
npx serverless invoke --function seedTipoEstado --stage dev --region us-east-1
npx serverless invoke --function seedTipoBox --stage dev --region us-east-1
npx serverless invoke --function seedPersonalizacion --stage dev --region us-east-1
npx serverless invoke --function seedEstadoBox --stage dev --region us-east-1
npx serverless invoke --function seedTipoItem --stage dev --region us-east-1
npx serverless invoke --function seedBox --stage dev --region us-east-1
npx serverless invoke --function seedUsuarios --stage dev --region us-east-1
npx serverless invoke --function seedItems --stage dev --region us-east-1
npx serverless invoke --function seedAgenda --stage dev --region us-east-1
```

### 4. Verificar Tablas Creadas
```bash
# Listar tablas de DynamoDB
aws dynamodb list-tables --region us-east-1

# Verificar datos en una tabla específica
aws dynamodb scan --table-name agenda --region us-east-1 --max-items 5
```

### 5. Volver al Directorio Principal
```bash
cd ..
```

## Configuración de Autenticación (AWS Cognito)

### 1. Crear User Pool
```bash
# Crear User Pool
aws cognito-idp create-user-pool \
    --pool-name "reeva-user-pool" \
    --region us-east-1 \
    --policies '{
        "PasswordPolicy": {
            "MinimumLength": 8,
            "RequireUppercase": false,
            "RequireLowercase": false,
            "RequireNumbers": false,
            "RequireSymbols": false
        }
    }'

# Anotar el UserPoolId de la respuesta
```

### 2. Crear User Pool Client
```bash
# Reemplazar USER_POOL_ID con el ID obtenido anteriormente
aws cognito-idp create-user-pool-client \
    --user-pool-id USER_POOL_ID \
    --client-name "reeva-web-client" \
    --region us-east-1

# Anotar el ClientId de la respuesta
```

### 3. Crear Usuarios de Prueba
```bash
# Crear usuario administrador
aws cognito-idp admin-create-user \
    --user-pool-id USER_POOL_ID \
    --username "admin@reeva.com" \
    --user-attributes Name=email,Value="admin@reeva.com" \
    --message-action SUPPRESS \
    --region us-east-1

# Establecer contraseña permanente
aws cognito-idp admin-set-user-password \
    --user-pool-id USER_POOL_ID \
    --username "admin@reeva.com" \
    --password "TempPass123!" \
    --permanent \
    --region us-east-1
```

### 4. Asignar Roles (usando el sistema de permisos)
```bash
cd aws-cognito-jwt-login
npx serverless deploy --stage dev --region us-east-1

# Asignar rol de administrador
curl -X POST https://[API-GATEWAY-URL]/dev/admin/assign-role \
-H "Content-Type: application/json" \
-H "Authorization: Bearer [JWT-TOKEN]" \
-d '{
    "user_email": "admin@reeva.com",
    "role": "admin"
}'

cd ..
```

## Ejecución de la Aplicación

### 1. Configurar Base de Datos en la Aplicación
```bash
# Actualizar db.js con las configuraciones correctas
# El archivo ya está configurado para DynamoDB
```

### 2. Iniciar el Servidor de Desarrollo
```bash
# Desde el directorio raíz del proyecto
npm start

# O para desarrollo con auto-reload
npm run dev
```

### 3. Verificar que la Aplicación Funciona
```bash
# La aplicación debería estar corriendo en:
http://localhost:3000

# Endpoints de verificación:
# GET /                    - Página de inicio
# GET /bienvenida         - Dashboard principal (requiere autenticación)
```

## Uso del Sistema

### Acceso Inicial
1. **Abrir navegador:** `http://localhost:3000`
2. **Iniciar sesión:** Usar credenciales de Cognito creadas
3. **Bienvenida:** Interfaz de bienvenida

### Funcionalidades Principales **(Todavia no migradas)**

#### Gestión de Boxes
- **Ver estado de boxes:** `/box-matriz`
- **Información detallada:** `/info-box/{id}`
- **Gestión de inventario:** Desde la vista de información del box

#### Agenda Médica
- **Vista de agenda:** `/agenda`
- **Crear citas:** Formulario en la vista de agenda
- **Editar/Eliminar:** Funciones disponibles en cada evento

#### Usuarios y Permisos
- **Gestión de roles:** A través del sistema de permisos
- **Tipos de usuario:** Admin, Gestor de Pasillo, Consultor

#### Dashboard y Reportes
- **Métricas del sistema:** `/dashboard`
- **Estadísticas en tiempo real:** Actualización automática
- **Exportación de datos:** Funcionalidad de descarga

## API Endpoints

### Autenticación
```bash
POST /auth/login          # Iniciar sesión
POST /auth/logout         # Cerrar sesión
GET  /auth/info           # Información del usuario
```

### Seed Data (DynamoDB)
```bash
POST https://[API-GATEWAY-URL]/seed/tipo-profesional
POST https://[API-GATEWAY-URL]/seed/tipo-usuario
POST https://[API-GATEWAY-URL]/seed/agenda
# ... otros endpoints de seed
```

## 📁 Estructura del Proyecto

```
ReevaNode/Reeva_node/
├── README.md                          # Este archivo
├── package.json                       # Dependencias principales
├── db.js                             # Configuración de DynamoDB
├── server.js                         # Servidor principal
├── .env                              # Variables de entorno
├── src/
│   ├── routes/                       # Rutas de la aplicación
│   │   ├── bienvenida.js            # Ruta principal/dashboard
│   │   ├── agenda.js                # Gestión de agenda
│   │   └── ...
│   ├── middlewares/                  # Middlewares personalizados
│   │   └── requirePermission.js     # Control de permisos
│   └── views/                        # Plantillas EJS
│       ├── Bienvenida-y-Opciones.ejs
│       ├── agenda.ejs
│       └── ...
├── serverless-dynamo/                # Infraestructura DynamoDB
│   ├── serverless.yml               # Configuración Serverless
│   ├── deploy-seed.sh               # Script de despliegue
│   ├── src/
│   │   ├── tipos/                   # Seeds para tipos
│   │   ├── agenda/                  # Seed para agenda
│   │   ├── box/                     # Seed para boxes
│   │   └── usuarios/                # Seed para usuarios
│   └── package.json
└── aws-cognito-jwt-login/            # Sistema de autenticación
    ├── serverless.yml               # Configuración Cognito/Lambda
    ├── src/handlers/                # Handlers de Lambda
    │   └── permission.js            # Gestión de permisos
    └── package.json
```

## Troubleshooting

### Problemas Comunes

#### 1. Error de conexión a DynamoDB
```bash
# Verificar credenciales AWS
aws sts get-caller-identity

# Verificar que las tablas existen
aws dynamodb list-tables --region us-east-1

# Re-desplegar si es necesario
cd serverless-dynamo
bash deploy-seed.sh
```

#### 2. Error de autenticación Cognito
```bash
# Verificar User Pool existe
aws cognito-idp list-user-pools --max-results 10 --region us-east-1

# Verificar usuarios
aws cognito-idp list-users --user-pool-id USER_POOL_ID --region us-east-1
```

#### 3. Puerto 3000 ocupado
```bash
# Cambiar puerto en .env
PORT=3001

# O terminar proceso que usa el puerto
lsof -ti:3000 | xargs kill -9
```

#### 4. Dependencias no instaladas
```bash
# Reinstalar dependencias
rm -rf node_modules package-lock.json
npm install

# También en subdirectorios
cd serverless-dynamo && npm install && cd ..
cd aws-cognito-jwt-login && npm install && cd ..
```

### Logs y Debugging

#### Ver logs de Lambda functions
```bash
# Logs de una función específica
npx serverless logs --function seedAgenda --stage dev --region us-east-1

# Logs en tiempo real
npx serverless logs --function seedAgenda --stage dev --region us-east-1 --tail
```

#### Debug de la aplicación Node.js
```bash
# Ejecutar con debug habilitado
DEBUG=* npm start

# O específico para la aplicación
DEBUG=reeva:* npm start
```

### Limpiar y Reinstalar

#### Eliminar infraestructura AWS
```bash
cd serverless-dynamo
npx serverless remove --stage dev --region us-east-1
cd ..

cd aws-cognito-jwt-login
npx serverless remove --stage dev --region us-east-1
cd ..
```

#### Reset completo del proyecto
```bash
# Limpiar node_modules
find . -name "node_modules" -type d -exec rm -rf {} +
find . -name "package-lock.json" -delete

# Reinstalar dependencias
npm install
cd serverless-dynamo && npm install && cd ..
cd aws-cognito-jwt-login && npm install && cd ..

# Re-desplegar infraestructura
cd serverless-dynamo
bash deploy-seed.sh
cd ..
```

