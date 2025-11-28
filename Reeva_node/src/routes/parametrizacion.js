// src/routes/parametrizacion.js 

import express from 'express';
import requireAuth from '../middlewares/requireAuth.js';
import checkEmpresas from '../middlewares/checkEmpresas.js';
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand, QueryCommand, DeleteCommand, UpdateCommand, BatchGetCommand, ScanCommand } from "@aws-sdk/lib-dynamodb";

const router = express.Router();

// Configurar cliente DynamoDB
const dynamoClient = new DynamoDBClient({ region: 'us-east-1' });
const docClient = DynamoDBDocumentClient.from(dynamoClient);

const EMPRESAS_TABLE = process.env.EMPRESAS_TABLE || 'aws-cognito-jwt-login-dev-empresas-new';
const ESPACIOS_TABLE = process.env.ESPACIOS_TABLE || 'aws-cognito-jwt-login-dev-espacios';
const OCUPANTES_TABLE = process.env.OCUPANTES_TABLE || 'aws-cognito-jwt-login-dev-ocupantes';
const ITEMS_TABLE = process.env.ITEMS_TABLE || 'aws-cognito-jwt-login-dev-items';

/**
 * GET /seleccionar-empresa
 * Muestra interfaz para seleccionar empresa cuando el usuario tiene 2+ empresas
 * Se carga después del login si tiene múltiples empresas
 */
router.get('/seleccionar-empresa', requireAuth, async (req, res) => {
  try {
    const userId = req.user.id || req.user.sub || req.user.email;

    // Obtener todas las empresas del usuario
    const queryCommand = new QueryCommand({
      TableName: EMPRESAS_TABLE,
      KeyConditionExpression: 'userId = :userId',
      ExpressionAttributeValues: {
        ':userId': userId
      }
    });

    const result = await docClient.send(queryCommand);
    const empresas = result.Items || [];

    // Si tiene menos de 2 empresas, redirigir según corresponda
    if (empresas.length < 2) {
      if (empresas.length === 0) {
        return res.redirect('/parametrizacion');
      } else {
        // Si tiene 1 sola, cargarla automáticamente
        return res.redirect('/bienvenida');
      }
    }

    // CARGAR ESPACIOS Y OCUPANTES PARA CADA EMPRESA
    for (let empresa of empresas) {
      // Obtener espacios
      const resultEspacios = await docClient.send(new QueryCommand({
        TableName: ESPACIOS_TABLE,
        KeyConditionExpression: 'empresaId = :empresaId',
        ExpressionAttributeValues: {
          ':empresaId': empresa.empresaId
        }
      }));

      empresa.espacios = resultEspacios.Items || [];

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

    console.log(`Mostrando selector con ${empresas.length} empresas`);

    res.render('seleccionar-empresa', {
      user: req.user,
      empresas,
      pageTitle: 'Seleccionar Empresa'
    });
  } catch (error) {
    console.error('Error al cargar seleccionar empresa:', error);
    res.status(500).render('error', { error: error.message });
  }
});

/**
 * GET /api/empresas/count
 * Retorna el número de empresas del usuario (para decidir si ir a seleccionar-empresa o bienvenida después del login)
 */
router.get('/api/empresas/count', requireAuth, async (req, res) => {
  try {
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

    res.json({
      success: true,
      count: empresas.length,
      empresas: empresas.map(e => ({
        empresaId: e.empresaId,
        nombre: e.nombre,
        activa: e.activa
      }))
    });
  } catch (error) {
    console.error('Error al contar empresas:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * GET /mis-empresas
 * Obtiene todas las empresas del usuario (desde EmpresasTable)
 */
router.get('/mis-empresas', requireAuth, checkEmpresas, async (req, res) => {
  try {
    if (!req.tieneEmpresas) {
      console.log('Usuario sin empresas, redirigiendo a parametrización');
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
    
    // CARGAR ESPACIOS Y OCUPANTES PARA CADA EMPRESA
    for (let empresa of empresas) {
      // Obtener espacios
      const resultEspacios = await docClient.send(new QueryCommand({
        TableName: ESPACIOS_TABLE,
        KeyConditionExpression: 'empresaId = :empresaId',
        ExpressionAttributeValues: {
          ':empresaId': empresa.empresaId
        }
      }));
      
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
    
    console.log(`Se obtuvieron ${empresas.length} empresas con espacios y ocupantes`);
    
    res.render('mis_empresas', {
      user: req.session?.user || req.user,
      empresas,
      pageTitle: 'Mis Empresas',
      activePage: 'mis-empresas'
    });
  } catch (error) {
    console.error('Error al cargar mis empresas:', error);
    res.status(500).render('error', { error: error.message });
  }
});

/**
 * GET /mis-empresas/editar/:empresaId
 */
router.get('/mis-empresas/editar/:empresaId', requireAuth, async (req, res) => {
  try {
    const userId = req.user.id || req.user.sub || req.user.email;
    const { empresaId } = req.params;

    console.log('Buscando empresa:', { userId, empresaId });

    // Obtener empresa desde EmpresasTable
    const resultEmpresa = await docClient.send(new QueryCommand({
      TableName: EMPRESAS_TABLE,
      KeyConditionExpression: 'userId = :userId AND empresaId = :empresaId',
      ExpressionAttributeValues: {
        ':userId': userId,
        ':empresaId': empresaId
      }
    }));

    if (!resultEmpresa.Items || resultEmpresa.Items.length === 0) {
      console.warn('Empresa no encontrada:', { userId, empresaId });
      return res.status(404).render('error', {
        message: 'Empresa no encontrada'
      });
    }

    const empresa = resultEmpresa.Items[0];
    console.log('Empresa encontrada:', empresa.nombre);

    //Obtener espacios (pasillos y mesas) desde EspaciosTable
    const resultEspacios = await docClient.send(new QueryCommand({
      TableName: ESPACIOS_TABLE,
      KeyConditionExpression: 'empresaId = :empresaId',
      ExpressionAttributeValues: {
        ':empresaId': empresaId
      }
    }));

    let espacios = resultEspacios.Items || [];
    const espaciosUnicos = {};
    for (const espacio of espacios) {
      if (!espaciosUnicos[espacio.espacioId]) {
        espaciosUnicos[espacio.espacioId] = espacio;
      }
    }
    espacios = Object.values(espaciosUnicos);
    
    console.log(`Se obtuvieron ${espacios.length} espacios únicos`);

    // Obtener ocupantes desde OcupantesTable
    const resultOcupantes = await docClient.send(new QueryCommand({
      TableName: OCUPANTES_TABLE,
      KeyConditionExpression: 'empresaId = :empresaId',
      ExpressionAttributeValues: {
        ':empresaId': empresaId
      }
    }));

    const ocupantes = resultOcupantes.Items || [];
    console.log(`Se obtuvieron ${ocupantes.length} ocupantes`);

    // Obtener items desde ItemsTable
    const resultItems = await docClient.send(new QueryCommand({
      TableName: ITEMS_TABLE,
      KeyConditionExpression: 'empresaId = :empresaId',
      ExpressionAttributeValues: {
        ':empresaId': empresaId
      }
    }));

    const items = resultItems.Items || [];
    console.log(`Se obtuvieron ${items.length} items`);

    // Agregar espacios, ocupantes e items a empresa para renderizar
    empresa.espacios = espacios;
    empresa.ocupantes = ocupantes;
    empresa.items = items;

    res.render('editar-empresa', {
      user: req.session?.user || req.user,
      empresa,
      idToken: req.session?.user?.idToken || '',
      mostrarHeader: true,
      activePage: 'editar-empresa'
    });
  } catch (error) {
    console.error('Error al cargar empresa para edición:', error);
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
    const { empresaId, desde } = req.query;
    const userId = req.user.id || req.user.sub || req.user.email;
    let empresaActual = null;

    // Obtener conteo de empresas del usuario
    const resultEmpresas = await docClient.send(new QueryCommand({
      TableName: EMPRESAS_TABLE,
      KeyConditionExpression: 'userId = :userId',
      ExpressionAttributeValues: { ':userId': userId }
    }));
    const countEmpresas = resultEmpresas.Count || 0;

    res.render('parametrizacion', {
      user: req.user,
      empresaId,
      empresaActual,
      desde: desde || null,
      countEmpresas, // Pasar el conteo de empresas
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
    const { configuracion, desde } = req.body;

    if (!configuracion || !configuracion.nombreEmpresa) {
      return res.status(400).json({
        success: false,
        message: 'Faltan datos requeridos: nombreEmpresa'
      });
    }

    // Crear ID único
    const empresaId = `emp-${Date.now()}`;
    const ahora = new Date().toISOString();

    // ESTRUCTURA 1: EmpresasTable - Solo metadatos
    const empresaData = {
      userId,
      empresaId,
      nombre: configuracion.nombreEmpresa,
      nombreNivel1: configuracion.nombreNivel1 || 'Pasillo',
      nombreNivel2: configuracion.nombreNivel2 || 'Box',
      nombreNivel3: configuracion.nombreNivel3 || 'Ocupante',
      nombreNivel4: configuracion.nombreNivel4 || '',
      activa: 1,
      fechaCreacion: ahora,
      fechaActualizacion: ahora
    };

    // Guardar en EmpresasTable
    await docClient.send(new PutCommand({
      TableName: EMPRESAS_TABLE,
      Item: empresaData
    }));

    // SI VIENE DE MIS-EMPRESAS O SELECCIONAR-EMPRESA, DESACTIVAR LAS OTRAS
    if (desde === 'mis-empresas' || desde === 'seleccionar-empresa') {
      const resultOtrasEmpresas = await docClient.send(new QueryCommand({
        TableName: EMPRESAS_TABLE,
        KeyConditionExpression: 'userId = :userId',
        ExpressionAttributeValues: { ':userId': userId }
      }));

      const otrasEmpresas = resultOtrasEmpresas.Items || [];
      
      // Desactivar todas excepto la recién creada
      for (const empresa of otrasEmpresas) {
        if (empresa.empresaId !== empresaId) {
          await docClient.send(new UpdateCommand({
            TableName: EMPRESAS_TABLE,
            Key: { userId, empresaId: empresa.empresaId },
            UpdateExpression: 'SET activa = :zero',
            ExpressionAttributeValues: { ':zero': 0 }
          }));
        }
      }
    }

    console.log('Empresa guardada:', {
      empresaId,
      nombre: configuracion.nombreEmpresa
    });

    // GUARDAR ESPACIOS (Paso 2)
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

        console.log('Espacio guardado:', espacioId);
      }
    }

    // GUARDAR OCUPANTES (Paso 3)
    if (configuracion.ocupantes && configuracion.ocupantes.length > 0) {
      for (const ocupante of configuracion.ocupantes) {
        const ocupanteId = ocupante.ocupanteId || `ocp-${String(Math.floor(Math.random() * 1000)).padStart(3, '0')}`;
        
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

        console.log('Ocupante guardado:', ocupanteId);
      }
    }

    // GUARDAR ELEMENTOS (Paso 4) - Usar ItemsTable
    if (configuracion.elementos && configuracion.elementos.length > 0) {
      for (const elemento of configuracion.elementos) {
        const itemId = elemento.itemId || `item-${String(Math.floor(Math.random() * 10000)).padStart(5, '0')}`;
        
        await docClient.send(new PutCommand({
          TableName: ITEMS_TABLE,
          Item: {
            empresaId,
            itemId,
            nombre: elemento.nombre,
            activo: 1,
            fechaCreacion: ahora,
            fechaActualizacion: ahora
          }
        }));

        console.log('Item/Elemento guardado:', itemId);
      }
    }

    // CONTAR EMPRESAS DEL USUARIO PARA DETERMINAR REDIRECT
    const resultEmpresas = await docClient.send(new QueryCommand({
      TableName: EMPRESAS_TABLE,
      KeyConditionExpression: 'userId = :userId',
      ExpressionAttributeValues: {
        ':userId': userId
      }
    }));

    const totalEmpresas = resultEmpresas.Items ? resultEmpresas.Items.length : 1;
    let redirectUrl = '/bienvenida';

    // DETERMINAR REDIRECT SEGÚN ORIGEN
    if (desde === 'seleccionar-empresa' || desde === 'mis-empresas') {
      // Viene de seleccionar-empresa o mis-empresas → ir a bienvenida
      redirectUrl = '/bienvenida?skip-select=1';
    } else if (totalEmpresas >= 2) {
      // Viene del login y ahora tiene 2+ empresas → mostrar selector
      redirectUrl = '/seleccionar-empresa';
    }

    res.json({
      success: true,
      empresaId,
      redirect: redirectUrl,
      message: 'Empresa creada exitosamente con todos sus datos'
    });
  } catch (error) {
    console.error('Error al guardar empresa:', error);
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

    // 1️Obtener todas las empresas del usuario
    const resultEmpresas = await docClient.send(new QueryCommand({
      TableName: EMPRESAS_TABLE,
      KeyConditionExpression: 'userId = :userId',
      ExpressionAttributeValues: { ':userId': userId }
    }));

    const empresas = resultEmpresas.Items || [];

    // Actualizar todas a activa=0 (usando UpdateCommand)
    for (const empresa of empresas) {
      await docClient.send(new UpdateCommand({
        TableName: EMPRESAS_TABLE,
        Key: { userId, empresaId: empresa.empresaId },
        UpdateExpression: 'SET activa = :zero',
        ExpressionAttributeValues: { ':zero': 0 }
      }));
    }

    // Establecer la empresa seleccionada a activa=1 (usando UpdateCommand)
    await docClient.send(new UpdateCommand({
      TableName: EMPRESAS_TABLE,
      Key: { userId, empresaId: empresaId },
      UpdateExpression: 'SET activa = :one',
      ExpressionAttributeValues: { ':one': 1 }
    }));

    res.json({
      success: true,
      message: 'Empresa seleccionada correctamente'
    });
  } catch (error) {
    console.error('Error al seleccionar empresa:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * DELETE /api/empresas/:empresaId
 */
router.delete('/api/empresas/:empresaId', requireAuth, async (req, res) => {
  try {
    const userId = req.user.id || req.user.sub || req.user.email;
    const { empresaId } = req.params;

    // Obtener la empresa a eliminar para saber si era activa
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

    // Eliminar empresa de EmpresasTable
    await docClient.send(new DeleteCommand({
      TableName: EMPRESAS_TABLE,
      Key: { userId, empresaId }
    }));

    // Obtener y eliminar todos los espacios de EspaciosTable
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

    // Obtener y eliminar todos los ocupantes de OcupantesTable
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

    console.log('Empresa y todos sus datos eliminados:', empresaId);

    // Si era activa, buscar otra empresa para activar
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
        
        console.log('Nueva empresa activada:', empresaActivaActual.empresaId);
      } else {
        console.log('No hay más empresas disponibles');
      }
    }

    res.json({
      success: true,
      message: 'Empresa y sus datos eliminados',
      empresaActivaActual: empresaActivaActual?.empresaId || null
    });
  } catch (error) {
    console.error('Error al eliminar empresa:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/empresas/:empresaId/espacios
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
        console.log('Actualizando espacio existente:', espacioId);
      } else {
        console.log('No se encontró espacio con ese ID, creando nuevo:', espacioId);
      }
    } else {
      // Crear nuevo espacioId si no se proporcionó
      nuevoEspacioId = `esp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      console.log('Creando nuevo espacio:', nuevoEspacioId);
    }

    // ESTRUCTURA 2: EspaciosTable - Pasillo + sus mesas
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

    console.log('Espacio guardado:', nuevoEspacioId);

    res.json({ 
      success: true, 
      espacioId: nuevoEspacioId,
      espacio: espacioData
    });
  } catch (error) {
    console.error('Error al guardar espacio:', error);
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

    console.log('Espacio eliminado:', espacioId);

    res.json({ success: true });
  } catch (error) {
    console.error('Error al eliminar espacio:', error);
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

    console.log('Guardando ocupante:', { empresaId, nombre });

    const nuevoOcupanteId = ocupanteId || `ocp-${String(Math.floor(Math.random() * 1000)).padStart(3, '0')}`;
    const ahora = new Date().toISOString();

    // ESTRUCTURA 3: OcupantesTable - Datos del ocupante
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

    console.log('Ocupante guardado:', nuevoOcupanteId);

    res.json({ 
      success: true, 
      ocupanteId: nuevoOcupanteId,
      ocupante: ocupanteData
    });
  } catch (error) {
    console.error('Error al guardar ocupante:', error);
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

    console.log('Ocupante eliminado:', ocupanteId);

    res.json({ success: true });
  } catch (error) {
    console.error('Error al eliminar ocupante:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/empresas/:empresaId/items
 * Agrega o actualiza un item/elemento
 * Body: { nombre, itemId? }
 */
router.post('/api/empresas/:empresaId/items', requireAuth, async (req, res) => {
  try {
    const { empresaId } = req.params;
    const { nombre } = req.body;

    if (!nombre || !nombre.trim()) {
      return res.status(400).json({
        success: false,
        message: 'El nombre del item es requerido'
      });
    }

    console.log('Guardando item:', { empresaId, nombre });

    const nuevoItemId = `item-${String(Math.floor(Math.random() * 10000)).padStart(5, '0')}`;
    const ahora = new Date().toISOString();

    // Guardar en ItemsTable
    const itemData = {
      empresaId,
      itemId: nuevoItemId,
      nombre: nombre.trim(),
      activo: 1,
      fechaCreacion: ahora,
      fechaActualizacion: ahora
    };

    await docClient.send(new PutCommand({
      TableName: ITEMS_TABLE,
      Item: itemData
    }));

    console.log('Item guardado:', nuevoItemId);

    res.json({ 
      success: true, 
      itemId: nuevoItemId,
      item: itemData
    });
  } catch (error) {
    console.error('Error al guardar item:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * DELETE /api/empresas/:empresaId/items/:itemId
 * Elimina un item y todas sus asignaciones a mesas
 */
router.delete('/api/empresas/:empresaId/items/:itemId', requireAuth, async (req, res) => {
  try {
    const { empresaId, itemId } = req.params;
    const ITEMS_MESAS_TABLE = process.env.ITEMS_MESAS_TABLE || 'aws-cognito-jwt-login-dev-items-mesas';

    // 1. Eliminar item de ITEMS_TABLE
    await docClient.send(new DeleteCommand({
      TableName: ITEMS_TABLE,
      Key: { empresaId, itemId }
    }));

    console.log('Item eliminado de ITEMS_TABLE:', itemId);

    // 2. Obtener todas las mesas que usan este item
    const itemsMesasResult = await docClient.send(new ScanCommand({
      TableName: ITEMS_MESAS_TABLE,
      FilterExpression: 'itemId = :itemId',
      ExpressionAttributeValues: { ':itemId': itemId }
    }));

    const itemsMesas = itemsMesasResult.Items || [];
    console.log(`Encontrados ${itemsMesas.length} registros en ITEMS_MESAS_TABLE para eliminar`);

    // 3. Eliminar cada registro de ITEMS_MESAS_TABLE
    for (const item of itemsMesas) {
      await docClient.send(new DeleteCommand({
        TableName: ITEMS_MESAS_TABLE,
        Key: { mesaId: item.mesaId, itemId: item.itemId }
      }));
      console.log(`Item eliminado de ITEMS_MESAS_TABLE: mesaId=${item.mesaId}, itemId=${itemId}`);
    }

    res.json({ success: true, eliminadosMesas: itemsMesas.length });
  } catch (error) {
    console.error('Error al eliminar item:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
