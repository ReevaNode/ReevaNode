#!/bin/bash
# seed-dynamodb.sh
# Seeds the tipoestado DynamoDB table with initial state data

set -e

echo "========================================"
echo "Seeding tipoestado table..."
echo "========================================"

# Estado 1: Libre
echo "Inserting state 1: Libre..."
aws dynamodb put-item \
  --table-name tipoestado \
  --item '{
    "idTipoEstado": {"S": "1"},
    "atendido": {"N": "0"},
    "estado": {"S": "Libre"},
    "vino": {"N": "0"}
  }' \
  --return-consumed-capacity TOTAL

# Estado 2: Paciente Ausente
echo "Inserting state 2: Paciente Ausente..."
aws dynamodb put-item \
  --table-name tipoestado \
  --item '{
    "idTipoEstado": {"S": "2"},
    "atendido": {"N": "0"},
    "estado": {"S": "Paciente Ausente"},
    "vino": {"N": "0"}
  }' \
  --return-consumed-capacity TOTAL

# Estado 3: Paciente Esperando
echo "Inserting state 3: Paciente Esperando..."
aws dynamodb put-item \
  --table-name tipoestado \
  --item '{
    "idTipoEstado": {"S": "3"},
    "atendido": {"N": "0"},
    "estado": {"S": "Paciente Esperando"},
    "vino": {"N": "1"}
  }' \
  --return-consumed-capacity TOTAL

# Estado 4: En Atención
echo "Inserting state 4: En Atención..."
aws dynamodb put-item \
  --table-name tipoestado \
  --item '{
    "idTipoEstado": {"S": "4"},
    "atendido": {"N": "1"},
    "estado": {"S": "En Atención"},
    "vino": {"N": "1"}
  }' \
  --return-consumed-capacity TOTAL

# Estado 5: Inhabilitado
echo "Inserting state 5: Inhabilitado..."
aws dynamodb put-item \
  --table-name tipoestado \
  --item '{
    "idTipoEstado": {"S": "5"},
    "atendido": {"N": "0"},
    "estado": {"S": "Inhabilitado"},
    "vino": {"N": "0"}
  }' \
  --return-consumed-capacity TOTAL

# Estado 6: Finalizado
echo "Inserting state 6: Finalizado..."
aws dynamodb put-item \
  --table-name tipoestado \
  --item '{
    "idTipoEstado": {"S": "6"},
    "atendido": {"N": "0"},
    "estado": {"S": "Finalizado"},
    "vino": {"N": "0"}
  }' \
  --return-consumed-capacity TOTAL

echo "========================================"
echo "✅ tipoestado table seeded successfully!"
echo "Total records inserted: 6"
echo "========================================"
