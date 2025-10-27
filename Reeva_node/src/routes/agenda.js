import { Router } from "express";
import db from '../../db.js';
import {ScanCommand, QueryCommand , PutCommand, DeleteCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { config } from '../config/index.js';
import Logger from '../utils/logger.js';

const router = Router();
const logger = new Logger('AGENDA');

// GET /agenda
router.get('/agenda', async (req, res) => {
    const inicio = Date.now();
    try {
        const boxNumber = req.query.box_number;
        
        if (!boxNumber) {
            return res.redirect('/agenda?box_number=1');
        }
        
        // 1) Cargar todos los boxes
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
        
        // 2) Seleccionar box por query param o el primero
        let box = null;
        if (boxNumber) {
            box = boxes.find(b => String(b.numero) === String(boxNumber) || String(b.idBox) === String(boxNumber)) || null;
        }
        if (!box) box = boxes.length ? boxes[0] : null;
        
        // 3) Traer tipos de profesional, profesionales, tipos de consulta y tipos de box
        const [tiposProfRes, profesRes, tiposConsultaRes, tiposBoxRes] = await Promise.all([
            db.send(new ScanCommand({ TableName: config.dynamodb.tablas.tipoProfesional })),
            db.send(new ScanCommand({ TableName: config.dynamodb.tablas.usuario })),
            db.send(new ScanCommand({ TableName: config.dynamodb.tablas.tipoConsulta })),
            db.send(new ScanCommand({ TableName: config.dynamodb.tablas.tipoBox })),
        ]);
        
        const tipos_profesional = tiposProfRes.Items || [];
        const profesionales = profesRes.Items || [];
        const tipos_consulta = tiposConsultaRes.Items || [];
        const tipos_box = tiposBoxRes.Items || [];
        
        // Normalizar tipos para la vista
        const tipos_profesional_normalizados = (tipos_profesional || []).map(t => ({
            id: String(t.idTipoProfesional || t.idtipoprofesional || t.id || ''),
            nombre: t.tipoprofesional || t.tipoProfesional || t.nombre || ''
        }));
        
        const tipos_consulta_normalizados = (tipos_consulta || []).map(t => ({
            id: String(t.idTipoConsulta || t.idtipoconsulta || t.id || ''),
            nombre: t.tipoconsulta || t.tipoConsulta || t.nombre || ''
        }));
        
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
        
        // Renderizar la vista EJS con TODOS los datos necesarios
        res.render('agenda', {
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
            title: 'Agenda',
            activePage: 'agenda'
        });
    } catch (error) {
        logger.error('Error cargando agenda', { error: error.message, stack: error.stack });
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
        console.log('POST /toggle_mantenimiento boxId=', boxId, 'user=', req.session && req.session.user ? req.session.user.id : null);
        
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
        
        const current = box.idEstadoBox || box.idestadobox || box.idEstado || box.idestado || '1';
        const nuevo = String(current) === '4' ? '1' : '4';
        
        console.log('Updating box', box.idBox || box.idbox, 'nuevo estado=', nuevo);
        
        await db.send(new UpdateCommand({
            TableName: config.dynamodb.tablas.box,
            Key: { idBox: box.idBox || box.idbox },
            UpdateExpression: 'SET idEstadoBox = :e',
            ExpressionAttributeValues: { ':e': nuevo }
        }));
        
        console.log('UpdateCommand enviado para box', box.idBox || box.idbox);
        
        const redirectBox = box.idbox || box.idBox || box.numero || box.id || '';
        return res.redirect(`/agenda?box_number=${encodeURIComponent(redirectBox)}`);
    } catch (err) {
        console.error('Error toggle mantenimiento', err);
        req.flash && req.flash('error', 'Error actualizando box');
        return res.redirect('/agenda');
    }
});

export default router;