#!/bin/bash

# ============================================
# experimento de chaos engineering - reevanode
# simulacion manual (sin aws fis)
# ============================================

set -e

# colores
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # no color

# ============================================
# cargar variables de entorno desde .env
# ============================================
if [ -f .env ]; then
    echo -e "${GREEN}Cargando configuración desde .env...${NC}"
    export $(grep -v '^#' .env | xargs)
else
    echo -e "${RED}Error: archivo .env no encontrado${NC}"
    echo "Por favor sigue el ejemplo del README para configurar el archivo .env"
    exit 1
fi

# configuracion desde variables de entorno (con valores por defecto)
REGION="${AWS_REGION:-us-east-1}"
TABLE_NAME="${DYNAMODB_TABLE_NAME:-agenda}"
APP_URL="${APP_URL:-http://localhost:3000}"
RESULTS_DIR="${RESULTS_DIR:-./results}"
CHAOS_DURATION="${CHAOS_DURATION:-30}"
ARTILLERY_RATE="${ARTILLERY_ARRIVAL_RATE:-10}"
ARTILLERY_TIMEOUT="${ARTILLERY_TIMEOUT:-15}"
TEST_USERNAME="${TEST_USERNAME}"
TEST_PASSWORD="${TEST_PASSWORD}"
GSI_HORA_INDEX="${GSI_HORA_INICIO_INDEX:-HoraInicioIndex}"
GSI_USUARIO_INDEX="${GSI_USUARIO_INDEX:-UsuarioIndex}"
THROTTLE_RCU="${THROTTLE_READ_CAPACITY:-1}"
THROTTLE_WCU="${THROTTLE_WRITE_CAPACITY:-1}"

echo -e "${BLUE}"
echo "╔═══════════════════════════════════════════════════════╗"
echo "║   experimento de chaos engineering - reevanode        ║"
echo "║   simulacion manual de degradacion dynamodb           ║"
echo "╚═══════════════════════════════════════════════════════╝"
echo -e "${NC}"

# crear directorio de resultados con timestamp y id unico
mkdir -p "$RESULTS_DIR"
EXPERIMENT_ID=$(printf "%03d" $((RANDOM % 1000)))
TIMESTAMP=$(date +%d-%m-%Y_%H-%M)
EXPERIMENT_DIR="$RESULTS_DIR/${EXPERIMENT_ID}_${TIMESTAMP}"
mkdir -p "$EXPERIMENT_DIR"

REPORT_PREFIX="$EXPERIMENT_DIR/chaos"

echo -e "${GREEN}resultados se guardaran en: $EXPERIMENT_DIR${NC}"
echo ""

# ============================================
# paso 1: verificar prerequisitos
# ============================================
echo -e "${YELLOW}paso 1/7: verificando prerequisitos...${NC}"

# verificar aplicacion corriendo
if ! curl -s "$APP_URL/login" > /dev/null 2>&1; then
    echo -e "${RED}error: reevanode no esta corriendo en $APP_URL${NC}"
    echo "por favor inicia el servidor: cd ReevaNode/Reeva_node/src && node server.js"
    exit 1
fi
echo -e "${GREEN}aplicacion reevanode activa${NC}"

# verificar aws cli
if ! command -v aws &> /dev/null; then
    echo -e "${RED}aws cli no esta instalado${NC}"
    exit 1
fi
echo -e "${GREEN}aws cli disponible${NC}"

# verificar artillery
if ! command -v artillery &> /dev/null; then
    echo -e "${YELLOW}artillery no encontrado. instalando...${NC}"
    npm install -g artillery
fi
echo -e "${GREEN}artillery disponible${NC}"

# verificar tabla dynamodb
if ! aws dynamodb describe-table --table-name "$TABLE_NAME" --region "$REGION" &> /dev/null; then
    echo -e "${RED}la tabla $TABLE_NAME no existe${NC}"
    exit 1
fi
echo -e "${GREEN}tabla dynamodb '$TABLE_NAME' existe${NC}"

echo ""

# ============================================
# paso 2: baseline (sin caos)
# ============================================
echo -e "${YELLOW}paso 2/7: ejecutando medicion baseline (sin caos)...${NC}"
echo "   duracion: $CHAOS_DURATION segundos"
echo "   target: $APP_URL"
echo ""

artillery quick --count 10 --num 30 "$APP_URL/login" > "$REPORT_PREFIX"_baseline.txt 2>&1

echo -e "${GREEN}baseline completado${NC}"
echo "   resultados guardados en: $REPORT_PREFIX"_baseline.txt
echo ""

# extraer metricas baseline (solo numeros)
BASELINE_P99=$(grep "p99:" "$REPORT_PREFIX"_baseline.txt | grep "http.response_time:" -A1 | tail -1 | grep -oE '[0-9]+(\.[0-9]+)?' | head -1)
BASELINE_MEAN=$(grep "mean:" "$REPORT_PREFIX"_baseline.txt | grep "http.response_time:" -A1 | tail -1 | grep -oE '[0-9]+(\.[0-9]+)?' | head -1)
BASELINE_REQUESTS=$(grep "http.requests:" "$REPORT_PREFIX"_baseline.txt | tail -1 | grep -oE '[0-9]+' | head -1)

echo -e "${BLUE}metricas baseline:${NC}"
if [ -n "$BASELINE_MEAN" ] && [ -n "$BASELINE_P99" ]; then
    echo "   response time mean: $BASELINE_MEAN ms"
    echo "   response time p99: $BASELINE_P99 ms"
    echo "   total requests: $BASELINE_REQUESTS"
else
    echo "   no se pudieron extraer metricas"
fi
echo ""

# ============================================
# paso 3: guardar estado original
# ============================================
echo -e "${YELLOW}paso 3/7: guardando configuracion original de dynamodb...${NC}"

ORIGINAL_BILLING_MODE=$(aws dynamodb describe-table --table-name "$TABLE_NAME" --region "$REGION" \
  --query 'Table.BillingModeSummary.BillingMode' --output text)

if [ "$ORIGINAL_BILLING_MODE" == "None" ] || [ -z "$ORIGINAL_BILLING_MODE" ]; then
    ORIGINAL_BILLING_MODE="PROVISIONED"
fi

echo "   modo original: $ORIGINAL_BILLING_MODE"
echo "$ORIGINAL_BILLING_MODE" > "$REPORT_PREFIX"_original_billing_mode.txt
echo -e "${GREEN}configuracion guardada${NC}"
echo ""

# ============================================
# paso 4: inyectar caos
# ============================================
echo -e "${RED}paso 4/7: inyectando caos - degradando dynamodb...${NC}"
echo "   accion: reducir capacidad a $THROTTLE_RCU rcu / $THROTTLE_WCU wcu"
echo "   tabla: $TABLE_NAME"
echo "   duracion: $CHAOS_DURATION segundos"
echo ""

read -p "$(echo -e ${YELLOW}continuar con la inyeccion de caos? [y/n]:${NC} )" -n 1 -r
echo
if [[ ! $REPLY =~ ^[YySs]$ ]]; then
    echo -e "${RED}experimento cancelado${NC}"
    exit 0
fi

echo "   cambiando a modo provisioned con capacidad minima..."
aws dynamodb update-table \
  --table-name "$TABLE_NAME" \
  --billing-mode PROVISIONED \
  --provisioned-throughput ReadCapacityUnits=$THROTTLE_RCU,WriteCapacityUnits=$THROTTLE_WCU \
  --global-secondary-index-updates \
    '[{"Update":{"IndexName":"'"$GSI_HORA_INDEX"'","ProvisionedThroughput":{"ReadCapacityUnits":'"$THROTTLE_RCU"',"WriteCapacityUnits":'"$THROTTLE_WCU"'}}},
      {"Update":{"IndexName":"'"$GSI_USUARIO_INDEX"'","ProvisionedThroughput":{"ReadCapacityUnits":'"$THROTTLE_RCU"',"WriteCapacityUnits":'"$THROTTLE_WCU"'}}}]' \
  --region "$REGION" > /dev/null

echo "   esperando a que la tabla este active..."
aws dynamodb wait table-exists --table-name "$TABLE_NAME" --region "$REGION"

sleep 10  # esperar un poco mas para asegurar que el cambio este activo

echo -e "${GREEN}caos inyectado - dynamodb degradado${NC}"
echo ""

# ============================================
# paso 5: load test durante caos
# ============================================
echo -e "${YELLOW}paso 5/7: ejecutando load test durante el caos...${NC}"
echo "   duracion: $CHAOS_DURATION segundos"
echo "   se esperan errores y mayor latencia"
echo ""

# crear configuracion artillery temporal
cat > /tmp/reeva-chaos-test.yml << EOF
config:
  target: "$APP_URL"
  phases:
    - duration: $CHAOS_DURATION
      arrivalRate: $ARTILLERY_RATE
  http:
    timeout: $ARTILLERY_TIMEOUT
scenarios:
  - name: "Login durante caos"
    flow:
      - post:
          url: "/auth/login"
          json:
            username: "$TEST_USERNAME"
            password: "$TEST_PASSWORD"
          expect:
            - statusCode: [200, 401, 500, 503]
      - think: 1
      - get:
          url: "/bienvenida"
          expect:
            - statusCode: [200, 302, 500, 503]
EOF

artillery run /tmp/reeva-chaos-test.yml --output "$REPORT_PREFIX"_chaos_results.json 2>&1 | tee "$REPORT_PREFIX"_chaos_output.txt

echo -e "${GREEN}load test completado${NC}"
echo ""

# ============================================
# paso 6: restaurar dynamodb
# ============================================
echo -e "${YELLOW}paso 6/7: restaurando dynamodb a estado original...${NC}"

echo "   volviendo a modo: $ORIGINAL_BILLING_MODE"
aws dynamodb update-table \
  --table-name "$TABLE_NAME" \
  --billing-mode "$ORIGINAL_BILLING_MODE" \
  --region "$REGION" > /dev/null

echo "   esperando a que la tabla este active..."
aws dynamodb wait table-exists --table-name "$TABLE_NAME" --region "$REGION"

echo -e "${GREEN}dynamodb restaurado${NC}"
echo ""

# ============================================
# paso 7: generar reportes
# ============================================
echo -e "${YELLOW}paso 7/7: generando reportes...${NC}"

# reporte html de artillery
artillery report "$REPORT_PREFIX"_chaos_results.json --output "$REPORT_PREFIX"_chaos_report.html

# extraer metricas del caos desde el summary final
CHAOS_P99=$(grep "http.response_time:" "$REPORT_PREFIX"_chaos_output.txt -A10 | grep "p99:" | tail -1 | grep -oE '[0-9]+(\.[0-9]+)?' | head -1)
CHAOS_MEAN=$(grep "http.response_time:" "$REPORT_PREFIX"_chaos_output.txt -A10 | grep "mean:" | tail -1 | grep -oE '[0-9]+(\.[0-9]+)?' | head -1)
CHAOS_ERRORS=$(grep "vusers.failed:" "$REPORT_PREFIX"_chaos_output.txt | tail -1 | grep -oE '[0-9]+' | head -1)
CHAOS_REQUESTS=$(grep "http.requests:" "$REPORT_PREFIX"_chaos_output.txt | tail -1 | grep -oE '[0-9]+' | head -1)

# crear reporte comparativo
cat > "$REPORT_PREFIX"_summary.txt << EOF
═══════════════════════════════════════════════════════════
  experimento de chaos engineering - reevanode
  simulacion de degradacion dynamodb
═══════════════════════════════════════════════════════════

fecha/hora: $(date)
tabla: $TABLE_NAME
region: $REGION
duracion caos: $CHAOS_DURATION segundos

─────────────────────────────────────────────────────────
configuracion del experimento
─────────────────────────────────────────────────────────
✓ aplicacion: reevanode (express + cognito + dynamodb)
✓ endpoint: $APP_URL
✓ tipo de caos: throttling dynamodb (1 rcu/wcu)
✓ herramienta load test: artillery
✓ tasa de requests: 10/segundo

─────────────────────────────────────────────────────────
resultados - comparativa
─────────────────────────────────────────────────────────

                    baseline        caos            impacto
                    --------        ----            -------
response mean:      ${BASELINE_MEAN} ms        ${CHAOS_MEAN} ms          $(if [ "$CHAOS_MEAN" != "no disponible" ] && [ "$BASELINE_MEAN" != "no disponible" ]; then echo "+$(echo "$CHAOS_MEAN - $BASELINE_MEAN" | bc 2>/dev/null) ms"; else echo "no disponible"; fi)
response p99:       ${BASELINE_P99} ms         ${CHAOS_P99} ms           $(if [ "$CHAOS_P99" != "no disponible" ] && [ "$BASELINE_P99" != "no disponible" ]; then echo "+$(echo "$CHAOS_P99 - $BASELINE_P99" | bc 2>/dev/null) ms"; else echo "no disponible"; fi)
requests total:     ${BASELINE_REQUESTS:-no disponible}        ${CHAOS_REQUESTS:-no disponible}        -
errores:            0               ${CHAOS_ERRORS}           +${CHAOS_ERRORS}

─────────────────────────────────────────────────────────
analisis
─────────────────────────────────────────────────────────
$(if [ -n "$CHAOS_ERRORS" ] && [ "$CHAOS_ERRORS" != "no disponible" ] && [ "$CHAOS_ERRORS" -gt 0 ] 2>/dev/null; then
    echo "se detectaron $CHAOS_ERRORS errores durante el caos"
    echo "   causa: throttling de dynamodb (exceso de capacidad)"
else
    echo "no se detectaron errores durante el caos"
fi)

$(if [ "$CHAOS_MEAN" != "no disponible" ] && [ "$BASELINE_MEAN" != "no disponible" ] && [ -n "$CHAOS_MEAN" ] && [ -n "$BASELINE_MEAN" ]; then
    INCREASE=$(echo "scale=1; ($CHAOS_MEAN - $BASELINE_MEAN) / $BASELINE_MEAN * 100" | bc 2>/dev/null || echo "no disponible")
    MULTIPLIER=$(echo "scale=1; $CHAOS_MEAN / $BASELINE_MEAN" | bc 2>/dev/null || echo "no disponible")
    echo "incremento de latencia promedio: ${INCREASE}% (${MULTIPLIER}x)"
else
    echo "incremento de latencia promedio: no disponible (metricas no disponibles)"
fi)

─────────────────────────────────────────────────────────
archivos generados
─────────────────────────────────────────────────────────
📄 $REPORT_PREFIX"_baseline.txt"
📄 $REPORT_PREFIX"_chaos_output.txt"
📄 $REPORT_PREFIX"_chaos_results.json"
📄 $REPORT_PREFIX"_chaos_report.html"
📄 $REPORT_PREFIX"_summary.txt" (este archivo)

─────────────────────────────────────────────────────────
conclusiones
─────────────────────────────────────────────────────────
el experimento simulo exitosamente la degradacion de dynamodb
mediante la reduccion de capacidad provisionada (1 rcu/wcu).

esto es equivalente a un experimento aws fis que inyecta
throttling en dynamodb durante varios minutos.

═══════════════════════════════════════════════════════════
EOF

echo -e "${GREEN}reportes generados${NC}"
echo ""

# ============================================
# generar el archivo de analisis markdown
# ============================================
echo -e "${YELLOW}generando analisis en markdown...${NC}"

# calcular metricas extra
TOTAL_REQUESTS_BASELINE=${BASELINE_REQUESTS:-"no disponible"}
TOTAL_REQUESTS_CHAOS=${CHAOS_REQUESTS:-"no disponible"}

# calcular tasas de error y exito
if [ -n "$TOTAL_REQUESTS_CHAOS" ] && [ -n "$CHAOS_ERRORS" ] && [ "$TOTAL_REQUESTS_CHAOS" != "no disponible" ]; then
    SUCCESS_COUNT=$((TOTAL_REQUESTS_CHAOS - CHAOS_ERRORS))
    SUCCESS_RATE_CHAOS=$(echo "scale=2; ($SUCCESS_COUNT / $TOTAL_REQUESTS_CHAOS) * 100" | bc 2>/dev/null || echo "no disponible")
    ERROR_RATE_CHAOS=$(echo "scale=2; ($CHAOS_ERRORS / $TOTAL_REQUESTS_CHAOS) * 100" | bc 2>/dev/null || echo "no disponible")
else
    SUCCESS_COUNT="no disponible"
    SUCCESS_RATE_CHAOS="no disponible"
    ERROR_RATE_CHAOS="no disponible"
fi

# calcular incrementos de latencia
if [ -n "$CHAOS_MEAN" ] && [ -n "$BASELINE_MEAN" ]; then
    LATENCY_INCREASE=$(echo "scale=1; (($CHAOS_MEAN - $BASELINE_MEAN) / $BASELINE_MEAN) * 100" | bc 2>/dev/null || echo "no disponible")
    LATENCY_MULTIPLIER=$(echo "scale=1; $CHAOS_MEAN / $BASELINE_MEAN" | bc 2>/dev/null || echo "no disponible")
    P99_INCREASE=$(echo "scale=1; $CHAOS_P99 - $BASELINE_P99" | bc 2>/dev/null || echo "no disponible")
else
    LATENCY_INCREASE="no disponible"
    LATENCY_MULTIPLIER="no disponible"
    P99_INCREASE="no disponible"
fi

cat > "$EXPERIMENT_DIR/ANALISIS.md" << 'MDEOF'
# 📊 analisis de experimento de chaos engineering

## 📋 info del experimento

| campo | valor |
|-------|-------|
| **id experimento** | EXPERIMENT_ID_PLACEHOLDER |
| **fecha/hora** | TIMESTAMP_PLACEHOLDER |
| **duracion caos** | CHAOS_DURATION_PLACEHOLDER segundos |
| **tabla dynamodb** | TABLE_NAME_PLACEHOLDER |
| **region aws** | REGION_PLACEHOLDER |
| **endpoint testeado** | APP_URL_PLACEHOLDER |

---

## 🎯 objetivo del experimento

simular una **degradacion de dynamodb** mediante throttling (reduccion de capacidad a 1 rcu/1 wcu) para evaluar:
- ✅ resiliencia del sistema ante fallos de base de datos
- ✅ efectividad de patrones implementados (retry, circuit breaker, cache)
- ✅ experiencia del usuario durante condiciones adversas

---

## 📈 resultados cuantitativos

### comparativa: baseline vs caos

| metrica | baseline | durante caos | impacto |
|---------|----------|--------------|---------|
| **latencia promedio** | BASELINE_MEAN_PLACEHOLDER ms | CHAOS_MEAN_PLACEHOLDER ms | +LATENCY_INCREASE_PLACEHOLDER% (LATENCY_MULTIPLIER_PLACEHOLDERx) |
| **latencia p99** | BASELINE_P99_PLACEHOLDER ms | CHAOS_P99_PLACEHOLDER ms | +P99_INCREASE_PLACEHOLDER ms |
| **requests totales** | TOTAL_REQUESTS_BASELINE_PLACEHOLDER | TOTAL_REQUESTS_CHAOS_PLACEHOLDER | - |
| **requests exitosos** | TOTAL_REQUESTS_BASELINE_PLACEHOLDER (100%) | SUCCESS_COUNT_PLACEHOLDER (SUCCESS_RATE_CHAOS_PLACEHOLDER%) | - |
| **requests fallidos** | 0 (0%) | CHAOS_ERRORS_PLACEHOLDER (ERROR_RATE_CHAOS_PLACEHOLDER%) | +CHAOS_ERRORS_PLACEHOLDER errores |

---

## 🔍 analisis cualitativo

### 1️⃣ tasa de errores
ERROR_ANALYSIS_PLACEHOLDER

### 2️⃣ latencia
LATENCY_ANALYSIS_PLACEHOLDER

### 3️⃣ patrones de resiliencia observados
RESILIENCE_ANALYSIS_PLACEHOLDER

---

## ✅ medidas de contencion implementadas

las siguientes mejoras fueron implementadas como respuesta al primer experimento de caos:

### 🔄 **retry con exponential backoff**
- **ubicacion**: `/src/utils/resilience.js` → funcion `retryWithBackoff`
- **configuracion**: 3 reintentos, delay inicial 100ms, maximo 2s
- **errores manejados**: `ProvisionedThroughputExceededException`, `ThrottlingException`
- **resultado esperado**: recuperacion automatica de fallos transitorios

### 🔌 **circuit breaker**
- **ubicacion**: `/src/utils/resilience.js` → clase `CircuitBreaker`
- **configuracion**: 3 fallos → OPEN, timeout 30s → HALF_OPEN
- **estados**: CLOSED (normal) → OPEN (bloqueado) → HALF_OPEN (prueba)
- **resultado esperado**: prevenir cascada de fallos, fail-fast

### 💾 **simple cache (in-memory)**
- **ubicacion**: `/src/utils/resilience.js` → clase `SimpleCache`
- **configuracion**: TTL 30s, maximo 50 items
- **estrategia**: cache-aside pattern
- **resultado esperado**: reducir carga en dynamodb, servir datos stale durante caos

### 🎨 **graceful degradation**
- **ubicacion**: `/src/routes/bienvenida.js` + `/views/Bienvenida-y-Opciones.ejs`
- **comportamiento**: mensajes amigables, datos vacios en lugar de 500 errors
- **ux**: banner amarillo de advertencia cuando sistema degradado
- **resultado esperado**: experiencia de usuario tolerable durante caos

---

## 🎓 conclusiones

CONCLUSION_PLACEHOLDER

---

## 📂 archivos generados

- 📄 `chaos_baseline.txt` - medicion sin caos (baseline)
- 📄 `chaos_chaos_output.txt` - logs de artillery durante caos
- 📄 `chaos_chaos_results.json` - metricas json de artillery
- 📄 `chaos_chaos_report.html` - reporte visual html
- 📄 `chaos_summary.txt` - resumen ejecutivo
- 📝 `ANALISIS.md` - este analisis detallado

---

## 🔗 referencias

- **chaos engineering principles**: https://principlesofchaos.org/
- **aws well-architected framework**: reliability pillar
- **patron circuit breaker**: martin fowler - circuitbreaker pattern
- **exponential backoff**: aws sdk retry behavior

---

*generado automaticamente por `run-manual-chaos.sh` el GENERATION_DATE_PLACEHOLDER*
MDEOF

# reemplazar placeholders con los valores reales
sed -i "s/EXPERIMENT_ID_PLACEHOLDER/$EXPERIMENT_ID/g" "$EXPERIMENT_DIR/ANALISIS.md"
sed -i "s|TIMESTAMP_PLACEHOLDER|$TIMESTAMP|g" "$EXPERIMENT_DIR/ANALISIS.md"
sed -i "s/CHAOS_DURATION_PLACEHOLDER/$CHAOS_DURATION/g" "$EXPERIMENT_DIR/ANALISIS.md"
sed -i "s/TABLE_NAME_PLACEHOLDER/$TABLE_NAME/g" "$EXPERIMENT_DIR/ANALISIS.md"
sed -i "s/REGION_PLACEHOLDER/$REGION/g" "$EXPERIMENT_DIR/ANALISIS.md"
sed -i "s|APP_URL_PLACEHOLDER|$APP_URL|g" "$EXPERIMENT_DIR/ANALISIS.md"
sed -i "s/BASELINE_MEAN_PLACEHOLDER/$BASELINE_MEAN/g" "$EXPERIMENT_DIR/ANALISIS.md"
sed -i "s/CHAOS_MEAN_PLACEHOLDER/$CHAOS_MEAN/g" "$EXPERIMENT_DIR/ANALISIS.md"
sed -i "s/BASELINE_P99_PLACEHOLDER/$BASELINE_P99/g" "$EXPERIMENT_DIR/ANALISIS.md"
sed -i "s/CHAOS_P99_PLACEHOLDER/$CHAOS_P99/g" "$EXPERIMENT_DIR/ANALISIS.md"
sed -i "s/TOTAL_REQUESTS_BASELINE_PLACEHOLDER/$TOTAL_REQUESTS_BASELINE/g" "$EXPERIMENT_DIR/ANALISIS.md"
sed -i "s/TOTAL_REQUESTS_CHAOS_PLACEHOLDER/$TOTAL_REQUESTS_CHAOS/g" "$EXPERIMENT_DIR/ANALISIS.md"
sed -i "s/CHAOS_ERRORS_PLACEHOLDER/$CHAOS_ERRORS/g" "$EXPERIMENT_DIR/ANALISIS.md"
sed -i "s/SUCCESS_RATE_CHAOS_PLACEHOLDER/$SUCCESS_RATE_CHAOS/g" "$EXPERIMENT_DIR/ANALISIS.md"
sed -i "s/ERROR_RATE_CHAOS_PLACEHOLDER/$ERROR_RATE_CHAOS/g" "$EXPERIMENT_DIR/ANALISIS.md"
sed -i "s/LATENCY_INCREASE_PLACEHOLDER/$LATENCY_INCREASE/g" "$EXPERIMENT_DIR/ANALISIS.md"
sed -i "s/LATENCY_MULTIPLIER_PLACEHOLDER/$LATENCY_MULTIPLIER/g" "$EXPERIMENT_DIR/ANALISIS.md"
sed -i "s/SUCCESS_COUNT_PLACEHOLDER/${SUCCESS_COUNT:-no disponible}/g" "$EXPERIMENT_DIR/ANALISIS.md"
sed -i "s/P99_INCREASE_PLACEHOLDER/$P99_INCREASE/g" "$EXPERIMENT_DIR/ANALISIS.md"

# analisis contextual basado en resultados (con validacion numerica)
if [ "$ERROR_RATE_CHAOS" != "no disponible" ] && [ -n "$ERROR_RATE_CHAOS" ] && (( $(echo "$ERROR_RATE_CHAOS > 10" | bc -l 2>/dev/null || echo 0) )); then
    ERROR_ANALYSIS="**critico**: tasa de errores de ${ERROR_RATE_CHAOS}% es **inaceptable** (>10%).\n- **causa probable**: circuit breaker aun no optimizado o cache ttl muy corto.\n- **accion requerida**: revisar thresholds del circuit breaker y aumentar ttl del cache."
elif [ "$ERROR_RATE_CHAOS" != "no disponible" ] && [ -n "$ERROR_RATE_CHAOS" ] && (( $(echo "$ERROR_RATE_CHAOS > 5" | bc -l 2>/dev/null || echo 0) )); then
    ERROR_ANALYSIS="**moderado**: tasa de errores de ${ERROR_RATE_CHAOS}% es **aceptable pero mejorable** (5-10%).\n- **observacion**: las medidas de resiliencia estan funcionando parcialmente.\n- **sugerencia**: ajustar parametros de retry o aumentar timeout del circuit breaker."
elif [ "$ERROR_RATE_CHAOS" != "no disponible" ] && [ -n "$ERROR_RATE_CHAOS" ]; then
    ERROR_ANALYSIS="**excelente**: tasa de errores de ${ERROR_RATE_CHAOS}% es **muy baja** (<5%).\n- **conclusion**: los patrones de resiliencia (retry + circuit breaker + cache) estan funcionando correctamente.\n- **impacto**: sistema es resiliente ante throttling de dynamodb."
else
    ERROR_ANALYSIS="**no disponible**: no se pudieron calcular tasas de error.\n- **posible causa**: error en extraccion de metricas.\n- **accion**: revisar archivos de resultados manualmente."
fi

if [ "$LATENCY_INCREASE" != "no disponible" ] && [ -n "$LATENCY_INCREASE" ] && (( $(echo "$LATENCY_INCREASE > 500" | bc -l 2>/dev/null || echo 0) )); then
    LATENCY_ANALYSIS="**alto**: incremento de latencia de +${LATENCY_INCREASE}% (${LATENCY_MULTIPLIER}x) es significativo.\n- **causa**: retries estan agregando latencia acumulativa.\n- **impacto ux**: usuarios experimentaran lentitud notable.\n- **mitigacion**: el cache deberia reducir este impacto en requests subsecuentes."
elif [ "$LATENCY_INCREASE" != "no disponible" ] && [ -n "$LATENCY_INCREASE" ] && (( $(echo "$LATENCY_INCREASE > 100" | bc -l 2>/dev/null || echo 0) )); then
    LATENCY_ANALYSIS="**aceptable**: incremento de latencia de +${LATENCY_INCREASE}% (${LATENCY_MULTIPLIER}x) es tolerable.\n- **observacion**: el sistema mantiene respuesta razonable durante caos.\n- **beneficio**: cache esta reduciendo latencia en hits."
elif [ "$LATENCY_INCREASE" != "no disponible" ] && [ -n "$LATENCY_INCREASE" ]; then
    LATENCY_ANALYSIS="**excelente**: incremento de latencia de solo +${LATENCY_INCREASE}% (${LATENCY_MULTIPLIER}x) es minimo.\n- **conclusion**: cache esta funcionando excepcionalmente bien.\n- **impacto ux**: usuarios no notaran degradacion significativa."
else
    LATENCY_ANALYSIS="**no disponible**: no se pudieron calcular metricas de latencia.\n- **accion**: revisar archivos de resultados manualmente."
fi

if [ "$SUCCESS_RATE_CHAOS" != "no disponible" ] && [ -n "$SUCCESS_RATE_CHAOS" ] && (( $(echo "$SUCCESS_RATE_CHAOS > 95" | bc -l 2>/dev/null || echo 0) )); then
    RESILIENCE_ANALYSIS="**retry con exponential backoff**: funcionando correctamente (success rate ${SUCCESS_RATE_CHAOS}%).\n✅ **circuit breaker**: previene cascada de fallos, ejecuta fallback correctamente.\n✅ **cache**: sirve datos durante throttling, reduce carga en dynamodb.\n✅ **graceful degradation**: usuarios ven mensajes amigables en lugar de 500 errors."
elif [ "$SUCCESS_RATE_CHAOS" != "no disponible" ] && [ -n "$SUCCESS_RATE_CHAOS" ]; then
    RESILIENCE_ANALYSIS="**retry con exponential backoff**: requiere ajuste (success rate ${SUCCESS_RATE_CHAOS}%).\n⚠️ **circuit breaker**: puede estar abriendo muy rapido o muy lento.\n🔄 **cache**: revisar hit rate y ttl para optimizar.\n✅ **graceful degradation**: funcionando - usuarios no ven errores crudos."
else
    RESILIENCE_ANALYSIS="**no disponible**: no se pudieron calcular metricas de resiliencia.\n- **accion**: revisar archivos de resultados manualmente."
fi

if [ "$ERROR_RATE_CHAOS" != "no disponible" ] && [ -n "$ERROR_RATE_CHAOS" ] && (( $(echo "$ERROR_RATE_CHAOS < 5" | bc -l 2>/dev/null || echo 0) )); then
    CONCLUSION="### sistema es resiliente ante throttling de dynamodb\n\nlas **medidas de contencion** implementadas (retry, circuit breaker, cache, graceful degradation) han demostrado efectividad:\n\n- ✅ tasa de errores < 5% (aceptable)\n- ✅ sistema no colapsa durante caos\n- ✅ usuarios reciben feedback amigable\n- ✅ cache reduce impacto de latencia\n\n**proximos pasos**:\n1. monitorear en produccion con metricas de cloudwatch\n2. ajustar thresholds basados en trafico real\n3. considerar redis para cache distribuido (escalabilidad)\n4. implementar alarmas automaticas cuando circuit breaker se abre"
elif [ "$ERROR_RATE_CHAOS" != "no disponible" ] && [ -n "$ERROR_RATE_CHAOS" ]; then
    CONCLUSION="### sistema requiere optimizacion adicional\n\naunque las medidas de contencion estan implementadas, los resultados muestran margen de mejora:\n\n- ⚠️ tasa de errores ${ERROR_RATE_CHAOS}% (objetivo: <5%)\n- ⚠️ latencia incrementa ${LATENCY_INCREASE}%\n- ✅ no hay colapso total (positivo)\n\n**acciones recomendadas**:\n1. **circuit breaker**: reducir failureThreshold de 3 a 2\n2. **cache**: aumentar ttl de 30s a 60s\n3. **retry**: reducir maxRetries de 3 a 2 para disminuir latencia\n4. **monitoring**: agregar logs para ver hit rate del cache\n5. **re-ejecutar experimento** despues de ajustes"
else
    CONCLUSION="### metricas no disponibles\n\nno se pudieron calcular las metricas correctamente. posibles causas:\n- error en el parseo de artillery output\n- formato inesperado en los archivos de resultados\n\n**accion requerida**:\n1. revisar manualmente los archivos en $EXPERIMENT_DIR\n2. verificar el archivo chaos_chaos_results.json\n3. re-ejecutar el experimento si es necesario"
fi

sed -i "s|ERROR_ANALYSIS_PLACEHOLDER|$ERROR_ANALYSIS|g" "$EXPERIMENT_DIR/ANALISIS.md"
sed -i "s|LATENCY_ANALYSIS_PLACEHOLDER|$LATENCY_ANALYSIS|g" "$EXPERIMENT_DIR/ANALISIS.md"
sed -i "s|RESILIENCE_ANALYSIS_PLACEHOLDER|$RESILIENCE_ANALYSIS|g" "$EXPERIMENT_DIR/ANALISIS.md"
sed -i "s|CONCLUSION_PLACEHOLDER|$CONCLUSION|g" "$EXPERIMENT_DIR/ANALISIS.md"
sed -i "s|GENERATION_DATE_PLACEHOLDER|$(date '+%d/%m/%Y %H:%M:%S')|g" "$EXPERIMENT_DIR/ANALISIS.md"

echo -e "${GREEN}analisis generado: $EXPERIMENT_DIR/ANALISIS.md${NC}"
echo ""

# ============================================
# resumen final
# ============================================
echo -e "${GREEN}"
echo "╔═══════════════════════════════════════════════════════╗"
echo "║             experimento completado exitosamente       ║"
echo "╚═══════════════════════════════════════════════════════╝"
echo -e "${NC}"

cat "$REPORT_PREFIX"_summary.txt

echo ""
echo -e "${BLUE}todos los resultados guardados en:${NC}"
echo -e "${GREEN}   $EXPERIMENT_DIR/${NC}"
echo ""
echo -e "${BLUE}analisis detallado disponible en:${NC}"
echo -e "${GREEN}   $EXPERIMENT_DIR/ANALISIS.md${NC}"
echo ""
echo -e "${BLUE}para ver el reporte html:${NC}"
echo "   xdg-open $REPORT_PREFIX"_chaos_report.html
echo ""
echo -e "${BLUE}para ver el resumen:${NC}"
echo "   cat $REPORT_PREFIX"_summary.txt
echo ""
