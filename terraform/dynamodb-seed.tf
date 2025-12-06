# dynamodb-seed.tf
# Seed data for DynamoDB tables after creation

# Null resource to seed tipoestado table with initial data
resource "null_resource" "seed_tipoestado" {
  depends_on = [aws_dynamodb_table.tipoestado]

  provisioner "local-exec" {
    command     = "bash ${path.module}/../scripts/seed-dynamodb.sh"
    working_dir = path.module
  }

  # Only run once when table is created
  triggers = {
    table_name = aws_dynamodb_table.tipoestado.name
    always_run = "${timestamp()}"  # Run every time for now, can be removed later
  }
}
