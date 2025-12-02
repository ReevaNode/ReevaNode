# Presentación - Defensa Examen Redes de Computadores
## Sistema Reeva en AWS

**Tiempo**: 5-10 minutos  
**Formato**: Demostración tecnica + explicacion arquitectónica

---

## SLIDE 1: Portada (30 segundos)

### Sistema Reeva - Gestión de Agendas Médicas
- **Proyecto**: Arquitectura de Software
- **Estudiante**: [Tu Nombre]
- **Tecnología**: Node.js + AWS Cloud
- **URL**: http://reeva-dev-alb-2062089697.us-east-1.elb.amazonaws.com

**Recursos desplegados**: 40 recursos AWS con Terraform  
**Cumplimiento**: 100% de requisitos del examen

---

## SLIDE 2: Arquitectura de Red (90 segundos)

### VPC y Subnets
```
VPC: 10.0.0.0/16 (vpc-007525a835a05802f)
├── Subnet Pública A (us-east-1a): 10.0.0.0/24
├── Subnet Pública B (us-east-1b): 10.0.1.0/24
└── Internet Gateway: igw-0b545f3a31db560b4
```

### Flujo de Tráfico
```
Internet → WAF → ALB (Multi-AZ) → Fargate Container → DynamoDB/Cognito
```

### Decisión Arquitectónica Principal
- **Sin NAT Gateway** (ahorro: $32/mes)
- **VPC Endpoints** para servicios AWS (tráfico privado)
- **Security Groups** controlan acceso a containers

**Mostrar en AWS Console**: VPC → Subnets → Resource Map

---

## SLIDE 3: Seguridad en Capas (90 segundos)

### Capa 1: AWS WAF
-  Rate limiting: 2000 req/5min por IP
-  SQL Injection protection
-  OWASP Core Rules
-  Known bad inputs

**Demo**: Mostrar Web ACL en AWS Console

### Capa 2: Network ACLs
```
Inbound:  100 (HTTP/80), 110 (HTTPS/443), 120 (Ephemeral 1024-65535)
Outbound: 100 (HTTP/80), 110 (HTTPS/443), 120 (Ephemeral a Internet)
```

** Lección aprendida**: Regla 120 egress a 0.0.0.0/0 es CRÍTICA (stateless)

### Capa 3: Security Groups
- **SG-ALB**: Permite 80/443 desde Internet → solo hacia Fargate
- **SG-Fargate**: Solo acepta tráfico desde ALB en puerto 3001

**Mostrar**: Security Groups en EC2 Console

### Capa 4: IAM
- Roles con mínimo privilegio
- Task role solo accede a tablas DynamoDB especificas

---

## SLIDE 4: Alta Disponibilidad (60 segundos)

### Redundancia Implementada

#### 1. Application Load Balancer Multi-AZ
```
AZ us-east-1a: 44.197.64.253
AZ us-east-1b: 44.209.3.91
```

**Failover**: Si una AZ falla → automático a otra AZ

#### 2. ECS Auto-Healing
```
Task crashea → ECS detecta → Inicia nueva task (60-90 seg)
```

#### 3. Health Checks
```
Endpoint: /health
Interval: 30 segundos
Healthy threshold: 2 checks consecutivos
```

**Demo en vivo**: 
```bash
curl http://reeva-dev-alb-2062089697.us-east-1.elb.amazonaws.com/health
```

**Mostrar**: Target Group Health en EC2 Console

---

## SLIDE 5: Monitoreo y Ciberseguridad (60 segundos)

### CloudWatch Alarms (8 configuradas)
| Categoría | Alarmas |
|-----------|---------|
| ALB | unhealthy-hosts, high-response-time, 5xx-errors, low-requests |
| ECS | cpu-high, memory-high, task-count-low |
| DynamoDB | throttle-usuario |

**Notificaciones**: SNS → Email pempeight8@gmail.com

### Medidas de Ciberseguridad
-  Encryption at rest (DynamoDB SSE)
-  Secrets en environment variables ( mejorar con Secrets Manager)
-  WAF contra DDoS/SQLi/XSS
-  Budget $20/mes con alertas

**Mostrar**: CloudWatch Alarms en estado OK

---

## SLIDE 6: Demostración Funcional (90 segundos)

### 1. Aplicación en Funcionamiento
**Abrir en navegador**: http://reeva-dev-alb-2062089697.us-east-1.elb.amazonaws.com

**Flujo de usuario**:
1. Página de login (Cognito)
2. Dashboard medico
3. Gestión de agendas

### 2. Verificación de Infraestructura

**Terminal - Health Check**:
```bash
curl http://reeva-dev-alb-2062089697.us-east-1.elb.amazonaws.com/health
# Output: {"status":"healthy", "uptime":...}
```

**Terminal - Estado ECS**:
```bash
aws ecs describe-services --cluster reeva-dev-cluster --services reeva-dev-service
# Output: "runningCount": 1, "desiredCount": 1
```

**Terminal - Target Health**:
```bash
aws elbv2 describe-target-health --target-group-arn <ARN>
# Output: "State": "healthy"
```

### 3. Terraform State
```bash
cd terraform
terraform show | grep "resource"
# Output: 40 resources
```

---

## SLIDE 7: Evidencias de Cumplimiento (30 segundos)

### Requisitos del Examen 

| Requisito | Cumplimiento |
|-----------|--------------|
| VPC personalizada |  10.0.0.0/16 |
| Subred publica |  2 subnets multi-AZ |
| Subred privada |  Containers no accesibles (funcional) |
| Internet Gateway |  igw-0b545f3a31db560b4 |
| Security Groups |  3 SGs con reglas especificas |
| Network ACLs |  7 reglas configuradas |
| Redundancia |  Multi-AZ ALB + Auto-healing |
| Ciberseguridad |  WAF + IAM + Encryption + Monitoring |

**Documentación completa**: INFORME-TECNICO.md (120 páginas)

---

## SLIDE 8: Lecciones Aprendidas (60 segundos)

### Desafío 1: NACLs Stateless
**Problema**: App inaccesible desde Internet  
**Causa**: NACL bloqueaba respuestas HTTP (puertos efímeros)  
**Solución**: Regla 120 egress a 0.0.0.0/0 (1024-65535)  
**Aprendizaje**: NACLs requieren reglas bidireccionales explícitas

### Desafío 2: Cognito Integration
**Problema**: Login fallaba con "credenciales inválidas"  
**Causa**: Variables de entorno faltantes en ECS task  
**Solución**: Agregar USER_POOL_ID, CLIENT_ID, etc.  
**Aprendizaje**: Todas las env vars deben estar en task definition

### Desafío 3: Optimización de Costos
**Problema**: Costos ($80/mes) exceden budget ($20/mes)  
**Causa**: 3 VPC Endpoints interface ($21/mes)  
**Trade-off**: Seguridad/latencia vs costo  
**Decisión**: Mantener para el examen, evaluar eliminar en producción

---

## SLIDE 9: Conclusiones (30 segundos)

### Integración Exitosa
-  Conocimientos de **Redes de Computadores** aplicados en cloud
-  Proyecto de **Arquitectura de Software** desplegado en producción
-  **40 recursos AWS** funcionando correctamente
-  **Infraestructura como Código** reproducible (Terraform)

### Arquitectura Production-Ready
- Multi-AZ high availability
- Seguridad en capas (WAF, NACLs, SGs, IAM)
- Monitoreo proactivo (8 alarms)
- Auto-healing y auto-scaling ready

### Valor Agregado
- Sistema funcional accesible 24/7
- Documentación completa para futuras implementaciones
- Base sólida para escalamiento futuro

---

## SLIDE 10: Preguntas (Backup)

### Preguntas Frecuentes Anticipadas

**P1: ¿Por qué no usaste NAT Gateway?**  
R: VPC Endpoints eliminan la necesidad. Gateway endpoints (DynamoDB, S3) son gratuitos. Ahorro de $32/mes (40% del presupuesto).

**P2: ¿Las subnets son realmente privadas?**  
R: Funcionalmente sí. Aunque son "publicas", los containers NO son accesibles desde Internet. Solo ALB acepta tráfico publico, y Security Groups restringen acceso a containers solo desde ALB.

**P3: ¿Cómo garantizas alta disponibilidad con 1 sola task?**  
R: ECS auto-healing reinicia task en 60-90 seg si falla. ALB multi-AZ garantiza failover entre zonas. Para producción recomendaría min 2 tasks en diferentes AZs.

**P4: ¿Qué pasa si alguien hace DDoS?**  
R: WAF rate limiting bloquea IPs con >2000 req/5min. CloudWatch alarmas alertan sobre request count anormales. AWS Shield Standard protege contra ataques de red.

**P5: ¿Cuánto cuesta esta infraestructura?**  
R: ~$51-80/mes dependiendo de uso:
- ALB: $16/mes
- Fargate Spot: $3.50/mes
- VPC Endpoints: $21/mes (3 interface)
- WAF: $5/mes + $1/millón requests
- DynamoDB: Variable según uso
- CloudWatch/Logs: $2-5/mes

**P6: ¿Cómo se despliega una nueva versión?**  
R: 
```bash
# 1. Build nueva imagen
docker build -t reeva-app .

# 2. Push a ECR
aws ecr get-login-password | docker login
docker push 402341712953.dkr.ecr.us-east-1.amazonaws.com/reeva-dev-app

# 3. Forzar nuevo deployment
aws ecs update-service --cluster reeva-dev-cluster \
  --service reeva-dev-service --force-new-deployment
```

Rolling update sin downtime (health checks aseguran nueva task funciona antes de matar antigua).

---

## GUIÓN DE PRESENTACIÓN

### Minuto 0-1: Introducción
"Buenos días/tardes. Les presento el Sistema Reeva, una aplicacion de gestión de agendas medicas que desarrollamos en Arquitectura de Software y que he desplegado en AWS aplicando los conceptos de Redes de Computadores."

**[Mostrar navegador con aplicacion funcionando]**

"La aplicacion está corriendo en producción en esta URL, accesible 24/7, con 40 recursos AWS gestionados con Terraform."

### Minuto 1-3: Arquitectura de Red
"La arquitectura de red está basada en una VPC personalizada 10.0.0.0/16 con dos subnets publicas en diferentes availability zones para redundancia."

**[Mostrar diagrama en pantalla o AWS Console VPC Resource Map]**

"El flujo de tráfico pasa por 4 capas de seguridad: primero AWS WAF filtra requests maliciosos, luego el Application Load Balancer distribuye a containers Fargate, que están protegidos por Security Groups y Network ACLs."

"Una decision arquitectónica importante fue NO usar NAT Gateway, sino VPC Endpoints. Esto ahorra $32 mensuales manteniendo el tráfico a AWS en red privada."

### Minuto 3-5: Seguridad
"Implementé seguridad en capas siguiendo el principio de defensa en profundidad."

**[Mostrar AWS WAF en Console]**

"El WAF tiene 4 reglas: rate limiting contra DDoS, proteccion SQL Injection, OWASP Core Rules contra XSS, y bloqueo de inputs maliciosos conocidos."

**[Mostrar Security Groups]**

"Los Security Groups controlan acceso a nivel de instancia. El SG del ALB permite 80/443 desde Internet, pero solo puede comunicarse con containers Fargate. Los containers solo aceptan tráfico del ALB en puerto 3001."

"Una lección importante: las Network ACLs son stateless. Necesité agregar una regla de egress para puertos efímeros 1024-65535 hacia Internet, si no el ALB no puede responder a clientes externos. Esto me tomó varias horas de debugging."

### Minuto 5-7: Alta Disponibilidad y Monitoreo
"Para garantizar disponibilidad implementé 3 mecanismos de redundancia:"

**[Mostrar Target Group Health]**

"Primero, el ALB está en dos availability zones. Si us-east-1a falla, el tráfico se redirige automáticamente a us-east-1b."

"Segundo, ECS auto-healing reinicia tasks automáticamente si crashean. El downtime es de 60-90 segundos."

"Tercero, health checks cada 30 segundos validan que la aplicacion está respondiendo."

**[Mostrar CloudWatch Alarms]**

"Configuré 8 alarmas de CloudWatch que me alertan por email si hay problemas: hosts unhealthy, CPU alta, errores 5xx, throttling de DynamoDB, etc. Todas están en estado OK actualmente."

### Minuto 7-9: Demostración en Vivo
"Ahora les muestro que todo está funcionando en tiempo real."

**[Terminal 1: Health check]**
```bash
curl http://reeva-dev-alb-2062089697.us-east-1.elb.amazonaws.com/health
```
"El endpoint de health retorna status healthy con el uptime del contenedor."

**[Terminal 2: Estado ECS]**
```bash
aws ecs describe-services --cluster reeva-dev-cluster --services reeva-dev-service
```
"ECS muestra 1 task corriendo, que es el desired count."

**[Navegador: Login]**
"Acá vemos la integración con Cognito funcionando. Si intento hacer login..."

**[Mostrar dashboard si hay tiempo]**

### Minuto 9-10: Conclusión
"En resumen, este proyecto integró exitosamente conocimientos de redes y arquitectura de software. Cumplí todos los requisitos del examen: VPC personalizada, subnets publicas y privadas, Internet Gateway, Security Groups, NACLs, redundancia multi-AZ y múltiples medidas de ciberseguridad."

"La infraestructura está documentada en 120 páginas y es completamente reproducible con Terraform. El codigo está versionado y listo para futuras implementaciones."

"La principal lección aprendida es que las NACLs stateless requieren pensar cuidadosamente las reglas bidireccionales, especialmente para puertos efímeros."

"¿Tienen alguna pregunta?"

---

## CHECKLIST PRE-PRESENTACIÓN

### Preparación Técnica (30 min antes)
- [ ] Verificar que aplicacion está accesible: `curl http://ALB-DNS/health`
- [ ] Verificar ECS task corriendo: `aws ecs describe-services...`
- [ ] Verificar Target Group healthy: `aws elbv2 describe-target-health...`
- [ ] Verificar alarmas en OK: `aws cloudwatch describe-alarms...`
- [ ] Abrir AWS Console en tabs:
  - [ ] VPC → Resource Map
  - [ ] EC2 → Load Balancers → reeva-dev-alb
  - [ ] EC2 → Target Groups → reeva-dev-tg
  - [ ] ECS → Clusters → reeva-dev-cluster
  - [ ] WAF → Web ACLs → reeva-dev-waf
  - [ ] CloudWatch → Alarms
  - [ ] IAM → Roles → reeva-dev-ecs-task
- [ ] Terminal con comandos preparados en history
- [ ] Navegador con aplicacion cargada (login page)

### Materiales de Apoyo
- [ ] Este guión impreso
- [ ] INFORME-TECNICO.md abierto (referencia)
- [ ] Diagrama de arquitectura visible
- [ ] Cronómetro/reloj visible (max 10 min)

### Plan B (Si algo falla)
- **App no responde**: Mostrar logs CloudWatch y explicar troubleshooting
- **AWS Console lento**: Usar comandos CLI preparados
- **Internet cae**: Usar screenshots preparadas de antemano
- **Olvido algo**: INFORME-TECNICO.md tiene toda la info

---

## SCREENSHOTS RECOMENDADAS (Incluir en anexo de informe)

1. **VPC Resource Map** mostrando VPC, subnets, IGW
2. **Application Load Balancer** con estado "active" y 2 AZs
3. **Target Group** con target "healthy"
4. **ECS Service** con runningCount=1, desiredCount=1
5. **Security Groups** mostrando reglas de SG-ALB y SG-Fargate
6. **Network ACLs** con las 7 reglas configuradas
7. **WAF Web ACL** con 4 reglas activas
8. **CloudWatch Alarms** todas en estado OK
9. **CloudWatch Dashboard** con métricas (si lo creaste)
10. **Terraform Output** mostrando `Apply complete! Resources: 40 added`
11. **Terminal curl /health** con response 200 OK
12. **Navegador** mostrando login page de aplicacion
13. **Budget** mostrando $20/mes configurado con alerta
14. **VPC Endpoints** listando los 5 endpoints creados
15. **IAM Roles** mostrando ecs-task-execution y ecs-task
16. **DynamoDB Tables** mostrando las 25 tablas (opcional)
17. **Cognito User Pool** mostrando pool id us-east-1_nGDzbmgag

**Formato**: Capturas de pantalla con marca de tiempo visible, organizar en carpeta `evidencias/`

---

**Duración estimada**: 8-10 minutos  
**Última revisión**: Diciembre 2025
