import { Router } from "express";
import db from '../../db.js';
import {ScanCommand, QueryCommand , PutCommand, DeleteCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { config } from '../config/index.js';
import Logger from '../utils/logger.js';
import { broadcastBoxUpdate } from '../services/websocketService.js';
import { retryWithBackoff, CircuitBreaker, SimpleCache } from '../utils/resilience.js';

const router = Router();
const logger = new Logger('AGENDA');

const ESPACIOS_TABLE = process.env.ESPACIOS_TABLE || 'aws-cognito-jwt-login-dev-espacios';
const OCUPANTES_TABLE = process.env.OCUPANTES_TABLE || 'aws-cognito-jwt-login-dev-ocupantes';

// inicializar Circuit Breaker y Cache para agenda
const agendaCircuitBreaker = new CircuitBreaker({
  failureThreshold: 5,    // más tolerante para operaciones críticas
  successThreshold: 2,
  timeout: 30000
});

const agendaCache = new SimpleCache({
  ttl: 10000,    // 10 segundos - actualización frecuente
  maxSize: 50
});

// helper para obtener mesas de ESPACIOS con RESILIENCIA
async function getMesas(empresaId) {
    return await retryWithBackoff(
        async () => {
            const espaciosCmd = new QueryCommand({
                TableName: ESPACIOS_TABLE,
                KeyConditionExpression: 'empresaId = :empresaId',
                ExpressionAttributeValues: {
                    ':empresaId': empresaId
                }
            });
            
            const espaciosRes = await db.send(espaciosCmd);
            const espacios = espaciosRes.Items || [];
            
            // Convertir mesas a formato similar al anterior para compatibilidad
            const mesas = [];
            espacios.forEach(espacio => {
                if (espacio.mesas && Array.isArray(espacio.mesas)) {
                    espacio.mesas.forEach(mesa => {
                        mesas.push({
                            id: mesa.id,
                            nombre: mesa.nombre,
                            numero: mesa.numero,
                            pasilloNombre: espacio.pasilloNombre,
                            espacioId: espacio.espacioId
                        });
                    });
                }
            });
            
            return mesas;
        },
        {
            maxRetries: 3,
            initialDelay: 100,
            maxDelay: 1000,
            factor: 2
        }
    );
}

// helper para obtener ocupantes (profesionales) de la empresa con RESILIENCIA
async function getOcupantes(empresaId) {
    try {
        return await retryWithBackoff(
            async () => {
                const ocupantesCmd = new QueryCommand({
                    TableName: OCUPANTES_TABLE,
                    KeyConditionExpression: 'empresaId = :empresaId',
                    ExpressionAttributeValues: {
                        ':empresaId': empresaId
                    }
                });
                
                const result = await db.send(ocupantesCmd);
                const ocupantes = result.Items || [];
                
                // Filtrar solo activos
                const ocupantesActivos = ocupantes.filter(o => o.activo === 1 || o.activo === '1');
                
                logger.info(`Ocupantes obtenidos para ${empresaId}: ${ocupantesActivos.length} activos de ${ocupantes.length} totales`);
                return ocupantesActivos;
            },
            {
                maxRetries: 3,
                initialDelay: 100,
                maxDelay: 1000,
                factor: 2
            }
        );
    } catch (error) {
        logger.error(`Error obteniendo ocupantes para ${empresaId}:`, error);
        return [];  // Retornar array vacío en caso de error
    }
}

// GET /agenda
router.get('/agenda', async (req, res) => {
    const inicio = Date.now();
    const mesaId = req.query.box_number || '';  // Renombrado para claridad
    const cacheKey = `agenda_${mesaId}`;
    
    try {
        // 1. Intentar obtener desde cache
        const cachedData = agendaCache.get(cacheKey);
        if (cachedData) {
            logger.info(`Usando datos del cache para agenda mesa ${mesaId}`);
            return res.render('agenda', {
                ...cachedData,
                user: req.session.user,
                activePage: 'agenda',
                fromCache: true
            });
        }

        // 2. Consultar con resiliencia
        logger.info(`Cache miss - consultando agenda mesa ${mesaId} con resiliencia`);
        
        // Obtener empresa activa desde el middleware
        const empresaActiva = res.locals.empresaActiva;
        if (!empresaActiva) {
            logger.warn('No hay empresa activa');
            return res.status(400).send('No hay empresa activa');
        }

        const empresaId = empresaActiva.empresaId;
        
        const fetchAgendaData = async () => {
            return await retryWithBackoff(
                async () => {
                    // Cargar todas las mesas
                    const mesas = await getMesas(empresaId);
                    
                    // Ordenar mesas
                    mesas.sort((a, b) => {
                        const na = Number(a.numero || 0);
                        const nb = Number(b.numero || 0);
                        if (!isNaN(na) && !isNaN(nb)) return na - nb;
                        return String(a.nombre || '').localeCompare(String(b.nombre || ''));
                    });
                    
                    // Seleccionar mesa
                    let mesa = null;
                    if (mesaId) {
                        mesa = mesas.find(m => 
                            String(m.id) === String(mesaId) || 
                            String(m.nombre) === String(mesaId) ||
                            String(m.numero) === String(mesaId)
                        );
                    }
                    mesa = mesa || mesas[0] || null;
                    
                    // Traer datos en paralelo
                    const [ocupantesRes, tiposConsultaRes] = await Promise.all([
                        getOcupantes(empresaId),
                        db.send(new ScanCommand({ TableName: config.dynamodb.tablas.tipoConsulta }))
                    ]).catch(async (err) => {
                        logger.warn('Error en Promise.all de ocupantes/tipoConsulta, intentando sin ocupantes:', err.message);
                        // Retornar con ocupantes vacíos si falla
                        return [[], { Items: [] }];
                    });
                    
                    return {
                        mesas,
                        mesa,
                        ocupantes: ocupantesRes || [],
                        tipos_consulta: tiposConsultaRes?.Items || []
                    };
                },
                {
                    maxRetries: 3,
                    initialDelay: 100,
                    maxDelay: 2000,
                    factor: 2,
                    onRetry: (attempt, delay, error) => {
                        logger.warn(`Agenda retry ${attempt}/3 después de ${delay}ms: ${error.message}`);
                    }
                }
            );
        };

        const fallbackAgendaData = async () => {
            logger.error('⚠️ Usando fallback para agenda');
            return {
                mesas: [],
                mesa: null,
                ocupantes: [],
                tipos_consulta: []
            };
        };

        const data = await agendaCircuitBreaker.execute(fetchAgendaData, fallbackAgendaData);
        
        let mesas = data.mesas || [];
        let mesa = data.mesa || null;
        let ocupantes = Array.isArray(data.ocupantes) ? data.ocupantes : [];
        let tipos_consulta = Array.isArray(data.tipos_consulta) ? data.tipos_consulta : [];
        
        // Normalizar ocupantes PRIMERO (antes de usar en eventos)
        let ocupantes_normalizados = (ocupantes || []).map(o => ({
            id: String(o.ocupanteId || o.id || ''),
            nombre: String(o.nombre || ''),
            activo: Number(o.activo) || 1
        })).filter(o => o.id);  // Filtrar ocupantes sin ID
        
        // Normalizar tipos de consulta
        let tipos_consulta_normalizados = (tipos_consulta || []).map(tc => ({
            ...tc,
            id: tc.idTipoConsulta || tc.idtipoconsulta || tc.id,
            nombre: tc.nombreTipo || tc.nombre || ''
        }));
        
        const specialtyTranslationMap = {
            'Cirugía': 'surgery',
            'Dermatología': 'dermatology',
            'Ginecología': 'gynecology',
            'Odontología': 'dentistry',
            'Oftalmología': 'ophthalmology',
            'Pediatría': 'pediatrics',
            'General': 'general',
            'Médico General': 'generalPractitioner',
            'Cirujano': 'surgeon',
            'Ginecólogo': 'gynecologist',
            'Odontólogo': 'dentist',
            'Oftalmólogo': 'ophthalmologist',
            'Dermatólogo': 'dermatologist',
            'Pediatra': 'pediatrician'
        };

        // Ya no usamos tipos_profesional normalizados
        // Se utilizan ocupantes directamente

        const consultationTranslationMap = {
            'Control': 'followup',
            'Ingreso': 'admission',
            'Gestión': 'management',
            'Alta': 'discharge'
        };

        // Ya normalizamos tipos_consulta arriba en ocupantes_normalizados
        
        // 4) Traer eventos para la mesa seleccionada
        let eventos = [];
        if (mesa) {
            const agendaCmd = new ScanCommand({ TableName: config.dynamodb.tablas.agenda });
            const agendaRes = await db.send(agendaCmd);
            const items = agendaRes.Items || [];
            
            // Filtrar eventos para la mesa seleccionada
            const mesaKey = String(mesa.id);
            const eventosDelMesa = items.filter(it => String(it.mesaId || it.boxId || it.idBox || it.idbox) === mesaKey);
            
            // Helper para devolver ISO local (YYYY-MM-DDTHH:mm:ss)
            const toLocalIsoString = (input) => {
                if (!input) return null;
                const localNoZone = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(String(input));
                if (localNoZone) {
                    return String(input).length === 16 ? `${input}:00` : String(input);
                }
                const d = new Date(input);
                if (isNaN(d.getTime())) return null;
                const pad = (n) => String(n).padStart(2, '0');
                return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:00`;
            };
            
            const pnSafe = (pn, key) => {
                if (!pn) return '';
                return pn[key] !== undefined && pn[key] !== null ? String(pn[key]) : '';
            };
            
            eventos = eventosDelMesa.map(ev => {
                // Leer usando AMBOS formatos (prioridad a camelCase)
                const start = ev.horainicio;
                const end = ev.horaTermino || ev.horatermino;
                
                // formatear a ISO local
                const startIsoLocal = toLocalIsoString(start);
                const endIsoLocal = toLocalIsoString(end);
                
                // encontrar ocupante usando la lista normalizada
                const ocupante = (ocupantes_normalizados || []).find(o => 
                    String(o.id) === String(ev.idUsuario || ev.idusuario || ev.id)
                );
                
                return {
                    id: ev.idAgenda || ev.idagenda,
                    title: ocupante ? ocupante.nombre : 'Sin ocupante',
                    start: startIsoLocal,
                    end: endIsoLocal,
                    extendedProps: {
                        usuario_id: ocupante ? ocupante.id : '',
                        tipo_id: ev.idTipoConsulta || ev.idtipoconsulta || '',
                        observaciones: ev.observaciones || ev.observacion || ev.detalle || ''
                    }
                };
            });
        }
        
        // 5) calcular disabled (estado de la mesa)
        let disabled = false;
        if (mesa) {
            const estadoId = mesa.idEstadoBox || mesa.idestadobox || mesa.idEstado || mesa.idestado;
            disabled = String(estadoId) === '4';
        }
        
        // 6) calcular pct_ocupado / pct_libre
        let pct_ocupado = 0;
        let pct_libre = 100;
        try {
            if (eventos && eventos.length) {
                const msJornada = (19 - 8) * 60 * 60 * 1000; // 11 horas
                const hoy = new Date();
                const startOfDay = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate(), 0, 0, 0);
                const finJornada = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate(), 19, 0, 0);
                let ocupadoMs = 0;
                
                eventos.forEach(e => {
                    if (!e.start || !e.end) return;
                    const s = new Date(e.start);
                    const t = new Date(e.end);
                    const rs = s < startOfDay ? startOfDay : s;
                    const rt = t > finJornada ? finJornada : t;
                    if (rt > rs) ocupadoMs += (rt - rs);
                });
                
                pct_ocupado = Math.round((ocupadoMs / msJornada) * 100);
                if (pct_ocupado < 0) pct_ocupado = 0;
                if (pct_ocupado > 100) pct_ocupado = 100;
                pct_libre = 100 - pct_ocupado;
            }
        } catch (err) {
            logger.warn('Error calculando pct ocupado', { error: err.message });
        }
        
        const eventos_json = JSON.stringify(eventos);
        
        if ((req.headers.accept || '').includes('application/json')) {
            return res.json(eventos);
        }
        
        // Preparar datos para render y cache
        const renderData = {
            mesas,
            mesa,
            ocupantes,                        
            ocupantes_normalizados,           
            tipos_consulta,                       
            tipos_consulta_normalizados,          
            eventos_json,
            disabled,
            pct_ocupado,
            pct_libre,
            messages: req.flash ? req.flash('error') : [],
            title: 'Agenda'
        };

        // Guardar en cache
        agendaCache.set(cacheKey, renderData);
        logger.info(`Datos de agenda mesa ${mesaId} guardados en cache`);
        
        // Renderizar la vista EJS con TODOS los datos necesarios
        res.render('agenda', {
            ...renderData,
            activePage: 'agenda',
            fromCache: false
        });
    } catch (error) {
        logger.error('❌ Error cargando agenda', { 
            error: error.message, 
            stack: error.stack,
            mesaId: mesaId,
            empresa: res.locals.empresaActiva?.empresaId
        });
        
        // Intentar servir desde cache en caso de error
        const cachedData = agendaCache.get(cacheKey);
        if (cachedData) {
            logger.warn('Sirviendo agenda desde cache debido a error');
            return res.render('agenda', {
                ...cachedData,
                user: req.session.user,
                activePage: 'agenda',
                fromCache: true
            });
        }
        
        // Si no hay cache, retornar error con detalle
        return res.status(500).send(`
            <h1>Error interno del servidor</h1>
            <p><strong>Mensaje:</strong> ${error.message}</p>
            <p><strong>Detalles:</strong> ${error.stack}</p>
            <a href="/agenda">Volver a Agenda</a>
        `);
    } finally {
        logger.trace('GET /agenda procesado', Date.now() - inicio);
    }
});

// POST /add_evento/:mesaId -> crear evento en tabla agenda
router.post('/add_evento/:mesaId', async (req, res) => {
    try {
        console.log('POST /add_evento body:', req.body);
        const mesaId = req.params.mesaId;
        const body = req.body || {};
        
        const usuario_id = body.usuario_id || body.usuario || body.user_id || '';
        const horainicio = body.horainicio || body.hora_inicio || '';
        const horafin = body.horafin || body.hora_fin || '';
        const fecha = body.fecha || '';
        const idTipoConsulta = body.idTipoConsulta || body.idTipo || body.tipo || '';
        const observaciones = body.observaciones || body.observacion || '';
        
        if (!mesaId || !usuario_id || !horainicio || !horafin || !fecha) {
            const err = 'Faltan campos obligatorios';
            if (req.headers['x-requested-with'] === 'XMLHttpRequest') return res.json({ ok: false, error: err });
            req.flash && req.flash('error', err);
            return res.redirect('/agenda');
        }
        
        const idAgenda = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        
        function toLocalIso(date) {
            const pad = (n) => String(n).padStart(2, '0');
            return `${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:00`;
        }
        
        const inicioDate = new Date(`${fecha}T${horainicio}`);
        const finDate = new Date(`${fecha}T${horafin}`);
        const horainicioIso = toLocalIso(inicioDate);
        const horaTerminoIso = toLocalIso(finDate);
        
        const item = {
            idAgenda,
            mesaId: String(mesaId),
            idBox: String(mesaId),  // Para compatibilidad hacia atrás
            idUsuario: String(usuario_id),
            idTipoConsulta: idTipoConsulta || '',
            horainicio: horainicioIso,
            horatermino: horaTerminoIso,    
            horaTermino: horaTerminoIso,  
            observaciones: observaciones || '',
            createdAt: new Date().toISOString(),
        };
        
        await db.send(new PutCommand({ TableName: config.dynamodb.tablas.agenda, Item: item }));
        console.log('PutCommand item saved:', item);
        
        // emitir websocket
        const boxInfo = await getBoxInfo(boxId);
        broadcastBoxUpdate({
            box_id: String(boxId),
            box_numero: boxInfo ? String(boxInfo.numero) : String(boxId),
            new_state: 2, // reservado
            new_state_text: 'Reservado',
            action: 'create'
        });
        
        if (req.headers['x-requested-with'] === 'XMLHttpRequest') return res.json({ ok: true });
        return res.redirect('/agenda');
    } catch (err) {
        console.error('Error add_evento', err);
        if (req.headers['x-requested-with'] === 'XMLHttpRequest') return res.json({ ok: false, error: err.message });
        req.flash && req.flash('error', 'Error creando evento');
        return res.redirect('/agenda');
    }
});

// POST /editar_evento/:eventoId -> editar evento
router.post('/editar_evento/:eventoId', async (req, res) => {
    try {
        console.log('POST /editar_evento body:', req.body);
        const eventoId = req.params.eventoId;
        const body = req.body || {};
        
        const usuario_id = body.usuario_id || body.usuario || body.user_id || '';
        const horainicio = body.horainicio || body.hora_inicio || '';
        const horafin = body.horafin || body.hora_fin || '';
        const fecha = body.fecha || '';
        const idTipoConsulta = body.idTipoConsulta || body.idTipo || body.tipo || '';
        const observaciones = body.observaciones || body.observacion || '';
        
        if (!eventoId) {
            if (req.headers['x-requested-with'] === 'XMLHttpRequest') return res.json({ ok: false, error: 'eventoId faltante' });
            req.flash && req.flash('error', 'eventoId faltante');
            return res.redirect('/agenda');
        }
        
        const pad = (n) => String(n).padStart(2, '0');
        function toLocalIsoFromParts(fechaStr, timeStr) {
            if (!fechaStr || !timeStr) return undefined;
            const d = new Date(`${fechaStr}T${timeStr}`);
            return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:00`;
        }
        
        const horainicioIso = fecha && horainicio ? toLocalIsoFromParts(fecha, horainicio) : undefined;
        const horaTerminoIso = fecha && horafin ? toLocalIsoFromParts(fecha, horafin) : undefined;
        
        // Preparar UpdateExpression
        const updateExpr = [];
        const exprAttrNames = {};
        const exprAttrValues = {};
        
        if (usuario_id) { 
            updateExpr.push('#u = :u'); 
            exprAttrNames['#u'] = 'idUsuario'; 
            exprAttrValues[':u'] = String(usuario_id); 
        }
        if (idTipoConsulta) { 
            updateExpr.push('#t = :t'); 
            exprAttrNames['#t'] = 'idTipoConsulta'; 
            exprAttrValues[':t'] = idTipoConsulta; 
        }
        if (horainicioIso) { 
            updateExpr.push('#hi = :hi'); 
            exprAttrNames['#hi'] = 'horainicio';    
            exprAttrValues[':hi'] = horainicioIso; 
        }
        if (horaTerminoIso) { 
            updateExpr.push('#ht1 = :ht, #ht2 = :ht'); 
            exprAttrNames['#ht1'] = 'horaTermino';   
            exprAttrNames['#ht2'] = 'horatermino';  
            exprAttrValues[':ht'] = horaTerminoIso; 
        }
        if (observaciones !== undefined) { 
            updateExpr.push('#o = :o'); 
            exprAttrNames['#o'] = 'observaciones'; 
            exprAttrValues[':o'] = observaciones; 
        }
        
        if (updateExpr.length === 0) {
            if (req.headers['x-requested-with'] === 'XMLHttpRequest') return res.json({ ok: false, error: 'Nada para actualizar' });
            req.flash && req.flash('error', 'Nada para actualizar');
            return res.redirect('/agenda');
        }
        
        await db.send(new UpdateCommand({
            TableName: config.dynamodb.tablas.agenda,
            Key: { idAgenda: eventoId },
            UpdateExpression: 'SET ' + updateExpr.join(', '),
            ExpressionAttributeNames: exprAttrNames,
            ExpressionAttributeValues: exprAttrValues,
        }));
        
        console.log('UpdateCommand aplicado para eventoId=', eventoId, 'updates=', updateExpr, 'values=', exprAttrValues);
        
        // emitir websocket (necesitamos el box_id, lo sacamos del body si existe)
        if (body.box_id) {
            const boxInfo = await getBoxInfo(body.box_id);
            broadcastBoxUpdate({
                box_id: String(body.box_id),
                box_numero: boxInfo ? String(boxInfo.numero) : String(body.box_id),
                new_state: 2,
                new_state_text: 'Reservado',
                action: 'update'
            });
        }
        
        if (req.headers['x-requested-with'] === 'XMLHttpRequest') return res.json({ ok: true });
        return res.redirect('/agenda');
    } catch (err) {
        console.error('Error editar evento', err);
        if (req.headers['x-requested-with'] === 'XMLHttpRequest') return res.json({ ok: false, error: err.message });
        req.flash && req.flash('error', 'Error editando evento');
        return res.redirect('/agenda');
    }
});

// Debug endpoints para verificar datos en el navegador
router.get('/debug/profesionales', async (req, res) => {
    try {
        const profesRes = await db.send(new ScanCommand({ TableName: config.dynamodb.tablas.usuario }));
        const profesionales = profesRes.Items || [];
        const normalized = profesionales.map(p => ({
            id: String(p.idUsuario || p.idusuario || p.id || ''),
            nombre: p.nombreProfesional || p.nombreprofesional || p.nombre || '',
            especialidad: String(p.idTipoProfesional || p.idtipoprofesional || p.idtipoprofesional_id || '')
        }));
        return res.json(normalized);
    } catch (err) {
        console.error('Error debug/profesionales', err);
        return res.status(500).json({ error: 'error' });
    }
});

router.get('/debug/tipos', async (req, res) => {
    try {
        const tiposProfRes = await db.send(new ScanCommand({ TableName: config.dynamodb.tablas.tipoProfesional }));
        const tiposConsultaRes = await db.send(new ScanCommand({ TableName: config.dynamodb.tablas.tipoConsulta }));
        
        const tipos_profesional_normalizados = (tiposProfRes.Items || []).map(t => ({ 
            id: String(t.idTipoProfesional || t.id || ''), 
            nombre: t.tipoprofesional || t.tipo || '' 
        }));
        const tipos_consulta_normalizados = (tiposConsultaRes.Items || []).map(t => ({ 
            id: String(t.idTipoConsulta || t.id || ''), 
            nombre: t.tipoconsulta || t.tipo || '' 
        }));
        
        return res.json({ tipos_profesional_normalizados, tipos_consulta_normalizados });
    } catch (err) {
        console.error('Error debug/tipos', err);
        return res.status(500).json({ error: 'error' });
    }
});

router.get('/debug/agenda_raw', async (req, res) => {
    try {
        const agendaRes = await db.send(new ScanCommand({ TableName: config.dynamodb.tablas.agenda }));
        return res.json({ items: agendaRes.Items || [] });
    } catch (err) {
        console.error('Error debug/agenda_raw', err);
        return res.status(500).json({ error: 'error' });
    }
});

// GET /agenda/events?box_number=... -> devuelve eventos en JSON para cargar por AJAX
router.get('/agenda/events', async (req, res) => {
    try {
        const boxNumber = req.query.box_number;
        const startParam = req.query.start;
        const endParam = req.query.end;
        
        // Traer agenda y profesionales SIN cache
        const agendaCmd = new ScanCommand({ TableName: config.dynamodb.tablas.agenda });
        const agendaRes = await db.send(agendaCmd);
        const items = agendaRes.Items || [];
        
        const profesRes = await db.send(new ScanCommand({ TableName: config.dynamodb.tablas.usuario }));
        const profesionales = profesRes.Items || [];
        
        const profesionales_normalizados = profesionales.map(p => ({
            id: String(p.idUsuario || p.idusuario || p.id || ''),
            nombre: p.nombreProfesional || p.nombreprofesional || p.nombre || '',
            especialidad: String(p.idTipoProfesional || p.idtipoprofesional || p.idtipoprofesional_id || '')
        }));
        
        const boxKey = boxNumber ? String(boxNumber) : null;
        
        // parsear rango de fechas
        const rangeStart = startParam ? new Date(startParam) : null;
        const rangeEnd = endParam ? new Date(endParam) : null;
        
        const intersectsRange = (evStart, evEnd) => {
            if (!rangeStart || !rangeEnd) return true;
            if (!evStart || !evEnd) return false;
            const s = new Date(evStart);
            const e = new Date(evEnd);
            if (isNaN(s.getTime()) || isNaN(e.getTime())) return false;
            return (e > rangeStart) && (s < rangeEnd);
        };
        
        const eventosDelBox = items.filter(it => {
            if (boxKey && String(it.idBox || it.idbox) !== boxKey) return false;
            const s = it.horainicio;
            const e = it.horaTermino || it.horatermino;
            return intersectsRange(s, e);
        });
        
        const pnSafe = (pn, key) => {
            if (!pn) return '';
            return pn[key] !== undefined && pn[key] !== null ? String(pn[key]) : '';
        };
        
        const eventos = eventosDelBox.map(ev => {
            const start = ev.horainicio;
            const end = ev.horaTermino || ev.horatermino;
            
            const prof = (profesionales_normalizados || []).find(pn => 
                String(pn.id) === String(ev.idUsuario || ev.idusuario || ev.id)
            );
            
            return {
                id: ev.idAgenda || ev.idagenda,
                title: prof ? prof.nombre : 'Sin profesional',
                start: start || null,
                end: end || null,
                extendedProps: {
                    usuario_id: prof ? pnSafe(prof, 'id') : '',
                    especialidad: prof ? pnSafe(prof, 'especialidad') : '',
                    tipo_id: ev.idTipoConsulta || ev.idtipoconsulta || '',
                    observaciones: ev.observaciones || ev.observacion || ev.detalle || ''
                }
            };
        });
        
        res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
        return res.json(eventos);
    } catch (err) {
        console.error('Error GET /agenda/events', err);
        return res.status(500).json({ error: 'error' });
    }
});

// GET /eliminar_evento/:eventoId -> eliminar evento
router.get('/eliminar_evento/:eventoId', async (req, res) => {
    try {
        console.log('GET /eliminar_evento eventoId=', req.params.eventoId, 'user=', req.session && req.session.user ? req.session.user.id : null);
        const eventoId = req.params.eventoId;
        
        if (!eventoId) {
            req.flash && req.flash('error', 'eventoId faltante');
            return res.redirect('/agenda');
        }
        
        let boxToRedirect = '';
        try {
            const agendaScan = await db.send(new ScanCommand({ TableName: config.dynamodb.tablas.agenda }));
            const all = agendaScan.Items || [];
            const found = all.find(it => String(it.idAgenda || it.idagenda) === String(eventoId));
            if (found) boxToRedirect = found.idBox || found.idbox || found.box || '';
        } catch (err) {
            console.warn('No se pudo leer agenda para obtener idBox antes de eliminar', err.message);
        }
        
        await db.send(new DeleteCommand({ 
            TableName: config.dynamodb.tablas.agenda, 
            Key: { idAgenda: eventoId } 
        }));
        
        // emitir websocket
        if (boxToRedirect) {
            const boxInfo = await getBoxInfo(boxToRedirect);
            broadcastBoxUpdate({
                box_id: String(boxToRedirect),
                box_numero: boxInfo ? String(boxInfo.numero) : String(boxToRedirect),
                new_state: 1, // libre
                new_state_text: 'Libre',
                action: 'delete'
            });
        }
        
        if (boxToRedirect) return res.redirect(`/agenda?box_number=${encodeURIComponent(boxToRedirect)}`);
        return res.redirect('/agenda');
    } catch (err) {
        console.error('Error eliminar evento', err);
        req.flash && req.flash('error', 'Error eliminando evento');
        return res.redirect('/agenda');
    }
});

// POST /toggle_mantenimiento/:mesaId -> alternar estado de mantenimiento de la mesa
router.post('/toggle_mantenimiento/:mesaId', async (req, res) => {
    try {
        const mesaId = req.params.mesaId;
        console.log('========================================');
        console.log('🔄 POST /toggle_mantenimiento LLAMADO');
        console.log('   mesaId:', mesaId);
        console.log('   user:', req.session && req.session.user ? req.session.user.id : null);
        console.log('   authenticated:', !!req.session?.user);
        console.log('========================================');
        
        if (!mesaId) {
            req.flash && req.flash('error', 'mesaId faltante');
            return res.redirect('/agenda');
        }
        
        // Obtener empresa activa desde el middleware
        const empresaActiva = res.locals.empresaActiva;
        if (!empresaActiva) {
            req.flash && req.flash('error', 'No hay empresa activa');
            return res.redirect('/agenda');
        }
        
        // Obtener la mesa desde ESPACIOS
        const mesas = await getMesas(empresaActiva.empresaId);
        const mesa = mesas.find(m => String(m.id) === String(mesaId));
        
        if (!mesa) {
            req.flash && req.flash('error', 'Mesa no encontrada');
            return res.redirect('/agenda');
        }
        
        const current = mesa.idEstadoBox || mesa.idestadobox || mesa.idEstado || mesa.idestado || 1;
        const nuevo = (String(current) === '4' || current === 4) ? 1 : 4;
        
        console.log('Mesa actual idEstado:', current, '(tipo:', typeof current, ') - nuevo estado:', nuevo);
        
        await db.send(new UpdateCommand({
            TableName: config.dynamodb.tablas.box,
            Key: { idBox: box.idBox || box.idbox },
            UpdateExpression: 'SET idEstadoBox = :e',
            ExpressionAttributeValues: { ':e': nuevo } // guardar como número
        }));
        
        console.log('UpdateCommand enviado para box', box.idBox || box.idbox);
        
        // Determinar el estado real del box (especialmente al habilitar)
        let estadoReal = {
            state: nuevo,
            text: (nuevo === 4 || nuevo === '4') ? 'Inhabilitado' : 'Libre',
            medico: null
        };
        
        // Si estamos habilitando el box (nuevo === 1), consultar agendas para estado real
        if (nuevo === 1 || nuevo === '1') {
            try {
                const agendasCmd = new ScanCommand({ TableName: config.dynamodb.tablas.agenda });
                const agendasRes = await db.send(agendasCmd);
                const agendas = agendasRes.Items || [];
                
                console.log('📋 Total de agendas encontradas:', agendas.length);
                
                // Cargar usuarios para obtener nombres de médicos
                const usuariosCmd = new ScanCommand({ TableName: config.dynamodb.tablas.usuario });
                const usuariosRes = await db.send(usuariosCmd);
                const usuarios = usuariosRes.Items || [];
                
                console.log('👥 Total de usuarios encontrados:', usuarios.length);
                
                const usuarioMap = {};
                usuarios.forEach(u => {
                    const uid = u.idUsuario || u.idusuario;
                    usuarioMap[uid] = u.nombre || u.Nombre || 'Sin nombre';
                });
                
                // Buscar agenda activa o la más reciente del día
                const ahora = new Date();
                const hoy = new Date();
                hoy.setHours(0, 0, 0, 0);
                const finHoy = new Date();
                finHoy.setHours(23, 59, 59, 999);
                
                // Filtrar agendas de este box del día de hoy
                const agendasHoy = agendas.filter(agenda => {
                    const agendaBoxId = agenda.idBox || agenda.idbox;
                    if (String(agendaBoxId) !== String(boxId)) return false;
                    
                    const inicio = new Date(agenda.horainicio || agenda.horaInicio);
                    return inicio >= hoy && inicio <= finHoy;
                });
                
                // Ordenar por hora de inicio descendente (más reciente primero)
                agendasHoy.sort((a, b) => {
                    const inicioA = new Date(a.horainicio || a.horaInicio);
                    const inicioB = new Date(b.horainicio || b.horaInicio);
                    return inicioB - inicioA;
                });
                
                // Tomar la agenda más reciente (puede estar activa, finalizada, o próxima)
                const agendaActual = agendasHoy[0];
                
                if (agendaActual) {
                    const estadoId = agendaActual.idEstado || agendaActual.idestado || 1;
                    const usuarioId = agendaActual.idUsuario || agendaActual.idusuario;
                    const medicoNombre = usuarioMap[usuarioId] || null;
                    
                    console.log('📅 Agenda del día encontrada para box', boxId);
                    console.log('   - Estado agenda:', estadoId, '(tipo:', typeof estadoId, ')');
                    console.log('   - Médico:', medicoNombre);
                    console.log('   - Hora inicio:', agendaActual.horainicio);
                    
                    // Mapear estado de agenda (comparar tanto string como número)
                    const estadoNum = parseInt(estadoId) || 1;
                    switch (estadoNum) {
                        case 1:
                            estadoReal = { state: 1, text: 'Libre', medico: medicoNombre };
                            break;
                        case 2:
                            estadoReal = { state: 2, text: 'Paciente Ausente', medico: medicoNombre };
                            break;
                        case 3:
                            estadoReal = { state: 3, text: 'Paciente Esperando', medico: medicoNombre };
                            break;
                        case 4:
                            estadoReal = { state: 4, text: 'En Atención', medico: medicoNombre };
                            break;
                        case 6:
                            estadoReal = { state: 6, text: 'Finalizado', medico: medicoNombre };
                            break;
                        default:
                            estadoReal = { state: 1, text: 'Libre', medico: medicoNombre };
                    }
                } else {
                    console.log('No hay agenda activa para box', boxId, '- estado: Libre');
                    estadoReal = { state: 1, text: 'Libre', medico: null };
                }
            } catch (err) {
                console.error('Error consultando agendas para estado real:', err);
                estadoReal = { state: 1, text: 'Libre', medico: null };
            }
        }
        
        console.log('Estado real determinado:', estadoReal);
        
        // emitir websocket con el estado real
        broadcastBoxUpdate({
            box_id: String(box.idBox || box.idbox),
            box_numero: String(box.numero || box.idBox || box.idbox),
            new_state: estadoReal.state,
            new_state_text: estadoReal.text,
            medico_nombre: estadoReal.medico,
            action: 'toggle_maintenance'
        });
        
        console.log('✅ Toggle mantenimiento completado exitosamente');
        
        // Si es una llamada AJAX (fetch), devolver JSON
        // Si es una llamada normal, hacer redirect
        const isAjax = req.headers['content-type']?.includes('application/json') || 
                       req.headers['accept']?.includes('application/json');
        
        if (isAjax) {
            return res.json({ 
                ok: true, 
                message: 'Estado actualizado',
                nuevo_estado: nuevo,
                estado_texto: estadoReal.text,
                medico_nombre: estadoReal.medico
            });
        } else {
            const redirectBox = box.idbox || box.idBox || box.numero || box.id || '';
            return res.redirect(`/agenda?box_number=${encodeURIComponent(redirectBox)}`);
        }
    } catch (err) {
        console.error('Error toggle mantenimiento', err);
        
        const isAjax = req.headers['content-type']?.includes('application/json') || 
                       req.headers['accept']?.includes('application/json');
        
        if (isAjax) {
            return res.status(500).json({ ok: false, error: 'Error actualizando box' });
        } else {
            req.flash && req.flash('error', 'Error actualizando box');
            return res.redirect('/agenda');
        }
    }
});

export default router;