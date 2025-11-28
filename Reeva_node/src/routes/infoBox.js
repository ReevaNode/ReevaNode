// routes/infoBox.js
import express from 'express';
import { config } from '../config/index.js';
import { ScanCommand, QueryCommand, PutCommand, UpdateCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb';
import db from '../../db.js';

const router = express.Router();

// GET /info-box/:idBox - vista de información detallada del box
router.get('/info-box/:idBox', async (req, res) => {
    try {
        const idBox = req.params.idBox; // mantener como string
        const empresaId = res.locals.empresaActiva?.empresaId;
        const fechaSeleccionada = req.query.fecha || ''; // Capturar fecha del query string

        let box = null;
        if (empresaId) {
            try {
                const espaciosCmd = new QueryCommand({
                    TableName: config.dynamodb.tablas.espacios,
                    KeyConditionExpression: 'empresaId = :empresaId',
                    ExpressionAttributeValues: {
                        ':empresaId': empresaId
                    }
                });

                const espaciosResult = await db.send(espaciosCmd);
                const espacios = espaciosResult.Items || [];

                // Buscar la mesa en los espacios
                for (const espacio of espacios) {
                    if (espacio.mesas && Array.isArray(espacio.mesas)) {
                        const encontrada = espacio.mesas.find(m => String(m.id) === String(idBox));
                        if (encontrada) {
                            box = {
                                ...encontrada,
                                idBox: idBox,
                                numero: encontrada.nombre,
                                pasilloNombre: espacio.pasilloNombre || espacio.nombre,
                                especialidad: encontrada.especialidad || espacio.nombre
                            };
                            break;
                        }
                    }
                }
            } catch (error) {
                console.warn('Error buscando en ESPACIOS_TABLE, intentando tabla box antigua:', error.message);
            }
        }
        
        // Obtener fecha actual y rangos (día actual + ±1 año para calendario)
        const ahora = new Date();
        const hoy = new Date();
        hoy.setHours(0, 0, 0, 0);
        
        // Rango del día actual para estadísticas
        const yyyy = ahora.getFullYear();
        const mm = String(ahora.getMonth() + 1).padStart(2, '0');
        const dd = String(ahora.getDate()).padStart(2, '0');
        const inicioHoy = `${yyyy}-${mm}-${dd} 00:00:00`;
        const finHoy = `${yyyy}-${mm}-${dd} 23:59:59`;

        // Rango de ±1 año para el calendario (formato YYYY-MM-DD HH:MM:SS)
        const unAnioAtras = new Date(ahora);
        unAnioAtras.setFullYear(ahora.getFullYear() - 1);
        const unAnioAdelante = new Date(ahora);
        unAnioAdelante.setFullYear(ahora.getFullYear() + 1);
        
        const formatFechaRango = (fecha) => {
            const y = fecha.getFullYear();
            const m = String(fecha.getMonth() + 1).padStart(2, '0');
            const d = String(fecha.getDate()).padStart(2, '0');
            return `${y}-${m}-${d} 00:00:00`;
        };
        
        const inicioRango = formatFechaRango(unAnioAtras);
        const finRango = formatFechaRango(unAnioAdelante);

        console.log(`\n=== Consultando agendas para Box ${idBox} ===`);
        console.log(`Rango del día: ${inicioHoy} a ${finHoy}`);
        console.log(`Rango calendario: ${inicioRango} a ${finRango}`);

        // Consultas paralelas a DynamoDB
        const [
            boxResultOldTable,
            tiposBoxResult,
            estadosBoxResult,
            tiposEstadoResult,
            tiposProfesionalResult,
            tiposConsultaResult,
            usuariosResult,
            tiposItemResult,
            itemsResult,
            agendasResult,
            ocupantesResult,
            itemsEmpresaResult,
            itemsMesasResult
        ] = await Promise.all([
            // Box específico de tabla antigua (fallback) - ConsistentRead para obtener el estado más reciente
            db.send(new ScanCommand({ 
                TableName: 'box',
                FilterExpression: 'idBox = :idBox',
                ExpressionAttributeValues: { ':idBox': idBox }, // usar como string
                ConsistentRead: true // Leer el valor más reciente, no el cache
            })),
            // Tipos de box
            db.send(new ScanCommand({ TableName: 'tipobox' })),
            // Estados de box
            db.send(new ScanCommand({ TableName: 'estadobox' })),
            // Tipos de estado (para agendas)
            db.send(new ScanCommand({ TableName: 'tipoestado' })),
            // Tipos de profesional
            db.send(new ScanCommand({ TableName: 'tipoprofesional' })),
            // Tipos de consulta
            db.send(new ScanCommand({ TableName: 'tipoconsulta' })),
            // Usuarios (médicos/profesionales)
            db.send(new ScanCommand({ TableName: 'usuario' })),
            // Tipos de items
            db.send(new ScanCommand({ TableName: 'tipoitem' })),
            // Items del box
            db.send(new ScanCommand({
                TableName: 'items',
                FilterExpression: 'idBox = :idBox',
                ExpressionAttributeValues: { ':idBox': idBox }
            })),
            // Agendas del box (rango de ±1 año para el calendario)
            db.send(new ScanCommand({
                TableName: 'agenda',
                FilterExpression: 'idBox = :idBox AND horainicio >= :inicio AND horainicio <= :fin',
                ExpressionAttributeValues: {
                    ':idBox': idBox,
                    ':inicio': inicioRango,
                    ':fin': finRango
                }
            })),
            // Ocupantes de la empresa (tabla OCUPANTES_TABLE)
            empresaId ? db.send(new QueryCommand({
                TableName: config.dynamodb.tablas.ocupantes,
                KeyConditionExpression: 'empresaId = :empresaId',
                ExpressionAttributeValues: {
                    ':empresaId': empresaId
                }
            })) : Promise.resolve({ Items: [] }),
            // Items de la empresa (ITEMS_TABLE)
            empresaId ? db.send(new QueryCommand({
                TableName: config.dynamodb.tablas.items,
                KeyConditionExpression: 'empresaId = :empresaId',
                ExpressionAttributeValues: {
                    ':empresaId': empresaId
                }
            })) : Promise.resolve({ Items: [] }),
            // Items de la mesa (ITEMS_MESAS_TABLE)
            db.send(new QueryCommand({
                TableName: config.dynamodb.tablas.itemsMesas,
                KeyConditionExpression: 'mesaId = :mesaId',
                ExpressionAttributeValues: {
                    ':mesaId': idBox
                }
            }))
        ]);

        // Usar box encontrado en ESPACIOS_TABLE, o fallback a tabla antigua
        if (!box) {
            box = boxResultOldTable.Items?.[0];
        }
        if (!box) {
            console.error(`Box con ID ${idBox} no encontrado`);
            return res.status(404).send(`
                <!DOCTYPE html>
                <html><head><title>Error</title>
                <script src="https://cdn.tailwindcss.com/3.4.16"></script>
                </head><body class="bg-gray-50 flex items-center justify-center min-h-screen">
                <div class="text-center p-8">
                    <h1 class="text-2xl font-bold mb-4">Box no encontrado</h1>
                    <p class="text-gray-600 mb-6">El box con ID ${idBox} no existe.</p>
                    <a href="/matriz-box" class="px-6 py-2 bg-purple-600 text-white rounded-lg inline-block hover:bg-purple-700">Volver a la matriz</a>
                </div>
                </body></html>
            `);
        }

        const tiposBox = tiposBoxResult.Items || [];
        const estadosBox = estadosBoxResult.Items || [];
        const tiposEstado = tiposEstadoResult.Items || [];
        const tiposProfesional = tiposProfesionalResult.Items || [];
        const tiposConsulta = tiposConsultaResult.Items || [];
        const usuarios = usuariosResult.Items || [];
        const tiposItem = tiposItemResult.Items || [];
        const items = itemsResult.Items || [];
        const todasAgendas = agendasResult.Items || [];
        
        // Obtener ocupantes de OCUPANTES_TABLE y normalizar
        const ocupantes = (ocupantesResult?.Items || []).filter(o => o.activo === 1 || Number(o.activo) === 1);
        const ocupantes_normalizados = (ocupantes || []).map(o => ({
            id: String(o.ocupanteId || o.id || ''),
            nombre: String(o.nombre || ''),
            activo: Number(o.activo) || 1
        })).filter(o => o.id);

        // Filtrar agendas del día actual para estadísticas
        const agendas = todasAgendas.filter(a => {
            const inicio = a.horainicio;
            return inicio >= inicioHoy && inicio <= finHoy;
        });

        // Crear mapas para lookups rápidos
        const tipoBoxMap = {};
        tiposBox.forEach(tb => {
            tipoBoxMap[tb.idTipoBox] = tb.tipoBox || tb.tipobox || 'Sin Especialidad';
        });

        const estadoBoxMap = {};
        estadosBox.forEach(eb => {
            estadoBoxMap[eb.idEstadoBox] = eb.estado;
        });

        const tipoEstadoMap = {};
        tiposEstado.forEach(te => {
            tipoEstadoMap[te.idTipoEstado] = te.estado;
        });

        const usuarioMap = {};
        usuarios.forEach(u => {
            usuarioMap[u.idUsuario] = u.nombreProfesional || u.nombreprofesional || 'Sin nombre';
        });

        // Crear mapa de ocupantes para los eventos (preferir ocupantes sobre usuarios)
        const ocupanteMap = {};
        ocupantes_normalizados.forEach(o => {
            ocupanteMap[o.id] = o.nombre;
        });
        
        // Usar ocupanteMap si está disponible, si no, usar usuarioMap
        const getNombreOcupante = (id) => ocupanteMap[id] || usuarioMap[id] || 'sin profesional';

        const tipoConsultaMap = {};
        tiposConsulta.forEach(tc => {
            tipoConsultaMap[tc.idTipoConsulta] = tc.tipoConsulta || tc.tipoconsulta;
        });

        const tipoItemMap = {};
        tiposItem.forEach(ti => {
            tipoItemMap[ti.idTipoItem] = ti.tipoItem || ti.tipoitem;
        });

        // Enriquecer información del box
        box.especialidad = tipoBoxMap[box.idTipoBox] || 'Sin Especialidad';
        box.estadoBox = estadoBoxMap[box.idEstadoBox] || 'Desconocido';
        box.disabled = box.idEstadoBox === 4 || box.idEstadoBox === '4'; // 4 = inhabilitado
        
        // Mapeo de traducción para especialidades
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

        // Agregar translation key al box
        box.especialidadTranslationKey = specialtyTranslationMap[box.especialidad] || null;

        // Calcular ocupación del día
        let segmentosOcupados = [];
        const inicioJornada = new Date(hoy);
        inicioJornada.setHours(8, 0, 0, 0);
        const finJornada = new Date(hoy);
        finJornada.setHours(19, 0, 0, 0);

        // solo contar agendas que ocuparon el box (estados 4 y 6)
        const agendasOcupadas = agendas.filter(a => {
            const estado = a.idEstado || a.idTipoEstado;
            return estado === 4 || estado === 6 || estado === '4' || estado === '6';
        });

        agendasOcupadas.forEach(agenda => {
            const inicio = new Date(agenda.horainicio);
            const fin = new Date(agenda.horaTermino);
            
            // solo considerar eventos dentro de la jornada laboral
            if (fin > inicioJornada && inicio < finJornada) {
                const inicioAjustado = inicio < inicioJornada ? inicioJornada : inicio;
                const finAjustado = fin > finJornada ? finJornada : fin;
                segmentosOcupados.push([inicioAjustado, finAjustado]);
            }
        });

        // Fusionar segmentos solapados
        segmentosOcupados.sort((a, b) => a[0] - b[0]);
        const merged = [];
        segmentosOcupados.forEach(seg => {
            if (!merged.length || merged[merged.length - 1][1] < seg[0]) {
                merged.push(seg);
            } else {
                merged[merged.length - 1][1] = new Date(Math.max(merged[merged.length - 1][1], seg[1]));
            }
        });

        // calcular tiempo total ocupado
        let totalOcupado = 0;
        merged.forEach(seg => {
            totalOcupado += (seg[1] - seg[0]) / 1000 / 60 / 60;
        });

        const totalHorasDia = 11; // 8:00 a 19:00
        const pctOcupado = Math.round((totalOcupado / totalHorasDia) * 100);
        const pctLibre = 100 - pctOcupado;

        // estadisticas por tipo de consulta del dia (solo finalizadas - estado 6)
        const agendasFinalizadas = agendas.filter(a => {
            const estado = a.idEstado || a.idTipoEstado;
            return estado === 6 || estado === '6';
        });
        
        // Total de agendas finalizadas (para "Pacientes atendidos Diario")
        const totalDiario = agendasFinalizadas.length;
        
        // Desglose por tipo de consulta
        const ingresos = agendasFinalizadas.filter(a => {
            const tipo = a.idTipoConsulta;
            return tipo === 1 || tipo === '1';
        }).length;
        
        const controles = agendasFinalizadas.filter(a => {
            const tipo = a.idTipoConsulta;
            return tipo === 2 || tipo === '2';
        }).length;
        
        const altas = agendasFinalizadas.filter(a => {
            const tipo = a.idTipoConsulta;
            return tipo === 3 || tipo === '3';
        }).length;
        
        const gestiones = agendasFinalizadas.filter(a => {
            const tipo = a.idTipoConsulta;
            return tipo === 4 || tipo === '4';
        }).length;

        // preparar eventos para fullcalendar con colores por estado
        const primerDiaMes = new Date(ahora.getFullYear(), ahora.getMonth(), 1);
        const ultimoDiaMes = new Date(ahora.getFullYear(), ahora.getMonth() + 1, 0, 23, 59, 59, 999);
        
        // Formatear fechas para DynamoDB (YYYY-MM-DD HH:MM:SS)
        const formatFecha = (fecha) => {
            const y = fecha.getFullYear();
            const m = String(fecha.getMonth() + 1).padStart(2, '0');
            const d = String(fecha.getDate()).padStart(2, '0');
            const h = String(fecha.getHours()).padStart(2, '0');
            const min = String(fecha.getMinutes()).padStart(2, '0');
            const s = String(fecha.getSeconds()).padStart(2, '0');
            return `${y}-${m}-${d} ${h}:${min}:${s}`;
        };
        
        const agendasMensualResult = await db.send(new ScanCommand({
            TableName: 'agenda',
            FilterExpression: 'idBox = :idBox AND idEstado = :estado AND horainicio >= :inicio AND horainicio <= :fin',
            ExpressionAttributeValues: {
                ':idBox': idBox,
                ':estado': '6',
                ':inicio': formatFecha(primerDiaMes),
                ':fin': formatFecha(ultimoDiaMes)
            }
        }));
        const mensual = agendasMensualResult.Items?.length || 0;

        const itemTranslationMap = {
            'Mesa': 'mesa',
            'Silla': 'silla',
            'Balanza': 'balanza',
            'Computador': 'computador',
            'Escritorio': 'escritorio',
            'Camilla': 'camilla',
        };

        // Obtener items de la empresa e items de la mesa
        const itemsEmpresa = itemsEmpresaResult.Items || [];
        const itemsMesas = itemsMesasResult.Items || [];

        // Crear mapa de cantidades por mesa
        const cantidadesMesaMap = {};
        itemsMesas.forEach(item => {
            cantidadesMesaMap[item.itemId] = item.cantidad || 0;
        });

        // Construir lista de elementos con cantidades de la mesa
        const elementos = [];
        itemsEmpresa.forEach(item => {
            const cantidad = cantidadesMesaMap[item.itemId] || 0;
            if (cantidad > 0) {
                const nombreOriginal = item.nombre || '';
                const translationKey = itemTranslationMap[nombreOriginal] || null;
                
                elementos.push({
                    id: item.itemId,
                    nombre: nombreOriginal,
                    translationKey: translationKey,
                    cantidad: cantidad
                });
            }
        });

        // colores por estado para eventos del calendario
        const coloresPorEstado = {
            '1': '#94a3b8', // libre
            '2': '#f59e0b', // paciente ausente
            '3': '#3b82f6', // paciente esperando
            '4': '#10b981', // en atencion
            '5': '#ef4444', // inhabilitado
            '6': '#6b7280'  // finalizado
        };

        // preparar eventos para fullcalendar con colores por estado
        // Usar TODAS las agendas del rango de ±1 año para el calendario
        const eventos = todasAgendas.map(agenda => {
            const usuario = usuarios.find(u => u.idUsuario === agenda.idUsuario);
            const tipoConsulta = tiposConsulta.find(tc => tc.idTipoConsulta === agenda.idTipoConsulta);
            const estado = agenda.idEstado || '1';
            const nombreOcupante = getNombreOcupante(agenda.idUsuario);
            
            return {
                id: agenda.idAgenda,
                title: nombreOcupante,
                start: agenda.horainicio,
                end: agenda.horaTermino,
                backgroundColor: coloresPorEstado[estado] || '#94a3b8',
                borderColor: coloresPorEstado[estado] || '#94a3b8',
                extendedProps: {
                    idBox: agenda.idBox,
                    usuario_id: agenda.idUsuario, // ← AGREGADO para compatibilidad
                    idUsuario: agenda.idUsuario,
                    nombreUsuario: nombreOcupante,
                    tipo_id: agenda.idTipoConsulta, // ← AGREGADO para compatibilidad
                    idTipoConsulta: agenda.idTipoConsulta,
                    nombreTipoConsulta: tipoConsultaMap[agenda.idTipoConsulta] || 'sin tipo',
                    idEstado: estado,
                    nombreEstado: tipoEstadoMap[estado] || 'desconocido',
                    observaciones: agenda.observaciones || '',
                    idTipoProfesional: usuario?.idTipoProfesional || ''
                }
            };
        });

        // Agrupar profesionales por tipo
        const profPorTipo = {};
        tiposProfesional.forEach(tipo => {
            profPorTipo[tipo.idTipoProfesional] = usuarios
                .filter(u => u.idTipoProfesional === tipo.idTipoProfesional)
                .map(u => ({
                    value: u.idUsuario,
                    label: u.nombreProfesional || u.nombreprofesional || 'Sin nombre',
                    esp: u.idTipoProfesional
                }));
        });

        // Normalizar tipos para la vista (para los modales de agenda)
        const tipos_profesional_normalizados = (tiposProfesional || []).map(t => ({
            id: String(t.idTipoProfesional || t.idtipoprofesional || ''),
            nombre: t.tipoprofesional || t.tipoProfesional || ''
        }));
        
        const tipos_consulta_normalizados = (tiposConsulta || []).map(t => ({
            id: String(t.idTipoConsulta || t.idtipoconsulta || ''),
            nombre: t.tipoconsulta || t.tipoConsulta || ''
        }));
        
        const profesionales_normalizados = usuarios.map(p => ({
            id: String(p.idUsuario || p.idusuario || ''),
            nombre: p.nombreProfesional || p.nombreprofesional || '',
            especialidad: String(p.idTipoProfesional || p.idtipoprofesional || '')
        }));

        // Mapeo de traducción para tipos de consulta
        const consultationTranslationMap = {
            'Control': 'followup',
            'Ingreso': 'admission',
            'Gestión': 'management',
            'Alta': 'discharge'
        };

        const tipos_profesional_normalizados_i18n = (tiposProfesional || []).map(t => {
            const nombre = t.tipoprofesional || t.tipoProfesional || t.nombre || '';
            const translationKey = specialtyTranslationMap[nombre] || null;
            
            return {
                id: String(t.idTipoProfesional || t.idtipoprofesional || ''),
                nombre: nombre,
                translationKey: translationKey
            };
        });

        const tipos_consulta_normalizados_i18n = (tiposConsulta || []).map(t => {
            const nombre = t.tipoconsulta || t.tipoConsulta || t.nombre || '';
            const translationKey = consultationTranslationMap[nombre] || null;
            
            return {
                id: String(t.idTipoConsulta || t.idtipoconsulta || ''),
                nombre: nombre,
                translationKey: translationKey
            };
        });

        res.render('info_box', {
            user: req.session?.user || req.user,
            box,
            hoy: hoy.toISOString().split('T')[0],
            fechaSeleccionada: fechaSeleccionada,
            eventos_json: JSON.stringify(eventos),
            estado: merged.some(seg => ahora >= seg[0] && ahora < seg[1]) ? 'OCUPADO' : 'DISPONIBLE',
            pct_ocupado: pctOcupado,
            pct_libre: pctLibre,
            horas_tot: totalOcupado.toFixed(1),
            total_diario: totalDiario,
            ingresos,
            controles,
            altas,
            gestiones,
            mensual,
            doctores: usuarios.filter(u => u.nombreProfesional || u.nombreprofesional),
            tipos_profesional: tiposProfesional,
            tipos_consulta: tiposConsulta,
            tipos_estado: tiposEstado,
            disabled: box.disabled,
            elementos,
            prof_por_tipo_json: JSON.stringify(profPorTipo),
            // Variables normalizadas para los modales de agenda CON i18n
            tipos_profesional_normalizados: tipos_profesional_normalizados_i18n,
            tipos_consulta_normalizados: tipos_consulta_normalizados_i18n,
            profesionales_normalizados,
            ocupantes_normalizados,
            // Parametrización e i18n
            parametrizacionLabels: res.locals.parametrizacionLabels || {},
            userLang: req.session?.userLang || 'es',
            __: res.__,
            activePage: 'infobox',
            AUTH_API_BASE: res.locals.AUTH_API_BASE
        });

    } catch (error) {
        console.error('Error en /info-box:', error);
        return res.status(500).send(`
            <!DOCTYPE html>
            <html><head><title>Error</title>
            <script src="https://cdn.tailwindcss.com/3.4.16"></script>
            </head><body class="bg-gray-50 flex items-center justify-center min-h-screen">
            <div class="text-center p-8 max-w-2xl">
                <h1 class="text-2xl font-bold mb-4 text-red-600">Error al cargar información del box</h1>
                <p class="text-gray-600 mb-4">Ha ocurrido un error al procesar la solicitud.</p>
                <details class="text-left bg-gray-100 p-4 rounded mb-6">
                    <summary class="cursor-pointer font-medium">Detalles del error</summary>
                    <pre class="text-xs mt-2 overflow-auto">${error.stack}</pre>
                </details>
                <a href="/matriz-box" class="px-6 py-2 bg-purple-600 text-white rounded-lg inline-block hover:bg-purple-700">Volver a la matriz</a>
            </div>
            </body></html>
        `);
    }
});

// GET /info-box/:idBox/items - API para obtener items del box/mesa
router.get('/info-box/:idBox/items', async (req, res) => {
    try {
        const mesaId = req.params.idBox; // mesaId es el idBox
        const empresaId = res.locals.empresaActiva?.empresaId;

        // Obtener items de la empresa e items de la mesa
        const [itemsEmpresaResult, itemsMesasResult] = await Promise.all([
            empresaId ? db.send(new QueryCommand({
                TableName: config.dynamodb.tablas.items,
                KeyConditionExpression: 'empresaId = :empresaId',
                ExpressionAttributeValues: { ':empresaId': empresaId }
            })) : Promise.resolve({ Items: [] }),
            db.send(new QueryCommand({
                TableName: config.dynamodb.tablas.itemsMesas,
                KeyConditionExpression: 'mesaId = :mesaId',
                ExpressionAttributeValues: { ':mesaId': mesaId }
            }))
        ]);

        const itemsEmpresa = itemsEmpresaResult.Items || [];
        const itemsMesas = itemsMesasResult.Items || [];

        // Crear mapa de cantidades actuales por mesa
        const cantidadesMap = {};
        itemsMesas.forEach(item => {
            cantidadesMap[item.itemId] = item.cantidad || 0;
        });

        const itemTranslationMap = {
            'Mesa': 'mesa',
            'Silla': 'silla',
            'Balanza': 'balanza',
            'Computador': 'computador',
            'Escritorio': 'escritorio',
            'Camilla': 'camilla',
        };

        // Mapear items de la empresa con sus cantidades en la mesa
        const data = itemsEmpresa.map(item => {
            const nombreOriginal = item.nombre || '';
            const translationKey = itemTranslationMap[nombreOriginal] || null;
            
            return {
                id: item.itemId,
                nombre: nombreOriginal,
                translationKey: translationKey,  
                cantidad: cantidadesMap[item.itemId] || 0
            };
        });

        res.json({ items: data });

    } catch (error) {
        console.error('Error en GET /info-box/:idBox/items:', error);
        res.status(500).json({ error: 'Error al obtener items' });
    }
});

// POST /info-box/:idBox/items - API para actualizar items de la mesa/box
router.post('/info-box/:idBox/items', async (req, res) => {
    try {
        const mesaId = req.params.idBox;
        const empresaId = res.locals.empresaActiva?.empresaId;
        const { items: itemsPayload } = req.body;

        if (!Array.isArray(itemsPayload)) {
            return res.status(400).json({ error: 'Formato inválido: se espera {items: [...]}' });
        }

        // Obtener items actuales de la mesa
        const itemsActualesResult = await db.send(new QueryCommand({
            TableName: config.dynamodb.tablas.itemsMesas,
            KeyConditionExpression: 'mesaId = :mesaId',
            ExpressionAttributeValues: { ':mesaId': mesaId }
        }));
        const itemsActuales = itemsActualesResult.Items || [];

        // Crear mapa de items existentes
        const itemsMap = {};
        itemsActuales.forEach(item => {
            itemsMap[item.itemId] = item;
        });

        const cambios = { creados: 0, actualizados: 0, eliminados: 0 };

        // Procesar cada item del payload
        for (const entry of itemsPayload) {
            const itemId = entry.id; // idTipoItem -> itemId en ItemsMesasTable
            const cantidad = Math.max(0, parseInt(entry.cantidad) || 0);

            if (cantidad > 0) {
                const itemExistente = itemsMap[itemId];
                
                if (itemExistente) {
                    // Actualizar si la cantidad cambió
                    if (itemExistente.cantidad !== cantidad) {
                        await db.send(new UpdateCommand({
                            TableName: config.dynamodb.tablas.itemsMesas,
                            Key: { mesaId, itemId },
                            UpdateExpression: 'SET cantidad = :cantidad, fechaActualizacion = :ahora',
                            ExpressionAttributeValues: {
                                ':cantidad': cantidad,
                                ':ahora': new Date().toISOString()
                            }
                        }));
                        cambios.actualizados++;
                    }
                } else {
                    // Crear nuevo item
                    await db.send(new PutCommand({
                        TableName: config.dynamodb.tablas.itemsMesas,
                        Item: {
                            mesaId,
                            itemId,
                            cantidad: cantidad,
                            fechaCreacion: new Date().toISOString(),
                            fechaActualizacion: new Date().toISOString()
                        }
                    }));
                    cambios.creados++;
                }
            } else if (itemsMap[itemId]) {
                // Eliminar item si cantidad es 0
                await db.send(new DeleteCommand({
                    TableName: config.dynamodb.tablas.itemsMesas,
                    Key: { mesaId, itemId }
                }));
                cambios.eliminados++;
            }
        }

        const [itemsEmpresaResult, itemsNuevosResult] = await Promise.all([
            empresaId ? db.send(new QueryCommand({
                TableName: config.dynamodb.tablas.items,
                KeyConditionExpression: 'empresaId = :empresaId',
                ExpressionAttributeValues: { ':empresaId': empresaId }
            })) : Promise.resolve({ Items: [] }),
            db.send(new QueryCommand({
                TableName: config.dynamodb.tablas.itemsMesas,
                KeyConditionExpression: 'mesaId = :mesaId',
                ExpressionAttributeValues: { ':mesaId': mesaId }
            }))
        ]);

        const itemsEmpresa = itemsEmpresaResult.Items || [];
        const itemsNuevos = itemsNuevosResult.Items || [];

        const cantidadesMap = {};
        itemsNuevos.forEach(item => {
            cantidadesMap[item.itemId] = item.cantidad || 0;
        });

        const itemTranslationMap = {
            'Mesa': 'mesa',
            'Silla': 'silla',
            'Balanza': 'balanza',
            'Computador': 'computador',
            'Escritorio': 'escritorio',
            'Camilla': 'camilla',
        };

        const data = itemsEmpresa.map(item => {
            const nombreOriginal = item.nombre || '';
            const translationKey = itemTranslationMap[nombreOriginal] || null;
            
            return {
                id: item.itemId,
                nombre: nombreOriginal,
                translationKey: translationKey,  
                cantidad: cantidadesMap[item.itemId] || 0
            };
        });

        res.json({ ok: true, cambios, items: data });

    } catch (error) {
        console.error('Error en POST /info-box/:idBox/items:', error);
        res.status(500).json({ error: 'Error al actualizar items' });
    }
});

// POST /add_evento/:boxId - crear evento desde formulario tradicional
router.post('/add_evento/:boxId', async (req, res) => {
    try {
        const idBox = req.params.boxId;
        const { usuario_id, horainicio, horafin, fecha, idTipoConsulta, observaciones } = req.body;

        if (!usuario_id || !horainicio || !horafin || !fecha || !idTipoConsulta) {
            return res.status(400).json({ ok: false, error: 'Faltan campos requeridos' });
        }

        // Combinar fecha + hora en formato YYYY-MM-DD HH:MM:SS
        const horaInicioFull = `${fecha} ${horainicio}:00`;
        const horaFinFull = `${fecha} ${horafin}:00`;

        const { v4: uuidv4 } = await import('uuid');
        const idAgenda = uuidv4();
        
        const nuevaAgenda = {
            idAgenda,
            idBox,
            idUsuario: usuario_id,
            idTipoConsulta,
            horainicio: horaInicioFull,
            horaTermino: horaFinFull,
            horatermino: horaFinFull,
            observaciones: observaciones || '',
            createdAt: new Date().toISOString()
        };

        // Primero crear el evento base
        await db.send(new PutCommand({
            TableName: 'agenda',
            Item: nuevaAgenda
        }));

        // Luego actualizar con idEstado
        await db.send(new UpdateCommand({
            TableName: 'agenda',
            Key: { idAgenda },
            UpdateExpression: 'SET idEstado = :estado',
            ExpressionAttributeValues: {
                ':estado': '2' // Paciente ausente por defecto
            }
        }));

        res.json({ ok: true, agenda: { ...nuevaAgenda, idEstado: '2' } });

    } catch (error) {
        console.error('Error en POST /add_evento/:boxId:', error);
        res.status(500).json({ ok: false, error: 'Error al crear evento' });
    }
});

// POST /info-box/:idBox/agenda - crear nueva agenda
router.post('/info-box/:idBox/agenda', async (req, res) => {
    try {
        const idBox = req.params.idBox;
        const { idUsuario, idTipoConsulta, idEstado, horainicio, horaTermino, observaciones } = req.body;

        if (!idUsuario || !idTipoConsulta || !horainicio || !horaTermino) {
            return res.status(400).json({ error: 'Faltan campos requeridos' });
        }

        const { v4: uuidv4 } = await import('uuid');
        const nuevaAgenda = {
            idAgenda: uuidv4(),
            idBox,
            idUsuario,
            idTipoConsulta,
            idEstado: idEstado || '2', // Estado por defecto: "paciente ausente"
            horainicio,
            horaTermino,
            observaciones: observaciones || ''
        };

        await db.send(new PutCommand({
            TableName: 'agenda',
            Item: nuevaAgenda
        }));

        res.json({ ok: true, agenda: nuevaAgenda });

    } catch (error) {
        console.error('Error en POST /info-box/:idBox/agenda:', error);
        res.status(500).json({ error: 'Error al crear agenda' });
    }
});

// POST /editar_evento/:eventoId - editar evento desde formulario tradicional
router.post('/editar_evento/:eventoId', async (req, res) => {
    try {
        const { eventoId } = req.params;
        const { usuario_id, horainicio, horafin, fecha, idTipoConsulta, idEstado, observaciones } = req.body;

        // Combinar fecha + hora en formato YYYY-MM-DD HH:MM:SS
        const horaInicioFull = fecha && horainicio ? `${fecha} ${horainicio}:00` : undefined;
        const horaFinFull = fecha && horafin ? `${fecha} ${horafin}:00` : undefined;

        const updates = [];
        const values = {};

        if (usuario_id) {
            updates.push('idUsuario = :usuario');
            values[':usuario'] = usuario_id;
        }
        if (idTipoConsulta) {
            updates.push('idTipoConsulta = :tipo');
            values[':tipo'] = idTipoConsulta;
        }
        if (idEstado) {
            updates.push('idEstado = :estado');
            values[':estado'] = idEstado;
        }
        if (horaInicioFull) {
            updates.push('horainicio = :inicio');
            values[':inicio'] = horaInicioFull;
        }
        if (horaFinFull) {
            updates.push('horaTermino = :fin');
            values[':fin'] = horaFinFull;
        }
        if (observaciones !== undefined) {
            updates.push('observaciones = :obs');
            values[':obs'] = observaciones;
        }

        if (updates.length === 0) {
            return res.json({ ok: false, error: 'No hay datos para actualizar' });
        }

        await db.send(new UpdateCommand({
            TableName: 'agenda',
            Key: { idAgenda: eventoId },
            UpdateExpression: 'SET ' + updates.join(', '),
            ExpressionAttributeValues: values
        }));

        res.json({ ok: true });

    } catch (error) {
        console.error('Error en POST /editar_evento/:eventoId:', error);
        res.status(500).json({ ok: false, error: 'Error al editar evento' });
    }
});

// PUT /info-box/:idBox/agenda/:idAgenda - editar agenda
router.put('/info-box/:idBox/agenda/:idAgenda', async (req, res) => {
    try {
        const { idAgenda } = req.params;
        const { idUsuario, idTipoConsulta, idEstado, horainicio, horaTermino, observaciones } = req.body;

        const updates = [];
        const values = {};

        if (idUsuario) {
            updates.push('idUsuario = :usuario');
            values[':usuario'] = idUsuario;
        }
        if (idTipoConsulta) {
            updates.push('idTipoConsulta = :tipo');
            values[':tipo'] = idTipoConsulta;
        }
        if (idEstado) {
            updates.push('idEstado = :estado');
            values[':estado'] = idEstado;
        }
        if (horainicio) {
            updates.push('horainicio = :inicio');
            values[':inicio'] = horainicio;
        }
        if (horaTermino) {
            updates.push('horaTermino = :fin');
            values[':fin'] = horaTermino;
        }
        if (observaciones !== undefined) {
            updates.push('observaciones = :obs');
            values[':obs'] = observaciones;
        }

        if (updates.length === 0) {
            return res.status(400).json({ error: 'No hay campos para actualizar' });
        }

        await db.send(new UpdateCommand({
            TableName: 'agenda',
            Key: { idAgenda },
            UpdateExpression: `SET ${updates.join(', ')}`,
            ExpressionAttributeValues: values
        }));

        res.json({ ok: true });

    } catch (error) {
        console.error('Error en PUT /info-box/:idBox/agenda/:idAgenda:', error);
        res.status(500).json({ error: 'Error al actualizar agenda' });
    }
});

// DELETE /info-box/:idBox/agenda/:idAgenda - eliminar agenda
router.delete('/info-box/:idBox/agenda/:idAgenda', async (req, res) => {
    try {
        const { idAgenda } = req.params;

        await db.send(new DeleteCommand({
            TableName: 'agenda',
            Key: { idAgenda }
        }));

        res.json({ ok: true });

    } catch (error) {
        console.error('Error en DELETE /info-box/:idBox/agenda/:idAgenda:', error);
        res.status(500).json({ error: 'Error al eliminar agenda' });
    }
});

// DELETE /eliminar_evento/:eventoId - eliminar evento (compatible con interfaz)
router.delete('/eliminar_evento/:eventoId', async (req, res) => {
    try {
        const { eventoId } = req.params;

        await db.send(new DeleteCommand({
            TableName: 'agenda',
            Key: { idAgenda: eventoId }
        }));

        res.json({ ok: true });

    } catch (error) {
        console.error('Error en DELETE /eliminar_evento:', error);
        res.status(500).json({ error: 'Error al eliminar evento' });
    }
});

// GET /info-box/:idBox/events - obtener eventos del calendario (para refresh)
router.get('/info-box/:idBox/events', async (req, res) => {
    try {
        const idBox = req.params.idBox;
        const empresaId = res.locals.empresaActiva?.empresaId;
        
        // Rango de ±1 año para el calendario
        const ahora = new Date();
        const unAnioAtras = new Date(ahora);
        unAnioAtras.setFullYear(ahora.getFullYear() - 1);
        const unAnioAdelante = new Date(ahora);
        unAnioAdelante.setFullYear(ahora.getFullYear() + 1);
        
        const formatFechaRango = (fecha) => {
            const y = fecha.getFullYear();
            const m = String(fecha.getMonth() + 1).padStart(2, '0');
            const d = String(fecha.getDate()).padStart(2, '0');
            return `${y}-${m}-${d} 00:00:00`;
        };
        
        const inicioRango = formatFechaRango(unAnioAtras);
        const finRango = formatFechaRango(unAnioAdelante);

        console.log(`Obteniendo eventos para Box ${idBox}, rango: ${inicioRango} a ${finRango}`);

        // Obtener agendas
        const agendasResult = await db.send(new ScanCommand({
            TableName: 'agenda',
            FilterExpression: 'idBox = :idBox AND horainicio BETWEEN :inicio AND :fin',
            ExpressionAttributeValues: {
                ':idBox': idBox,
                ':inicio': inicioRango,
                ':fin': finRango
            }
        }));
        const agendas = agendasResult.Items || [];

        console.log(`${agendas.length} agendas encontradas`);

        // Obtener ocupantes de OCUPANTES_TABLE (igual que agenda.js)
        let ocupantes_normalizados = [];
        if (empresaId) {
            try {
                const ocupantesResult = await db.send(new QueryCommand({
                    TableName: config.dynamodb.tablas.ocupantes,
                    KeyConditionExpression: 'empresaId = :empresaId',
                    ExpressionAttributeValues: {
                        ':empresaId': empresaId
                    }
                }));
                
                const ocupantes = (ocupantesResult.Items || []).filter(o => o.activo === 1 || Number(o.activo) === 1);
                ocupantes_normalizados = (ocupantes || []).map(o => ({
                    id: String(o.ocupanteId || o.id || ''),
                    nombre: String(o.nombre || ''),
                    activo: Number(o.activo) || 1
                })).filter(o => o.id);
            } catch (error) {
                console.warn('Error obteniendo ocupantes de OCUPANTES_TABLE:', error.message);
            }
        }

        const tiposEstadoResult = await db.send(new ScanCommand({ TableName: 'tipoestado' }));
        const tiposEstado = tiposEstadoResult.Items || [];
        const tipoEstadoMap = {};
        tiposEstado.forEach(te => {
            tipoEstadoMap[te.idTipoEstado] = te.nombre;
        });

        // Colores por estado
        const coloresPorEstado = {
            '1': '#94a3b8', // libre
            '2': '#f59e0b', // paciente ausente
            '3': '#3b82f6', // paciente esperando
            '4': '#10b981', // en atencion
            '5': '#ef4444', // inhabilitado
            '6': '#6b7280'  // finalizado
        };

        // Formatear eventos para FullCalendar
        const eventos = agendas.map(agenda => {
            const estado = agenda.idEstado || '1';
            // Buscar el ocupante por su ID
            const ocupante = ocupantes_normalizados.find(o => o.id === String(agenda.idUsuario));
            const nombreOcupante = ocupante?.nombre || 'Sin ocupante';
            
            return {
                id: agenda.idAgenda,
                title: nombreOcupante,
                start: agenda.horainicio,
                end: agenda.horaTermino,
                backgroundColor: coloresPorEstado[estado] || '#94a3b8',
                borderColor: coloresPorEstado[estado] || '#94a3b8',
                extendedProps: {
                    idBox: agenda.idBox,
                    usuario_id: agenda.idUsuario,
                    idUsuario: agenda.idUsuario,
                    nombreUsuario: nombreOcupante,
                    idEstado: estado,
                    nombreEstado: tipoEstadoMap[estado] || 'desconocido',
                    observaciones: agenda.observaciones || ''
                }
            };
        });

        res.json(eventos);

    } catch (error) {
        console.error('Error en GET /info-box/:idBox/events:', error);
        res.status(500).json({ error: 'Error al obtener eventos' });
    }
});

// POST /toggle_mantenimiento/:boxId -> alternar estado de mantenimiento del box
router.post('/toggle_mantenimiento/:boxId', async (req, res) => {
    try {
        const boxId = req.params.boxId;
        console.log('POST /toggle_mantenimiento boxId=', boxId, 'user=', req.session && req.session.user ? req.session.user.id : null);
        
        if (!boxId) {
            req.flash && req.flash('error', 'boxId faltante');
            return res.redirect('/infobox');
        }
        
        const boxesCmd = new ScanCommand({ TableName: 'box' });
        const boxesRes = await db.send(boxesCmd);
        const boxes = boxesRes.Items || [];
        const box = boxes.find(b => String(b.idBox || b.idbox) === String(boxId));
        
        if (!box) {
            req.flash && req.flash('error', 'Box no encontrado');
            return res.redirect('/infobox');
        }
        
        const current = box.idEstadoBox || box.idestadobox || box.idEstado || box.idestado || '1';
        const nuevo = String(current) === '4' ? '1' : '4';
        
        console.log('Updating box', box.idBox || box.idbox, 'nuevo estado=', nuevo);
        
        await db.send(new UpdateCommand({
            TableName: 'box',
            Key: { idBox: box.idBox || box.idbox },
            UpdateExpression: 'SET idEstadoBox = :e',
            ExpressionAttributeValues: { ':e': nuevo }
        }));
        
        console.log('UpdateCommand enviado para box', box.idBox || box.idbox);
        
        const redirectBoxId = box.idbox || box.idBox;
        return res.redirect(`/info-box/${redirectBoxId}`);
    } catch (err) {
        console.error('Error toggle mantenimiento', err);
        req.flash && req.flash('error', 'Error actualizando box');
        return res.redirect('/infobox');
    }
});

export default router;