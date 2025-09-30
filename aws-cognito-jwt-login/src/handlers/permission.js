const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, GetCommand, PutCommand, ScanCommand } = require("@aws-sdk/lib-dynamodb");
const { CognitoIdentityProviderClient, AdminGetUserCommand } = require("@aws-sdk/client-cognito-identity-provider");
const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);
const cognitoClient = new CognitoIdentityProviderClient({});

// === CONFIGURACION DE PERMISOS Y ROLES ===
const PERMISSIONS = [
  "agenda.read", "agenda.write",
  "bienvenidos.read", "bienvenidos.write", 
  "box.read", "box.write",
  "dashboard.read", "dashboard.write",
  "infobox.read", "infobox.write"
];

const ROLES = {
  "admin": [
    "bienvenidos.read", "bienvenidos.write",
    "dashboard.read", "dashboard.write", 
    "agenda.read", "agenda.write",
    "box.read", "box.write",
    "infobox.read", "infobox.write"
  ],
  "gestorpasillo": [
    "bienvenidos.read", "bienvenidos.write",
    "dashboard.read", "dashboard.write",
    "agenda.read", "agenda.write"
  ],
  "consultor": [
    "bienvenidos.read", "agenda.read",
    "box.read", "infobox.read", "dashboard.read"
  ]
};

function response(statusCode, body) {
  return {
    statusCode,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  };
}

// === HELPERS Dynamo ===
async function getUser(userId) {
  try {
    const command = new GetCommand({
      TableName: process.env.USER_TABLE,
      Key: { userId }
    });
    const result = await docClient.send(command);
    return result.Item || null;
  } catch (error) {
    console.error('Error obteniendo usuario:', error);
    return null;
  }
}

async function getUserByEmail(email) {
  try {
    const command = new ScanCommand({
      TableName: process.env.USER_TABLE,
      FilterExpression: 'email = :email',
      ExpressionAttributeValues: { ':email': email }
    });
    const result = await docClient.send(command);
    return result.Items?.[0] || null;
  } catch (error) {
    console.error('Error buscando usuario por email:', error);
    return null;
  }
}

async function saveUser(userData) {
  try {
    const command = new PutCommand({
      TableName: process.env.USER_TABLE,
      Item: {
        ...userData,
        updatedAt: new Date().toISOString()
      }
    });
    await docClient.send(command);
    return true;
  } catch (error) {
    console.error('Error guardando usuario:', error);
    return false;
  }
}

// Funcion para verificar si un usuario existe en Cognito
async function checkUserExistsInCognito(email) {
  try {
    const command = new AdminGetUserCommand({
      UserPoolId: process.env.USER_POOL_ID,
      Username: email
    });
    
    await cognitoClient.send(command);
    return true; 
  } catch (error) {
    if (error.name === 'UserNotFoundException') {
      return false; 
    }
    // Otros errores los re-lanzamos
    console.error('Error verificando usuario en Cognito:', error);
    throw error;
  }
}

// Funcion helper para crear usuario desde email
async function createUserFromEmail(email) {
  try {
    // Obtener el usuario real de Cognito para sacar el sub
    const command = new AdminGetUserCommand({
      UserPoolId: process.env.USER_POOL_ID,
      Username: email
    });
    
    const cognitoUser = await cognitoClient.send(command);
    const userSub = cognitoUser.UserAttributes.find(attr => attr.Name === 'sub')?.Value;
    
    if (!userSub) {
      throw new Error('No se pudo obtener el sub del usuario');
    }
    
    const userData = {
      userId: userSub, // Usar el sub real de Cognito
      email: email,
      username: email,
      roles: [],
      permissions: [],
      createdAt: new Date().toISOString(),
      lastLogin: null
    };
    
    return userData;
  } catch (error) {
    console.error('Error creando usuario desde email:', error);
    return null;
  }
}

// === ENDPOINTS ===

// Info usuario autenticado
module.exports.getAuthInfo = async (event) => {
  try {
    const claims = event?.requestContext?.authorizer?.jwt?.claims;
    if (!claims) {
      return response(401, { ok: false, error: 'Token no válido' });
    }
    const userId = claims.sub;
    let user = await getUser(userId);
    
    if (!user) {
      return response(403, { 
        ok: false, 
        error: 'Usuario no encontrado. Debe estar registrado en el sistema.' 
      });
    }
    
    return response(200, {
      ok: true,
      user: {
        userId: user.userId,
        email: user.email,
        username: user.username,
        roles: user.roles || [],
        permissions: user.permissions || []
      }
    });
  } catch (error) {
    console.error('Error en getAuthInfo:', error);
    return response(500, { ok: false, error: 'Error interno' });
  }
};

// Asignar rol a usuario (crear si no existe)
module.exports.assignRole = async (event) => {
  try {
    const claims = event?.requestContext?.authorizer?.jwt?.claims;
    if (!claims) {
      return response(401, { ok: false, error: 'Token no válido' });
    }
    
    const { user_email, role } = JSON.parse(event.body || '{}');
    
    if (!user_email || !role) {
      return response(400, { ok: false, error: 'user_email y role son obligatorios' });
    }
    
    if (!ROLES[role]) {
      return response(400, { ok: false, error: `Rol '${role}' no existe` });
    }
    
    // Buscar usuario en Dynamo
    let user = await getUserByEmail(user_email);
    
    // Verificar primero si el usuario existe en Cognito
    if (!user) {
      console.log(`Usuario ${user_email} no existe en DynamoDB. Verificando en Cognito...`);
      
      try {
        const existsInCognito = await checkUserExistsInCognito(user_email);
        
        if (!existsInCognito) {
          return response(404, { 
            ok: false, 
            error: `Usuario '${user_email}' no existe en Cognito. Debe crearlo primero con AWS CLI.`,
            suggestion: `Ejecute: aws cognito-idp admin-create-user --user-pool-id ${process.env.USER_POOL_ID} --username "${user_email}" --user-attributes Name=email,Value="${user_email}" --message-action SUPPRESS`
          });
        }
        
        // Si existe en Cognito, crear en DynamoDB
        user = await createUserFromEmail(user_email);
        if (!user) {
          return response(500, { ok: false, error: 'Error creando usuario en el sistema' });
        }
        
        const saved = await saveUser(user);
        if (!saved) {
          return response(500, { ok: false, error: 'Error guardando nuevo usuario' });
        }
        
        console.log(`Usuario ${user_email} creado en DynamoDB (existe en Cognito)`);
        
      } catch (error) {
        return response(500, { 
          ok: false, 
          error: 'Error verificando usuario en Cognito',
          details: error.message 
        });
      }
    }
    
    const currentRoles = user.roles || [];
    if (currentRoles.includes(role)) {
      return response(200, { 
        ok: true, 
        message: `Usuario ${user_email} ya tiene el rol '${role}'`,
        user: user
      });
    }
    
    const newRoles = [...currentRoles, role];
    const newPermissions = [...new Set(newRoles.flatMap(r => ROLES[r] || []))];
    
    const updatedUser = {
      ...user,
      roles: newRoles, 
      permissions: newPermissions
    };
    
    const updated = await saveUser(updatedUser);
    if (!updated) {
      return response(500, { ok: false, error: 'Error asignando rol' });
    }
    
    return response(200, {
      ok: true,
      message: `Rol '${role}' asignado a '${user_email}'`,
      user: updatedUser
    });
    
  } catch (error) {
    console.error('Error en assignRole:', error);
    return response(500, { ok: false, error: 'Error interno' });
  }
};