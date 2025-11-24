// src/middlewares/loadParametrizacion.js
// Middleware para cargar la parametrizacion activa del usuario

import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, QueryCommand } from "@aws-sdk/lib-dynamodb";
import Logger from '../utils/logger.js';
import { getParametrizacionLabels } from '../utils/pluralize.js';

const logger = new Logger('LOAD_PARAMETRIZACION');

const dynamoClient = new DynamoDBClient({ region: 'us-east-1' });
const docClient = DynamoDBDocumentClient.from(dynamoClient);

const EMPRESAS_TABLE = process.env.EMPRESAS_TABLE || 'aws-cognito-jwt-login-dev-empresas-new';

/**
 * Middleware que carga la parametrización activa del usuario
 * Busca la empresa activa (activa: 1) y extrae nombreNivel1, nombreNivel2, nombreNivel3
 * Los datos se almacenan en res.locals para usarlos en las vistas
 */
const loadParametrizacion = async (req, res, next) => {
  try {
    // Valores por defecto
    const defaults = {
      nombreNivel1: 'Pasillo',
      nombreNivel2: 'Mesa',
      nombreNivel3: 'Ocupante'
    };

    // Si no hay usuario autenticado, pasar los valores por defecto
    if (!req.session || !req.session.user) {
      res.locals.parametrizacion = defaults;
      res.locals.parametrizacionLabels = getParametrizacionLabels(defaults);
      res.locals.empresaActiva = null;
      return next();
    }

    const userId = req.session.user.id || req.session.user.sub || req.session.user.email;

    // Buscar la empresa activa del usuario
    const queryCommand = new QueryCommand({
      TableName: EMPRESAS_TABLE,
      KeyConditionExpression: 'userId = :userId',
      ExpressionAttributeValues: {
        ':userId': userId
      }
    });

    const result = await docClient.send(queryCommand);
    const empresas = result.Items || [];

    // Buscar la empresa con activa = 1
    const empresaActiva = empresas.find(e => e.activa === 1);

    if (empresaActiva) {
      const parametrizacion = {
        nombreNivel1: empresaActiva.nombreNivel1 || defaults.nombreNivel1,
        nombreNivel2: empresaActiva.nombreNivel2 || defaults.nombreNivel2,
        nombreNivel3: empresaActiva.nombreNivel3 || defaults.nombreNivel3
      };

      res.locals.parametrizacion = parametrizacion;
      res.locals.parametrizacionLabels = getParametrizacionLabels(parametrizacion);
      res.locals.empresaActiva = empresaActiva;

      logger.info(`Parametrización cargada para usuario ${userId}:`, parametrizacion);
    } else {
      // Si no hay empresa activa, usar los valores por defecto
      res.locals.parametrizacion = defaults;
      res.locals.parametrizacionLabels = getParametrizacionLabels(defaults);
      res.locals.empresaActiva = null;
      logger.warn(`No hay empresa activa para usuario ${userId}, usando valores por defecto`);
    }

    next();
  } catch (error) {
    logger.error('Error al cargar parametrización:', error);
    // En caso de error, usar los valores por defecto
    const defaults = {
      nombreNivel1: 'Pasillo',
      nombreNivel2: 'Mesa',
      nombreNivel3: 'Ocupante'
    };
    res.locals.parametrizacion = defaults;
    res.locals.parametrizacionLabels = getParametrizacionLabels(defaults);
    res.locals.empresaActiva = null;
    next();
  }
};

export default loadParametrizacion;
