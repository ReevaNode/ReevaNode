import { Router } from "express";
import db from '../../db.js';
import {ScanCommand, QueryCommand , PutCommand, DeleteCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { config } from '../config/index.js';
import Logger from '../utils/logger.js';
import { broadcastBoxUpdate } from '../services/websocketService.js';
import { retryWithBackoff, CircuitBreaker, SimpleCache } from '../utils/resilience.js';

const router = Router();
const logger = new Logger('AGENDA');

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

// helper para obtener info del box CON RESILIENCIA
async function getBoxInfo(boxId) {
    return await retryWithBackoff(
        async () => {
            const boxesCmd = new ScanCommand({ TableName: config.dynamodb.tablas.box });
            const boxesRes = await db.send(boxesCmd);
            const boxes = boxesRes.Items || [];
            const box = boxes.find(b => String(b.idBox || b.idbox) === String(boxId));
            
            if (!box) return null;
            
            return {
                id: box.idBox || box.idbox,
                numero: box.numero || box.idBox || box.idbox,
                box: box
            };
        },
        {
            maxRetries: 3,
            initialDelay: 100,
            maxDelay: 1000,
            factor: 2
        }
    );
}

// GET /agenda
router.get('/agenda', async (req, res) => {
    const inicio = Date.now();
    const boxNumber = req.query.box_number || '1';
    const cacheKey = `agenda_${boxNumber}`;
    
    try {
        // 1. Intentar obtener desde cache
        const cachedData = agendaCache.get(cacheKey);
        if (cachedData) {
            logger.info(`Usando datos del cache para agenda box ${boxNumber}`);
            return res.render('agenda', {
                ...cachedData,
                user: req.session.user,
                activePage: 'agenda',
                fromCache: true
            });
        }

        // 2. Consultar con resiliencia
        logger.info(`Cache miss - consultando agenda box ${boxNumber} con resiliencia`);
        
        const fetchAgendaData = async () => {
            return await retryWithBackoff(
                async () => {
                    // Cargar todos los boxes
                    const boxesCmd = new ScanCommand({ TableName: config.dynamodb.tablas.box });
                    const boxesRes = await db.send(boxesCmd);
                    let boxes = boxesRes.Items || [];
                    
                    // Ordenar boxes por numero
                    boxes = boxes.slice().sort((a, b) => {
                        const na = Number(a.numero || a.idBox || a.idbox || a.id || 0);
                        const nb = Number(b.numero || b.idBox || b.idbox || b.id || 0);
                        if (!isNaN(na) && !isNaN(nb)) return na - nb;
                        const sa = String(a.numero || a.idBox || a.idbox || a.id || '');
                        const sb = String(b.numero || b.idBox || b.idbox || b.id || '');
                        return sa.localeCompare(sb);
                    });
                    
                    // Seleccionar box
                    let box = boxes.find(b => 
                        String(b.numero) === String(boxNumber) || 
                        String(b.idBox) === String(boxNumber)
                    ) || boxes[0] || null;
                    
                    // Traer datos en paralelo
                    const [tiposProfRes, profesRes, tiposConsultaRes, tiposBoxRes] = await Promise.all([
                        db.send(new ScanCommand({ TableName: config.dynamodb.tablas.tipoProfesional })),
                        db.send(new ScanCommand({ TableName: config.dynamodb.tablas.usuario })),
                        db.send(new ScanCommand({ TableName: config.dynamodb.tablas.tipoConsulta })),
                        db.send(new ScanCommand({ TableName: config.dynamodb.tablas.tipoBox })),
                    ]);
                    
                    return {
                        boxes,
                        box,
                        tipos_profesional: tiposProfRes.Items || [],
                        profesionales: profesRes.Items || [],
                        tipos_consulta: tiposConsultaRes.Items || [],
                        tipos_box: tiposBoxRes.Items || []
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
                boxes: [],
                box: null,
                tipos_profesional: [],
                profesionales: [],
                tipos_consulta: [],
                tipos_box: []
            };
        };

        const data = await agendaCircuitBreaker.execute(fetchAgendaData, fallbackAgendaData);
        
        const boxes = data.boxes;
        let box = data.box;  // Cambiado a 'let' para permitir reasignación
        const tipos_profesional = data.tipos_profesional;
        const profesionales = data.profesionales;
        const tipos_consulta = data.tipos_consulta;
        const tipos_box = data.tipos_box;
        
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

        const tipos_profesional_normalizados = (tipos_profesional || []).map(t => {
            const nombre = t.tipoprofesional || t.tipoProfesional || t.nombre || '';
            const translationKey = specialtyTranslationMap[nombre] || null;
            
            return {
                id: String(t.idTipoProfesional || t.idtipoprofesional || t.id || ''),
                nombre: nombre,
                translationKey: translationKey
            };
        });

        const consultationTranslationMap = {
            'Control': 'followup',
            'Ingreso': 'admission',
            'Gestión': 'management',
            'Alta': 'discharge'
        };

        const tipos_consulta_normalizados = (tipos_consulta || []).map(t => {
            const nombre = t.tipoconsulta || t.tipoConsulta || t.nombre || '';
            const translationKey = consultationTranslationMap[nombre] || null;
            
            return {
                id: String(t.idTipoConsulta || t.idtipoconsulta || t.id || ''),
                nombre: nombre,
                translationKey: translationKey
            };
        });        
        // Normalizar profesionales antes de usarlo para construir eventos
        const profesionales_normalizados = profesionales.map(p => ({
            id: String(p.idUsuario || p.idusuario || p.id || ''),
            nombre: p.nombreProfesional || p.nombreprofesional || p.nombre || '',
            especialidad: String(p.idTipoProfesional || p.idtipoprofesional || p.idtipoprofesional_id || '')
        }));
        
        // Mapear tipos_box por id (idTipoBox)
        const tiposBoxMap = new Map();
        tipos_box.forEach(t => {
            const id = t.idTipoBox || t.idtipobox;
            tiposBoxMap.set(String(id), t);
        });
        
        // Normalizar y enriquecer boxes para que la vista encuentre b.idtipobox.tipobox y b.numero / b.idbox
        const normalizedBoxes = boxes.map(b => {
            const nb = { ...b };
            nb.idbox = nb.idbox || nb.idBox || nb.id;
            nb.numero = nb.numero || nb.numero || (nb.idbox ? nb.idbox : '');
            
            const refTipo = nb.idTipoBox || nb.idtipobox || nb.idTipo;
            const tipoObj = tiposBoxMap.get(String(refTipo));
            if (tipoObj) {
                nb.idtipobox = { tipobox: tipoObj.tipoBox || tipoObj.tipobox || '' };
            } else {
                nb.idtipobox = { tipobox: '' };
            }
            return nb;
        });
        
        // Recalcular la selección de box sobre los boxes normalizados
        if (normalizedBoxes && normalizedBoxes.length) {
            if (boxNumber) {
                box = normalizedBoxes.find(b => 
                    String(b.numero) === String(boxNumber) || 
                    String(b.idbox) === String(boxNumber) || 
                    String(b.idBox) === String(boxNumber)
                ) || null;
            }
            if (!box) box = normalizedBoxes[0];
        }
        
        // 4) Traer eventos para el box seleccionado
        let eventos = [];
        if (box) {
            const agendaCmd = new ScanCommand({ TableName: config.dynamodb.tablas.agenda });
            const agendaRes = await db.send(agendaCmd);
            const items = agendaRes.Items || [];
            
            // Asegurar comparar con la versión normalizada del box
            const boxKey = String(box.idbox || box.idBox || box.numero);
            const eventosDelBox = items.filter(it => String(it.idBox || it.idbox) === boxKey);
            
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
            
            eventos = eventosDelBox.map(ev => {
                // Leer usando AMBOS formatos (prioridad a camelCase)
                const start = ev.horainicio;
                const end = ev.horaTermino || ev.horatermino;
                
                // formatear a ISO local
                const startIsoLocal = toLocalIsoString(start);
                const endIsoLocal = toLocalIsoString(end);
                
                // encontrar profesional usando la lista normalizada
                const prof = (profesionales_normalizados || []).find(pn => 
                    String(pn.id) === String(ev.idUsuario || ev.idusuario || ev.id)
                );
                
                return {
                    id: ev.idAgenda || ev.idagenda,
                    title: prof ? prof.nombre : 'Sin profesional',
                    start: startIsoLocal,
                    end: endIsoLocal,
                    extendedProps: {
                        usuario_id: prof ? pnSafe(prof, 'id') : '',
                        especialidad: prof ? pnSafe(prof, 'especialidad') : '',
                        tipo_id: ev.idTipoConsulta || ev.idtipoconsulta || '',
                        observaciones: ev.observaciones || ev.observacion || ev.detalle || ''
                    }
                };
            });
        }
        
        // 5) calcular disabled (estado del box)
        let disabled = false;
        if (box) {
            const estadoId = box.idEstadoBox || box.idestadobox || box.idEstado || box.idestado;
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
            boxes: normalizedBoxes,
            box,
            tipos_profesional,                    
            tipos_profesional_normalizados,       
            profesionales,                        
            profesionales_normalizados,           
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
        logger.info(`Datos de agenda box ${boxNumber} guardados en cache`);
        
        // Renderizar la vista EJS con TODOS los datos necesarios
        res.render('agenda', {
            ...renderData,
            activePage: 'agenda',
            fromCache: false
        });
    } catch (error) {
        logger.error('Error cargando agenda', { error: error.message, stack: error.stack });
        
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
        
        return res.status(500).send('Error interno del servidor');
    } finally {
        logger.trace('GET /agenda procesado', Date.now() - inicio);
    }
});

// POST /add_evento/:boxId -> crear evento en tabla agenda
router.post('/add_evento/:boxId', async (req, res) => {
    try {
        console.log('POST /add_evento body:', req.body);
        const boxId = req.params.boxId;
        const body = req.body || {};
        
        const usuario_id = body.usuario_id || body.usuario || body.user_id || '';
        const horainicio = body.horainicio || body.hora_inicio || '';
        const horafin = body.horafin || body.hora_fin || '';
        const fecha = body.fecha || '';
        const idTipoConsulta = body.idTipoConsulta || body.idTipo || body.tipo || '';
        const observaciones = body.observaciones || body.observacion || '';
        
        if (!boxId || !usuario_id || !horainicio || !horafin || !fecha) {
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
            idBox: String(boxId),
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

// POST /toggle_mantenimiento/:boxId -> alternar estado de mantenimiento del box
router.post('/toggle_mantenimiento/:boxId', async (req, res) => {
    try {
        const boxId = req.params.boxId;
        console.log('========================================');
        console.log('🔄 POST /toggle_mantenimiento LLAMADO');
        console.log('   boxId:', boxId);
        console.log('   user:', req.session && req.session.user ? req.session.user.id : null);
        console.log('   authenticated:', !!req.session?.user);
        console.log('========================================');
        
        if (!boxId) {
            req.flash && req.flash('error', 'boxId faltante');
            return res.redirect('/agenda');
        }
        
        const boxesCmd = new ScanCommand({ TableName: config.dynamodb.tablas.box });
        const boxesRes = await db.send(boxesCmd);
        const boxes = boxesRes.Items || [];
        const box = boxes.find(b => String(b.idBox || b.idbox) === String(boxId));
        
        if (!box) {
            req.flash && req.flash('error', 'Box no encontrado');
            return res.redirect('/agenda');
        }
        
        const current = box.idEstadoBox || box.idestadobox || box.idEstado || box.idestado || 1;
        const nuevo = (String(current) === '4' || current === 4) ? 1 : 4;
        
        console.log('Box actual idEstadoBox:', current, '(tipo:', typeof current, ') - nuevo estado:', nuevo);
        
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