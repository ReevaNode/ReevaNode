// src/routes/parametrizacion.js - TRES TABLAS NORMALIZADAS
// ✅ EmpresasTable: Datos generales de la empresa
// ✅ EspaciosTable: Pasillos y Mesas
// ✅ OcupantesTable: Ocupantes por empresa

import express from 'express';
import requireAuth from '../middlewares/requireAuth.js';
import checkEmpresas from '../middlewares/checkEmpresas.js';
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand, QueryCommand, DeleteCommand, BatchGetCommand } from "@aws-sdk/lib-dynamodb";

const router = express.Router();

// Configurar cliente DynamoDB
const dynamoClient = new DynamoDBClient({ region: 'us-east-1' });
const docClient = DynamoDBDocumentClient.from(dynamoClient);

// ✅ TRES TABLAS NORMALIZADAS
const EMPRESAS_TABLE = process.env.EMPRESAS_TABLE || 'aws-cognito-jwt-login-dev-empresas-new';
const ESPACIOS_TABLE = process.env.ESPACIOS_TABLE || 'aws-cognito-jwt-login-dev-espacios';
const OCUPANTES_TABLE = process.env.OCUPANTES_TABLE || 'aws-cognito-jwt-login-dev-ocupantes';

/**
 * GET /mis-empresas
 * Obtiene todas las empresas del usuario (desde EmpresasTable)
 */
router.get('/mis-empresas', requireAuth, checkEmpresas, async (req, res) => {
  try {
    if (!req.tieneEmpresas) {
      console.log('ℹ️ Usuario sin empresas, redirigiendo a parametrización');
      return res.redirect('/parametrizacion');
    }

    const userId = req.user.id || req.user.sub || req.user.email;
    
    // Obtener empresas desde EmpresasTable
    const queryCommand = new QueryCommand({
      TableName: EMPRESAS_TABLE,
      KeyConditionExpression: 'userId = :userId',
      ExpressionAttributeValues: {
        ':userId': userId
      }
    });
    
    const result = await docClient.send(queryCommand);
    const empresas = result.Items || [];
    
    // 🔥 CARGAR ESPACIOS Y OCUPANTES PARA CADA EMPRESA
    for (let empresa of empresas) {
      // Obtener espacios
      const resultEspacios = await docClient.send(new QueryCommand({
        TableName: ESPACIOS_TABLE,
        KeyConditionExpression: 'empresaId = :empresaId',
        ExpressionAttributeValues: {
          ':empresaId': empresa.empresaId
        }
      }));
      
      // 🔥 DEDUPLICAR espacios por espacioId
      let espacios = resultEspacios.Items || [];
      const espaciosUnicos = {};
      for (const espacio of espacios) {
        if (!espaciosUnicos[espacio.espacioId]) {
          espaciosUnicos[espacio.espacioId] = espacio;
        }
      }
      empresa.espacios = Object.values(espaciosUnicos);

      // Obtener ocupantes
      const resultOcupantes = await docClient.send(new QueryCommand({
        TableName: OCUPANTES_TABLE,
        KeyConditionExpression: 'empresaId = :empresaId',
        ExpressionAttributeValues: {
          ':empresaId': empresa.empresaId
        }
      }));
      empresa.ocupantes = resultOcupantes.Items || [];
    }
    
    console.log(`✅ Se obtuvieron ${empresas.length} empresas con espacios y ocupantes`);
    
    res.render('mis_empresas', {
      user: req.user,
      empresas,
      pageTitle: 'Mis Empresas'
    });
  } catch (error) {
    console.error('❌ Error al cargar mis empresas:', error);
    res.status(500).render('error', { error: error.message });
  }
});

/**
 * GET /mis-empresas/editar/:empresaId
 * Carga la página de edición con datos de las 3 tablas
 */
router.get('/mis-empresas/editar/:empresaId', requireAuth, async (req, res) => {
  try {
    const userId = req.user.id || req.user.sub || req.user.email;
    const { empresaId } = req.params;

    console.log('🔍 Buscando empresa:', { userId, empresaId });

    // 1️⃣ Obtener empresa desde EmpresasTable
    const resultEmpresa = await docClient.send(new QueryCommand({
      TableName: EMPRESAS_TABLE,
      KeyConditionExpression: 'userId = :userId AND empresaId = :empresaId',
      ExpressionAttributeValues: {
        ':userId': userId,
        ':empresaId': empresaId
      }
    }));

    if (!resultEmpresa.Items || resultEmpresa.Items.length === 0) {
      console.warn('⚠️ Empresa no encontrada:', { userId, empresaId });
      return res.status(404).render('error', {
        message: 'Empresa no encontrada'
      });
    }

    const empresa = resultEmpresa.Items[0];
    console.log('✅ Empresa encontrada:', empresa.nombre);

    // 2️⃣ Obtener espacios (pasillos y mesas) desde EspaciosTable
    const resultEspacios = await docClient.send(new QueryCommand({
      TableName: ESPACIOS_TABLE,
      KeyConditionExpression: 'empresaId = :empresaId',
      ExpressionAttributeValues: {
        ':empresaId': empresaId
      }
    }));

    // 🔥 DEDUPLICAR espacios por espacioId (en caso de que haya duplicados)
    let espacios = resultEspacios.Items || [];
    const espaciosUnicos = {};
    for (const espacio of espacios) {
      if (!espaciosUnicos[espacio.espacioId]) {
        espaciosUnicos[espacio.espacioId] = espacio;
      }
    }
    espacios = Object.values(espaciosUnicos);
    
    console.log(`✅ Se obtuvieron ${espacios.length} espacios únicos`);

    // 3️⃣ Obtener ocupantes desde OcupantesTable
    const resultOcupantes = await docClient.send(new QueryCommand({
      TableName: OCUPANTES_TABLE,
      KeyConditionExpression: 'empresaId = :empresaId',
      ExpressionAttributeValues: {
        ':empresaId': empresaId
      }
    }));

    const ocupantes = resultOcupantes.Items || [];
    console.log(`✅ Se obtuvieron ${ocupantes.length} ocupantes`);

    // Agregar espacios y ocupantes a empresa para renderizar
    empresa.espacios = espacios;
    empresa.ocupantes = ocupantes;

    res.render('editar-empresa', {
      user: req.user,
      empresa,
      idToken: req.idToken || '',
      mostrarHeader: true
    });
  } catch (error) {
    console.error('❌ Error al cargar empresa para edición:', error);
    res.status(500).render('error', {
      message: 'Error al cargar la empresa: ' + error.message
    });
  }
});

/**
 * GET /parametrizacion
 * Muestra el wizard para crear empresa
 */
router.get('/parametrizacion', requireAuth, async (req, res) => {
  try {
    const { empresaId } = req.query;
    let empresaActual = null;

    res.render('parametrizacion', {
      user: req.user,
      empresaId,
      empresaActual,
      mostrarHeader: false,
      pageTitle: 'Crear Nueva Empresa'
    });
  } catch (error) {
    console.error('Error al cargar parametrización:', error);
    res.status(500).render('error', { error: error.message });
  }
});

/**
 * POST /parametrizacion/guardar
 * Guarda empresa, espacios y ocupantes en las 3 tablas
 */
router.post('/parametrizacion/guardar', requireAuth, async (req, res) => {
  try {
    const userId = req.user.id || req.user.sub || req.user.email;
    const { configuracion } = req.body;

    if (!configuracion || !configuracion.nombreEmpresa) {
      return res.status(400).json({
        success: false,
        message: 'Faltan datos requeridos: nombreEmpresa'
      });
    }

    // Crear ID único
    const empresaId = `emp-${Date.now()}`;
    const ahora = new Date().toISOString();

    // 📋 ESTRUCTURA 1: EmpresasTable - Solo metadatos
    const empresaData = {
      userId,
      empresaId,
      nombre: configuracion.nombreEmpresa,
      nombreNivel1: configuracion.nombreNivel1 || 'Pasillo',
      nombreNivel2: configuracion.nombreNivel2 || 'Box',
      nombreNivel3: configuracion.nombreNivel3 || 'Ocupante',
      activa: 1,
      fechaCreacion: ahora,
      fechaActualizacion: ahora
    };

    // Guardar en EmpresasTable
    await docClient.send(new PutCommand({
      TableName: EMPRESAS_TABLE,
      Item: empresaData
    }));

    console.log('✅ Empresa guardada en EmpresasTable:', {
      empresaId,
      nombre: configuracion.nombreEmpresa
    });

    // 🔥 GUARDAR ESPACIOS (Paso 2)
    if (configuracion.espacios && configuracion.espacios.length > 0) {
      for (const espacio of configuracion.espacios) {
        const espacioId = espacio.espacioId || `esp-${Date.now()}-${Math.random()}`;
        
        await docClient.send(new PutCommand({
          TableName: ESPACIOS_TABLE,
          Item: {
            empresaId,
            espacioId,
            pasilloNombre: espacio.pasilloNombre || `${empresaData.nombreNivel1} 1`,
            mesas: espacio.mesas || [],
            fechaCreacion: ahora,
            fechaActualizacion: ahora
          }
        }));

        console.log('✅ Espacio guardado:', espacioId);
      }
    }

    // 🔥 GUARDAR OCUPANTES (Paso 3)
    if (configuracion.ocupantes && configuracion.ocupantes.length > 0) {
      for (const ocupante of configuracion.ocupantes) {
        const ocupanteId = ocupante.ocupanteId || `ocp-${Date.now()}-${Math.random()}`;
        
        await docClient.send(new PutCommand({
          TableName: OCUPANTES_TABLE,
          Item: {
            empresaId,
            ocupanteId,
            nombre: ocupante.nombre,
            activo: 1,
            fechaCreacion: ahora,
            fechaActualizacion: ahora
          }
        }));

        console.log('✅ Ocupante guardado:', ocupanteId);
      }
    }

    res.json({
      success: true,
      empresaId,
      redirect: '/mis-empresas',
      message: 'Empresa creada exitosamente con todos sus datos'
    });
  } catch (error) {
    console.error('❌ Error al guardar empresa:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * POST /api/empresas/seleccionar
 * Marca una empresa como activa para el usuario
 */
router.post('/api/empresas/seleccionar', requireAuth, async (req, res) => {
  try {
    const userId = req.user.id || req.user.sub || req.user.email;
    const { empresaId } = req.body;

    if (!empresaId) {
      return res.status(400).json({
        success: false,
        message: 'empresaId es requerido'
      });
    }

    // 1️⃣ Obtener todas las empresas del usuario
    const resultEmpresas = await docClient.send(new QueryCommand({
      TableName: EMPRESAS_TABLE,
      KeyConditionExpression: 'userId = :userId',
      ExpressionAttributeValues: { ':userId': userId }
    }));

    const empresas = resultEmpresas.Items || [];

    // 2️⃣ Actualizar todas a activa=0
    for (const empresa of empresas) {
      await docClient.send(new PutCommand({
        TableName: EMPRESAS_TABLE,
        Item: {
          ...empresa,
          activa: 0
        }
      }));
    }

    // 3️⃣ Establecer la empresa seleccionada a activa=1
    const empresaSeleccionada = empresas.find(e => e.empresaId === empresaId);
    if (!empresaSeleccionada) {
      return res.status(404).json({
        success: false,
        message: 'Empresa no encontrada'
      });
    }

    await docClient.send(new PutCommand({
      TableName: EMPRESAS_TABLE,
      Item: {
        ...empresaSeleccionada,
        activa: 1
      }
    }));

    console.log('✅ Empresa seleccionada:', empresaId);

    res.json({
      success: true,
      message: 'Empresa seleccionada correctamente'
    });
  } catch (error) {
    console.error('❌ Error al seleccionar empresa:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * DELETE /api/empresas/:empresaId
 * Elimina empresa y sus datos relacionados (espacios y ocupantes)
 * Si era la activa, selecciona otra o ninguna
 */
router.delete('/api/empresas/:empresaId', requireAuth, async (req, res) => {
  try {
    const userId = req.user.id || req.user.sub || req.user.email;
    const { empresaId } = req.params;

    // 0️⃣ Obtener la empresa a eliminar para saber si era activa
    const resultEmpresa = await docClient.send(new QueryCommand({
      TableName: EMPRESAS_TABLE,
      KeyConditionExpression: 'userId = :userId AND empresaId = :empresaId',
      ExpressionAttributeValues: {
        ':userId': userId,
        ':empresaId': empresaId
      }
    }));

    const empresaAEliminar = resultEmpresa.Items?.[0];
    const eraActiva = empresaAEliminar?.activa === 1;

    // 1️⃣ Eliminar empresa de EmpresasTable
    await docClient.send(new DeleteCommand({
      TableName: EMPRESAS_TABLE,
      Key: { userId, empresaId }
    }));

    // 2️⃣ Obtener y eliminar todos los espacios de EspaciosTable
    const resultEspacios = await docClient.send(new QueryCommand({
      TableName: ESPACIOS_TABLE,
      KeyConditionExpression: 'empresaId = :empresaId',
      ExpressionAttributeValues: { ':empresaId': empresaId }
    }));

    if (resultEspacios.Items) {
      for (const espacio of resultEspacios.Items) {
        await docClient.send(new DeleteCommand({
          TableName: ESPACIOS_TABLE,
          Key: { empresaId, espacioId: espacio.espacioId }
        }));
      }
    }

    // 3️⃣ Obtener y eliminar todos los ocupantes de OcupantesTable
    const resultOcupantes = await docClient.send(new QueryCommand({
      TableName: OCUPANTES_TABLE,
      KeyConditionExpression: 'empresaId = :empresaId',
      ExpressionAttributeValues: { ':empresaId': empresaId }
    }));

    if (resultOcupantes.Items) {
      for (const ocupante of resultOcupantes.Items) {
        await docClient.send(new DeleteCommand({
          TableName: OCUPANTES_TABLE,
          Key: { empresaId, ocupanteId: ocupante.ocupanteId }
        }));
      }
    }

    console.log('✅ Empresa y todos sus datos eliminados:', empresaId);

    // 4️⃣ Si era activa, buscar otra empresa para activar
    let empresaActivaActual = null;
    if (eraActiva) {
      const resultOtrasEmpresas = await docClient.send(new QueryCommand({
        TableName: EMPRESAS_TABLE,
        KeyConditionExpression: 'userId = :userId',
        ExpressionAttributeValues: { ':userId': userId }
      }));

      const otrasEmpresas = resultOtrasEmpresas.Items || [];
      
      if (otrasEmpresas.length > 0) {
        // Usar la primera empresa disponible
        empresaActivaActual = otrasEmpresas[0];
        
        // Actualizar para que sea activa
        await docClient.send(new PutCommand({
          TableName: EMPRESAS_TABLE,
          Item: {
            ...empresaActivaActual,
            activa: 1
          }
        }));
        
        console.log('✅ Nueva empresa activada:', empresaActivaActual.empresaId);
      } else {
        console.log('ℹ️ No hay más empresas disponibles');
      }
    }

    res.json({
      success: true,
      message: 'Empresa y sus datos eliminados',
      empresaActivaActual: empresaActivaActual?.empresaId || null
    });
  } catch (error) {
    console.error('❌ Error al eliminar empresa:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/empresas/:empresaId/espacios
 * Agrega o actualiza un espacio (pasillo con sus mesas)
 * Body: { espacioId?, pasilloNombre, mesas[] }
 * 
 * Si espacioId viene en body:
 *   - Obtiene el registro existente y lo actualiza manteniendo fechaCreacion
 * Si NO viene espacioId:
 *   - Crea uno nuevo con fechaCreacion actual
 */
router.post('/api/empresas/:empresaId/espacios', requireAuth, async (req, res) => {
  try {
    const { empresaId } = req.params;
    const { pasilloNombre, mesas, espacioId } = req.body;

    if (!pasilloNombre || !pasilloNombre.trim()) {
      return res.status(400).json({
        success: false,
        message: 'El nombre del espacio es requerido'
      });
    }

    const ahora = new Date().toISOString();
    let nuevoEspacioId = espacioId;
    let fechaCreacion = ahora;

    // Si viene espacioId, buscar el registro existente para obtener fechaCreacion
    if (espacioId) {
      const resultEspacioExistente = await docClient.send(new QueryCommand({
        TableName: ESPACIOS_TABLE,
        KeyConditionExpression: 'empresaId = :empresaId AND espacioId = :espacioId',
        ExpressionAttributeValues: {
          ':empresaId': empresaId,
          ':espacioId': espacioId
        }
      }));

      if (resultEspacioExistente.Items && resultEspacioExistente.Items.length > 0) {
        // Mantener la fecha de creación del registro existente
        fechaCreacion = resultEspacioExistente.Items[0].fechaCreacion;
        console.log('📝 Actualizando espacio existente:', espacioId);
      } else {
        console.log('⚠️ No se encontró espacio con ese ID, creando nuevo:', espacioId);
      }
    } else {
      // Crear nuevo espacioId si no se proporcionó
      nuevoEspacioId = `esp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      console.log('📝 Creando nuevo espacio:', nuevoEspacioId);
    }

    // 📋 ESTRUCTURA 2: EspaciosTable - Pasillo + sus mesas
    const espacioData = {
      empresaId,
      espacioId: nuevoEspacioId,
      pasilloNombre: pasilloNombre.trim(),
      mesas: mesas || [], // Array de { id, nombre }
      fechaCreacion: fechaCreacion,
      fechaActualizacion: ahora
    };

    await docClient.send(new PutCommand({
      TableName: ESPACIOS_TABLE,
      Item: espacioData
    }));

    console.log('✅ Espacio guardado:', nuevoEspacioId);

    res.json({ 
      success: true, 
      espacioId: nuevoEspacioId,
      espacio: espacioData
    });
  } catch (error) {
    console.error('❌ Error al guardar espacio:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * DELETE /api/empresas/:empresaId/espacios/:espacioId
 * Elimina un espacio (pasillo completo con sus mesas)
 */
router.delete('/api/empresas/:empresaId/espacios/:espacioId', requireAuth, async (req, res) => {
  try {
    const { empresaId, espacioId } = req.params;

    await docClient.send(new DeleteCommand({
      TableName: ESPACIOS_TABLE,
      Key: { empresaId, espacioId }
    }));

    console.log('✅ Espacio eliminado:', espacioId);

    res.json({ success: true });
  } catch (error) {
    console.error('❌ Error al eliminar espacio:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/empresas/:empresaId/ocupantes
 * Agrega o actualiza un ocupante
 * Body: { nombre, ocupanteId? }
 */
router.post('/api/empresas/:empresaId/ocupantes', requireAuth, async (req, res) => {
  try {
    const { empresaId } = req.params;
    const { nombre, ocupanteId } = req.body;

    if (!nombre || !nombre.trim()) {
      return res.status(400).json({
        success: false,
        message: 'El nombre del ocupante es requerido'
      });
    }

    console.log('📝 Guardando ocupante:', { empresaId, nombre });

    const nuevoOcupanteId = ocupanteId || `ocp-${Date.now()}`;
    const ahora = new Date().toISOString();

    // 📋 ESTRUCTURA 3: OcupantesTable - Datos del ocupante
    const ocupanteData = {
      empresaId,
      ocupanteId: nuevoOcupanteId,
      nombre: nombre.trim(),
      activo: 1,
      fechaCreacion: ahora,
      fechaActualizacion: ahora
    };

    await docClient.send(new PutCommand({
      TableName: OCUPANTES_TABLE,
      Item: ocupanteData
    }));

    console.log('✅ Ocupante guardado:', nuevoOcupanteId);

    res.json({ 
      success: true, 
      ocupanteId: nuevoOcupanteId,
      ocupante: ocupanteData
    });
  } catch (error) {
    console.error('❌ Error al guardar ocupante:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * DELETE /api/empresas/:empresaId/ocupantes/:ocupanteId
 * Elimina un ocupante
 */
router.delete('/api/empresas/:empresaId/ocupantes/:ocupanteId', requireAuth, async (req, res) => {
  try {
    const { empresaId, ocupanteId } = req.params;

    await docClient.send(new DeleteCommand({
      TableName: OCUPANTES_TABLE,
      Key: { empresaId, ocupanteId }
    }));

    console.log('✅ Ocupante eliminado:', ocupanteId);

    res.json({ success: true });
  } catch (error) {
    console.error('❌ Error al eliminar ocupante:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
