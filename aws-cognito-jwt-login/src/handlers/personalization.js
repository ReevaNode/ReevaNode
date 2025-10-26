const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, GetCommand, PutCommand, DeleteCommand } = require("@aws-sdk/lib-dynamodb");

const client = new DynamoDBClient({});
const dynamo = DynamoDBDocumentClient.from(client);

/* GET /personalization */
module.exports.getPersonalization = async (event) => {
  try {
    console.log("=== getPersonalization - START ===");
    
    // Obtener userId del token JWT
    const userId = event.requestContext?.authorizer?.jwt?.claims?.sub;
    const userEmail = event.requestContext?.authorizer?.jwt?.claims?.email;
    
    if (!userId) {
      console.error("Usuario no autenticado");
      return response(401, { ok: false, error: "Usuario no autenticado" });
    }

    console.log("UserId:", userId);
    console.log("Table:", process.env.PARAMETERS_TABLE);

    // Buscar el registro del usuario en DynamoDB
    const params = {
      TableName: process.env.PARAMETERS_TABLE,
      Key: { idUser: userId }
    };

    console.log("Consultando DynamoDB:", params);

    const result = await dynamo.send(new GetCommand(params));
    console.log("Resultado:", result);

    // Si no hay datos guardados, retornar valores por defecto
    const personalizacion = result.Item || {
      idUser: userId,
      idioma: "es",
      aspecto: "claro"
    };

    return response(200, {
      ok: true,
      user_id: userId,
      email: userEmail,
      personalization: personalizacion
    });

  } catch (err) {
    console.error("Error en getPersonalization:", err);
    return response(500, { 
      ok: false, 
      error: "Error interno", 
      details: err.message 
    });
  }
};

/* PUT /personalization */
module.exports.updatePersonalization = async (event) => {
  try {
    console.log("=== updatePersonalization - START ===");
    console.log("Environment Variables:");
    console.log("- PARAMETERS_TABLE:", process.env.PARAMETERS_TABLE);

    // 1. Verificar variable de entorno
    if (!process.env.PARAMETERS_TABLE) {
      console.error("PARAMETERS_TABLE no está definida");
      return response(500, { 
        ok: false, 
        error: "Configuración del servidor incorrecta" 
      });
    }

    // 2. Obtener userId del token JWT
    const userId = event.requestContext?.authorizer?.jwt?.claims?.sub;
    const userEmail = event.requestContext?.authorizer?.jwt?.claims?.email;
    
    if (!userId) {
      console.error("Usuario no autenticado");
      return response(401, { ok: false, error: "Usuario no autenticado" });
    }

    console.log("UserId del token:", userId);
    console.log("Email del token:", userEmail);

    // 3. Parsear body
    const body = JSON.parse(event.body || "{}");
    console.log("Body parseado:", body);

    const { idioma, aspecto } = body;

    // 4. Validar parametros
    if (!idioma || !aspecto) {
      console.error("Faltan parámetros obligatorios");
      return response(400, { 
        ok: false, 
        error: "Parámetros 'idioma' y 'aspecto' son obligatorios",
        received: { idioma, aspecto }
      });
    }

    // 5. Preparar datos para DynamoDB
    const timestamp = new Date().toISOString();
    const params = {
      TableName: process.env.PARAMETERS_TABLE,
      Item: {
        idUser: userId,     
        idioma,              
        aspecto,             
        email: userEmail,    
        updatedAt: timestamp 
      }
    };

    console.log("Guardando en DynamoDB:", JSON.stringify(params, null, 2));

    // 6. Guardar en DynamoDB usando AWS SDK v3
    await dynamo.send(new PutCommand(params));
    console.log("Personalización guardada exitosamente");

    // 7. Respuesta exitosa
    return response(200, { 
      ok: true, 
      message: "Parámetros de personalización actualizados",
      user_id: userId,
      saved_parameters: { 
        idioma, 
        aspecto 
      },
      timestamp: timestamp
    });

  } catch (err) {
    console.error("Error en updatePersonalization:", err);
    console.error("Error stack:", err.stack);
    
    return response(500, { 
      ok: false, 
      error: "Error interno del servidor",
      details: err.message
    });
  }
};

/* DELETE /personalization */
module.exports.deletePersonalization = async (event) => {
  try {
    console.log("=== deletePersonalization - START ===");
    
    const userId = event.requestContext?.authorizer?.jwt?.claims?.sub;

    if (!userId) {
      console.error("Usuario no autenticado");
      return response(401, { ok: false, error: "Usuario no autenticado" });
    }

    const params = {
      TableName: process.env.PARAMETERS_TABLE,
      Key: { idUser: userId }
    };

    console.log("Eliminando de DynamoDB:", params);

    await dynamo.send(new DeleteCommand(params));
    
    console.log("Personalización eliminada");
    return response(200, { 
      ok: true, 
      message: "Personalización eliminada",
      user_id: userId
    });
    
  } catch (err) {
    console.error("Error al eliminar personalización:", err);
    return response(500, { 
      ok: false, 
      error: "Error interno", 
      details: err.message 
    });
  }
};

function response(statusCode, body) {
  return {
    statusCode,
    headers: { 
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Amz-Date, X-Api-Key, X-Amz-Security-Token",
      "Access-Control-Allow-Credentials": "true"
    },
    body: JSON.stringify(body)
  };
}