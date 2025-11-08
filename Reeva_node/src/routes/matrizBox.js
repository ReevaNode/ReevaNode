// routes/matrizBox.js
import express from 'express';
import { ScanCommand } from '@aws-sdk/lib-dynamodb';
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

// GET /matriz-box - vista de matriz de boxes
router.get('/matriz-box', async (req, res) => {
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
                activePage: 'matriz-box',
                fromCache: true
            });
        }

        // 2. Consultar con resiliencia
        logger.info('Cache miss - consultando DynamoDB con resiliencia');
        
        const ahora = new Date();
        const hoy = new Date();
        hoy.setHours(0, 0, 0, 0);
        const finDia = new Date(hoy);
        finDia.setHours(23, 59, 59, 999);

        // Función para consultar DynamoDB con retry
        const fetchMatrizData = async () => {
            return await retryWithBackoff(
                async () => {
                    // Obtener todas las tablas en paralelo
                    const [boxesResult, tipoBoxResult, estadoBoxResult, tipoEstadoResult, agendasResult, usuariosResult] = 
                        await Promise.all([
                            db.send(new ScanCommand({ TableName: 'box' })),
                            db.send(new ScanCommand({ TableName: 'tipobox' })),
                            db.send(new ScanCommand({ TableName: 'estadobox' })),
                            db.send(new ScanCommand({ TableName: 'tipoestado' })),
                            db.send(new ScanCommand({ TableName: 'agenda' })),
                            db.send(new ScanCommand({ TableName: 'usuario' }))
                        ]);

                    return {
                        boxes: boxesResult.Items || [],
                        tiposBox: tipoBoxResult.Items || [],
                        estadosBox: estadoBoxResult.Items || [],
                        tiposEstado: tipoEstadoResult.Items || [],
                        agendas: agendasResult.Items || [],
                        usuarios: usuariosResult.Items || []
                    };
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
            return {
                boxes: [],
                tiposBox: [],
                estadosBox: [],
                tiposEstado: [],
                agendas: [],
                usuarios: []
            };
        };

        // Ejecutar con Circuit Breaker
        const data = await matrizCircuitBreaker.execute(fetchMatrizData, fallbackMatrizData);

        const boxes = data.boxes;
        const tiposBox = data.tiposBox;
        const estadosBox = data.estadosBox;
        const tiposEstado = data.tiposEstado;
        let agendas = data.agendas;
        const usuarios = data.usuarios;

        // filtrar solo agendas de hoy
        agendas = agendas.filter(agenda => {
            if (!agenda.horainicio) return false;
            const fechaAgenda = new Date(agenda.horainicio);
            return fechaAgenda >= hoy && fechaAgenda <= finDia;
        });

        // obtener registros de agenda (para calcular progreso)
        const registrosCommand = new ScanCommand({
            TableName: 'registroagenda'
        });
        const registrosResult = await db.send(registrosCommand);
        let registros = registrosResult.Items || [];

        // filtrar solo registros de hoy
        registros = registros.filter(registro => {
            if (!registro.fechahora) return false;
            const fechaRegistro = new Date(registro.fechahora);
            return fechaRegistro >= hoy && fechaRegistro <= finDia;
        });

        // crear mapas para lookups rapidos
        const tipoBoxMap = {};
        tiposBox.forEach(tb => {
            tipoBoxMap[tb.idTipoBox] = tb.tipoBox || tb.tipobox || 'Sin Especialidad';
        });

        const estadoBoxMap = {};
        estadosBox.forEach(eb => {
            estadoBoxMap[eb.idEstadoBox] = eb;
        });

        const tipoEstadoMap = {};
        tiposEstado.forEach(te => {
            tipoEstadoMap[te.idTipoEstado] = te.estado;
        });

        const usuarioMap = {};
        usuarios.forEach(u => {
            usuarioMap[u.idUsuario] = u.nombreProfesional || u.nombreprofesional || 'Sin nombre';
        });

        // Procesar cada box
        const groupedBoxes = {};
        
        for (const box of boxes) {
            const boxData = { ...box };
            
            // Verificar si está inhabilitado (idEstadoBox = 4 en estadobox)
            // Según el seed, puede ser idEstadoBox o idestadobox
            const estadoBoxId = box.idEstadoBox || box.idestadobox;
            const estadoBoxActual = estadoBoxMap[estadoBoxId];
            
            if (estadoBoxActual && estadoBoxId === '4') {
                // Box inhabilitado
                boxData.estado = 'Inhabilitado';
                boxData.medico_nombre = null;
                boxData.progreso_porcentaje = 0;
                boxData.ocupacion_porcentaje = 0;
            } else {
                // Buscar agenda activa (que esté en curso ahora mismo)
                const agendaActual = agendas.find(agenda => {
                    // Comparar idBox (puede ser idBox o idbox en algunos casos)
                    const agendaBoxId = agenda.idBox || agenda.idbox;
                    if (agendaBoxId !== box.idBox) return false;
                    const inicio = new Date(agenda.horainicio);
                    const termino = new Date(agenda.horaTermino);
                    return inicio <= ahora && termino > ahora;
                });

                // Asignar estado según agenda actual
                if (agendaActual) {
                    const estadoId = agendaActual.idEstado || agendaActual.idestado;
                    switch (estadoId) {
                        case '1':
                            boxData.estado = 'Libre';
                            break;
                        case '2':
                            boxData.estado = 'Paciente Ausente';
                            break;
                        case '3':
                            boxData.estado = 'Paciente Esperando';
                            break;
                        case '4':
                            boxData.estado = 'En Atención';
                            break;
                        case '6':
                            boxData.estado = 'Finalizado';
                            break;
                        default:
                            boxData.estado = 'Libre';
                    }
                    const usuarioId = agendaActual.idUsuario || agendaActual.idusuario;
                    boxData.medico_nombre = usuarioMap[usuarioId] || null;
                } else {
                    boxData.estado = 'Libre';
                    boxData.medico_nombre = null;
                }

                // Calcular progreso diario
                const agendasDelBox = agendas.filter(a => {
                    const agendaBoxId = a.idBox || a.idbox;
                    return agendaBoxId === box.idBox;
                });
                const totalAgendasDia = agendasDelBox.length;

                let agendasFinalizadas = 0;
                if (totalAgendasDia > 0) {
                    const agendasIds = agendasDelBox.map(a => a.idAgenda);
                    agendasFinalizadas = registros.filter(r => 
                        agendasIds.includes(r.idAgenda) && r.idEstado === '6'
                    ).length;
                }

                if (totalAgendasDia > 0) {
                    boxData.progreso_porcentaje = Math.round((agendasFinalizadas / totalAgendasDia) * 100);
                } else {
                    boxData.progreso_porcentaje = 0;
                }

                // Calcular ocupación (tiempo agendado vs 24 horas)
                let tiempoTotalAgendado = 0;
                agendasDelBox.forEach(agenda => {
                    if (agenda.horainicio && agenda.horaTermino) {
                        const inicio = new Date(agenda.horainicio);
                        const termino = new Date(agenda.horaTermino);
                        const duracionHoras = (termino - inicio) / (1000 * 60 * 60);
                        tiempoTotalAgendado += duracionHoras;
                    }
                });

                const horasLaboralesDia = 24;
                if (tiempoTotalAgendado > 0) {
                    boxData.ocupacion_porcentaje = Math.min(
                        Math.round((tiempoTotalAgendado / horasLaboralesDia) * 100),
                        100
                    );
                } else {
                    boxData.ocupacion_porcentaje = 0;
                }
            }

            // Agregar nombre de especialidad
            // El campo FK puede ser idTipoBox o idtipobox
            const tipoBoxId = box.idTipoBox || box.idtipobox;
            boxData.especialidad = tipoBoxMap[tipoBoxId] || 'Sin Especialidad';
            
            // Agregar número de box (extraer del idBox si es numérico)
            boxData.numero = box.numero || box.idBox || 'N/A';

            // Agrupar por especialidad
            const nombreEsp = boxData.especialidad;
            if (!groupedBoxes[nombreEsp]) {
                groupedBoxes[nombreEsp] = [];
            }
            groupedBoxes[nombreEsp].push(boxData);
        }

        // Obtener lista de especialidades únicas
        const especialidades = Object.keys(groupedBoxes).sort();

        // Obtener lista de estados únicos
        const estados = tiposEstado.map(te => te.estado).sort();

        // Preparar datos para cache y respuesta
        const renderData = {
            grouped_boxes: groupedBoxes,
            especialidades: especialidades,
            estados: estados,
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
            activePage: 'matriz-box',
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
                activePage: 'matriz-box',
                fromCache: true,
                systemDegraded: true
            });
        }
        
        res.status(500).send('Error al cargar la matriz de boxes');
    }
});

export default router;
