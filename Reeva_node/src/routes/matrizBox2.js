// routes/matrizBox.js
import express from 'express';
import { QueryCommand } from '@aws-sdk/lib-dynamodb';
import db from '../../db.js';
import { retryWithBackoff, CircuitBreaker, SimpleCache } from '../utils/resilience.js';
import Logger from '../utils/logger.js';

const router = express.Router();
const logger = new Logger('MATRIZ_BOX');

// inicializar Circuit Breaker y Cache para matriz box
const matrizCircuitBreaker = new CircuitBreaker({
  failureThreshold: 3,
  successThreshold: 2,
  timeout: 30000
});

const matrizCache = new SimpleCache({
  ttl: 15000,    // 15 segundos de cache (actualización rápida)
  maxSize: 100
});

const ESPACIOS_TABLE = process.env.ESPACIOS_TABLE || 'aws-cognito-jwt-login-dev-espacios';

// GET /matriz - vista de matriz de boxes
router.get('/matriz', async (req, res) => {
    const cacheKey = 'matriz_data';
    let fromCache = false;
    let systemDegraded = false;

    try {
        // 1. Intentar obtener desde cache
        const cachedData = matrizCache.get(cacheKey);
        if (cachedData) {
            logger.info('Usando datos del cache para matriz');
            fromCache = true;
            return res.render('matriz_box', {
                ...cachedData,
                user: req.session.user,
                activePage: 'matriz',
                fromCache: true
            });
        }

        // 2. Consultar con resiliencia
        logger.info('Cache miss - consultando DynamoDB con resiliencia');
        
        // Obtener empresa activa desde res.locals (proporcionada por el middleware loadParametrizacion)
        const empresaActiva = res.locals.empresaActiva;
        if (!empresaActiva) {
            logger.warn('No hay empresa activa');
            return res.status(400).send('No hay empresa activa');
        }

        const empresaId = empresaActiva.empresaId;

        // Función para consultar DynamoDB con retry
        const fetchMatrizData = async () => {
            return await retryWithBackoff(
                async () => {
                    // Obtener espacios (pasillos/habitaciones) de la empresa
                    const queryCommand = new QueryCommand({
                        TableName: ESPACIOS_TABLE,
                        KeyConditionExpression: 'empresaId = :empresaId',
                        ExpressionAttributeValues: {
                            ':empresaId': empresaId
                        }
                    });

                    const resultado = await db.send(queryCommand);
                    return resultado.Items || [];
                },
                {
                    maxRetries: 3,
                    initialDelay: 100,
                    maxDelay: 2000,
                    factor: 2,
                    onRetry: (attempt, delay, error) => {
                        logger.warn(`Retry ${attempt}/3 después de ${delay}ms: ${error.message}`);
                    }
                }
            );
        };

        // Fallback en caso de fallo
        const fallbackMatrizData = async () => {
            logger.error('⚠️ Usando fallback - DynamoDB no disponible');
            systemDegraded = true;
            return [];
        };

        // Ejecutar con Circuit Breaker
        const espacios = await matrizCircuitBreaker.execute(fetchMatrizData, fallbackMatrizData);

        // Agrupar mesas por pasilloNombre
        const groupedByPasillo = {};
        
        espacios.forEach(espacio => {
            const pasilloNombre = espacio.pasilloNombre || 'Sin nombre';
            
            if (!groupedByPasillo[pasilloNombre]) {
                groupedByPasillo[pasilloNombre] = [];
            }

            // Agregar las mesas de este espacio
            if (espacio.mesas && Array.isArray(espacio.mesas)) {
                espacio.mesas.forEach(mesa => {
                    groupedByPasillo[pasilloNombre].push({
                        id: mesa.id,
                        nombre: mesa.nombre || `Mesa ${mesa.numero || '?'}`,
                        numero: mesa.numero,
                        estado: 'Libre', // Por ahora, estado predeterminado
                        medico_nombre: null,
                        progreso_porcentaje: 0,
                        ocupacion_porcentaje: 0,
                        espacioId: espacio.espacioId,
                        pasilloNombre: pasilloNombre  // Agregar el nombre del pasillo
                    });
                });
            }
        });

        // Obtener lista de pasillos únicos
        const pasillos = Object.keys(groupedByPasillo).sort();

        // Preparar datos para cache y respuesta
        const renderData = {
            grouped_boxes: groupedByPasillo,  // Renombramos para compatibilidad con la vista
            especialidades: pasillos,          // Los pasillos ahora son las "especialidades"
            estados: ['Libre', 'Ocupado', 'En Mantenimiento'],
            systemDegraded: systemDegraded
        };

        // Guardar en cache si no hubo errores
        if (!systemDegraded) {
            matrizCache.set(cacheKey, renderData);
            logger.info('Datos de matriz guardados en cache');
        }

        res.render('matriz_box', {
            ...renderData,
            user: req.session.user,
            activePage: 'matriz',
            fromCache: false
        });

    } catch (error) {
        logger.error('Error al cargar matriz de boxes:', error);
        
        // Intentar servir desde cache en caso de error crítico
        const cachedData = matrizCache.get(cacheKey);
        if (cachedData) {
            logger.warn('Sirviendo datos en cache debido a error');
            return res.render('matriz_box', {
                ...cachedData,
                user: req.session.user,
                activePage: 'matriz',
                fromCache: true,
                systemDegraded: true
            });
        }
        
        res.status(500).send('Error al cargar la matriz de boxes');
    }
});

export default router;
