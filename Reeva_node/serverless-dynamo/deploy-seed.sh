#!/usr/bin/env bash

set -euo pipefail


ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
STAGE="${1:-dev}"
REGION="${AWS_REGION:-us-east-1}"

cd "$ROOT_DIR"

echo "[deploy] Desplegando stack serverless (stage=$STAGE, region=$REGION)..."
echo "[deploy] Tablas a crear/asegurar en esta corrida:"
cat <<'EOF'
  - tipoprofesional
  - tipousuario
  - tipoconsulta
  - tipoestado
  - tipobox
  - tipoitem
  - personalizacion
  - estadobox
  - usuario
  - box
  - items           (inventario de box)
  - agenda
  - registroagenda
  - items-mesas
  - empresa-items   (nuevo catálogo por empresa)
  - espacios
  - ocupantes
  - empresas-new
  - users
  - parameters-new
EOF
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
