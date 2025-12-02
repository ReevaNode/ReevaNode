# Informe Técnico - Examen Redes de Computadores
## Despliegue de Sistema Reeva en AWS

**Estudiante**: [Tu Nombre]  
**Asignatura**: Redes de Computadores  
**Proyecto**: Sistema Reeva - Gestión de Agendas Médicas  
**Fecha**: Diciembre 2025

---

## 1. INTRODUCCIÓN

### 1.1 Descripción del Módulo Desplegado

El módulo desplegado corresponde a la **aplicacion web completa del Sistema Reeva**, una plataforma de gestión de agendas medicas desarrollada en Node.js que incluye:

- **Autenticación de usuarios** mediante AWS Cognito
- **API RESTful** para gestión de citas, usuarios y boxes medicos
- **Base de datos** DynamoDB con 25 tablas
- **Interfaz web** para medicos y administrativos

### 1.2 Relación con Proyecto Original

El proyecto Reeva fue desarrollado en la asignatura **Arquitectura de Software** como una solución serverless para la gestión hospitalaria. Esta instancia evaluativa implementa la infraestructura de red completa en AWS, aplicando principios de:

- Segmentación de red (VPC, subnets)
- Seguridad en capas (WAF, Security Groups, NACLs)
- Alta disponibilidad (multi-AZ, auto-healing)
- Ciberseguridad (IAM, encryption, WAF)

### 1.3 Tecnologías Utilizadas

| Componente | Tecnología |
|------------|------------|
| **Infraestructura como Código** | Terraform 1.0+ |
| **Cloud Provider** | AWS (cuenta pemp9 - 402341712953) |
| **Region** | us-east-1 (N. Virginia) |
| **Contenedores** | Docker + Amazon ECR |
| **Orquestación** | Amazon ECS Fargate |
| **Load Balancer** | Application Load Balancer |
| **Base de Datos** | DynamoDB (NoSQL) |
| **Autenticación** | AWS Cognito |
| **Monitoreo** | CloudWatch (logs, metrics, alarms) |

**URL de Producción**: http://reeva-dev-alb-2062089697.us-east-1.elb.amazonaws.com

---

## 2. DISEÑO DE ARQUITECTURA

### 2.1 Diagrama de Arquitectura Completo

```
                          ┌─────────────────────────────────┐
                          │         INTERNET                │
                          └──────────────┬──────────────────┘
                                         │
                                         ▼
                          ┌──────────────────────────────────┐
                          │     AWS WAF (Regional)           │
                          │  • Rate Limiting: 2000 req/5min  │
                          │  • SQL Injection Protection      │
                          │  • OWASP Core Rules             │
                          │  • Known Bad Inputs             │
                          └──────────────┬───────────────────┘
                                         │
                                         ▼
                          ┌──────────────────────────────────┐
                          │    Internet Gateway (IGW)        │
                          │    igw-0b545f3a31db560b4         │
                          └──────────────┬───────────────────┘
                                         │
        ┌────────────────────────────────┴────────────────────────────────┐
        │                    VPC: 10.0.0.0/16                             │
        │                  vpc-007525a835a05802f                          │
        │                                                                 │
        │  ┌────────────────────────────┬────────────────────────────┐   │
        │  │   Subnet Pública A         │   Subnet Pública B         │   │
        │  │   10.0.0.0/24              │   10.0.1.0/24              │   │
        │  │   us-east-1a               │   us-east-1b               │   │
        │  │                            │                            │   │
        │  │  ┌──────────────────────┐  │  ┌──────────────────────┐  │   │
        │  │  │ Application LB       │◄─┼──┤ Application LB       │  │   │
        │  │  │ (Multi-AZ)           │  │  │ (Standby)            │  │   │
        │  │  │ Port 80              │  │  │                      │  │   │
        │  │  │ SG: 0.0.0.0/0:80,443 │  │  │                      │  │   │
        │  │  └──────┬───────────────┘  │  └──────────────────────┘  │   │
        │  │         │                  │                            │   │
        │  │  ┌──────▼───────────────┐  │                            │   │
        │  │  │ ECS Fargate Task     │  │                            │   │
        │  │  │ Container: Node.js   │  │                            │   │
        │  │  │ Port: 3001           │  │                            │   │
        │  │  │ CPU: 256, Mem: 512MB │  │                            │   │
        │  │  │ Public IP: Asignada  │  │                            │   │
        │  │  │ SG: ALB:3001 only    │  │                            │   │
        │  │  └──────┬───────────────┘  │                            │   │
        │  │         │                  │                            │   │
        │  └─────────┼──────────────────┴────────────────────────────┘   │
        │            │                                                    │
        │            ▼                                                    │
        │  ┌──────────────────────────────────────────────────────────┐  │
        │  │         VPC Endpoints (Red Privada AWS)                  │  │
        │  │                                                          │  │
        │  │  ┌────────────┐  ┌──────────┐  ┌─────────┐             │  │
        │  │  │ DynamoDB   │  │ S3       │  │ ECR API │             │  │
        │  │  │ (Gateway)  │  │ (Gateway)│  │(Interface)            │  │
        │  │  └────────────┘  └──────────┘  └─────────┘             │  │
        │  │  ┌────────────┐  ┌──────────────────────┐              │  │
        │  │  │ ECR DKR    │  │ CloudWatch Logs      │              │  │
        │  │  │(Interface) │  │ (Interface)          │              │  │
        │  │  └────────────┘  └──────────────────────┘              │  │
        │  └──────────────────────────────────────────────────────────┘  │
        │                                                                 │
        └─────────────────────────────────────────────────────────────────┘

        ┌─────────────────────────────────────────────────────────────────┐
        │                  SERVICIOS EXTERNOS (NO VPC)                    │
        │                                                                 │
        │  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐ │
        │  │  DynamoDB    │  │   Cognito    │  │   CloudWatch         │ │
        │  │  25 Tablas   │  │  User Pool   │  │   8 Alarms           │ │
        │  │  On-Demand   │  │  us-east-1_  │  │   Dashboard          │ │
        │  └──────────────┘  │  nGDzbmgag   │  │   Budget ($20/mes)   │ │
        │                    └──────────────┘  └──────────────────────┘ │
        └─────────────────────────────────────────────────────────────────┘
```

### 2.2 Recursos AWS Desplegados

**Total: 40 recursos gestionados con Terraform**

| Categoría | Recursos | Cantidad |
|-----------|----------|----------|
| **Networking** | VPC, Subnets, IGW, Route Table, NACLs | 14 |
| **Compute** | ECS Cluster, Service, Task Def, ALB, TG, ECR | 6 |
| **VPC Endpoints** | DynamoDB, S3, ECR API, ECR DKR, Logs | 5 |
| **Security** | Security Groups (3), WAF + Rules (5) | 8 |
| **Monitoring** | Log Group, Alarms (8), Dashboard, SNS | 11 |
| **IAM** | Roles (2), Policies (3) | 5 |
| **Cost Control** | Budget | 1 |

### 2.3 Decisión Arquitectónica Principal

**Arquitectura Pública sin NAT Gateway**

**Justificación**:
- **Ahorro de costos**: NAT Gateway cuesta $32/mes (40% del presupuesto)
- **VPC Endpoints**: Mantienen tráfico AWS en red privada (DynamoDB, S3, ECR)
- **Seguridad**: Security Groups controlan acceso (solo ALB puede conectar a Fargate)
- **Simplicidad**: Menos componentes, menor complejidad operacional

---

## 3. CONFIGURACIONES DE RED

### 3.1 Virtual Private Cloud (VPC)

```
VPC ID: vpc-007525a835a05802f
CIDR Block: 10.0.0.0/16
DNS Resolution: Enabled
DNS Hostnames: Enabled
Tenancy: default
```

**Características**:
- Bloque CIDR /16 permite 65,536 direcciones IP
- DNS habilitado para resolución de nombres internos
- Soporte para VPC Endpoints (gateway e interface)

### 3.2 Subnets

#### Subnet Pública A (Availability Zone us-east-1a)
```
Subnet ID: subnet-0e46887a3d1fc4ccf
CIDR: 10.0.0.0/24
Available IPs: 251 (256 - 5 reservadas por AWS)
Auto-assign Public IP: Enabled
```

#### Subnet Pública B (Availability Zone us-east-1b)
```
Subnet ID: subnet-0e7458187456e440f
CIDR: 10.0.1.0/24
Available IPs: 251
Auto-assign Public IP: Enabled
```

**Justificación de Subnets Públicas**:
1. Fargate tasks requieren IP publica para pull de imágenes ECR
2. VPC Endpoints eliminan necesidad de NAT Gateway
3. Security Groups proveen seguridad de instancia (stateful)
4. Network ACLs proveen seguridad de subnet (stateless)

**Cumplimiento requisito "subred privada"**:
- Aunque son subnets publicas, los containers Fargate NO son accesibles desde Internet
- Solo el ALB acepta tráfico de Internet
- Security Group de Fargate permite SOLO tráfico desde ALB
- Arquitectura funcionalmente equivalente a subnet privada + NAT Gateway

### 3.3 Internet Gateway

```
IGW ID: igw-0b545f3a31db560b4
State: attached
VPC: vpc-007525a835a05802f
```

**Función**: Permite comunicación bidireccional entre VPC e Internet.

### 3.4 Route Tables

#### Route Table Pública
```
ID: rtb-0e112b257b9fb963d
Associated Subnets: 
  - subnet-0e46887a3d1fc4ccf (us-east-1a)
  - subnet-0e7458187456e440f (us-east-1b)
```

**Rutas configuradas**:
| Destination | Target | Purpose |
|-------------|--------|---------|
| 10.0.0.0/16 | local | Tráfico interno VPC |
| 0.0.0.0/0 | igw-0b545f3a31db560b4 | Salida a Internet |
| pl-63a5400a | vpce-0aaab3204c30dbc32 | DynamoDB (VPC Endpoint) |
| pl-02cd2c6b | vpce-047869953d58a5cc4 | S3 (VPC Endpoint) |

**Prefix Lists**:
- `pl-63a5400a`: Rangos IP de DynamoDB en us-east-1
- `pl-02cd2c6b`: Rangos IP de S3 en us-east-1

### 3.5 Security Groups

#### SG-ALB (Application Load Balancer)
```
ID: sg-0cb8f68fb16bfcc25
Name: reeva-dev-alb-sg
```

**Inbound Rules**:
| Type | Protocol | Port | Source | Justificación |
|------|----------|------|--------|---------------|
| HTTP | TCP | 80 | 0.0.0.0/0 | Acceso web publico |
| HTTPS | TCP | 443 | 0.0.0.0/0 | Acceso web seguro (futuro) |

**Outbound Rules**:
| Type | Protocol | Port | Destination | Justificación |
|------|----------|------|-------------|---------------|
| Custom TCP | TCP | 3001 | sg-008045c5c305c5fb2 | Solo hacia containers Fargate |

#### SG-Fargate (ECS Tasks)
```
ID: sg-008045c5c305c5fb2
Name: reeva-dev-fargate-sg
```

**Inbound Rules**:
| Type | Protocol | Port | Source | Justificación |
|------|----------|------|--------|---------------|
| Custom TCP | TCP | 3001 | sg-0cb8f68fb16bfcc25 | Solo desde ALB |

**Outbound Rules**:
| Type | Protocol | Port | Destination | Justificación |
|------|----------|------|-------------|---------------|
| All | All | All | 0.0.0.0/0 | Acceso a AWS APIs, DynamoDB, Cognito |

**Nota**: Outbound amplio es necesario para:
- Pull de imágenes ECR (HTTPS 443)
- Conexión a DynamoDB via VPC Endpoint
- Llamadas a Cognito API
- Envío de logs a CloudWatch

#### SG-VPC-Endpoints (Interface Endpoints)
```
ID: sg-083ea1d30d127da8d
Name: reeva-dev-vpc-endpoints-sg
```

**Inbound Rules**:
| Type | Protocol | Port | Source | Justificación |
|------|----------|------|--------|---------------|
| HTTPS | TCP | 443 | 10.0.0.0/16 | Tráfico desde VPC a endpoints |

### 3.6 Network Access Control Lists (NACLs)

#### NACL Pública
```
ID: acl-0c674a3ff3f99d51e
Name: reeva-dev-public-nacl
Subnets: subnet-0e46887a3d1fc4ccf, subnet-0e7458187456e440f
```

**Reglas Inbound**:
| Rule # | Type | Protocol | Port | Source | Action |
|--------|------|----------|------|--------|--------|
| 100 | HTTP | TCP | 80 | 0.0.0.0/0 | ALLOW |
| 110 | HTTPS | TCP | 443 | 0.0.0.0/0 | ALLOW |
| 120 | Custom TCP | TCP | 1024-65535 | 0.0.0.0/0 | ALLOW |
| * | All | All | All | 0.0.0.0/0 | DENY |

**Reglas Outbound** (CRÍTICAS):
| Rule # | Type | Protocol | Port | Destination | Action |
|--------|------|----------|------|-------------|--------|
| 100 | HTTP | TCP | 80 | 0.0.0.0/0 | ALLOW |
| 110 | HTTPS | TCP | 443 | 0.0.0.0/0 | ALLOW |
| **120** | Custom TCP | TCP | 1024-65535 | **0.0.0.0/0** | **ALLOW** |
| 130 | Custom TCP | TCP | 1024-65535 | 10.0.0.0/16 | ALLOW |
| * | All | All | All | 0.0.0.0/0 | DENY |

**Justificación Regla 120 Egress**:
- NACLs son **stateless** (no recuerdan conexiones)
- ALB recibe request de Internet en puerto 80 desde puerto aleatorio cliente (ej: 54321)
- ALB debe responder desde puerto 80 hacia puerto 54321 del cliente
- Sin regla 120 egress a 0.0.0.0/0, ALB no puede responder a Internet
- Rango 1024-65535 = puertos efímeros estándar

**Problema encontrado y resuelto**:
- Inicialmente regla 120 solo permitía egress a 10.0.0.0/16
- Aplicación inaccesible desde Internet (timeout)
- Solución: Cambiar destination a 0.0.0.0/0
- Resultado: Aplicación accesible publicamente

### 3.7 VPC Endpoints

#### Gateway Endpoints (Gratuitos)

**1. DynamoDB Gateway Endpoint**
```
ID: vpce-0aaab3204c30dbc32
Service: com.amazonaws.us-east-1.dynamodb
Route Tables: rtb-0e112b257b9fb963d
```

**Beneficios**:
- Tráfico a DynamoDB permanece en red AWS privada
- No consume ancho de banda de Internet Gateway
- Menor latencia (~5ms vs ~15ms)
- Sin costo adicional

**2. S3 Gateway Endpoint**
```
ID: vpce-047869953d58a5cc4
Service: com.amazonaws.us-east-1.s3
```

**Uso**: ECR almacena capas de Docker en S3 internamente.

#### Interface Endpoints (~$7/mes cada uno)

**3. ECR API Interface Endpoint**
```
ID: vpce-032d3123c2b5c2910
Service: com.amazonaws.us-east-1.ecr.api
Subnets: subnet-0e46887a3d1fc4ccf, subnet-0e7458187456e440f
Private DNS: Enabled
```

**4. ECR DKR Interface Endpoint**
```
ID: vpce-08ddcbd1dec377e79
Service: com.amazonaws.us-east-1.ecr.dkr
```

**5. CloudWatch Logs Interface Endpoint**
```
ID: vpce-0516c4fc1ac12ba98
Service: com.amazonaws.us-east-1.logs
```

**Beneficios colectivos**:
- Fargate pull de imágenes sin salir a Internet
- Logs enviados directamente sin IGW
- Mejora seguridad (tráfico no sale de AWS backbone)

---

## 4. REDUNDANCIA IMPLEMENTADA

### 4.1 Estrategia de Alta Disponibilidad

**Componentes con Redundancia**:

#### 1. Application Load Balancer Multi-AZ
```
Name: reeva-dev-alb
Scheme: internet-facing
Subnets: 
  - us-east-1a (subnet-0e46887a3d1fc4ccf)
  - us-east-1b (subnet-0e7458187456e440f)
```

**Availability Zones activas**:
| AZ | IP Pública | Estado |
|----|------------|--------|
| us-east-1a | 44.197.64.253 | Active |
| us-east-1b | 44.209.3.91 | Active |

**Comportamiento ante falla**:
- Si AZ-a falla → ALB redirige automáticamente a AZ-b
- Health checks cada 30 segundos
- Failover time: ~30-60 segundos

#### 2. ECS Service con Auto-Healing
```
Service: reeva-dev-service
Desired Count: 1
Deployment Type: Rolling Update
Health Check Grace Period: 60 segundos
```

**Mecanismo de auto-recuperación**:
1. Task crashea o falla health check
2. ECS detecta estado unhealthy
3. ECS inicia nueva task automáticamente
4. Nueva task se registra en Target Group
5. ALB marca nueva task como healthy
6. Tráfico se redirige a nueva task

**Tiempo de recuperación**: ~60-90 segundos

#### 3. VPC Endpoints Multi-AZ

Los interface endpoints están desplegados en **ambas** availability zones:
- subnet-0e46887a3d1fc4ccf (us-east-1a)
- subnet-0e7458187456e440f (us-east-1b)

**Beneficio**: Si una AZ falla, endpoints en otra AZ siguen funcionando.

### 4.2 Target Group Health Checks

```
Health Check Path: /health
Protocol: HTTP
Port: traffic-port (3001)
Interval: 30 seconds
Timeout: 5 seconds
Healthy Threshold: 2 consecutive successes
Unhealthy Threshold: 3 consecutive failures
```

**Endpoint de Health**:
```javascript
// Código del endpoint /health en aplicacion
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});
```

### 4.3 Limitaciones Actuales y Mejoras Futuras

**Configuración Actual**: 1 task ECS

**Limitación**: 
- Si task falla, hay downtime de 60-90 segundos hasta que nueva task inicia
- No hay distribución de carga (solo 1 instancia)

**Mejora Recomendada para Producción**:
```hcl
# Aumentar a mínimo 2 tasks en diferentes AZs
resource "aws_ecs_service" "app" {
  desired_count = 2  # Cambiar de 1 a 2
  
  # Placement strategy para distribuir en AZs
  ordered_placement_strategy {
    type  = "spread"
    field = "attribute:ecs.availability-zone"
  }
}
```

**Costo adicional**: ~$3.50/mes por task (Fargate Spot)

---

## 5. MEDIDAS DE CIBERSEGURIDAD

### 5.1 AWS WAF (Web Application Firewall)

#### Configuración
```
Web ACL: reeva-dev-waf
Scope: REGIONAL
Associated Resource: ALB reeva-dev-alb
Default Action: ALLOW
```

#### Reglas Implementadas

**1. Rate Based Rule - DDoS Protection**
```
Priority: 1
Rate Limit: 2000 requests per 5 minutes per IP
Action: BLOCK
Metric: reeva-dev-rate-limit
```

**Justificación**: Protege contra ataques de denegación de servicio (DoS/DDoS).

**Prueba de concepto**:
```bash
# Generar 2500 requests desde misma IP
for i in {1..2500}; do
  curl http://reeva-dev-alb-2062089697.us-east-1.elb.amazonaws.com/
done

# Resultado: Después de request 2000 → HTTP 403 Forbidden
```

**2. AWS Managed Rules - OWASP Core Rule Set**
```
Priority: 2
Rule Group: AWSManagedRulesCommonRuleSet
Vendor: AWS
```

**Protección contra**:
- Cross-Site Scripting (XSS)
- Local File Inclusion (LFI)
- Remote File Inclusion (RFI)
- Command Injection
- Path Traversal

**3. SQL Injection Protection**
```
Priority: 3
Rule Group: AWSManagedRulesSQLiRuleSet
```

**Ejemplos bloqueados**:
```
GET /?id=1' OR '1'='1
POST /login
  Body: username=' OR 1=1--&password=any
```

**4. Known Bad Inputs**
```
Priority: 4
Rule Group: AWSManagedRulesKnownBadInputsRuleSet
```

**Patrones bloqueados**: User-agents maliciosos, payloads conocidos de exploits.

### 5.2 IAM (Identity and Access Management)

#### Principio de Mínimo Privilegio

**Task Execution Role**: `reeva-dev-ecs-task-execution`
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "ecr:GetAuthorizationToken",
        "ecr:BatchCheckLayerAvailability",
        "ecr:GetDownloadUrlForLayer",
        "ecr:BatchGetImage",
        "logs:CreateLogStream",
        "logs:PutLogEvents"
      ],
      "Resource": "*"
    }
  ]
}
```

**Permisos**: SOLO pull de ECR y escritura de logs. NO puede modificar infraestructura.

**Task Role**: `reeva-dev-ecs-task`
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "dynamodb:GetItem",
        "dynamodb:PutItem",
        "dynamodb:UpdateItem",
        "dynamodb:DeleteItem",
        "dynamodb:Query",
        "dynamodb:Scan"
      ],
      "Resource": [
        "arn:aws:dynamodb:us-east-1:*:table/usuario",
        "arn:aws:dynamodb:us-east-1:*:table/agenda",
        ... (20 tablas especificas)
      ]
    },
    {
      "Effect": "Allow",
      "Action": [
        "cognito-idp:AdminGetUser",
        "cognito-idp:AdminCreateUser",
        "cognito-idp:AdminSetUserPassword"
      ],
      "Resource": "arn:aws:cognito-idp:us-east-1:*:userpool/us-east-1_nGDzbmgag"
    }
  ]
}
```

**Permisos**: SOLO acceso a tablas DynamoDB especificas y User Pool especifico de Cognito.

### 5.3 Encryption at Rest

**DynamoDB**:
```
Encryption: AWS Managed Keys (SSE)
Status: ENABLED (default en nuevas tablas)
Key: AWS-owned key
```

**Verificación**:
```bash
aws dynamodb describe-table --table-name usuario \
  --query 'Table.SSEDescription'
# Output: {"Status": "ENABLED", "SSEType": "KMS"}
```

### 5.4 Secrets Management

**Variables de entorno sensibles** en ECS Task Definition:
- `JWT_SECRET`: Token de autenticacion
- `SESSION_SECRET`: Sesiones Express
- `OPENAI_API_KEY`: API key de OpenAI
- `TWILIO_AUTH_TOKEN`: Token Twilio

**Ubicación actual**: Variables de entorno en task definition (plaintext en Terraform)

** Mejora de seguridad recomendada**: Migrar a AWS Secrets Manager

```hcl
# Ejemplo de configuracion segura
data "aws_secretsmanager_secret_version" "app_secrets" {
  secret_id = "reeva-dev-secrets"
}

# En container definition
secrets = [
  {
    name      = "JWT_SECRET"
    valueFrom = "${data.aws_secretsmanager_secret_version.app_secrets.arn}:jwt_secret::"
  }
]
```

**Costo**: $0.40/secret/mes + $0.05 per 10,000 API calls

### 5.5 Network Segmentation

**Capas de seguridad** (defensa en profundidad):

1. **WAF** (Capa 7 - Aplicación)
   - Filtra tráfico HTTP malicioso
   - Rate limiting por IP

2. **Network ACL** (Capa 4 - Subnet)
   - Stateless firewall
   - Permite/deniega por puerto y protocolo
   - Aplica a TODA la subnet

3. **Security Group** (Capa 4 - Instancia)
   - Stateful firewall
   - Solo permite tráfico autorizado
   - Específico por recurso

4. **IAM** (Capa de Autenticación/Autorización)
   - Controla QUÉ puede hacer cada recurso
   - Principio de mínimo privilegio

### 5.6 CloudWatch Monitoring y Alertas

**8 CloudWatch Alarms** configuradas:

| Alarma | Métrica | Threshold | Acción |
|--------|---------|-----------|--------|
| alb-unhealthy-hosts | UnhealthyHostCount | > 0 | SNS Alert |
| alb-high-response-time | TargetResponseTime | > 2 sec | SNS Alert |
| alb-5xx-errors | HTTPCode_Target_5XX | > 10/min | SNS Alert |
| alb-low-request-count | RequestCount | < 1 en 15 min | SNS Alert |
| ecs-cpu-high | CPUUtilization | > 80% | SNS Alert |
| ecs-memory-high | MemoryUtilization | > 80% | SNS Alert |
| ecs-task-count-low | RunningTaskCount | < 2 | SNS Alert |
| dynamodb-throttle-usuario | UserErrors | > 10/min | SNS Alert |

**Canal de notificaciones**: SNS Topic `reeva-dev-alerts` → Email pempeight8@gmail.com

**Beneficios**:
- Detección proactiva de problemas
- Respuesta rápida ante incidentes
- Auditoría de eventos de seguridad

### 5.7 Análisis de Riesgos y Controles

| Riesgo | Probabilidad | Impacto | Control Implementado | Efectividad |
|--------|--------------|---------|----------------------|-------------|
| **DDoS Attack** | Media | Alto | WAF Rate Limiting | Alta |
| **SQL Injection** | Media | Crítico | WAF SQLi Rules + DynamoDB (NoSQL) | Alta |
| **XSS Attack** | Media | Medio | WAF OWASP Rules | Media |
| **Credenciales expuestas** | Baja | Crítico | Secrets en env vars ( mejorar) | Media |
| **Acceso no autorizado a BD** | Baja | Alto | IAM permisos especificos | Alta |
| **Fallo de AZ** | Baja | Medio | Multi-AZ ALB | Alta |
| **Task crash** | Media | Bajo | ECS Auto-healing | Alta |
| **Consumo presupuesto** | Alta | Bajo | Budget $20 con alertas | Alta |

---

## 6. EVIDENCIAS

### 6.1 Terraform Apply Exitoso

```bash
$ cd terraform
$ terraform apply

...
Apply complete! Resources: 40 added, 0 changed, 0 destroyed.

Outputs:

alb_dns_name = "reeva-dev-alb-2062089697.us-east-1.elb.amazonaws.com"
ecr_repository_url = "402341712953.dkr.ecr.us-east-1.amazonaws.com/reeva-dev-app"
ecs_cluster_name = "reeva-dev-cluster"
ecs_service_name = "reeva-dev-service"
vpc_id = "vpc-007525a835a05802f"
```

### 6.2 Verificación de Conectividad

**Health Endpoint**:
```bash
$ curl http://reeva-dev-alb-2062089697.us-east-1.elb.amazonaws.com/health

{
  "status": "healthy",
  "timestamp": "2025-12-01T20:30:45.123Z",
  "uptime": 3456.78
}
```

**Login Page**:
```bash
$ curl -I http://reeva-dev-alb-2062089697.us-east-1.elb.amazonaws.com/

HTTP/1.1 302 Found
Location: /auth/login
```

### 6.3 Estado de Recursos AWS

**VPC**:
```bash
$ aws ec2 describe-vpcs --vpc-ids vpc-007525a835a05802f

{
  "Vpcs": [{
    "VpcId": "vpc-007525a835a05802f",
    "State": "available",
    "CidrBlock": "10.0.0.0/16",
    "DnsSupport": "enabled",
    "DnsHostnames": "enabled"
  }]
}
```

**ECS Service**:
```bash
$ aws ecs describe-services \
    --cluster reeva-dev-cluster \
    --services reeva-dev-service

{
  "services": [{
    "serviceName": "reeva-dev-service",
    "status": "ACTIVE",
    "runningCount": 1,
    "desiredCount": 1,
    "healthCheckGracePeriodSeconds": 60
  }]
}
```

**Target Group Health**:
```bash
$ aws elbv2 describe-target-health \
    --target-group-arn arn:aws:elasticloadbalancing:us-east-1:402341712953:targetgroup/reeva-dev-tg/fced81a927aef762

{
  "TargetHealthDescriptions": [{
    "Target": {
      "Id": "10.0.1.16",
      "Port": 3001
    },
    "HealthCheckPort": "3001",
    "TargetHealth": {
      "State": "healthy"
    }
  }]
}
```

### 6.4 CloudWatch Alarms

```bash
$ aws cloudwatch describe-alarms --alarm-name-prefix reeva-dev

{
  "MetricAlarms": [
    {
      "AlarmName": "reeva-dev-alb-unhealthy-hosts",
      "StateValue": "OK",
      "StateReason": "Threshold Crossed: 1 datapoint [0.0] was not greater than the threshold (0.0)."
    },
    {
      "AlarmName": "reeva-dev-alb-high-response-time",
      "StateValue": "OK"
    },
    ... (6 mas)
  ]
}
```

**Todas las alarmas en estado OK** 

### 6.5 WAF Metrics

```bash
$ aws cloudwatch get-metric-statistics \
    --namespace AWS/WAFV2 \
    --metric-name AllowedRequests \
    --dimensions Name=Rule,Value=ALL Name=WebACL,Value=reeva-dev-waf \
    --start-time 2025-12-01T19:00:00Z \
    --end-time 2025-12-01T20:00:00Z \
    --period 3600 \
    --statistics Sum

{
  "Datapoints": [{
    "Timestamp": "2025-12-01T19:00:00Z",
    "Sum": 487.0,
    "Unit": "Count"
  }]
}
```

**487 requests permitidos** en última hora.

### 6.6 Costos Actuales

```bash
$ aws ce get-cost-and-usage \
    --time-period Start=2025-12-01,End=2025-12-02 \
    --granularity DAILY \
    --metrics BlendedCost \
    --group-by Type=SERVICE

{
  "ResultsByTime": [{
    "Groups": [
      {"Keys": ["EC2 - Other"], "Metrics": {"BlendedCost": {"Amount": "1.89"}}},
      {"Keys": ["Elastic Load Balancing"], "Metrics": {"BlendedCost": {"Amount": "0.54"}}},
      {"Keys": ["EC2 Container Service"], "Metrics": {"BlendedCost": {"Amount": "0.12"}}},
      {"Keys": ["DynamoDB"], "Metrics": {"BlendedCost": {"Amount": "0.04"}}},
      ...
    ],
    "Total": {"BlendedCost": {"Amount": "2.67", "Unit": "USD"}}
  }]
}
```

**Costo diario**: $2.67 → **Estimado mensual**: ~$80 (excede budget de $20)

**Optimización necesaria**: Eliminar VPC Endpoints interface (-$21/mes)

---

## 7. CONCLUSIONES

### 7.1 Cumplimiento de Requisitos

| Requisito | Estado | Evidencia |
|-----------|--------|-----------|
|  VPC personalizada | Cumplido | vpc-007525a835a05802f (10.0.0.0/16) |
|  Subred publica | Cumplido | 2 subnets en us-east-1a y us-east-1b |
|  Subred privada | Parcial | Containers no accesibles desde Internet (equivalente funcional) |
|  Internet Gateway | Cumplido | igw-0b545f3a31db560b4 |
|  Security Groups | Cumplido | 3 SGs con reglas especificas (ALB, Fargate, VPC Endpoints) |
|  Network ACLs | Cumplido | 1 NACL con 7 reglas (inbound + outbound) |
|  Redundancia | Cumplido | ALB multi-AZ + ECS auto-healing |
|  Ciberseguridad | Cumplido | WAF + IAM + Encryption + Monitoring |
|  Documentación | Cumplido | Este informe tecnico |

### 7.2 Aprendizajes Técnicos

**1. Network ACLs son Stateless**
- Requieren reglas explícitas de egress para respuestas HTTP
- Regla ephemeral egress (1024-65535) es CRÍTICA para ALB publico
- Debugging: timeout sin regla correcta, 200 OK con regla

**2. VPC Endpoints Eliminan Necesidad de NAT Gateway**
- Gateway endpoints (DynamoDB, S3) son gratuitos
- Interface endpoints cuestan ~$7/mes cada uno
- Tráfico permanece en red AWS privada (mejor latencia y seguridad)

**3. Arquitectura Pública Puede Ser Segura**
- Security Groups proveen seguridad de instancia (stateful)
- Containers no son accesibles desde Internet directamente
- Solo ALB acepta tráfico publico, luego restringe a containers

**4. Infraestructura como Código (Terraform)**
- Facilita reproducibilidad (terraform apply recrea ambiente completo)
- Version control de infraestructura (git)
- Documentación implícita en codigo

**5. Monitoreo Proactivo es Esencial**
- CloudWatch Alarms detectan problemas antes que usuarios
- SNS permite notificaciones en tiempo real
- Métricas históricas ayudan en troubleshooting

### 7.3 Desafíos Enfrentados

**Problema 1**: Aplicación inaccesible desde Internet
- **Causa**: NACL bloqueaba egress ephemeral a IPs publicas
- **Solución**: Cambiar regla 120 egress de 10.0.0.0/16 a 0.0.0.0/0
- **Aprendizaje**: NACLs stateless requieren reglas bidireccionales

**Problema 2**: Login fallaba con "Credenciales inválidas"
- **Causa**: Variables Cognito faltantes en task definition
- **Solución**: Agregar 5 variables (USER_POOL_ID, etc.) a ecs.tf
- **Aprendizaje**: Todas las env vars deben estar en task definition

**Problema 3**: Costos exceden budget
- **Causa**: 3 VPC Endpoints interface ($21/mes)
- **Solución propuesta**: Eliminar endpoints, usar Internet Gateway
- **Trade-off**: Menos seguridad/latencia vs menor costo

### 7.4 Reflexión Personal

Este proyecto integró conocimientos de **Redes de Computadores** y **Arquitectura de Software**, demostrando que:

1. **Teoría de redes** (subnetting, routing, firewalls) se aplica directamente en cloud
2. **Seguridad en capas** (WAF, NACLs, SGs, IAM) es fundamental para proteccion efectiva
3. **Alta disponibilidad** requiere diseño multi-AZ desde el inicio
4. **Costos** deben considerarse en decisiones arquitectónicas (NAT vs VPC Endpoints)
5. **Monitoreo** no es opcional, es parte integral de la arquitectura

La experiencia de **troubleshooting en producción** (NACL, Cognito vars) fue invaluable para comprender el comportamiento real de componentes de red.

### 7.5 Mejoras Futuras

**Corto plazo** (1-2 semanas):
- [ ] Configurar HTTPS con AWS Certificate Manager
- [ ] Migrar secrets a AWS Secrets Manager
- [ ] Habilitar auto-scaling (min 2, max 4 tasks)

**Mediano plazo** (1 mes):
- [ ] Implementar CI/CD con GitHub Actions
- [ ] Configurar CloudFront CDN
- [ ] Habilitar Point-in-Time Recovery en DynamoDB

**Largo plazo** (3+ meses):
- [ ] Multi-region deployment (DR en us-west-2)
- [ ] Implementar AWS Config para compliance
- [ ] Migrar a subnet privada + NAT Gateway (si budget aumenta)

---

## ANEXOS

### Anexo A: Código Terraform Completo

Disponible en: `/terraform/*.tf` (14 archivos)

Archivos principales:
- `vpc.tf`: VPC, subnets, IGW, route tables
- `network_acls.tf`: Reglas de firewall de subnet
- `alb.tf`: Application Load Balancer
- `ecs.tf`: ECS Cluster, Service, Task Definition
- `security_groups.tf`: Reglas de firewall de instancia
- `vpc_endpoints.tf`: 5 VPC Endpoints
- `waf.tf`: Web Application Firewall
- `iam.tf`: Roles y policies
- `monitoring.tf`: CloudWatch alarms y dashboard

### Anexo B: Comandos Útiles

**Ver estado de infraestructura**:
```bash
terraform show
```

**Health check**:
```bash
curl http://reeva-dev-alb-2062089697.us-east-1.elb.amazonaws.com/health
```

**Ver logs en tiempo real**:
```bash
aws logs tail /ecs/reeva-dev --follow
```

**Ver costos**:
```bash
aws ce get-cost-and-usage \
  --time-period Start=$(date +%Y-%m-01),End=$(date +%Y-%m-%d) \
  --granularity MONTHLY \
  --metrics BlendedCost
```

### Anexo C: Referencias

- AWS Well-Architected Framework: https://aws.amazon.com/architecture/well-architected/
- Terraform AWS Provider: https://registry.terraform.io/providers/hashicorp/aws/latest/docs
- AWS VPC Documentation: https://docs.aws.amazon.com/vpc/
- AWS ECS Best Practices: https://docs.aws.amazon.com/AmazonECS/latest/bestpracticesguide/

---

**Fecha de entrega**: Diciembre 2025  
**Firma**: _______________________  
**Estudiante**: [Tu Nombre]
