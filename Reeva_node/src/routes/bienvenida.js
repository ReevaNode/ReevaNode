// ruta de bienvenida
import { Router } from "express";
import { requirePermission } from "../middlewares/requirePermission.js";
import { QueryCommand } from "@aws-sdk/lib-dynamodb";
import db from '../../db.js';
import { config } from "../config/index.js";
import Logger from "../utils/logger.js";

const router = Router();
const logger = new Logger('BIENVENIDA');

router.get("/bienvenida", requirePermission("bienvenidos.read"), async (req, res) => {
  const inicio = Date.now();
  
  try {
    // usar query con indice en vez de scan (mas rapido)
    const userId = req.session.user.sub;
    
    const command = new QueryCommand({
      TableName: config.dynamodb.tablas.agenda,
      IndexName: "UsuarioIndex",
      KeyConditionExpression: "idUsuario = :userId",
      ExpressionAttributeValues: {
        ":userId": userId,
      },
      ScanIndexForward: false, // ordenar desc por horainicio
      Limit: 10,
    });

    const result = await db.send(command);
    
    logger.trace('Query agenda completada', Date.now() - inicio, {
      itemsRetornados: result.Items?.length || 0,
      userId,
    });
    
    let proxima_cita_fecha = null;
    let proxima_cita_hora = null;
    let tipo_consulta = null;

    if (result.Items && result.Items.length > 0) {
      // tomar la mas reciente
      const agenda = result.Items[0];

      const fechaInicio = new Date(agenda.horainicio);
      const fechaTermino = new Date(agenda.horatermino);

      // formato fecha
      proxima_cita_fecha = fechaInicio.toLocaleDateString("es-ES", {
        day: "2-digit",
        month: "long",
        year: "numeric",
      });

      logger.debug("Proxima cita encontrada", { 
        fecha: proxima_cita_fecha,
        userId,
      });

      // formato hora
      proxima_cita_hora =
        fechaInicio.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" }) +
        " - " +
        fechaTermino.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });

      tipo_consulta = agenda.idtipoconsulta;
    } else {
      logger.info('No se encontraron agendas para el usuario', { userId });
    }

    res.render("Bienvenida-y-Opciones", {
      user: req.session.user,
      next_appointment_date: proxima_cita_fecha,
      next_appointment_time: proxima_cita_hora,
      tipo_consulta,
    });
  } catch (error) {
    logger.error("Error obteniendo agenda desde DynamoDB", { 
      error: error.message,
      stack: error.stack,
    });
    res.status(500).send("Error interno del servidor");
  }
});

export default router;
