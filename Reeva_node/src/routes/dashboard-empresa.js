import { Router } from "express";
import { QueryCommand } from "@aws-sdk/lib-dynamodb";
import { requirePermission } from "../middlewares/requirePermission.js";
import db from "../../db.js";
import { config } from "../config/index.js";
import { getParametrizacionLabels } from "../utils/pluralize.js";

const router = Router();

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

    if (selectedEmpresaId) {
      const espacios = await getEspaciosPorEmpresa(selectedEmpresaId);
      totalPasillos = espacios.length;
      totalMesas = espacios.reduce((acc, esp) => acc + (Array.isArray(esp.mesas) ? esp.mesas.length : 0), 0);
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
    });
  } catch (error) {
    next(error);
  }
});

export default router;
