# dynamodb.tf
# tablas de dynamodb (migradas desde serverless-dynamo)

# tablas de catalogos/tipos
resource "aws_dynamodb_table" "tipoprofesional" {
  name         = "tipoprofesional"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "idTipoProfesional"
  
  attribute {
    name = "idTipoProfesional"
    type = "S"
  }
  
  tags = {
    Name = "${local.app_name}-tipoprofesional"
  }
}

resource "aws_dynamodb_table" "tipousuario" {
  name         = "tipousuario"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "idTipoUsuario"
  
  attribute {
    name = "idTipoUsuario"
    type = "S"
  }
  
  tags = {
    Name = "${local.app_name}-tipousuario"
  }
}

resource "aws_dynamodb_table" "tipoconsulta" {
  name         = "tipoconsulta"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "idTipoConsulta"
  
  attribute {
    name = "idTipoConsulta"
    type = "S"
  }
  
  tags = {
    Name = "${local.app_name}-tipoconsulta"
  }
}

resource "aws_dynamodb_table" "tipoestado" {
  name         = "tipoestado"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "idTipoEstado"
  
  attribute {
    name = "idTipoEstado"
    type = "S"
  }
  
  tags = {
    Name = "${local.app_name}-tipoestado"
  }
}

resource "aws_dynamodb_table" "tipobox" {
  name         = "tipobox"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "idTipoBox"
  
  attribute {
    name = "idTipoBox"
    type = "S"
  }
  
  tags = {
    Name = "${local.app_name}-tipobox"
  }
}

resource "aws_dynamodb_table" "tipoitem" {
  name         = "tipoitem"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "idTipoItem"
  
  attribute {
    name = "idTipoItem"
    type = "S"
  }
  
  tags = {
    Name = "${local.app_name}-tipoitem"
  }
}

resource "aws_dynamodb_table" "personalizacion" {
  name         = "personalizacion"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "idPersonalizacion"
  
  attribute {
    name = "idPersonalizacion"
    type = "S"
  }
  
  tags = {
    Name = "${local.app_name}-personalizacion"
  }
}

resource "aws_dynamodb_table" "estadobox" {
  name         = "estadobox"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "idEstadoBox"
  
  attribute {
    name = "idEstadoBox"
    type = "S"
  }
  
  tags = {
    Name = "${local.app_name}-estadobox"
  }
}

# tablas principales
resource "aws_dynamodb_table" "usuario" {
  name         = "usuario"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "idUsuario"
  
  attribute {
    name = "idUsuario"
    type = "S"
  }
  
  tags = {
    Name = "${local.app_name}-usuario"
  }
}

resource "aws_dynamodb_table" "box" {
  name         = "box"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "idBox"
  
  attribute {
    name = "idBox"
    type = "S"
  }
  
  tags = {
    Name = "${local.app_name}-box"
  }
}

resource "aws_dynamodb_table" "items" {
  name         = "items"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "idItem"
  
  attribute {
    name = "idItem"
    type = "S"
  }
  
  tags = {
    Name = "${local.app_name}-items"
  }
}

resource "aws_dynamodb_table" "agenda" {
  name         = "agenda"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "idAgenda"
  
  attribute {
    name = "idAgenda"
    type = "S"
  }
  
  attribute {
    name = "horainicio"
    type = "S"
  }
  
  attribute {
    name = "idUsuario"
    type = "S"
  }
  
  global_secondary_index {
    name            = "HoraInicioIndex"
    hash_key        = "horainicio"
    projection_type = "ALL"
  }
  
  global_secondary_index {
    name            = "UsuarioIndex"
    hash_key        = "idUsuario"
    range_key       = "horainicio"
    projection_type = "ALL"
  }
  
  tags = {
    Name = "${local.app_name}-agenda"
  }
}

resource "aws_dynamodb_table" "registroagenda" {
  name         = "registroagenda"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "idRegistroAgenda"
  
  attribute {
    name = "idRegistroAgenda"
    type = "S"
  }
  
  tags = {
    Name = "${local.app_name}-registroagenda"
  }
}
