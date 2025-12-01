import { Router } from "express";
import { QueryCommand, ScanCommand } from "@aws-sdk/lib-dynamodb";
import { requirePermission } from "../middlewares/requirePermission.js";
import db from "../../db.js";
import { config } from "../config/index.js";
import { getParametrizacionLabels } from "../utils/pluralize.js";

const router = Router();
const OCUPANTES_TABLE = config.dynamodb.tablas.ocupantes;
const AGENDA_TABLE = config.dynamodb.tablas.agenda;

async function getEspaciosPorEmpresa(empresaId) {
  const tableName = config.dynamodb.tablas.espacios;
  const result = await db.send(
    new QueryCommand({
      TableName: tableName,
      KeyConditionExpression: "empresaId = :empresaId",
      ExpressionAttributeValues: {
        ":empresaId": empresaId,
      },
    })
  );
  return result.Items || [];
}

router.get("/dashboard-empresa", requirePermission("dashboard.read"), async (req, res, next) => {
  try {
    const empresasList = res.locals.empresasList || [];
    const empresaActiva = res.locals.empresaActiva || null;
    const primeraEmpresa = empresasList[0] || null;
    let selectedEmpresaId = req.query.empresaId || empresaActiva?.empresaId || primeraEmpresa?.empresaId || null;

    if (selectedEmpresaId && empresasList.length) {
      const exists = empresasList.some((e) => String(e.empresaId) === String(selectedEmpresaId));
      if (!exists) {
        selectedEmpresaId = empresaActiva?.empresaId || primeraEmpresa?.empresaId || null;
      }
    }

    const selectedEmpresa =
      (selectedEmpresaId && empresasList.find((e) => String(e.empresaId) === String(selectedEmpresaId))) ||
      empresaActiva ||
      primeraEmpresa ||
      null;

    const selectedParametrizacion = selectedEmpresa
      ? {
          nombreNivel1: selectedEmpresa.nombreNivel1 || "Pasillo",
          nombreNivel2: selectedEmpresa.nombreNivel2 || "Box",
          nombreNivel3: selectedEmpresa.nombreNivel3 || "Ocupante",
          nombreNivel4: selectedEmpresa.nombreNivel4 || "Elemento",
        }
      : res.locals.parametrizacion || {
          nombreNivel1: "Pasillo",
          nombreNivel2: "Box",
          nombreNivel3: "Ocupante",
          nombreNivel4: "Elemento",
        };

    const selectedParametrizacionLabels = getParametrizacionLabels(selectedParametrizacion);

    let totalPasillos = 0;
    let totalMesas = 0;

    let espacios = [];
    if (selectedEmpresaId) {
      espacios = await getEspaciosPorEmpresa(selectedEmpresaId);
      totalPasillos = espacios.length;
      totalMesas = espacios.reduce((acc, esp) => acc + (Array.isArray(esp.mesas) ? esp.mesas.length : 0), 0);
    }

    let dashboardData = null;

    if (selectedEmpresaId && espacios.length) {
      const mesasCatalog = [];
      const mesasIndex = {};

      espacios.forEach((espacio) => {
        const pasilloNombre = espacio.pasilloNombre || "Sin nombre";
        if (Array.isArray(espacio.mesas)) {
          espacio.mesas.forEach((mesa) => {
            const normalized = {
              id: String(mesa.id),
              nombre: mesa.nombre || mesa.numero || mesa.id,
              pasillo: pasilloNombre,
              capacidad: Number(mesa.capacidad) > 0 ? Number(mesa.capacidad) : 1,
            };
            mesasCatalog.push(normalized);
            mesasIndex[String(mesa.id)] = normalized;
          });
        }
      });

      const [ocupantesRes, agendaRes] = await Promise.all([
        db.send(
          new QueryCommand({
            TableName: OCUPANTES_TABLE,
            KeyConditionExpression: "empresaId = :empresaId",
            ExpressionAttributeValues: { ":empresaId": selectedEmpresaId },
          })
        ).catch(() => ({ Items: [] })),
        db.send(new ScanCommand({ TableName: AGENDA_TABLE })).catch(() => ({ Items: [] })),
      ]);

      const ocupantes = (ocupantesRes.Items || []).map((o) => ({
        id: String(o.ocupanteId || o.id || o.idOcupante || ""),
        nombre: o.nombre || o.nombreProfesional || "Sin nombre",
      })).filter((o) => o.id);

      const ocupantesMap = ocupantes.reduce((acc, item) => {
        acc[item.id] = item.nombre;
        return acc;
      }, {});

      const now = new Date();
      const windowDays = 7;
      const windowEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
      const windowStart = new Date(windowEnd);
      windowStart.setDate(windowEnd.getDate() - (windowDays - 1));
      windowStart.setHours(0, 0, 0, 0);

      const jornadaMinutos = 11 * 60;

      const parseDate = (value) => {
        if (!value) return null;
        if (value instanceof Date) return value;
        if (typeof value === "string") {
          const normalized = value.includes("T") ? value : value.replace(" ", "T");
          const date = new Date(normalized);
          return isNaN(date.getTime()) ? null : date;
        }
        return null;
      };

      const eventos = (agendaRes.Items || [])
        .filter((item) => !item.idEmpresa || String(item.idEmpresa) === String(selectedEmpresaId))
        .map((item) => {
          const start = parseDate(item.horainicio || item.horaInicio);
          const end = parseDate(item.horaTermino || item.horatermino || item.horaFin);
          if (!start || !end || end <= windowStart || start >= windowEnd) return null;
          const mesaId = String(item.idBox || item.idbox || item.mesaId || "");
          const mesaMeta = mesasIndex[mesaId];
          const pasillo = mesaMeta?.pasillo || "Sin pasillo";
          const ocupantesIds = String(item.idUsuario || "")
            .split(",")
            .map((id) => id.trim())
            .filter(Boolean);
          const durationMinutes = Math.max((Math.min(end, windowEnd) - Math.max(start, windowStart)) / 60000, 0);

          return {
            idAgenda: String(item.idAgenda || item.id || ""),
            mesaId,
            pasillo,
            mesaNombre: mesaMeta?.nombre || mesaId,
            ocupantes: ocupantesIds,
            ocupantesNombres: ocupantesIds.map((id) => ocupantesMap[id] || id),
            inicio: start.toISOString(),
            fin: end.toISOString(),
            duracion: durationMinutes,
          };
        })
        .filter(Boolean);

      dashboardData = {
        mesas: mesasCatalog,
        eventos,
        ocupantes,
        filtros: {
          pasillos: [...new Set(mesasCatalog.map((m) => m.pasillo))],
        },
        jornadaMinutos,
        diasVentana: windowDays,
        ventana: {
          inicio: windowStart.toISOString(),
          fin: windowEnd.toISOString(),
        },
      };
    }

    res.render("dashboard-empresa", {
      user: req.session.user,
      empresasList,
      selectedEmpresaId,
      selectedEmpresaNombre: selectedEmpresa?.nombre || null,
      parametrizacionSelected: selectedParametrizacion,
      parametrizacionLabelsSelected: selectedParametrizacionLabels,
      totalPasillos,
      totalMesas,
      dashboardData: dashboardData ? JSON.stringify(dashboardData) : null,
    });
  } catch (error) {
    next(error);
  }
});

export default router;
