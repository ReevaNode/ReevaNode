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
    if (!req.user) {
      return next();
    }

    const userId = req.user.id || req.user.sub || req.user.email;

    // Consultar DynamoDB para obtener todas las empresas del usuario
    const queryCommand = new QueryCommand({
      TableName: EMPRESAS_TABLE,
      KeyConditionExpression: 'userId = :userId',
      ExpressionAttributeValues: {
        ':userId': userId
      }
    });

    const result = await docClient.send(queryCommand);
    const empresas = result.Items || [];
    const countEmpresas = result.Count || 0;
    const tieneEmpresas = countEmpresas > 0;

    // Guardar en request para usar después
    req.tieneEmpresas = tieneEmpresas;
    req.countEmpresas = countEmpresas;
    req.empresas = empresas;


    if (req.path === '/bienvenida' && countEmpresas >= 2 && !req.query['skip-select']) {
      console.log(`ℹUsuario con ${countEmpresas} empresas, redirigiendo a seleccionar-empresa`);
      return res.redirect('/seleccionar-empresa');
    }

    next();
  } catch (error) {
    console.warn('Advertencia en checkEmpresas:', error.message);
    req.tieneEmpresas = false;
    req.countEmpresas = 0;
    next();
  }
}

export default checkEmpresas;
