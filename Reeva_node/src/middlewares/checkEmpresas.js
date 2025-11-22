/**
 * Middleware: Verificar si el usuario tiene empresas
 * Si no tiene → redirige a /parametrizacion
 * Si tiene → continúa
 */

import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, QueryCommand } from "@aws-sdk/lib-dynamodb";

const dynamoClient = new DynamoDBClient({ region: 'us-east-1' });
const docClient = DynamoDBDocumentClient.from(dynamoClient);

const EMPRESAS_TABLE = process.env.EMPRESAS_TABLE || 'aws-cognito-jwt-login-dev-empresas';

async function checkEmpresas(req, res, next) {
  try {
    // Si no está autenticado, dejar pasar
    if (!req.user) {
      return next();
    }

    const userId = req.user.id || req.user.sub || req.user.email;

    // Consultar DynamoDB para ver si tiene empresas
    const queryCommand = new QueryCommand({
      TableName: EMPRESAS_TABLE,
      KeyConditionExpression: 'userId = :userId',
      ExpressionAttributeValues: {
        ':userId': userId
      },
      Limit: 1 // Solo necesitamos saber si existe al menos 1
    });

    const result = await docClient.send(queryCommand);
    const tieneEmpresas = result.Count > 0;

    // Guardar en request para usar después
    req.tieneEmpresas = tieneEmpresas;
    req.countEmpresas = result.Count || 0;

    next();
  } catch (error) {
    console.warn('Advertencia en checkEmpresas:', error.message);
    // Si hay error, dejamos que continúe (fallback a sesión)
    req.tieneEmpresas = false;
    next();
  }
}

export default checkEmpresas;
