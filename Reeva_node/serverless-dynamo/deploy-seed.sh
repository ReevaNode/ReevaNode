#!/usr/bin/env bash

set -euo pipefail

# Ejecuta el despliegue de la pila Serverless y luego invoca
# cada función seed en el orden requerido para poblar todas las
# tablas de DynamoDB.

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
STAGE="${1:-dev}"
REGION="${AWS_REGION:-us-east-1}"

cd "$ROOT_DIR"

echo "[deploy] Desplegando stack serverless (stage=$STAGE, region=$REGION)..."
npx serverless deploy --stage "$STAGE" --region "$REGION"

declare -a SEED_FUNCTIONS=(
  "seedTipoProfesional"
  "seedTipoUsuario"
  "seedTipoConsulta"
  "seedTipoEstado"
  "seedTipoBox"
  "seedPersonalizacion"
  "seedEstadoBox"
  "seedTipoItem"
  "seedBox"
  "seedUsuarios"
  "seedItems"
  "seedAgenda"
)

echo "[seed] Poblando tablas DynamoDB..."
for fn in "${SEED_FUNCTIONS[@]}"; do
  echo "\n[seed] Ejecutando $fn ..."
  npx serverless invoke --function "$fn" --stage "$STAGE" --region "$REGION" --log
done

echo "\n[done] Proceso completado."
