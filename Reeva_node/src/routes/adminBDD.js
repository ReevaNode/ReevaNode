// rutas de administracion de base de datos
import { Router } from 'express';
import { requireAdmin } from '../middlewares/requireAdmin.js';
import { ScanCommand, GetCommand, PutCommand, UpdateCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb';
import db from '../../db.js';
import Logger from '../utils/logger.js';
import { randomUUID } from 'crypto';
import { broadcastBoxUpdate } from '../services/websocketService.js';

const router = Router();
const logger = new Logger('ADMIN_BDD');

// tablas disponibles para administrar
const TABLAS_DISPONIBLES = [
  'agenda',
  'box',
  'estadobox',
  'items',
  'personalizacion',
  'tipobox',
  'tipoconsulta',
  'tipoestado',
  'tipoitem',
  'tipoprofesional',
  'tipousuario',
  'usuario'
];

// mapeo de claves primarias por tabla
const CLAVES_PRIMARIAS = {
  agenda: 'idAgenda',
  box: 'idBox',
  estadobox: 'idEstado',
  items: 'idItem',
  personalizacion: 'idPers',
  tipobox: 'idTipoBox',
  tipoconsulta: 'idTipoConsulta',
  tipoestado: 'idTipoEstado',
  tipoitem: 'idTipoItem',
  tipoprofesional: 'idTipoProfesional',
  tipousuario: 'idTipoUsuario',
  usuario: 'idUsuario'
};

// mapeo de campos foraneos (FK) por tabla
const CAMPOS_RELACION = {
  agenda: {
    idBox: 'box',
    idUsuario: 'usuario',
    idTipoConsulta: 'tipoconsulta',
    idEstado: 'tipoestado'
  },
  box: {
    idTipoBox: 'tipobox'
  },
  estadobox: {
    idBox: 'box',
    idEstado: 'tipoestado'
  },
  items: {
    idTipoItem: 'tipoitem',
    idBox: 'box'
  },
  personalizacion: {
    idUsuario: 'usuario'
  },
  usuario: {
    idTipoUsuario: 'tipousuario',
    idTipoProfesional: 'tipoprofesional'
  }
};

// interfaz principal
router.get('/admin-bdd', requireAdmin, async (req, res) => {
  try {
    // obtener conteo de registros por tabla
    const tablasInfo = [];
    
    for (const tabla of TABLAS_DISPONIBLES) {
      try {
        const result = await db.send(new ScanCommand({
          TableName: tabla,
          Select: 'COUNT'
        }));
        
        tablasInfo.push({
          name: tabla,
          count: result.Count || 0,
          verbose_name: tabla.charAt(0).toUpperCase() + tabla.slice(1)
        });
      } catch (err) {
        logger.error(`error al contar registros de tabla ${tabla}`, { error: err.message });
        tablasInfo.push({
          name: tabla,
          count: 0,
          verbose_name: tabla.charAt(0).toUpperCase() + tabla.slice(1)
        });
      }
    }
    
    res.render('admin_database', {
      user: req.session.user,
      activePage: 'admin-bdd',
      tables: tablasInfo
    });
    
  } catch (error) {
    logger.error('error en interfaz admin', { error: error.message });
    res.status(500).send('error al cargar admin de base de datos');
  }
});

// api: listar registros
router.get('/admin-bdd/api/:tabla/list', requireAdmin, async (req, res) => {
  const { tabla } = req.params;
  
  if (!TABLAS_DISPONIBLES.includes(tabla)) {
    return res.json({ success: false, error: 'tabla no encontrada' });
  }
  
  try {
    const limit = parseInt(req.query.limit) || 50;
    const lastKey = req.query.lastKey ? JSON.parse(req.query.lastKey) : undefined;
    
    const params = {
      TableName: tabla,
      Limit: limit
    };
    
    if (lastKey) {
      params.ExclusiveStartKey = lastKey;
    }
    
    const result = await db.send(new ScanCommand(params));
    
    // obtener info de campos
    const fields = result.Items.length > 0 ? Object.keys(result.Items[0]) : [];
    
    // construir field_info con relaciones
    const field_info = {};
    const relaciones = CAMPOS_RELACION[tabla] || {};
    
    fields.forEach(field => {
      if (relaciones[field]) {
        field_info[field] = {
          is_relation: true,
          related_table: relaciones[field]
        };
      }
    });
    
    res.json({
      success: true,
      data: result.Items,
      fields: fields,
      field_info: field_info,
      total: result.Count,
      lastEvaluatedKey: result.LastEvaluatedKey
    });
    
  } catch (error) {
    logger.error(`error al listar ${tabla}`, { error: error.message });
    res.json({ success: false, error: error.message });
  }
});

// api: consultar agendas por rango de fechas usando HoraInicioIndex
// IMPORTANTE: esta ruta debe ir ANTES de las rutas con :tabla para evitar conflictos
router.get('/admin-bdd/api/agenda/by-date', requireAdmin, async (req, res) => {
  const { dateStart, dateEnd } = req.query;
  
  if (!dateStart) {
    return res.json({ success: false, error: 'se requiere al menos dateStart' });
  }
  
  try {
    const startDate = dateStart; // "2025-10-27"
    const endDate = dateEnd || dateStart; // si no hay dateEnd, usar dateStart
    
    // generar todas las fechas en el rango
    const dates = [];
    const currentDate = new Date(startDate);
    const finalDate = new Date(endDate);
    
    while (currentDate <= finalDate) {
      dates.push(currentDate.toISOString().split('T')[0]);
      currentDate.setDate(currentDate.getDate() + 1);
    }
    
    logger.info(`consultando agendas para fechas: ${dates.join(', ')}`);
    
    // consultar cada fecha por separado usando el indice
    // nota: el indice usa horainicio como HASH, pero horainicio tiene formato completo
    // "2025-10-27 15:00:00", asi que necesitamos hacer un scan con filtro
    
    const allResults = [];
    
    for (const date of dates) {
      // hacer scan con filtro de fecha
      const result = await db.send(new ScanCommand({
        TableName: 'agenda',
        FilterExpression: 'begins_with(horainicio, :date)',
        ExpressionAttributeValues: {
          ':date': date
        }
      }));
      
      if (result.Items && result.Items.length > 0) {
        allResults.push(...result.Items);
      }
    }
    
    logger.info(`total de agendas encontradas: ${allResults.length}`);
    
    res.json({
      success: true,
      data: allResults,
      total: allResults.length,
      dateRange: { start: startDate, end: endDate }
    });
    
  } catch (error) {
    logger.error('error al consultar agendas por fecha', { error: error.message });
    res.json({ success: false, error: error.message });
  }
});

// api: obtener opciones para campos FK
router.get('/admin-bdd/api/:tabla/field_options', requireAdmin, async (req, res) => {
  const { tabla } = req.params;
  const { field } = req.query;
  
  if (!TABLAS_DISPONIBLES.includes(tabla)) {
    return res.json({ success: false, error: 'tabla no encontrada' });
  }
  
  try {
    // obtener la tabla relacionada
    const relaciones = CAMPOS_RELACION[tabla] || {};
    const tablaRelacionada = relaciones[field];
    
    if (!tablaRelacionada) {
      return res.json({ success: true, options: [] });
    }
    
    // obtener todos los registros de la tabla relacionada
    const result = await db.send(new ScanCommand({
      TableName: tablaRelacionada
    }));
    
    const clavePrimaria = CLAVES_PRIMARIAS[tablaRelacionada];
    const options = [];
    
    result.Items.forEach(item => {
      let value, label;
      
      if (Array.isArray(clavePrimaria)) {
        // composite key - usar primer campo como value
        value = item[clavePrimaria[0]];
      } else {
        value = item[clavePrimaria];
      }
      
      // construir label legible
      // para tipos, usar el campo "tipo..."
      if (tablaRelacionada.startsWith('tipo')) {
        const tipoField = Object.keys(item).find(k => k.toLowerCase().startsWith('tipo') && k.toLowerCase() !== 'tipoid');
        label = item[tipoField] || value;
      } else if (tablaRelacionada === 'usuario') {
        // para usuarios, usar nombreProfesional o nombreusuario
        const nombreProf = item.nombreProfesional || item.nombreprofesional;
        const nombreUsuario = item.nombreusuario || item.nombre;
        label = nombreProf || nombreUsuario || value;
        
        // log para debugging
        if (!nombreProf && !nombreUsuario) {
          logger.warn(`usuario ${value} no tiene nombreProfesional ni nombreusuario`, { item });
        }
      } else if (tablaRelacionada === 'box') {
        label = `Box ${item.nrobox || value}`;
      } else {
        // usar el primer campo no-id como label
        const labelField = Object.keys(item).find(k => !k.toLowerCase().includes('id'));
        label = item[labelField] || value;
      }
      
      options.push({ 
        value, 
        label,
        // para usuarios, incluir también el raw data para poder mostrar ID si se necesita
        ...(tablaRelacionada === 'usuario' && { 
          rawData: {
            nombreProfesional: item.nombreProfesional || item.nombreprofesional,
            idUsuario: value
          }
        })
      });
    });
    
    // ordenar opciones alfabeticamente/numericamente
    options.sort((a, b) => {
      // para boxes, extraer el numero y ordenar numericamente
      if (tablaRelacionada === 'box') {
        const numA = parseInt(a.label.replace(/\D/g, '')) || 0;
        const numB = parseInt(b.label.replace(/\D/g, '')) || 0;
        return numA - numB;
      }
      // para otros, ordenar alfabeticamente
      return a.label.localeCompare(b.label);
    });
    
    res.json({ success: true, options });
    
  } catch (error) {
    logger.error(`error al obtener opciones de ${field} en ${tabla}`, { error: error.message });
    res.json({ success: false, error: error.message });
  }
});

// api: crear registro
router.post('/admin-bdd/api/:tabla/create', requireAdmin, async (req, res) => {
  const { tabla } = req.params;
  
  if (!TABLAS_DISPONIBLES.includes(tabla)) {
    return res.json({ success: false, error: 'tabla no encontrada' });
  }
  
  try {
    const data = req.body;
    const clavePrimaria = CLAVES_PRIMARIAS[tabla];
    
    // generar uuid para la clave primaria si no existe
    if (!data[clavePrimaria]) {
      data[clavePrimaria] = randomUUID();
    }
    
    await db.send(new PutCommand({
      TableName: tabla,
      Item: data
    }));
    
    logger.info(`registro creado en ${tabla}`, { id: data[clavePrimaria] });
    
    res.json({ success: true, id: data[clavePrimaria] });
    
  } catch (error) {
    logger.error(`error al crear registro en ${tabla}`, { error: error.message });
    res.json({ success: false, error: error.message });
  }
});

// api: actualizar registro
router.post('/admin-bdd/api/:tabla/update', requireAdmin, async (req, res) => {
  const { tabla } = req.params;
  
  if (!TABLAS_DISPONIBLES.includes(tabla)) {
    return res.json({ success: false, error: 'tabla no encontrada' });
  }
  
  try {
    const data = req.body;
    const clavePrimaria = CLAVES_PRIMARIAS[tabla];
    
    const idValue = data[clavePrimaria];
    if (!idValue) {
      return res.json({ success: false, error: 'id no proporcionado' });
    }
    
    const key = { [clavePrimaria]: idValue };
    const updateData = { ...data };
    delete updateData[clavePrimaria]; // no actualizar la pk
    
    // construir update expression
    const updateParts = [];
    const expressionAttributeNames = {};
    const expressionAttributeValues = {};
    
    let index = 0;
    for (const [field, value] of Object.entries(updateData)) {
      updateParts.push(`#field${index} = :val${index}`);
      expressionAttributeNames[`#field${index}`] = field;
      expressionAttributeValues[`:val${index}`] = value;
      index++;
    }
    
    if (updateParts.length === 0) {
      return res.json({ success: false, error: 'no hay campos para actualizar' });
    }
    
    await db.send(new UpdateCommand({
      TableName: tabla,
      Key: key,
      UpdateExpression: `SET ${updateParts.join(', ')}`,
      ExpressionAttributeNames: expressionAttributeNames,
      ExpressionAttributeValues: expressionAttributeValues
    }));
    
    logger.info(`registro actualizado en ${tabla}`, { key });
    
    res.json({ success: true });
    
  } catch (error) {
    logger.error(`error al actualizar registro en ${tabla}`, { error: error.message });
    res.json({ success: false, error: error.message });
  }
});

// api: eliminar registro
router.post('/admin-bdd/api/:tabla/delete', requireAdmin, async (req, res) => {
  const { tabla } = req.params;
  
  if (!TABLAS_DISPONIBLES.includes(tabla)) {
    return res.json({ success: false, error: 'tabla no encontrada' });
  }
  
  try {
    const data = req.body;
    const clavePrimaria = CLAVES_PRIMARIAS[tabla];
    
    const key = { [clavePrimaria]: data[clavePrimaria] };
    
    await db.send(new DeleteCommand({
      TableName: tabla,
      Key: key
    }));
    
    logger.info(`registro eliminado de ${tabla}`, { key });
    
    res.json({ success: true });
    
  } catch (error) {
    logger.error(`error al eliminar registro de ${tabla}`, { error: error.message });
    res.json({ success: false, error: error.message });
  }
});

// ============ RUTAS ESPECIALES PARA AGENDA ============

// crear multiples agendas
router.post('/admin-bdd/api/agenda/create-multiple', requireAdmin, async (req, res) => {
  try {
    logger.info('📥 POST /admin-bdd/api/agenda/create-multiple recibido');
    
    let { agendas } = req.body;
    
    logger.info(`📊 Agendas recibidas: ${agendas ? agendas.length : 0}`);
    
    if (!Array.isArray(agendas) || agendas.length === 0) {
      logger.warn('⚠️ Array de agendas vacío o inválido');
      return res.json({ success: false, error: 'array de agendas vacio' });
    }
    
    logger.info(`✅ Primeras 3 agendas: ${JSON.stringify(agendas.slice(0, 3))}`);
    
    // obtener usuarios para asignar random
    const usuariosCmd = new ScanCommand({ TableName: 'usuario' });
    const usuariosResult = await db.send(usuariosCmd);
    const usuarios = usuariosResult.Items || [];
    
    logger.info(`👥 ${usuarios.length} usuarios disponibles para asignación random`);
    
    // procesar agendas y asignar usuarios random si es necesario
    agendas = agendas.map(agenda => {
      if (agenda.idUsuario === 'random' && usuarios.length > 0) {
        const randomUsuario = usuarios[Math.floor(Math.random() * usuarios.length)];
        agenda.idUsuario = randomUsuario.idUsuario;
      }
      return agenda;
    });
    
    // insertar en batch (maximo 25 por vez)
    const batchSize = 25;
    let insertados = 0;
    
    logger.info(`🔄 Iniciando inserción en lotes de ${batchSize}...`);
    
    for (let i = 0; i < agendas.length; i += batchSize) {
      const batch = agendas.slice(i, i + batchSize);
      
      logger.info(`📦 Procesando lote ${Math.floor(i / batchSize) + 1}: ${batch.length} agendas`);
      
      for (const agenda of batch) {
        await db.send(new PutCommand({
          TableName: 'agenda',
          Item: agenda
        }));
        insertados++;
      }
    }
    
    logger.info(`✅ ${insertados} agendas insertadas exitosamente`);
    
    // emitir websocket por cada box afectado
    const boxesAfectados = [...new Set(agendas.map(a => a.idBox))];
    logger.info(`📡 Emitiendo WebSocket para ${boxesAfectados.length} boxes afectados`);
    
    boxesAfectados.forEach(boxId => {
      broadcastBoxUpdate({
        box_id: String(boxId),
        new_state: 2,
        new_state_text: 'Reservado',
        action: 'bulk_create'
      });
    });
    
    res.json({ success: true, count: insertados });
    
  } catch (error) {
    logger.error('❌ error al crear multiples agendas', { error: error.message, stack: error.stack });
    res.json({ success: false, error: error.message });
  }
});

// actualizar multiples agendas por rango de fechas
router.post('/admin-bdd/api/agenda/update-multiple', requireAdmin, async (req, res) => {
  try {
    const { filters, update_data } = req.body;
    
    if (!filters || !filters.fecha_inicio || !filters.fecha_fin) {
      return res.json({ success: false, error: 'debes especificar fecha inicio y fin' });
    }
    
    if (!update_data || Object.keys(update_data).length === 0) {
      return res.json({ success: false, error: 'no hay campos para actualizar' });
    }
    
    // buscar agendas en el rango
    const scanCmd = new ScanCommand({
      TableName: 'agenda'
    });
    
    const result = await db.send(scanCmd);
    let agendas = result.Items || [];
    
    // filtrar por rango de fechas con hora
    // si hora_inicio no se especifica, usar 00:00:00
    // si hora_fin no se especifica, usar 23:59:59
    const horaInicio = filters.hora_inicio || '00:00:00';
    const horaFin = filters.hora_fin || '23:59:59';
    
    const fechaInicio = new Date(filters.fecha_inicio + 'T' + horaInicio + 'Z');
    const fechaFin = new Date(filters.fecha_fin + 'T' + horaFin + 'Z');
    
    agendas = agendas.filter(a => {
      const horainicio = new Date(a.horainicio);
      let match = horainicio >= fechaInicio && horainicio <= fechaFin;
      
      // filtro adicional por idBox si se especifica
      if (match && filters.idBox) {
        match = a.idBox === filters.idBox;
      }
      
      return match;
    });
    
    // actualizar cada agenda
    let actualizados = 0;
    for (const agenda of agendas) {
      const updateExpression = [];
      const expressionAttributeNames = {};
      const expressionAttributeValues = {};
      
      let attrIndex = 0;
      for (const [key, value] of Object.entries(update_data)) {
        const attrName = `#attr${attrIndex}`;
        const attrValue = `:val${attrIndex}`;
        
        updateExpression.push(`${attrName} = ${attrValue}`);
        expressionAttributeNames[attrName] = key;
        expressionAttributeValues[attrValue] = value;
        attrIndex++;
      }
      
      await db.send(new UpdateCommand({
        TableName: 'agenda',
        Key: {
          idAgenda: agenda.idAgenda
        },
        UpdateExpression: `SET ${updateExpression.join(', ')}`,
        ExpressionAttributeNames: expressionAttributeNames,
        ExpressionAttributeValues: expressionAttributeValues
      }));
      
      actualizados++;
    }
    
    logger.info(`${actualizados} agendas actualizadas`);
    res.json({ success: true, updated_count: actualizados });
    
  } catch (error) {
    logger.error('error al actualizar multiples agendas', { error: error.message });
    res.json({ success: false, error: error.message });
  }
});

// eliminar multiples agendas por rango de fechas
router.post('/admin-bdd/api/agenda/delete-multiple', requireAdmin, async (req, res) => {
  try {
    const { filters } = req.body;
    
    if (!filters || !filters.fecha_inicio || !filters.fecha_fin) {
      return res.json({ success: false, error: 'debes especificar fecha inicio y fin' });
    }
    
    // buscar agendas en el rango
    const scanCmd = new ScanCommand({
      TableName: 'agenda'
    });
    
    const result = await db.send(scanCmd);
    let agendas = result.Items || [];
    
    // filtrar por rango de fechas
    const fechaInicio = new Date(filters.fecha_inicio + 'T00:00:00Z');
    const fechaFin = new Date(filters.fecha_fin + 'T23:59:59Z');
    
    agendas = agendas.filter(a => {
      const horainicio = new Date(a.horainicio);
      let match = horainicio >= fechaInicio && horainicio <= fechaFin;
      
      // filtro adicional por idBox si se especifica
      if (match && filters.idBox) {
        match = a.idBox === filters.idBox;
      }
      
      return match;
    });
    
    logger.info(`Encontradas ${agendas.length} agendas para eliminar`);
    
    // eliminar cada agenda
    let eliminados = 0;
    for (const agenda of agendas) {
      await db.send(new DeleteCommand({
        TableName: 'agenda',
        Key: {
          idAgenda: agenda.idAgenda
        }
      }));
      
      eliminados++;
    }
    
    logger.info(`${eliminados} agendas eliminadas`);
    res.json({ success: true, deleted_count: eliminados });
    
  } catch (error) {
    logger.error('error al eliminar multiples agendas', { error: error.message });
    res.json({ success: false, error: error.message });
  }
});

export default router;
