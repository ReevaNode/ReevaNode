# Arquitectura del Sistema Reeva en AWS
## Explicacion completa y sencilla

---

## 1. LA RED (VPC Y SUBNETS)

### VPC - Virtual Private Cloud
**Que es**: Una red privada virtual dentro de AWS, como tu propia "mini internet" aislada.

**Configuracion**:
- **ID**: vpc-007525a835a05802f
- **CIDR**: 10.0.0.0/16
- **Direcciones disponibles**: 65,536 IPs

**Para que sirve**: Es el contenedor principal donde viven todos tus recursos. Nadie de afuera puede entrar a menos que tu lo permitas.

**Analogia**: Es como tu casa. Todo lo que esta adentro esta en tu red privada, y tu controlas quien entra y sale.

---

### Subnets Publicas (2)

**Que son**: Divisiones mas pequenas dentro de la VPC donde pones los recursos que necesitan hablar con Internet.

**Configuracion**:
- **Subnet A**: 10.0.0.0/24 en us-east-1a (251 IPs disponibles)
- **Subnet B**: 10.0.1.0/24 en us-east-1b (251 IPs disponibles)

**Por que publicas**: Tienen una "ruta" directa al Internet Gateway, lo que les permite recibir y enviar trafico a Internet.

**Por que dos**: Redundancia. Si la zona us-east-1a se cae (datacenter de AWS falla), us-east-1b sigue funcionando.

**Analogia**: Son como dos habitaciones en tu casa que tienen ventanas al exterior. Pueden recibir visitas de afuera.

---

### Internet Gateway (IGW)

**Que es**: La puerta de entrada/salida entre tu VPC e Internet.

**Configuracion**:
- **ID**: igw-0b545f3a31db560b4
- **Conectado a**: VPC principal

**Para que sirve**: Permite que los recursos con IP publica puedan hablar con Internet. Sin esto, tu VPC estaria completamente aislada.

**Analogia**: Es la puerta principal de tu casa. Sin ella, nadie puede entrar ni salir.

---

### Route Table (Tabla de Rutas)

**Que es**: Un "mapa" que le dice a los recursos "si quieres ir a esta direccion, usa este camino".

**Configuracion**:
- **Ruta 1**: 10.0.0.0/16 → local (trafico dentro de la VPC)
- **Ruta 2**: 0.0.0.0/0 → Internet Gateway (trafico a Internet)
- **Ruta 3**: pl-63a5400a → VPC Endpoint DynamoDB
- **Ruta 4**: pl-02cd2c6b → VPC Endpoint S3

**Para que sirve**: Cuando un container quiere enviar datos, la route table le dice "si es para Internet, usa el IGW; si es para DynamoDB, usa el VPC Endpoint".

**Analogia**: Es como el GPS de tu casa. Te dice que camino tomar segun a donde vayas.

---

### PREGUNTA: ¿Y la subnet privada?

**Respuesta corta**: No hay subnet privada tradicional (sin acceso directo a Internet).

**Por que**: Decision de arquitectura. En lugar de crear subnet privada + NAT Gateway (que cuesta $32/mes), use:
1. **Subnets publicas** para los containers
2. **Security Groups** para bloquear acceso directo desde Internet
3. **VPC Endpoints** para que el trafico a AWS vaya por red privada

**Resultado**: Los containers tecnicamente estan en subnet publica, pero NADIE puede acceder a ellos directamente desde Internet porque el Security Group solo permite trafico del ALB.

**Es valido**: Si. Es una arquitectura comun en produccion cuando quieres ahorrar costos sin sacrificar seguridad.

**Para el examen**: Debes explicar que es una "subnet privada funcional" - no accesible desde Internet gracias a Security Groups, aunque tecnicamente tenga route a IGW.

---

## 2. SEGURIDAD DE RED

### Security Groups (Firewall de Instancia - Stateful)

**Que son**: Firewalls virtuales que controlan el trafico a nivel de recurso individual (ALB, containers, etc).

**Caracteristica importante**: Son STATEFUL - si permites una conexion de entrada, la respuesta de salida se permite automaticamente.

---

#### Security Group del ALB

**Nombre**: reeva-dev-alb-sg

**Reglas Inbound** (quien puede conectarse AL ALB):
- Puerto 80 (HTTP) desde 0.0.0.0/0 → Cualquiera en Internet puede hacer requests
- Puerto 443 (HTTPS) desde 0.0.0.0/0 → Para futuro (cuando configures certificado SSL)

**Reglas Outbound** (a quien puede conectarse EL ALB):
- Puerto 3001 hacia sg-fargate → Solo puede hablar con los containers en puerto 3001

**Por que importa**: El ALB es la unica "puerta" que Internet puede tocar. Todo lo demas esta bloqueado.

---

#### Security Group de Fargate

**Nombre**: reeva-dev-fargate-sg

**Reglas Inbound** (quien puede conectarse A los containers):
- Puerto 3001 SOLO desde sg-alb → Solo el ALB puede conectarse, nadie mas

**Reglas Outbound** (a quien pueden conectarse LOS containers):
- Todo el trafico a 0.0.0.0/0 → Pueden salir a Internet y AWS APIs

**Por que importa**: Aunque los containers tienen IP publica, NADIE desde Internet puede conectarse directamente a ellos. Solo el ALB puede hablarles.

**Analogia**: El container esta en una habitacion con ventanas, pero la puerta solo se abre si tocas con la llave correcta (el Security Group del ALB).

---

#### Security Group de VPC Endpoints

**Nombre**: reeva-dev-vpc-endpoints-sg

**Reglas Inbound**:
- Puerto 443 (HTTPS) desde 10.0.0.0/16 → Solo recursos dentro de la VPC pueden usar los endpoints

**Por que importa**: Los VPC Endpoints son puertas privadas a servicios de AWS. Solo tu VPC puede usarlos.

---

### Network ACLs (Firewall de Subnet - Stateless)

**Que son**: Firewalls a nivel de subnet que funcionan como segunda capa de seguridad.

**Caracteristica importante**: Son STATELESS - debes configurar reglas de entrada Y salida explicitamente.

---

#### NACL de Subnets Publicas

**Nombre**: reeva-dev-public-nacl

**Reglas Inbound**:
- **100**: HTTP (80) desde 0.0.0.0/0 → Permitir requests web
- **110**: HTTPS (443) desde 0.0.0.0/0 → Permitir requests seguros
- **120**: Puertos 1024-65535 desde 0.0.0.0/0 → Permitir respuestas (puertos efimeros)
- **Default**: Denegar todo lo demas

**Reglas Outbound** (CRITICA):
- **100**: HTTP (80) a 0.0.0.0/0 → Enviar respuestas web
- **110**: HTTPS (443) a 0.0.0.0/0 → Enviar respuestas seguras
- **120**: Puertos 1024-65535 a 0.0.0.0/0 → SUPER IMPORTANTE (explicacion abajo)
- **130**: Puertos 1024-65535 a 10.0.0.0/16 → Comunicacion interna
- **Default**: Denegar todo lo demas

---

#### LA REGLA MAS IMPORTANTE: NACL 120 Egress

**Por que existe**: Las NACLs son stateless (no recuerdan conexiones).

**El problema sin esta regla**:
1. Un cliente en Internet (IP 203.0.113.5) hace request al ALB en puerto 80
2. El cliente usa un puerto aleatorio (ejemplo: 54321) para recibir la respuesta
3. El ALB recibe el request (NACL inbound rule 100 permite puerto 80)
4. El ALB quiere responder desde puerto 80 hacia puerto 54321 del cliente
5. Sin regla 120 egress, la NACL bloquea la respuesta porque solo permite egress a 10.0.0.0/16
6. La aplicacion da timeout y es inaccesible desde Internet

**La solucion**: Regla 120 egress permite trafico saliente a 0.0.0.0/0 en puertos 1024-65535 (rango de puertos efimeros).

**Debugging**: Este problema tomo 2 horas identificar porque la app funcionaba en Postman local pero no desde Internet.

**Analogia**: Es como si alguien te llama por telefono, tu contestas, pero el telefono no te deja hablar de vuelta. Necesitas una regla que permita las respuestas.

---

### VPC Endpoints (Puertas Privadas a AWS)

**Que son**: Conexiones privadas entre tu VPC y servicios de AWS, sin salir a Internet publico.

**Por que los usamos**: Eliminan la necesidad de NAT Gateway ($32/mes), manteniendo el trafico dentro de la red de AWS.

---

#### Gateway Endpoints (Gratuitos)

**1. DynamoDB Gateway Endpoint**
- **ID**: vpce-0aaab3204c30dbc32
- **Service**: com.amazonaws.us-east-1.dynamodb
- **Como funciona**: Agrega una ruta en la route table que dirige trafico a DynamoDB por red privada de AWS
- **Beneficio**: Latencia mas baja (~5ms vs ~15ms via Internet), sin costo

**2. S3 Gateway Endpoint**
- **ID**: vpce-047869953d58a5cc4
- **Service**: com.amazonaws.us-east-1.s3
- **Como funciona**: Igual que DynamoDB, ruta privada
- **Por que lo necesitas**: ECR guarda las capas de Docker en S3 internamente

---

#### Interface Endpoints (~$7/mes cada uno)

**3. ECR API Endpoint**
- **ID**: vpce-032d3123c2b5c2910
- **Service**: com.amazonaws.us-east-1.ecr.api
- **Como funciona**: Crea una interfaz de red (ENI) en tus subnets con IP privada
- **Para que**: Fargate puede autenticarse y pedir informacion de imagenes Docker sin salir a Internet

**4. ECR DKR Endpoint**
- **ID**: vpce-08ddcbd1dec377e79
- **Service**: com.amazonaws.us-east-1.ecr.dkr
- **Para que**: Fargate puede descargar (pull) las imagenes Docker sin salir a Internet

**5. CloudWatch Logs Endpoint**
- **ID**: vpce-0516c4fc1ac12ba98
- **Service**: com.amazonaws.us-east-1.logs
- **Para que**: Los containers pueden enviar logs a CloudWatch sin salir a Internet

**Analogia**: En lugar de salir de tu casa, caminar por la calle publica hasta la tienda (Internet), tienes un tunel privado directo desde tu sotano a la tienda (VPC Endpoint).

---

## 3. BALANCEADOR DE CARGA (ALB)

### Application Load Balancer

**Que es**: Un "portero inteligente" que recibe todas las peticiones de Internet y las distribuye a los containers.

**Configuracion**:
- **Nombre**: reeva-dev-alb
- **DNS**: reeva-dev-alb-2062089697.us-east-1.elb.amazonaws.com
- **Tipo**: Application Load Balancer (capa 7 - HTTP/HTTPS)
- **Scheme**: Internet-facing (accesible desde Internet)
- **Availability Zones**: us-east-1a y us-east-1b

**Como funciona**:
1. Usuario escribe la URL del ALB en su navegador
2. ALB recibe el request en puerto 80
3. ALB verifica que el container este "healthy" (vivo)
4. ALB envia el request al container en puerto 3001
5. Container procesa y responde
6. ALB devuelve la respuesta al usuario

**Redundancia Multi-AZ**:
- El ALB tiene nodos en 2 availability zones
- Si us-east-1a falla, el nodo en us-east-1b sigue funcionando
- Failover automatico en ~30-60 segundos

**Analogia**: Es como el recepcionista de un hotel. Tu llegas y pides una habitacion, el recepcionista verifica que haya habitaciones disponibles y te asigna una.

---

### Target Group

**Que es**: Un "grupo" de destinos (containers) donde el ALB puede enviar trafico.

**Configuracion**:
- **Nombre**: reeva-dev-tg
- **Protocolo**: HTTP
- **Puerto**: 3001
- **Tipo**: IP (para Fargate)

**Health Checks** (Verificacion de Salud):
- **Path**: /health
- **Intervalo**: 30 segundos
- **Timeout**: 5 segundos
- **Healthy threshold**: 2 checks consecutivos exitosos
- **Unhealthy threshold**: 3 checks consecutivos fallidos

**Como funciona**:
1. Cada 30 segundos, el ALB hace `GET /health` al container
2. Si el container responde 200 OK → "healthy"
3. Si el container no responde o da error → "unhealthy"
4. Si esta unhealthy, ALB deja de enviarle trafico

**Por que importa**: Si tu container crashea, el ALB lo detecta en 30 segundos y deja de enviarle requests (evita errores para usuarios).

---

## 4. CONTAINERS (ECS FARGATE)

### ECS Cluster

**Que es**: Un contenedor logico donde viven tus servicios y tareas de containers.

**Configuracion**:
- **Nombre**: reeva-dev-cluster
- **Tipo**: Fargate (serverless - no gestionas servidores)

**Para que sirve**: Organiza y gestiona todos tus containers. Es como el "administrador" de containers.

---

### ECS Service

**Que es**: Define como quieres que se ejecuten tus containers (cuantos, donde, que hacer si fallan).

**Configuracion**:
- **Nombre**: reeva-dev-service
- **Desired count**: 1 (quiero 1 container corriendo siempre)
- **Launch type**: Fargate Spot (70% mas barato que on-demand)
- **Subnets**: us-east-1a y us-east-1b
- **Health check grace period**: 60 segundos

**Auto-healing** (Auto-recuperacion):
1. Container crashea o falla health check
2. ECS detecta que running count (1) < desired count (1)
3. ECS automaticamente inicia un nuevo container
4. Nuevo container se registra en el Target Group
5. ALB detecta que el nuevo container esta healthy
6. ALB empieza a enviar trafico al nuevo container
7. Tiempo de recuperacion: ~60-90 segundos

**Por que Fargate Spot**: Cuesta $3.50/mes vs $11.67/mes on-demand. El riesgo es que AWS puede interrumpir tu tarea con 2 minutos de aviso, pero con auto-healing se reinicia automaticamente.

---

### Task Definition (Definicion de Tarea)

**Que es**: La "receta" de como construir y ejecutar tu container.

**Configuracion**:
- **Family**: reeva-dev-task
- **CPU**: 256 (0.25 vCPU)
- **Memoria**: 512 MB
- **Imagen**: 402341712953.dkr.ecr.us-east-1.amazonaws.com/reeva-dev-app:latest
- **Puerto**: 3001

**Variables de entorno** (30 variables):
- Configuracion de base de datos (DynamoDB tables)
- Credenciales de Cognito (autenticacion)
- Secrets (JWT, OpenAI API key, Twilio, etc)
- Configuracion de aplicacion (NODE_ENV, PORT, etc)

**Logs**:
- **Destino**: CloudWatch Logs
- **Log Group**: /ecs/reeva-dev
- **Stream**: Por cada container

**Analogia**: Es como una receta de cocina. Le dice a ECS "usa esta imagen Docker, dale 512MB de RAM, exponla en puerto 3001, y pasale estas variables de entorno".

---

### ECR (Elastic Container Registry)

**Que es**: Un "Docker Hub privado" de AWS donde guardas tus imagenes Docker.

**Configuracion**:
- **Repositorio**: reeva-dev-app
- **URI**: 402341712953.dkr.ecr.us-east-1.amazonaws.com/reeva-dev-app

**Como funciona**:
1. Haces build de tu imagen Docker localmente: `docker build -t reeva-app .`
2. Te autentificas en ECR: `aws ecr get-login-password | docker login ...`
3. Tageas la imagen: `docker tag reeva-app:latest 402341712953.dkr.ecr.../reeva-dev-app:latest`
4. Pusheas la imagen: `docker push 402341712953.dkr.ecr.../reeva-dev-app:latest`
5. Fargate pull de la imagen cuando inicia un container

**Por que privado**: Las imagenes Docker pueden contener secrets, codigo propietario, etc. No quieres que esten publicas.

---

## 5. SEGURIDAD AVANZADA (WAF)

### AWS WAF (Web Application Firewall)

**Que es**: Un firewall de capa 7 (aplicacion) que filtra trafico HTTP/HTTPS malicioso ANTES de que llegue al ALB.

**Configuracion**:
- **Web ACL**: reeva-dev-waf
- **Scope**: Regional (us-east-1)
- **Associated resource**: ALB
- **Default action**: ALLOW (permite todo excepto lo que bloquean las reglas)

---

#### Regla 1: Rate Limiting (Anti-DDoS)

**Que hace**: Bloquea IPs que hagan mas de 2000 requests en 5 minutos.

**Por que**: Protege contra ataques de denegacion de servicio (DoS/DDoS) donde un atacante envia miles de requests para tumbar tu servidor.

**Ejemplo**:
- IP 203.0.113.5 hace 2500 requests en 5 minutos
- WAF detecta que supero el limite (2000)
- WAF bloquea la IP por 5 minutos
- Usuario normal nunca hace 2000 requests en 5 minutos, asi que no le afecta

---

#### Regla 2: SQL Injection Protection

**Que hace**: Detecta y bloquea intentos de inyeccion SQL en requests.

**Que es SQL Injection**: Un ataque donde metes codigo SQL malicioso en formularios para robar/modificar datos.

**Ejemplo bloqueado**:
```
GET /?id=1' OR '1'='1
POST /login
  Body: username=' OR 1=1--&password=cualquiercosa
```

**Por que importa**: Aunque usas DynamoDB (NoSQL) y no SQL, el WAF bloquea estos patrones maliciosos igualmente.

---

#### Regla 3: OWASP Core Rule Set

**Que hace**: Bloquea las 10 vulnerabilidades web mas comunes segun OWASP.

**Protecciones incluidas**:
- Cross-Site Scripting (XSS): Codigo JavaScript malicioso en formularios
- Local File Inclusion (LFI): Intentos de leer archivos del servidor
- Remote File Inclusion (RFI): Intentos de ejecutar archivos remotos
- Command Injection: Intentos de ejecutar comandos del sistema
- Path Traversal: Intentos de acceder a directorios prohibidos (ej: ../../etc/passwd)

**Ejemplo XSS bloqueado**:
```
GET /?search=<script>alert('hack')</script>
```

---

#### Regla 4: Known Bad Inputs

**Que hace**: Bloquea patrones conocidos de payloads maliciosos y user-agents de bots maliciosos.

**Ejemplos**:
- User-Agent de herramientas de hacking (sqlmap, nikto, etc)
- Patrones de exploits conocidos
- Firmas de malware

---

## 6. PERMISOS (IAM)

### Principio de Minimo Privilegio

**Que significa**: Cada recurso solo tiene los permisos MINIMOS que necesita para funcionar, nada mas.

**Por que importa**: Si un atacante compromete un container, solo puede hacer lo que ese container tenia permitido, no puede destruir toda tu infraestructura.

---

### Task Execution Role

**Nombre**: reeva-dev-ecs-task-execution

**Que hace**: Permite a ECS (el orquestador) hacer setup inicial del container.

**Permisos**:
- `ecr:GetAuthorizationToken` → Autenticarse en ECR
- `ecr:BatchCheckLayerAvailability` → Verificar que capas de Docker existen
- `ecr:GetDownloadUrlForLayer` → Obtener URL para descargar capas
- `ecr:BatchGetImage` → Descargar imagen completa
- `logs:CreateLogStream` → Crear stream de logs
- `logs:PutLogEvents` → Escribir logs
- `secretsmanager:GetSecretValue` → **Leer secrets de Secrets Manager**

**Que NO puede hacer**: Modificar infraestructura, leer DynamoDB, borrar recursos, etc.

**Analogia**: Es como el permiso para que el portero del edificio pueda abrir la puerta de tu departamento para meter tus muebles, pero no puede vivir ahi ni usar tus cosas.

---

### Task Role

**Nombre**: reeva-dev-ecs-task

**Que hace**: Permite al container (tu aplicacion Node.js) acceder a servicios AWS.

**Permisos DynamoDB**:
```
Acciones permitidas:
- dynamodb:GetItem (leer un item)
- dynamodb:PutItem (crear un item)
- dynamodb:UpdateItem (actualizar un item)
- dynamodb:DeleteItem (borrar un item)
- dynamodb:Query (buscar items)
- dynamodb:Scan (escanear tabla)

Recursos permitidos: SOLO estas 20 tablas
- arn:aws:dynamodb:us-east-1:*:table/tipoprofesional
- arn:aws:dynamodb:us-east-1:*:table/tipousuario
- ... (20 tablas especificas)
```

**Permisos Cognito**:
```
Acciones permitidas:
- cognito-idp:AdminGetUser
- cognito-idp:AdminCreateUser
- cognito-idp:AdminSetUserPassword
- cognito-idp:AdminInitiateAuth
- cognito-idp:AdminRespondToAuthChallenge

Recursos permitidos: SOLO el User Pool creado por Terraform
- arn:aws:cognito-idp:us-east-1:*:userpool/[USER_POOL_ID]
```

**Que NO puede hacer**: 
- Acceder a otras tablas DynamoDB que no estan en la lista
- Borrar tablas
- Modificar otros User Pools de Cognito
- Crear recursos nuevos
- Acceder a S3, Lambda, EC2, etc (no tiene permisos)

**Analogia**: Es como tener llave de tu departamento y el gym del edificio, pero no puedes entrar a otros departamentos ni a las oficinas administrativas.

---

### AWS Secrets Manager

**Que es**: Servicio para guardar credenciales sensibles de forma segura.

**Secrets almacenados**:

**Secret 1: dev-reeva-app-secrets**
- JWT_SECRET (firma de tokens JWT)
- SESSION_SECRET (encriptacion de sesiones)
- TWILIO_ACCOUNT_SID (credencial Twilio)
- TWILIO_AUTH_TOKEN (credencial Twilio)
- OPENAI_API_KEY (credencial OpenAI)

**Secret 2: dev-reeva-admin-credentials**
- ADMIN_EMAIL (email del usuario admin inicial)
- ADMIN_PASSWORD (password temporal del admin)

**Como funciona**:
1. Secrets se crean ANTES de Terraform (manual, UNA VEZ)
2. Terraform lee los secrets para crear usuario admin en Cognito
3. ECS Task Execution Role tiene permiso para leer secrets
4. Container recibe secrets como variables de entorno al iniciar
5. Aplicacion Node.js usa los secrets (JWT_SECRET, etc)

**Beneficios**:
- Pro: Credenciales NUNCA en codigo fuente
- Pro: Rotacion facil (cambias secret, reinicias container)
- Pro: Auditoria completa (CloudTrail registra quien accede)
- Pro: Encriptacion automatica (KMS)

**Costo**: $0.40 por secret/mes = $0.80/mes total

**Analogia**: Es como una caja fuerte donde guardas tus passwords. La caja fuerte tiene su propia llave (IAM permissions), y solo quien tiene la llave puede abrir y leer los passwords.

---

## 7. MONITOREO (CLOUDWATCH)

### CloudWatch Logs

**Que es**: Un servicio que guarda todos los logs (registros) de tu aplicacion.

**Configuracion**:
- **Log Group**: /ecs/reeva-dev
- **Retention**: 7 dias (configurable)
- **Streams**: Un stream por cada container que se ejecuta

**Que se guarda**:
- Console.log() de tu aplicacion Node.js
- Errores y stack traces
- Requests HTTP (si los logueas)
- Inicio/apagado de containers

**Como ver logs**:
```bash
# Ver ultimos logs
aws logs tail /ecs/reeva-dev --follow

# Ver logs de las ultimas 2 horas
aws logs tail /ecs/reeva-dev --since 2h
```

---

### CloudWatch Alarms (7 alarmas)

**Que son**: "Alertas automaticas" que te avisan cuando algo anda mal.

---

#### Alarmas del ALB (4)

**1. Unhealthy Hosts**
- **Metrica**: UnHealthyHostCount
- **Threshold**: > 0
- **Que detecta**: Cuando el Target Group tiene containers no saludables
- **Cuando se activa**: Si el container falla health checks
- **Accion**: Envia notificacion SNS

**2. High Response Time**
- **Metrica**: TargetResponseTime
- **Threshold**: > 2 segundos (promedio)
- **Que detecta**: Cuando la app responde muy lento
- **Causas posibles**: CPU alta, memoria alta, base de datos lenta, codigo ineficiente
- **Accion**: Envia notificacion SNS

**3. 5xx Errors**
- **Metrica**: HTTPCode_Target_5XX_Count
- **Threshold**: > 10 errores por minuto
- **Que detecta**: Errores de servidor (crashes, exceptions no manejadas)
- **Causas posibles**: Bugs en codigo, base de datos caida, dependencias rotas
- **Accion**: Envia notificacion SNS

**4. Low Request Count**
- **Metrica**: RequestCount
- **Threshold**: < 1 request en 15 minutos
- **Que detecta**: Cuando nadie esta usando la aplicacion (posible problema DNS/red)
- **Causas posibles**: DNS roto, ALB inaccesible, WAF bloqueando todo
- **Accion**: Envia notificacion SNS

---

#### Alarmas de ECS (2)

**1. High CPU**
- **Metrica**: CPUUtilization
- **Threshold**: > 80%
- **Que detecta**: Cuando el container usa mucho CPU
- **Causas posibles**: Trafico alto, loop infinito, operaciones pesadas
- **Accion**: Envia notificacion SNS

**2. High Memory**
- **Metrica**: MemoryUtilization
- **Threshold**: > 80%
- **Que detecta**: Cuando el container usa mucha RAM
- **Causas posibles**: Memory leaks, cache grande, trafico alto
- **Accion**: Envia notificacion SNS

---

#### Alarmas de DynamoDB (1)

**1. Throttling**
- **Metrica**: UserErrors
- **Threshold**: > 10 errores por minuto
- **Que detecta**: Cuando DynamoDB rechaza requests por exceso de capacidad
- **Causas posibles**: Muchas escrituras/lecturas simultaneas
- **Accion**: Envia notificacion SNS

---

### SNS Topic (Canal de Notificaciones)

**Que es**: Un "canal" donde se envian todas las notificaciones de alarmas.

**Configuracion**:
- **Nombre**: reeva-dev-alerts
- **ARN**: arn:aws:sns:us-east-1:402341712953:reeva-dev-alerts

**Como funciona**:
1. Alarma se activa (ejemplo: CPU > 80%)
2. Alarma envia mensaje al SNS Topic
3. SNS envia email a pempeight8@gmail.com
4. Recibes notificacion y puedes investigar

**Nota**: El email requiere confirmacion manual la primera vez (click en link que AWS envia).

---

### CloudWatch Dashboard

**Que es**: Un panel visual con graficas de metricas en tiempo real.

**Configuracion**:
- **Nombre**: reeva-dev-dashboard
- **Widgets**: 3 graficas

**Widget 1: ALB Performance**
- Total Requests (suma)
- Response Time (promedio)
- 2xx Responses (suma)
- 5xx Errors (suma)

**Widget 2: ECS Resource Utilization**
- CPU % (promedio)
- Memory % (promedio)

**Widget 3: Target Group Health**
- Healthy Hosts (promedio)
- Unhealthy Hosts (promedio)

**Como acceder**: AWS Console → CloudWatch → Dashboards → reeva-dev-dashboard

---

## 8. CONTROL DE COSTOS

### AWS Budget

**Que es**: Un limite de gasto mensual con alertas.

**Configuracion**:
- **Nombre**: reeva-dev-monthly-budget
- **Amount**: $20 USD/mes
- **Alerts**: 
  - 80% del presupuesto ($16)
  - 100% del presupuesto ($20)

**Como funciona**:
1. AWS calcula tus gastos diarios
2. Si llegas a $16 (80%), te envia email de advertencia
3. Si llegas a $20 (100%), te envia email de alerta maxima
4. NO apaga recursos automaticamente (solo alerta)

**Costo real estimado**: $51-80/mes (excede el budget)

**Componentes mas caros**:
- ALB: $16/mes
- VPC Endpoints (3 interface): $21/mes
- WAF: $5/mes
- Fargate Spot: $3.50/mes
- DynamoDB: Variable (on-demand)

---

## 9. DATOS (DYNAMODB)

### DynamoDB

**Que es**: Base de datos NoSQL (sin SQL) serverless de AWS.

**Configuracion**:
- **Tablas**: 20 tablas (gestionadas por Terraform)
- **Modo**: On-Demand (pagas por request, no por capacidad)
- **Encryption**: SSE (Server-Side Encryption) con AWS Managed Keys

**Tablas de catalogo/tipo (8)**:
- tipoprofesional
- tipousuario
- tipoconsulta
- tipoestado (con seed automatico de 6 estados)
- tipobox
- tipoitem
- personalizacion
- estadobox

**Tablas principales (5)**:
- usuario
- box
- items
- agenda (con indices GSI: HoraInicioIndex, UsuarioIndex)
- registroagenda

**Tablas de autenticacion y parametrizacion (7)**:
- users (con indice GSI: EmailIndex)
- parameters-new
- empresas-new
- espacios
- ocupantes
- items-mesas
- empresa-items

**Seed automatico**: La tabla `tipoestado` se puebla automaticamente con 6 estados despues de `terraform apply`:
1. Libre (atendido=0, vino=0)
2. Paciente Ausente (atendido=0, vino=0)
3. Paciente Esperando (atendido=0, vino=1)
4. En Atencion (atendido=1, vino=1)
5. Inhabilitado (atendido=0, vino=0)
6. Finalizado (atendido=0, vino=0)

**Gestionado por Terraform**: Si. Todas las tablas estan definidas en `dynamodb.tf`. Puedes hacer `terraform destroy` y `terraform apply` para recrearlas desde cero (seed se ejecuta automaticamente).

**Beneficio**: Infraestructura 100% reproducible. Si algo falla, puedes recrear toda la base de datos con un comando.

---

## 10. AUTENTICACION (COGNITO)

### AWS Cognito User Pool

**Que es**: Un servicio de autenticacion de usuarios (login/registro) gestionado por AWS.

**Configuracion**:
- **User Pool ID**: Generado automaticamente por Terraform
- **Region**: us-east-1
- **Client ID**: Generado automaticamente por Terraform
- **Username**: Email (los usuarios usan su email para login)
- **Password Policy**: Minimo 8 caracteres, 1 mayuscula, 1 minuscula, 1 numero

**Grupo de administradores**:
- **Nombre**: Admins
- **Precedencia**: 1 (mayor prioridad)
- **Descripcion**: Full access administrators

**Usuario admin inicial**:
- **Email**: Leido desde AWS Secrets Manager (`dev-reeva-admin-credentials`)
- **Password**: Temporal (leido desde Secrets Manager)
- **Creacion**: Automatica via Terraform
- **Primer login**: Cognito obliga a cambiar password
- **Permisos**: Miembro del grupo Admins

**Como funciona**:
1. Usuario ingresa email y password en tu app
2. App envia credenciales a Cognito
3. Cognito valida y retorna un JWT token
4. App guarda el token en session/cookie
5. Requests subsecuentes incluyen el token
6. Backend valida el token con Cognito

**Gestionado por Terraform**: Si. El User Pool, Client, grupo Admins y usuario admin se crean automaticamente con `terraform apply`. Las credenciales del admin vienen de Secrets Manager (seguro, no hardcoded).

**Beneficio**: Al hacer `terraform destroy` + `terraform apply`, se recrea el User Pool completo con el admin funcional desde el primer momento.

---

## 11. FLUJO COMPLETO DE UN REQUEST

Veamos que pasa cuando un usuario visita tu aplicacion:

### Paso 1: Usuario escribe URL
```
Usuario → navegador: http://reeva-dev-alb-2062089697.us-east-1.elb.amazonaws.com
```

### Paso 2: DNS resuelve a IPs del ALB
```
DNS → Usuario: 44.197.64.253, 44.209.3.91
```

### Paso 3: Request llega a WAF
```
Usuario → WAF: GET / HTTP/1.1
```

WAF verifica:
- ✅ IP no esta en lista negra
- ✅ No es SQL injection
- ✅ No excede rate limit
- ✅ PASA → envia a ALB

### Paso 4: WAF envia a ALB
```
WAF → ALB: GET / HTTP/1.1
```

### Paso 5: ALB verifica Security Group
```
ALB Security Group verifica:
- ✅ Puerto 80 desde 0.0.0.0/0 PERMITIDO
- ✅ PASA
```

### Paso 6: ALB verifica Target Group Health
```
ALB consulta Target Group:
- Target 10.0.1.16:3001 → Status: healthy ✅
- ✅ PASA → envia a este target
```

### Paso 7: ALB envia a Container
```
ALB → Container (10.0.1.16:3001): GET / HTTP/1.1
```

### Paso 8: Request pasa por Security Group de Fargate
```
Fargate Security Group verifica:
- ✅ Puerto 3001 desde sg-alb PERMITIDO
- ✅ PASA
```

### Paso 9: Container procesa request
```
Container Node.js:
1. Express recibe GET /
2. Middleware de autenticacion verifica session
3. No hay session → redirige a /auth/login
4. Responde: HTTP 302 Location: /auth/login
```

### Paso 10: Container envia respuesta
```
Container → ALB: HTTP 302 Location: /auth/login
```

### Paso 11: ALB envia respuesta a usuario
```
ALB → Usuario: HTTP 302 Location: /auth/login
```

### Paso 12: Navegador redirige
```
Navegador → WAF → ALB → Container: GET /auth/login
Container → ALB → WAF → Navegador: HTML de pagina de login
```

### Paso 13: Usuario ve la pagina
```
Navegador renderiza: Formulario de login
```

**Tiempo total**: ~50-100ms

---

## 12. FLUJO DE DESPLIEGUE (CI/CD MANUAL)

Cuando haces cambios en el codigo:

### Paso 1: Hacer build de imagen Docker
```bash
cd /ruta/a/tu/app
docker build -t reeva-app .
```

### Paso 2: Autenticarse en ECR
```bash
aws ecr get-login-password --region us-east-1 | \
  docker login --username AWS --password-stdin \
  402341712953.dkr.ecr.us-east-1.amazonaws.com
```

### Paso 3: Tagear imagen
```bash
docker tag reeva-app:latest \
  402341712953.dkr.ecr.us-east-1.amazonaws.com/reeva-dev-app:latest
```

### Paso 4: Push a ECR
```bash
docker push 402341712953.dkr.ecr.us-east-1.amazonaws.com/reeva-dev-app:latest
```

### Paso 5: Forzar nuevo deployment en ECS
```bash
aws ecs update-service \
  --cluster reeva-dev-cluster \
  --service reeva-dev-service \
  --force-new-deployment
```

### Paso 6: ECS hace rolling update
```
1. ECS inicia nuevo container con nueva imagen
2. Nuevo container arranca y pasa health checks
3. ALB marca nuevo container como healthy
4. ALB empieza a enviar trafico al nuevo container
5. ECS detiene container viejo
6. Deployment completo
```

**Tiempo total**: ~2-3 minutos

**Downtime**: 0 segundos (si hicieras desired_count=2, sino hay ~60 segundos)

---

## 13. RESUMEN DE DECISIONES ARQUITECTONICAS

### Decision 1: Subnets Publicas sin NAT Gateway

**Alternativa tradicional**: Subnet privada + NAT Gateway

**Por que NO lo hicimos**:
- NAT Gateway cuesta $32/mes (40% del presupuesto)
- VPC Endpoints eliminan necesidad de NAT
- Security Groups proveen la misma seguridad

**Trade-off**:
- Pro: Ahorro de $32/mes
- Pro: Menor latencia a servicios AWS (VPC Endpoints)
- Contra: No cumple literalmente requisito de "subnet privada"
- Contra: Containers tienen IP publica (aunque inaccesibles por SG)

**Validez**: Arquitectura valida y comun en produccion real

---

### Decision 2: Fargate Spot en lugar de On-Demand

**Alternativa**: Fargate On-Demand

**Por que usamos Spot**:
- 70% mas barato ($3.50/mes vs $11.67/mes)
- Auto-healing compensa interrupciones
- Para ambiente dev/staging es suficiente

**Trade-off**:
- Pro: Ahorro de $8/mes
- Contra: AWS puede interrumpir con 2 min de aviso
- Contra: No recomendado para produccion critica

---

### Decision 3: DynamoDB y Cognito gestionados por Terraform

**Estrategia actual**: Infraestructura 100% reproducible

**Como se gestiona**:
- 20 tablas DynamoDB definidas en Terraform
- Cognito User Pool completo en Terraform
- Secrets Manager para credenciales (fuera de Terraform)
- Script automatico de seed para tabla tipoestado

**Beneficios**:
- Pro: `terraform destroy` + `terraform apply` recrea TODO
- Pro: Infraestructura como codigo completamente trazable
- Pro: Seed automatico de datos iniciales
- Pro: Facil de replicar en otros ambientes (staging, prod)

**Trade-offs**:
- Contra: Requiere import inicial de recursos existentes
- Contra: Secrets deben crearse manualmente ANTES de Terraform
- Mitigacion: Scripts automatizados para import y seed

**Flujo de deployment**:
1. Crear secrets en Secrets Manager (manual, UNA VEZ)
2. `terraform apply` crea TODO (tablas, cognito, infra)
3. Script seed puebla tabla tipoestado automaticamente
4. Push imagen Docker + deploy a ECS

---

### Decision 4: VPC Endpoints Interface en lugar de solo Gateway

**Alternativa**: Solo gateway endpoints + Internet para ECR

**Por que usamos Interface**:
- Mejor seguridad (trafico no sale a Internet)
- Menor latencia para pull de imagenes Docker
- Cumple mejor las buenas practicas

**Trade-off**:
- Pro: Mejor seguridad y latencia
- Contra: Costo adicional de $21/mes (3 endpoints x $7)

---

## 14. PROBLEMAS RESUELTOS DURANTE IMPLEMENTACION

### Problema 1: Aplicacion inaccesible desde Internet

**Sintoma**: Timeout al acceder a la URL del ALB desde navegador

**Debugging**:
1. Health check del container: OK ✅
2. Security Groups: OK ✅
3. ALB activo: OK ✅
4. Curl desde EC2 en misma VPC: OK ✅
5. Curl desde Internet: TIMEOUT ❌

**Causa raiz**: NACL bloqueaba respuestas HTTP en puertos efimeros

**Solucion**: Agregar regla 120 egress a 0.0.0.0/0 para puertos 1024-65535

**Tiempo de debugging**: 2 horas

**Leccion aprendida**: NACLs stateless requieren reglas bidireccionales explicitas

---

### Problema 2: Login fallaba con "Credenciales invalidas"

**Sintoma**: Formulario de login siempre daba error, incluso con credenciales correctas

**Debugging**:
1. Logs del container: "Cognito User Pool ID undefined"
2. Variables de entorno: Faltaban 5 variables de Cognito

**Causa raiz**: Task definition no tenia variables de Cognito

**Solucion**: Agregar estas variables en ecs.tf:
```
COGNITO_USER_POOL_ID
COGNITO_CLIENT_ID
COGNITO_REGION
COGNITO_DOMAIN
COGNITO_REDIRECT_URI
```

**Tiempo de debugging**: 30 minutos

**Leccion aprendida**: Todas las env vars deben estar en task definition, no asume nada

---

### Problema 3: Container no podia pull imagen de ECR

**Sintoma**: Task en estado PENDING indefinidamente, luego falla

**Debugging**:
1. Logs: "CannotPullContainerError"
2. Task execution role permisos: OK ✅
3. ECR repository existe: OK ✅
4. Imagen existe: OK ✅

**Causa raiz**: VPC Endpoints de ECR no estaban en las subnets correctas

**Solucion**: Agregar endpoints en ambas subnets (us-east-1a y us-east-1b)

**Tiempo de debugging**: 1 hora

**Leccion aprendida**: VPC Endpoints deben estar en las mismas subnets que Fargate

---

## 15. MEJORAS FUTURAS

### Corto Plazo (1-2 semanas)

**1. HTTPS con certificado SSL**
- Crear certificado en AWS Certificate Manager
- Agregar listener 443 en ALB
- Redirigir HTTP → HTTPS
- Costo: $0 (ACM es gratis)

**2. Migrar secrets a AWS Secrets Manager**
- Sacar JWT_SECRET, API keys de env vars
- Guardar en Secrets Manager
- Referenciar desde task definition
- Costo: $0.40/secret/mes

**3. Auto-scaling basico**
- Min 1, Max 3 tasks
- Scale up si CPU > 70%
- Scale down si CPU < 30%
- Costo: Variable segun uso

---

### Mediano Plazo (1 mes)

**1. CI/CD con GitHub Actions**
- Push a main → build automatico
- Tests automaticos
- Deploy automatico a ECS
- Costo: $0 (GitHub Actions gratis para repos publicos)

**2. CloudFront CDN**
- Cache de assets estaticos
- Mejor latencia global
- Menor carga en ALB
- Costo: $0.085/GB

**3. Point-in-Time Recovery en DynamoDB**
- Backups continuos
- Restaurar a cualquier punto de ultimos 35 dias
- Costo: $0.20/GB/mes

---

### Largo Plazo (3+ meses)

**1. Multi-region deployment**
- Replica en us-west-2
- Route53 con failover
- RTO < 5 minutos
- Costo: x2 infraestructura

**2. AWS Config para compliance**
- Auditoria automatica de configuraciones
- Alertas de cambios no autorizados
- Cumplimiento de normas
- Costo: $2/mes

**3. Subnet privada + NAT Gateway**
- Si presupuesto aumenta
- Cumplir requisito literal del examen
- Mejor aislamiento
- Costo: +$32/mes

---

## 16. EVIDENCIAS PARA EL EXAMEN

### Screenshots necesarios (10)

1. VPC Resource Map (VPC, subnets, IGW en un diagrama)
2. Application Load Balancer (estado active, 2 AZs)
3. Target Group Health (target healthy)
4. ECS Service (running count = 1)
5. Security Groups (reglas de ALB y Fargate)
6. Network ACLs (7 reglas inbound/outbound)
7. WAF Web ACL (4 reglas activas)
8. CloudWatch Alarms (7 alarms en OK)
9. VPC Endpoints (5 endpoints listados)
10. IAM Roles (2 roles con policies)

### Comandos para demo en vivo (5)

1. Health check: `curl http://ALB-DNS/health`
2. ECS status: `aws ecs describe-services ...`
3. Target health: `aws elbv2 describe-target-health ...`
4. Terraform resources: `terraform state list | wc -l`
5. CloudWatch alarms: `aws cloudwatch describe-alarms ...`

### Pagina funcionando

1. Abrir navegador: http://reeva-dev-alb-2062089697.us-east-1.elb.amazonaws.com
2. Mostrar redireccion a /auth/login
3. Mostrar pagina de login (Cognito)

---

## GLOSARIO DE TERMINOS

**Availability Zone (AZ)**: Datacenter fisico de AWS. Cada region tiene multiples AZs para redundancia.

**CIDR**: Notacion para rangos de IPs. Ejemplo: 10.0.0.0/16 = 65,536 IPs desde 10.0.0.0 hasta 10.0.255.255.

**Container**: Empaquetado de aplicacion con todas sus dependencias. Como una "caja" aislada que corre tu app.

**Egress**: Trafico saliente (de tu VPC hacia afuera).

**Ingress**: Trafico entrante (de afuera hacia tu VPC).

**Stateful**: Firewall que recuerda conexiones. Si permites entrada, automaticamente permite salida de respuesta.

**Stateless**: Firewall que NO recuerda conexiones. Debes configurar entrada Y salida explicitamente.

**Ephemeral ports**: Puertos aleatorios (1024-65535) que usa tu computadora para recibir respuestas.

**Health check**: Verificacion periodica de que un servicio esta funcionando correctamente.

**Failover**: Cambio automatico a recurso de respaldo cuando el principal falla.

**Auto-healing**: Recuperacion automatica sin intervencion humana.

**Serverless**: No gestionas servidores, solo codigo. AWS se encarga de la infraestructura.

**On-Demand**: Pagas por uso continuo, precio fijo.

**Spot**: Pagas 70% menos, pero AWS puede interrumpir con aviso.

**SSE**: Server-Side Encryption - cifrado en reposo.

**JWT**: JSON Web Token - token de autenticacion.

**NACL**: Network Access Control List - firewall de subnet.

**SG**: Security Group - firewall de instancia.

**WAF**: Web Application Firewall - firewall de aplicacion web.

**ALB**: Application Load Balancer - balanceador capa 7.

**ECR**: Elastic Container Registry - registro de imagenes Docker.

**ECS**: Elastic Container Service - orquestador de containers.

**VPC**: Virtual Private Cloud - red privada virtual.

**IGW**: Internet Gateway - puerta a Internet.

**NAT**: Network Address Translation - traduce IPs privadas a publicas.

**ARN**: Amazon Resource Name - identificador unico de recurso AWS.

---

**Fecha**: Diciembre 2, 2025
**Version**: Final para examen
