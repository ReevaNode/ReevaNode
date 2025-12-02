#!/bin/bash

echo "Verificacion Final - Sistema Reeva"
echo "===================================="
echo ""

# colores
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

# contadores
PASSED=0
FAILED=0

check() {
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}[OK] $1${NC}"
        ((PASSED++))
    else
        echo -e "${RED}[FAIL] $1${NC}"
        ((FAILED++))
    fi
}

# 1. terraform
echo "Verificando Terraform..."
cd terraform
terraform validate > /dev/null 2>&1
check "Terraform validate"

terraform fmt -check > /dev/null 2>&1
check "Terraform formatted"

terraform plan -detailed-exitcode > /dev/null 2>&1
if [ $? -eq 0 ]; then
    echo -e "${GREEN}[OK] Terraform plan (sin cambios pendientes)${NC}"
    ((PASSED++))
elif [ $? -eq 2 ]; then
    echo -e "${YELLOW}[WARN] Terraform plan (hay cambios pendientes)${NC}"
else
    echo -e "${RED}[FAIL] Terraform plan (error)${NC}"
    ((FAILED++))
fi

cd ..

# 2. documentacion
echo ""
echo "Verificando Documentacion..."
test -f seguridad-nube/README.md
check "README.md existe"

test -f seguridad-nube/IMPLEMENTACION-FINAL.md
check "IMPLEMENTACION-FINAL.md existe"

test -f seguridad-nube/DECISIONES-ARQUITECTURA.md
check "DECISIONES-ARQUITECTURA.md existe"

test -f seguridad-nube/CHECKLIST-DESPLIEGUE.md
check "CHECKLIST-DESPLIEGUE.md existe"

test -f seguridad-nube/OPERACIONES-DIARIAS.md
check "OPERACIONES-DIARIAS.md existe"

test -f seguridad-nube/RESUMEN-EJECUTIVO.md
check "RESUMEN-EJECUTIVO.md existe"

# 3. recursos aws
echo ""
echo "Verificando Recursos AWS..."

aws ecs describe-services --cluster reeva-dev-cluster --services reeva-dev-service > /dev/null 2>&1
check "ECS Service existe"

aws elbv2 describe-load-balancers --names reeva-dev-alb > /dev/null 2>&1
check "ALB existe"

aws ec2 describe-vpcs --filters "Name=tag:Name,Values=reeva-dev-vpc" > /dev/null 2>&1
check "VPC existe"

aws wafv2 list-web-acls --scope REGIONAL --region us-east-1 | grep -q reeva-dev-waf
check "WAF existe"

# 4. aplicacion
echo ""
echo "Verificando Aplicacion..."

HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" http://reeva-dev-alb-2062089697.us-east-1.elb.amazonaws.com/health 2>/dev/null)
if [ "$HTTP_CODE" = "200" ]; then
    echo -e "${GREEN}[OK] Health endpoint (200 OK)${NC}"
    ((PASSED++))
else
    echo -e "${RED}[FAIL] Health endpoint ($HTTP_CODE)${NC}"
    ((FAILED++))
fi

# 5. logs
echo ""
echo "Verificando Logs..."
aws logs describe-log-groups --log-group-name-prefix /ecs/reeva-dev > /dev/null 2>&1
check "CloudWatch Log Group existe"

# 6. alarmas
echo ""
echo "Verificando Alarmas..."
ALARM_COUNT=$(aws cloudwatch describe-alarms --alarm-name-prefix reeva-dev --query 'length(MetricAlarms)' --output text 2>/dev/null)
if [ "$ALARM_COUNT" -ge 8 ]; then
    echo -e "${GREEN}[OK] CloudWatch Alarms ($ALARM_COUNT configuradas)${NC}"
    ((PASSED++))
else
    echo -e "${RED}[FAIL] CloudWatch Alarms (esperadas 8, encontradas $ALARM_COUNT)${NC}"
    ((FAILED++))
fi

# 7. budget
echo ""
echo "Verificando Budget..."
aws budgets describe-budgets --account-id 402341712953 --query 'Budgets[?BudgetName==`reeva-dev-monthly-budget`]' > /dev/null 2>&1
check "Budget configurado"

# resumen
echo ""
echo "=================================="
echo "RESUMEN"
echo "=================================="
echo -e "${GREEN}[OK] Verificaciones pasadas: $PASSED${NC}"
if [ $FAILED -gt 0 ]; then
    echo -e "${RED}[FAIL] Verificaciones fallidas: $FAILED${NC}"
else
    echo -e "${GREEN}[OK] Verificaciones fallidas: $FAILED${NC}"
fi

echo ""
if [ $FAILED -eq 0 ]; then
    echo -e "${GREEN}TODO LISTO PARA PRODUCCION${NC}"
    exit 0
else
    echo -e "${YELLOW}Hay problemas que requieren atencion${NC}"
    exit 1
fi
