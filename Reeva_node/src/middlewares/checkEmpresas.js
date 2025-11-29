import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, QueryCommand } from "@aws-sdk/lib-dynamodb";

const dynamoClient = new DynamoDBClient({ region: 'us-east-1' });
const docClient = DynamoDBDocumentClient.from(dynamoClient);

const EMPRESAS_TABLE = process.env.EMPRESAS_TABLE || 'empresas-new';

async function checkEmpresas(req, res, next) {
  try {
    if (!req.user) {
      return next();
    }

    const userId = req.user.id || req.user.sub || req.user.email;

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

    // Verificar si hay una empresa activa
    const empresaActiva = empresas.find(e => e.activa === 1 || e.activa === '1');

    // Si viene de login (ruta "/" o "/bienvenida") y tiene 2+ empresas sin una activa, redirigir a seleccionar
    if ((req.path === '/' || req.path === '/bienvenida') && countEmpresas >= 2 && !empresaActiva && !req.query['skip-select']) {
      console.log(`ℹUsuario con ${countEmpresas} empresas (sin activa), redirigiendo a seleccionar-empresa`);
      return res.redirect('/seleccionar-empresa');
    }

    next();
  } catch (error) {
    console.error('checkEmpresas ERROR:', error.message);
    console.error('   Stack:', error.stack);
    req.tieneEmpresas = false;
    req.countEmpresas = 0;
    next();
  }
}

export default checkEmpresas;
