#!/bin/bash
# deploy.sh
# script para build y push de imagen docker a ecr

set -e

echo "=== Reeva Docker Deploy ==="
echo ""

# colores
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# verificar que estamos en el directorio correcto
if [ ! -f "../Reeva_node/package.json" ]; then
    echo -e "${RED}Error: ejecutar desde el directorio terraform/${NC}"
    exit 1
fi

# obtener region de terraform
REGION=$(terraform output -raw aws_region 2>/dev/null || echo "us-east-1")
echo -e "${GREEN}Region: ${REGION}${NC}"

# obtener ecr url de terraform output
echo -e "${YELLOW}Obteniendo URL de ECR...${NC}"
ECR_URL=$(terraform output -raw ecr_repository_url 2>/dev/null)

if [ -z "$ECR_URL" ]; then
    echo -e "${RED}Error: No se pudo obtener ECR URL. Asegurate de haber ejecutado 'terraform apply' primero${NC}"
    exit 1
fi

echo -e "${GREEN}ECR URL: ${ECR_URL}${NC}"
echo ""

# login a ecr
echo -e "${YELLOW}Haciendo login a ECR...${NC}"
aws ecr get-login-password --region ${REGION} | docker login --username AWS --password-stdin ${ECR_URL}

if [ $? -ne 0 ]; then
    echo -e "${RED}Error en login a ECR${NC}"
    exit 1
fi

echo -e "${GREEN}Login exitoso${NC}"
echo ""

# build de imagen
echo -e "${YELLOW}Building Docker image...${NC}"
cd ../Reeva_node
docker build -t reeva-dev .

if [ $? -ne 0 ]; then
    echo -e "${RED}Error en build de imagen${NC}"
    exit 1
fi

echo -e "${GREEN}Build exitoso${NC}"
echo ""

# tag de imagen
echo -e "${YELLOW}Tagging imagen...${NC}"
docker tag reeva-dev:latest ${ECR_URL}:latest

echo -e "${GREEN}Tag exitoso${NC}"
echo ""

# push a ecr
echo -e "${YELLOW}Pushing imagen a ECR...${NC}"
docker push ${ECR_URL}:latest

if [ $? -ne 0 ]; then
    echo -e "${RED}Error en push de imagen${NC}"
    exit 1
fi

echo -e "${GREEN}Push exitoso${NC}"
echo ""

# obtener cluster y service names
CLUSTER_NAME=$(cd ../terraform && terraform output -raw ecs_cluster_name)
SERVICE_NAME=$(cd ../terraform && terraform output -raw ecs_service_name)

# force redeploy del servicio
echo -e "${YELLOW}Forzando redeploy del servicio ECS...${NC}"
cd ../terraform
aws ecs update-service \
    --cluster ${CLUSTER_NAME} \
    --service ${SERVICE_NAME} \
    --force-new-deployment \
    --region ${REGION} > /dev/null

echo -e "${GREEN}Redeploy iniciado${NC}"
echo ""

# mostrar comandos para monitorear
echo -e "${GREEN}=== Deploy completado ===${NC}"
echo ""
echo "Para ver logs:"
echo -e "${YELLOW}aws logs tail /ecs/reeva-dev --follow${NC}"
echo ""
echo "Para ver status del servicio:"
echo -e "${YELLOW}aws ecs describe-services --cluster ${CLUSTER_NAME} --service ${SERVICE_NAME} --query 'services[0].deployments'${NC}"
echo ""
echo "URL de la app:"
terraform output -raw alb_url
echo ""
