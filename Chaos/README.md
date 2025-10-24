# Chaos Engineering - ReevaNode

Herramienta para ejecutar experimentos de **Chaos Engineering** en la aplicación ReevaNode, simulando degradación de DynamoDB mediante throttling (reducción de capacidad provisionada).

## Tabla de Contenidos

- [¿Qué es esto?](#qué-es-esto)
- [Requisitos Previos](#requisitos-previos)
- [Instalación](#instalación)
- [Configuración](#configuración)
- [Uso](#uso)
- [Resultados](#resultados)
- [Troubleshooting](#troubleshooting)

---

## ¿Qué es esto?

Este proyecto contiene un script automatizado que:

1. **Mide el baseline** de tu aplicación (rendimiento normal)
2. **Inyecta caos** reduciendo la capacidad de DynamoDB a 1 RCU/WCU
3. **Ejecuta load tests** para ver cómo responde el sistema bajo estrés
4. **Restaura** la configuración original automáticamente
5. **Genera reportes** detallados con análisis de resiliencia

**Objetivo**: Validar que las medidas de resiliencia implementadas (retry, circuit breaker, cache, graceful degradation) funcionan correctamente bajo condiciones adversas.

---

## Requisitos Previos

### 1. **Aplicación ReevaNode corriendo**
```bash
cd ../Reeva_node/src
node server.js
```
La aplicación debe estar accesible en `http://localhost:3000` (o la URL configurada).

### 2. **AWS CLI configurado**
```bash
aws configure
# Ingresa tus credenciales de AWS Academy Lab
```

### 3. **Artillery instalado** (herramienta de load testing)
```bash
npm install -g artillery
```

### 4. **bc** (calculadora de bash, para cálculos en el script)
```bash
# En Ubuntu/Debian
sudo apt-get install bc

# En macOS
brew install bc
```

### 5. **Tabla DynamoDB existente**
- Debes tener una tabla llamada `agenda` (o la que configures)
- Con los índices globales secundarios (GSI) configurados

---

## Instalación

### 1. Clonar/Copiar este directorio

Este directorio ya está incluido en el proyecto ReevaNode:
```
ReevaNode/
  ├── Reeva_node/          # Tu aplicación Node.js
  └── Chaos/               # Este proyecto
      ├── run-manual-chaos.sh
      ├── .env.example
      ├── .gitignore
      └── README.md
```

### 2. Crear tu archivo `.env`

```bash
cd Chaos
cp .env.example .env
nano .env  # o vim, code, etc.
```

---

## Configuración

### Variables de Entorno (`.env`)

Edita el archivo `.env` con tus configuraciones:

```bash
# ============================================
# CONFIGURACION CHAOS ENGINEERING - REEVANODE
# ============================================

# AWS Configuration
AWS_REGION=us-east-1                 # Región de AWS

# DynamoDB Table
DYNAMODB_TABLE_NAME=agenda           # Nombre de tu tabla

# Application Endpoint
APP_URL=http://localhost:3000        # URL de tu app

# Chaos Experiment Configuration
CHAOS_DURATION=30                    # Duración del experimento (segundos)
ARTILLERY_ARRIVAL_RATE=10            # Requests por segundo
ARTILLERY_TIMEOUT=15                 # Timeout de requests (segundos)

# Test User Credentials
TEST_USERNAME=pempeight8@gmail.com   # Usuario de prueba
TEST_PASSWORD=Admin123               # Password de prueba

# Results
RESULTS_DIR=./results                # Dónde guardar resultados

# DynamoDB GSI (Global Secondary Indexes)
GSI_HORA_INICIO_INDEX=HoraInicioIndex
GSI_USUARIO_INDEX=UsuarioIndex

# Throttling Configuration
THROTTLE_READ_CAPACITY=1             # RCU durante caos
THROTTLE_WRITE_CAPACITY=1            # WCU durante caos
```

### Descripción de Variables Clave

| Variable | Descripción | Valor Recomendado |
|----------|-------------|-------------------|
| `CHAOS_DURATION` | Cuánto tiempo dura el caos | `30` segundos (para pruebas rápidas) |
| `ARTILLERY_ARRIVAL_RATE` | Requests por segundo durante el test | `10` (aumenta para más estrés) |
| `THROTTLE_READ_CAPACITY` | RCU durante caos (bajo = más throttling) | `1` (mínimo para máximo caos) |
| `TEST_USERNAME` | Usuario válido en tu sistema | Tu email de prueba |
| `GSI_*_INDEX` | Nombres de tus índices GSI en DynamoDB | Verifica en AWS Console |

---

## Uso

### Paso 1: Levantar la aplicación ReevaNode

```bash
cd ../Reeva_node/src
node server.js
```

Deberías ver:
```
✓ API escuchando en http://localhost:3000
✓ Ambiente: development
✓ Region AWS: us-east-1
```

### Paso 2: Ejecutar el experimento de caos

En **otra terminal**:

```bash
cd Chaos
chmod +x run-manual-chaos.sh
./run-manual-chaos.sh
```

### Paso 3: Seguir el flujo interactivo

El script te guiará por 7 pasos:

```
╔═══════════════════════════════════════════════════════╗
║   experimento de chaos engineering - reevanode        ║
║   simulacion manual de degradacion dynamodb           ║
╚═══════════════════════════════════════════════════════╝

✓ paso 1/7: verificando prerequisitos...
✓ paso 2/7: ejecutando medicion baseline (sin caos)...
✓ paso 3/7: guardando configuracion original de dynamodb...
⚠ paso 4/7: inyectando caos - degradando dynamodb...
   continuar con la inyeccion de caos? [y/n]: y
✓ paso 5/7: ejecutando load test durante el caos...
✓ paso 6/7: restaurando dynamodb a estado original...
✓ paso 7/7: generando reportes...
```

**Importante**: El script te pedirá confirmación antes de inyectar el caos. Presiona `y` para continuar.

---

## 🔬 ¿Qué hace el experimento?

### Flujo Completo

```
┌─────────────────┐
│ 1. BASELINE     │ → Mide rendimiento normal (30s de requests)
└─────────────────┘
         ↓
┌─────────────────┐
│ 2. GUARDAR      │ → Guarda configuración original de DynamoDB
│    ESTADO       │   (billing mode: ON_DEMAND o PROVISIONED)
└─────────────────┘
         ↓
┌─────────────────┐
│ 3. INYECTAR     │ → Reduce capacidad DynamoDB a 1 RCU / 1 WCU
│    CAOS         │   (simula sobrecarga / throttling)
└─────────────────┘
         ↓
┌─────────────────┐
│ 4. LOAD TEST    │ → Bombardea con requests mientras hay caos
│    (30s)        │   (10 req/s × 30s = ~300 requests)
└─────────────────┘
         ↓
┌─────────────────┐
│ 5. RESTAURAR    │ → Vuelve DynamoDB a estado original
└─────────────────┘
         ↓
┌─────────────────┐
│ 6. GENERAR      │ → Crea reportes HTML + Markdown + TXT
│    REPORTES     │   con análisis completo
└─────────────────┘
```

### Lo que se prueba

✅ **Retry con Exponential Backoff**: ¿Los reintentos permiten recuperar requests fallidos?  
✅ **Circuit Breaker**: ¿Se abre correctamente para evitar cascadas de fallos?  
✅ **Cache**: ¿Sirve datos en caché cuando DynamoDB está lento/caído?  
✅ **Graceful Degradation**: ¿Los usuarios ven mensajes amigables en lugar de errores 500?

---

## Resultados

Después de ejecutar el experimento, encontrarás en `./results/XXX_DD-MM-YYYY_HH-MM/`:

### Archivos generados

```
results/
└── 028_24-10-2025_17-38/         # ID único + timestamp
    ├── ANALISIS.md                # Análisis detallado (LÉELO PRIMERO)
    ├── chaos_baseline.txt         # Métricas sin caos
    ├── chaos_chaos_output.txt     # Logs de Artillery durante caos
    ├── chaos_chaos_results.json   # Métricas JSON de Artillery
    ├── chaos_chaos_report.html    # Reporte visual (abre en navegador)
    ├── chaos_summary.txt          # Resumen ejecutivo
    └── chaos_original_billing_mode.txt  # Estado original de DynamoDB
```

### Cómo interpretar resultados

#### 1. **Ver el análisis completo**
```bash
cat results/XXX_*/ANALISIS.md
```

Encontrarás:
- ✅ Comparativa baseline vs caos
- ✅ Tasa de errores
- ✅ Incremento de latencia
- ✅ Evaluación de patrones de resiliencia
- ✅ Conclusiones y recomendaciones

#### 2. **Ver el reporte HTML visual**
```bash
xdg-open results/XXX_*/chaos_chaos_report.html  # Linux
open results/XXX_*/chaos_chaos_report.html      # macOS
```

#### 3. **Ver resumen rápido**
```bash
cat results/XXX_*/chaos_summary.txt
```

### Métricas Clave

| Métrica | ¿Qué significa? | Valor Bueno |
|---------|-----------------|-------------|
| **Response Time Mean** | Latencia promedio | < 500ms |
| **Response Time P99** | Latencia del 99% de requests | < 2000ms |
| **Error Rate** | % de requests fallidos | < 5% |
| **Success Rate** | % de requests exitosos | > 95% |

### Ejemplo de resultado exitoso

```
                    baseline        caos            impacto
                    --------        ----            -------
response mean:      120 ms          350 ms          +191% (2.9x)
response p99:       250 ms          1200 ms         +950 ms
requests total:     300             290             -
errores:            0               8               +8

✅ Tasa de errores: 2.7% (ACEPTABLE)
✅ Sistema resiliente - patrones funcionando
```

---

## Troubleshooting

### Error: "ReevaNode no está corriendo"

**Causa**: La aplicación no está accesible en la URL configurada.

**Solución**:
```bash
# Verifica que el servidor esté corriendo
curl http://localhost:3000/login

# Si no responde, inicia el servidor
cd ../Reeva_node/src
node server.js
```

---

### Error: "La tabla agenda no existe"

**Causa**: El nombre de la tabla en `.env` no coincide con la tabla en AWS.

**Solución**:
```bash
# Verificar tablas disponibles
aws dynamodb list-tables --region us-east-1

# Actualizar .env con el nombre correcto
DYNAMODB_TABLE_NAME=nombre_real_de_tu_tabla
```

---

### Error: "Artillery no encontrado"

**Causa**: Artillery no está instalado globalmente.

**Solución**:
```bash
npm install -g artillery

# Verificar instalación
artillery --version
```

---

### Error: "AWS CLI no configurado"

**Causa**: Credenciales de AWS no están configuradas.

**Solución**:
```bash
aws configure

# Ingresa:
# - AWS Access Key ID
# - AWS Secret Access Key
# - Region: us-east-1
# - Output format: json
```

---

### Advertencia: "Límite de cambios de DynamoDB por día"

**Causa**: AWS limita cuántas veces puedes cambiar el billing mode de una tabla por día.

**Solución**:
- Espera 24 horas antes de volver a cambiar de `PROVISIONED` a `ON_DEMAND`
- Alternativamente, deja la tabla en `PROVISIONED` mientras haces experimentos
- El script restaura automáticamente el estado original, pero si ya alcanzaste el límite, tendrás que esperar

---

### Error: "No se pueden extraer métricas"

**Causa**: El output de Artillery tiene un formato inesperado.

**Solución**:
```bash
# Revisar manualmente el archivo
cat results/XXX_*/chaos_chaos_output.txt

# Buscar la sección "Summary report"
# Las métricas deberían estar ahí
```

---

## 📝 Notas Importantes

### ⚠️ **No ejecutar en producción**
Este experimento modifica la configuración de DynamoDB. **Solo ejecutar en ambientes de desarrollo/pruebas**.

### ⏰ **Límite de cambios de DynamoDB**
AWS permite cambiar el billing mode de una tabla **solo 2 veces cada 24 horas**. Planifica tus experimentos en consecuencia.

### 💰 **Costos**
- El experimento usa DynamoDB en modo PROVISIONED (1 RCU/WCU) brevemente
- Artillery genera ~300 requests
- **Costo estimado**: < $0.01 USD por experimento

---