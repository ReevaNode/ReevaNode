import { Router } from "express";
import { requirePermission } from "../middlewares/requirePermission.js";
import { ScanCommand } from "@aws-sdk/lib-dynamodb";
import db from '../../db.js';

const router = Router();

router.get("/bienvenida", requirePermission("bienvenidos.read"), async (req, res) => {
  try {
    // Obtener todas las agendas y ordenar por horainicio descendente
    const command = new ScanCommand({
      TableName: "agenda",
    });

    const result = await db.send(command);
    
    let next_appointment_date = null;
    let next_appointment_time = null;
    let tipo_consulta = null;

    if (result.Items && result.Items.length > 0) {
      // Ordenar por horainicio descendente para obtener la mas reciente
      const sortedAgendas = result.Items.sort((a, b) => {
        const dateA = new Date(a.horainicio);
        const dateB = new Date(b.horainicio);
        return dateB - dateA; // Orden descendente
      });

      const agenda = sortedAgendas[0];

      const inicio = new Date(agenda.horainicio);
      const termino = new Date(agenda.horatermino);

      // Fecha tipo "22 septiembre, 2025"
      next_appointment_date = inicio.toLocaleDateString("es-ES", {
        day: "2-digit",
        month: "long",
        year: "numeric",
      });

      console.log("Fecha de la próxima cita:", next_appointment_date);

      // Hora tipo "14:00 - 15:00"
      next_appointment_time =
        inicio.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" }) +
        " - " +
        termino.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });

      tipo_consulta = agenda.idtipoconsulta;
    }

    res.render("Bienvenida-y-Opciones", {
      user: req.session.user,
      next_appointment_date,
      next_appointment_time,
      tipo_consulta,
    });
  } catch (error) {
    console.error("Error obteniendo agenda desde DynamoDB:", error);
    res.status(500).send("Error interno del servidor");
  }
});

export default router;
