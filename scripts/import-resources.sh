#!/bin/bash
# import-resources.sh
# Imports existing AWS resources into Terraform state

set -e

echo "========================================"
echo "Importing existing AWS resources"
echo "========================================"

cd "$(dirname "$0")/../terraform"

# ============================================
# COGNITO RESOURCES
# ============================================

echo ""
echo "=== Importing Cognito Resources ==="
echo ""

echo "Importing Cognito User Pool..."
terraform import aws_cognito_user_pool.main us-east-1_nGDzbmgag || echo "Already imported or failed"

echo "Importing Cognito User Pool Client..."
terraform import aws_cognito_user_pool_client.main us-east-1_nGDzbmgag/4997r28ubt0nnqkfv6lbjdspos || echo "Already imported or failed"

# ============================================
# DYNAMODB TABLES - CATALOG/TYPE (8 tables)
# ============================================

echo ""
echo "=== Importing DynamoDB Catalog Tables ==="
echo ""

terraform import aws_dynamodb_table.tipoprofesional tipoprofesional || echo "Already imported"
terraform import aws_dynamodb_table.tipousuario tipousuario || echo "Already imported"
terraform import aws_dynamodb_table.tipoconsulta tipoconsulta || echo "Already imported"
terraform import aws_dynamodb_table.tipoestado tipoestado || echo "Already imported"
terraform import aws_dynamodb_table.tipobox tipobox || echo "Already imported"
terraform import aws_dynamodb_table.tipoitem tipoitem || echo "Already imported"
terraform import aws_dynamodb_table.personalizacion personalizacion || echo "Already imported"
terraform import aws_dynamodb_table.estadobox estadobox || echo "Already imported"

# ============================================
# DYNAMODB TABLES - MAIN (5 tables)
# ============================================

echo ""
echo "=== Importing DynamoDB Main Tables ==="
echo ""

terraform import aws_dynamodb_table.usuario usuario || echo "Already imported"
terraform import aws_dynamodb_table.box box || echo "Already imported"
terraform import aws_dynamodb_table.items items || echo "Already imported"
terraform import aws_dynamodb_table.agenda agenda || echo "Already imported"
terraform import aws_dynamodb_table.registroagenda registroagenda || echo "Already imported"

# ============================================
# DYNAMODB TABLES - AUTH & CUSTOMIZATION (7 tables)
# ============================================

echo ""
echo "=== Importing DynamoDB Auth Tables ==="
echo ""

terraform import aws_dynamodb_table.users users || echo "Already imported"
terraform import aws_dynamodb_table.parameters parameters-new || echo "Already imported"
terraform import aws_dynamodb_table.empresas empresas-new || echo "Already imported"
terraform import aws_dynamodb_table.espacios espacios || echo "Already imported"
terraform import aws_dynamodb_table.ocupantes ocupantes || echo "Already imported"
terraform import aws_dynamodb_table.items_mesas items-mesas || echo "Already imported"
terraform import aws_dynamodb_table.empresa_items empresa-items || echo "Already imported"

echo ""
echo "========================================"
echo "✅ Import process completed!"
echo "========================================"
echo ""
echo "Next steps:"
echo "1. Run 'terraform plan' to verify no changes are needed"
echo "2. If there are minor differences (tags, etc.), run 'terraform apply'"
echo "3. Once plan shows 0 changes, you can safely destroy and recreate"
echo ""
