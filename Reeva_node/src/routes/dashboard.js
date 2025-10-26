import { Router } from "express";
import { ScanCommand } from "@aws-sdk/lib-dynamodb";
import dayjs from "dayjs";
import customParseFormat from "dayjs/plugin/customParseFormat.js";
import { requirePermission } from "../middlewares/requirePermission.js";
import db from "../../db.js";
import { config } from "../config/index.js";

dayjs.extend(customParseFormat);

const router = Router();

const slugify = (value = "") =>
  value
    .toString()
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "valor";

const AGENDA_DATE_FORMATS = [
  "YYYY-MM-DD HH:mm:ss",
  "YYYY-MM-DDTHH:mm:ss",
  "YYYY-MM-DDTHH:mm:ssZ",
];

const BOX_USAGE_PERIODS = [
  {
    value: "day",
    label: "Hoy",
    description: "Últimas 24 horas",
    start: (now) => now.startOf("day"),
  },
  {
    value: "week",
    label: "Semana",
    description: "Últimos 7 días",
    start: (now) => now.startOf("week"),
  },
  {
    value: "month",
    label: "Mes",
    description: "Últimos 30 días",
    start: (now) => now.startOf("month"),
  },
  {
    value: "year",
    label: "Año",
    description: "Últimos 12 meses",
    start: (now) => now.startOf("year"),
  },
];

const DEFAULT_BOX_USAGE_PERIOD = "week";
const WEEK_DAY_LABELS = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];
const WEEK_INDEX_FROM_DAY = {
  1: 0,
  2: 1,
  3: 2,
  4: 3,
  5: 4,
  6: 5,
  0: 6,
};

function parseAgendaDate(value) {
  if (!value) return null;
  for (const format of AGENDA_DATE_FORMATS) {
    const parsed = dayjs(value, format, true);
    if (parsed.isValid()) return parsed;
  }
  const fallback = dayjs(value);
  return fallback.isValid() ? fallback : null;
}

function resolveBoxUsagePeriod(periodValue = "") {
  const normalized = periodValue.toLowerCase();
  const config =
    BOX_USAGE_PERIODS.find((item) => item.value === normalized) ||
    BOX_USAGE_PERIODS.find((item) => item.value === DEFAULT_BOX_USAGE_PERIOD);
  return config;
}

async function scanTable(tableName) {
  let items = [];
  let ExclusiveStartKey;

  do {
    const { Items = [], LastEvaluatedKey } = await db.send(
      new ScanCommand({
        TableName: tableName,
        ExclusiveStartKey,
      })
    );
    items = items.concat(Items);
    ExclusiveStartKey = LastEvaluatedKey;
  } while (ExclusiveStartKey);

  return items;
}

async function fetchBoxAggregates() {
  const tables = config.dynamodb.tablas;
  const boxTable = tables.box;
  const tipoBoxTable = tables.tipoBox;
  const estadoBoxTable = tables.estadoBox;
  const agendaTable = tables.agenda;
  const tipoEstadoTable = tables.tipoEstado;

  const [boxesRaw, tiposRaw, estadosRaw, agendaRaw, tiposEstadoRaw] = await Promise.all([
    scanTable(boxTable),
    scanTable(tipoBoxTable),
    scanTable(estadoBoxTable),
    scanTable(agendaTable),
    scanTable(tipoEstadoTable),
  ]);

  const boxes = boxesRaw.map((box) => {
    const idBox = box.idBox ?? box.id;
    const rawTipo = box.idTipoBox ?? box.tipoBox ?? box.tipo;
    const rawEstado = box.idEstadoBox ?? box.idEstado ?? box.estadoBox;
    return {
      idBox: idBox ? String(idBox) : "",
      numero: box.numero ?? idBox,
      idTipoBox: rawTipo ? String(rawTipo) : null,
      idEstadoBox: rawEstado ? String(rawEstado) : null,
      pasillo: box.pasillo,
      piso: box.piso,
    };
  });

  const tipoMap = new Map(
    tiposRaw.map((tipo) => [
      String(tipo.idTipoBox ?? tipo.id),
      tipo.tipoBox || tipo.nombre || `Tipo ${tipo.idTipoBox}`,
    ])
  );
  const especialidadesBox = Array.from(tipoMap.values()).sort((a, b) =>
    a.localeCompare(b, "es", { sensitivity: "base" })
  );

  const estadoMap = new Map(
    estadosRaw.map((estado) => {
      const key = estado.idEstadoBox ?? estado.idEstado ?? estado.id;
      return [
        key ? String(key) : "",
        (estado.estado || "").toLowerCase(),
      ];
    })
  );

  const finalStateIds = new Set(
    tiposEstadoRaw
      .filter((estado) => {
        const nombre = (estado.estado || "").toLowerCase();
        return nombre.includes("finaliza");
      })
      .map((estado) => String(estado.idTipoEstado ?? estado.idEstado ?? estado.id ?? ""))
      .filter(Boolean)
  );
  if (!finalStateIds.size) {
    finalStateIds.add("6");
  }

  const ocupadosAgenda = new Set(
    agendaRaw
      .filter((item) => {
        const estadoId = String(item.idEstado ?? "");
        return estadoId === "3" || estadoId === "4";
      })
      .map((item) => String(item.idBox))
  );

  const estadoCounts = {
    Ocupado: 0,
    Disponible: 0,
    Inhabilitado: 0,
  };

  const countsPorTipo = {};

  for (const box of boxes) {
    const tipoId = box.idTipoBox;
    if (tipoId) {
      countsPorTipo[tipoId] = (countsPorTipo[tipoId] || 0) + 1;
    }

    const estadoBoxRaw = estadoMap.get(box.idEstadoBox || "") || "";
    const esInhabilitado = estadoBoxRaw.includes("inhabilitado");
    const estaHabilitado = estadoBoxRaw.includes("habilitado");

    if (esInhabilitado) {
      estadoCounts.Inhabilitado += 1;
      continue;
    }

    if (estaHabilitado && ocupadosAgenda.has(box.idBox)) {
      estadoCounts.Ocupado += 1;
    } else {
      estadoCounts.Disponible += 1;
    }
  }

  const totalBoxes = boxes.length || 0;

  const estadoPercentages = Object.fromEntries(
    Object.entries(estadoCounts).map(([key, value]) => [
      key,
      totalBoxes ? Math.round((value * 100) / totalBoxes) : 0,
    ])
  );

  const orderedTipo = Object.entries(countsPorTipo)
    .map(([tipoId, total]) => ({
      tipoId,
      total,
      label: tipoMap.get(tipoId) || `Tipo ${tipoId}`,
    }))
    .sort((a, b) => {
      if (b.total === a.total) {
        return a.label.localeCompare(b.label, "es", { sensitivity: "base" });
      }
      return b.total - a.total;
    });

  const etiquetasEspecialidad = orderedTipo.map((item) => item.label);
  const valoresEspecialidad = orderedTipo.map((item) => item.total);
  const especialidades = especialidadesBox;

  const labelColors = [
    { key: "Ocupado", color: "#B4447C" },
    { key: "Disponible", color: "#22C55E" },
    { key: "Inhabilitado", color: "#F59E0B" },
  ].map((item) => ({ ...item, id: slugify(item.key) }));

  return {
    boxes,
    etiquetasEspecialidad,
    valoresEspecialidad,
    especialidades,
    tipoBoxMap: tipoMap,
    estadoCounts,
    estadoPercentages,
    labelColors,
    occupiedCount: estadoCounts.Ocupado,
    availableCount: estadoCounts.Disponible,
    totalBoxesCount: totalBoxes,
    agendaItems: agendaRaw,
    finalStateIds,
  };
}

function computeBestBoxUsage(agendaItems, boxes, periodConfig) {
  const boxesMap = new Map(
    boxes.map((box) => [box.idBox, box])
  );

  const now = dayjs();
  const startDate = periodConfig.start(now);
  const totals = new Map();
  let totalMinutes = 0;

  for (const item of agendaItems) {
    const inicio = parseAgendaDate(item.horainicio || item.horaInicio);
    const termino = parseAgendaDate(item.horaTermino || item.horatermino || item.horaFin);
    if (!inicio || !termino) continue;
    if (inicio.isBefore(startDate)) continue;
    if (!boxesMap.has(String(item.idBox))) continue;

    const duration = Math.max(termino.diff(inicio, "minute"), 0);
    if (!duration) continue;

    const boxId = String(item.idBox);
    totals.set(boxId, (totals.get(boxId) || 0) + duration);
    totalMinutes += duration;
  }

  if (!totals.size || !totalMinutes) {
    const options = BOX_USAGE_PERIODS.map((option) => ({
      ...option,
      active: option.value === periodConfig.value,
    }));

    return {
      bestBox: null,
      totalMinutes: 0,
      periodLabel: periodConfig.label,
      periodValue: periodConfig.value,
      options,
    };
  }

  const [bestEntry] = [...totals.entries()].sort((a, b) => b[1] - a[1]);
  const [bestBoxId, bestMinutes] = bestEntry;
  const boxInfo = boxesMap.get(bestBoxId) || {};
  const percentage = Math.round((bestMinutes / totalMinutes) * 100);

  const options = BOX_USAGE_PERIODS.map((option) => ({
    ...option,
    active: option.value === periodConfig.value,
  }));

  return {
    bestBox: {
      boxId: bestBoxId,
      numero: boxInfo.numero ?? bestBoxId,
      minutos: bestMinutes,
      porcentaje: percentage,
    },
    totalMinutes,
    periodLabel: periodConfig.label,
    periodValue: periodConfig.value,
    options,
  };
}

function computeBestSpecialtyUsage(agendaItems, boxes, tipoBoxMap, periodConfig) {
  const boxesTipoMap = new Map(
    boxes.map((box) => [String(box.idBox), box.idTipoBox ? String(box.idTipoBox) : null])
  );

  const now = dayjs();
  const startDate = periodConfig.start(now);
  const totals = new Map();
  let totalAgendas = 0;

  for (const item of agendaItems) {
    const inicio = parseAgendaDate(item.horainicio || item.horaInicio);
    if (!inicio || inicio.isBefore(startDate)) continue;

    const boxId = String(item.idBox ?? item.boxId ?? "");
    const tipoId = boxesTipoMap.get(boxId);
    if (!tipoId) continue;

    const label = tipoBoxMap.get(String(tipoId)) || `Especialidad ${tipoId}`;
    const previous = totals.get(tipoId) || { conteo: 0, label };
    previous.conteo += 1;
    totals.set(tipoId, previous);
    totalAgendas += 1;
  }

  const options = BOX_USAGE_PERIODS.map((option) => ({
    ...option,
    active: option.value === periodConfig.value,
  }));

  if (!totals.size || !totalAgendas) {
    return {
      bestSpecialty: null,
      totalMinutes: 0,
      periodLabel: periodConfig.label,
      periodValue: periodConfig.value,
      options,
    };
  }

  const [bestId, bestData] = [...totals.entries()].sort((a, b) => b[1].conteo - a[1].conteo)[0];
  const percentage = Math.round((bestData.conteo / totalAgendas) * 100);

  return {
    bestSpecialty: {
      id: String(bestId),
      label: bestData.label,
      conteo: bestData.conteo,
      porcentaje: percentage,
    },
    totalMinutes: totalAgendas,
    periodLabel: periodConfig.label,
    periodValue: periodConfig.value,
    options,
  };
}

function computeWeeklyFinalized(agendaItems, boxes, tipoBoxMap, finalStateIds) {
  return computeWeeklyFinalizedWithFilters(agendaItems, boxes, tipoBoxMap, finalStateIds, {});
}

function computeWeeklyFinalizedWithFilters(agendaItems, boxes, tipoBoxMap, finalStateIds, filters = {}) {
  const boxesTipoMap = new Map(
    boxes.map((box) => [String(box.idBox), box.idTipoBox ? String(box.idTipoBox) : null])
  );

  const dayTotals = Array(WEEK_DAY_LABELS.length).fill(0);
  const series = {};
  const availableLabels = new Set();
  const availableYears = new Set();
  const monthsByYear = new Map();
  const allMonths = new Set();
  const { year, month, specialty } = filters;

  const normalizeLabel = (value, fallback) => {
    if (typeof value === "string" && value.trim()) return value.trim();
    return fallback;
  };

  for (const item of agendaItems) {
    const inicio = parseAgendaDate(item.horainicio || item.horaInicio);
    if (!inicio) continue;

    const eventYear = inicio.year();
    const eventMonth = inicio.month() + 1;
    availableYears.add(eventYear);
    allMonths.add(eventMonth);
    if (!monthsByYear.has(eventYear)) {
      monthsByYear.set(eventYear, new Set());
    }
    monthsByYear.get(eventYear).add(eventMonth);

    const estadoId = String(item.idEstado ?? item.estado ?? "");
    const estadoNombre = (item.estadoNombre || "").toLowerCase();
    const esFinalizado = finalStateIds.has(estadoId) || estadoNombre.includes("finaliza");
    if (!esFinalizado) continue;

    if (Number.isFinite(year) && eventYear !== year) continue;
    if (Number.isFinite(month) && eventMonth !== month) continue;

    const dayIndex = WEEK_INDEX_FROM_DAY[inicio.day()];
    if (typeof dayIndex !== "number") continue;

    const boxId = String(item.idBox ?? item.boxId ?? "");
    const tipoId = boxesTipoMap.get(boxId);
    if (!tipoId) continue;

    const label = normalizeLabel(
      tipoBoxMap.get(String(tipoId)),
      `Especialidad ${tipoId}`
    );

    if (!series[label]) {
      series[label] = Array(WEEK_DAY_LABELS.length).fill(0);
    }

    series[label][dayIndex] += 1;
    dayTotals[dayIndex] += 1;
    availableLabels.add(label);
  }

  tipoBoxMap.forEach((value, tipoId) => {
    const label = normalizeLabel(value, `Especialidad ${tipoId}`);
    if (!label) return;
    availableLabels.add(label);
    if (!series[label]) {
      series[label] = Array(WEEK_DAY_LABELS.length).fill(0);
    }
  });

  const totalSeries = Array.from(dayTotals);
  series["Todas"] = totalSeries;

  const orderedLabels = Array.from(availableLabels).sort((a, b) =>
    a.localeCompare(b, "es", { sensitivity: "base" })
  );
  const options = ["Todas", ...orderedLabels.filter((label) => label !== "Todas")];

  const hasData = (label) => {
    const values = series[label];
    return Array.isArray(values) && values.some((value) => value > 0);
  };

  let defaultSpecialty = "Todas";
  if (specialty && hasData(specialty)) {
    defaultSpecialty = specialty;
  } else if (!hasData("Todas")) {
    const firstWithData = options.find((label) => label !== "Todas" && hasData(label));
    if (firstWithData) {
      defaultSpecialty = firstWithData;
    }
  }

  const summaries = {};
  Object.entries(series).forEach(([label, values]) => {
    if (!Array.isArray(values)) return;
    const total = values.reduce((acc, value) => acc + value, 0);
    const maxValue = values.reduce((acc, value) => Math.max(acc, value), 0);
    const topIndex = total ? values.findIndex((value) => value === maxValue) : -1;
    const topLabel = total && topIndex >= 0 ? WEEK_DAY_LABELS[topIndex] : null;
    const percentage = total ? Math.round((maxValue * 100) / total) : 0;
    summaries[label] = {
      total,
      topDayLabel: topLabel,
      topDayCount: maxValue,
      topDayPercentage: percentage,
      distribution: values,
    };
  });

  const availableYearsList = Array.from(availableYears).sort((a, b) => b - a);
  const monthsByYearObj = Object.fromEntries(
    [...monthsByYear.entries()].map(([yearKey, set]) => [
      yearKey,
      Array.from(set).sort((a, b) => a - b),
    ])
  );
  const allMonthsList = Array.from(allMonths).sort((a, b) => a - b);

  return {
    labels: WEEK_DAY_LABELS,
    series,
    defaultSpecialty,
    options,
    summaries,
    availableYears: availableYearsList,
    monthsByYear: monthsByYearObj,
    allMonths: allMonthsList,
    selectedYear: Number.isFinite(year) ? year : null,
    selectedMonth: Number.isFinite(month) ? month : null,
  };
}

function computeSpecialtyTrend(agendaItems, boxes, tipoBoxMap, finalStateIds, monthsBack = 12) {
  const boxesTipoMap = new Map(
    boxes.map((box) => [String(box.idBox), box.idTipoBox ? String(box.idTipoBox) : null])
  );

  const monthCounts = new Map(); // monthKey -> Map<label, count>
  const monthRefs = new Map(); // monthKey -> dayjs instance
  const normalizeLabel = (value, fallback) => {
    if (typeof value === "string" && value.trim()) return value.trim();
    return fallback;
  };
  const ensureLabelArray = (seriesRef, label, size) => {
    if (!seriesRef[label]) {
      seriesRef[label] = Array(size).fill(0);
    } else if (seriesRef[label].length !== size) {
      const cloned = Array(size).fill(0);
      seriesRef[label].forEach((value, index) => {
        if (index < cloned.length) cloned[index] = value;
      });
      seriesRef[label] = cloned;
    }
  };

  for (const item of agendaItems) {
    const inicio = parseAgendaDate(item.horainicio || item.horaInicio);
    if (!inicio) continue;

    const estadoId = String(item.idEstado ?? item.estado ?? "");
    const estadoNombre = (item.estadoNombre || "").toLowerCase();
    const esFinalizado = finalStateIds.has(estadoId) || estadoNombre.includes("finaliza");
    if (!esFinalizado) continue;
    const monthKey = inicio.format("YYYY-MM");
    const monthInstance = inicio.startOf("month");
    if (!monthRefs.has(monthKey)) {
      monthRefs.set(monthKey, monthInstance);
    }
    const boxId = String(item.idBox ?? item.boxId ?? "");
    const tipoId = boxesTipoMap.get(boxId);
    if (!tipoId) continue;

    const label = normalizeLabel(
      tipoBoxMap.get(String(tipoId)),
      `Especialidad ${tipoId}`
    );
    if (!monthCounts.has(monthKey)) {
      monthCounts.set(monthKey, new Map());
    }
    const monthMap = monthCounts.get(monthKey);
    monthMap.set(label, (monthMap.get(label) || 0) + 1);
  }

  let monthEntries;
  if (monthRefs.size) {
    monthEntries = [...monthRefs.entries()].sort(
      (a, b) => a[1].valueOf() - b[1].valueOf()
    );

    const firstMonth = monthEntries[0][1];
    const lastMonth = monthEntries[monthEntries.length - 1][1];
    const filledEntries = [];
    let current = firstMonth;
    while (current.isBefore(lastMonth) || current.isSame(lastMonth)) {
      const key = current.format("YYYY-MM");
      filledEntries.push([key, current]);
      current = current.add(1, "month");
    }
    if (monthsBack && filledEntries.length > monthsBack) {
      monthEntries = filledEntries.slice(filledEntries.length - monthsBack);
    } else {
      monthEntries = filledEntries;
    }
  } else {
    const now = dayjs().startOf("month");
    const fallback = [];
    for (let i = monthsBack - 1; i >= 0; i--) {
      fallback.push(now.subtract(i, "month"));
    }
    monthEntries = fallback.map((month) => [month.format("YYYY-MM"), month]);
  }

  const labels = monthEntries.map(([, month]) => month.format("MMM YYYY"));
  const series = {};
  const availableLabels = new Set();
  for (const [, labelValue] of tipoBoxMap) {
    const normalized = normalizeLabel(labelValue, null);
    if (!normalized) continue;
    availableLabels.add(normalized);
  }

  monthEntries.forEach(([monthKey], index) => {
    const counts = monthCounts.get(monthKey);
    if (!counts) return;
    counts.forEach((value, label) => {
      availableLabels.add(label);
      ensureLabelArray(series, label, labels.length);
      series[label][index] = value;
    });
  });

  availableLabels.forEach((label) => {
    ensureLabelArray(series, label, labels.length);
  });

  const totalSeries = Array(labels.length).fill(0);
  Object.entries(series).forEach(([label, values]) => {
    if (!Array.isArray(values)) return;
    values.forEach((value, index) => {
      totalSeries[index] += value;
    });
  });
  series["Todas"] = totalSeries;

  const orderedLabels = Object.keys(series).sort((a, b) => {
    if (a === "Todas") return -1;
    if (b === "Todas") return 1;
    return a.localeCompare(b, "es", { sensitivity: "base" });
  });

  let defaultSpecialty =
    orderedLabels.find(
      (label) =>
        Array.isArray(series[label]) &&
        series[label].some((value) => value > 0)
    ) || orderedLabels[0] || null;

  return {
    labels,
    series,
    options: orderedLabels,
    defaultSpecialty,
  };
}

function buildStaticDashboardData(query = {}) {
  const totalBoxesCount = 20;
  const estadoCounts = {
    Ocupado: 12,
    Disponible: 7,
    Mantenimiento: 1,
  };

  const estadoPercentages = Object.fromEntries(
    Object.entries(estadoCounts).map(([key, count]) => [
      key,
      totalBoxesCount ? Math.round((count / totalBoxesCount) * 100) : 0,
    ])
  );

  const labelColors = [
    { key: "Ocupado", color: "#B4447C" },
    { key: "Disponible", color: "#22C55E" },
    { key: "Mantenimiento", color: "#F59E0B" },
  ].map((item) => ({ ...item, id: slugify(item.key) }));

  const especialidades = ["Todas", "Oftalmología", "Cardiología", "Neurología", "Urgencia"];
  const diasSemana = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes"];

  const horasAgendadas = "12";
  const horasRealizadas = "10";
  const horasAgendadasFloat = 12;
  const horasRealizadasFloat = 10;

  return {
    pageTitle: "Dashboard Hospital",
    occupiedCount: estadoCounts.Ocupado,
    availableCount: estadoCounts.Disponible,
    labelColors,
    estadoPercentages,
    estadoCounts,
    totalBoxesCount,
    etiquetasEspecialidad: ["Oftalmología", "Cardiología", "Neurología", "Urgencia"],
    valoresEspecialidad: [12, 9, 7, 5],
    doctores: [],
    boxes: [],
    especialidades,
    diasSemana,
    datosBarras: [10, 8, 12, 9, 7],
    horasAgendadas,
    horasRealizadas,
    horasAgendadasFloat,
    horasRealizadasFloat,
    espec_sel: query.especialidad || "Todas",
    fecha: query.fecha || "",
    profCode: query.prof_code || "",
    boxNumber: query.box_number || "",
  };
}

function buildDashboardViewModel(data) {
  const labelColorsList = Array.isArray(data.labelColors) ? data.labelColors : [];
  const etiquetasEspecialidadList = Array.isArray(data.etiquetasEspecialidad) ? data.etiquetasEspecialidad : [];
  const valoresEspecialidadList = Array.isArray(data.valoresEspecialidad) ? data.valoresEspecialidad : [];
  const doctoresList = Array.isArray(data.doctores) ? data.doctores : [];
  const boxesList = Array.isArray(data.boxes) ? data.boxes : [];
  const diasSemanaList = Array.isArray(data.diasSemana) ? data.diasSemana : [];
  const datosBarrasList = Array.isArray(data.datosBarras) ? data.datosBarras : [];
  const especialidadesLista = Array.isArray(data.especialidades) ? data.especialidades : [];
  const especialidadesWithAll = especialidadesLista.includes('Todas')
    ? especialidadesLista
    : ['Todas', ...especialidadesLista];
  const occupiedValue = Number.isFinite(data.occupiedCount) ? data.occupiedCount : Number(data.occupiedCount) || 0;
  const availableValue = Number.isFinite(data.availableCount) ? data.availableCount : Number(data.availableCount) || 0;
  const estadoPercentagesData = data.estadoPercentages || {};
  const estadoCountsData = data.estadoCounts || {};
  const totalBoxesData = Number.isFinite(data.totalBoxesCount) ? data.totalBoxesCount : Number(data.totalBoxesCount) || 0;
  const horasAgendadasText = typeof data.horasAgendadas === "string" ? data.horasAgendadas : String(data.horasAgendadas ?? "0");
  const horasRealizadasText = typeof data.horasRealizadas === "string" ? data.horasRealizadas : String(data.horasRealizadas ?? "0");
  const horasAgendadasFloatValue = Number.isFinite(data.horasAgendadasFloat) ? data.horasAgendadasFloat : Number(data.horasAgendadas) || 0;
  const horasRealizadasFloatValue = Number.isFinite(data.horasRealizadasFloat) ? data.horasRealizadasFloat : Number(data.horasRealizadas) || 0;
  const especSeleccionada = typeof data.espec_sel === "string" ? data.espec_sel : "Todas";
  const fechaSeleccionada = typeof data.fecha === "string" ? data.fecha : "";
  const profSeleccionado = typeof data.profCode === "string" ? data.profCode : "";
  const boxSeleccionado = typeof data.boxNumber === "string" ? data.boxNumber : "";

  const selectedBoxPeriodValue = typeof data.boxUsagePeriodValue === "string" ? data.boxUsagePeriodValue : DEFAULT_BOX_USAGE_PERIOD;
  const resolvedBoxPeriod = resolveBoxUsagePeriod(selectedBoxPeriodValue);
  const boxUsageOptionsRaw = Array.isArray(data.boxUsageOptions) ? data.boxUsageOptions : BOX_USAGE_PERIODS;
  const boxUsageOptions = boxUsageOptionsRaw.map((option) => ({
    ...option,
    active: option.value === resolvedBoxPeriod.value,
  }));
  const bestBoxUsageRaw = data.bestBoxUsage;
  const bestBoxUsageData = bestBoxUsageRaw
    ? {
        numero: bestBoxUsageRaw.numero ?? "—",
        porcentaje: Number.isFinite(bestBoxUsageRaw.porcentaje)
          ? bestBoxUsageRaw.porcentaje
          : Number(bestBoxUsageRaw.porcentaje) || 0,
        minutos: bestBoxUsageRaw.minutos ?? 0,
      }
    : null;

  const selectedSpecialtyPeriodValue =
    typeof data.specialtyUsagePeriodValue === "string" ? data.specialtyUsagePeriodValue : DEFAULT_BOX_USAGE_PERIOD;
  const resolvedSpecialtyPeriod = resolveBoxUsagePeriod(selectedSpecialtyPeriodValue);
  const specialtyUsageOptionsRaw = Array.isArray(data.specialtyUsageOptions) ? data.specialtyUsageOptions : BOX_USAGE_PERIODS;
  const specialtyUsageOptions = specialtyUsageOptionsRaw.map((option) => ({
    ...option,
    active: option.value === resolvedSpecialtyPeriod.value,
  }));
  const bestSpecialtyUsageRaw = data.bestSpecialtyUsage;
  const bestSpecialtyUsageData = bestSpecialtyUsageRaw
    ? {
        nombre: bestSpecialtyUsageRaw.label ?? "—",
        porcentaje: Number.isFinite(bestSpecialtyUsageRaw.porcentaje)
          ? bestSpecialtyUsageRaw.porcentaje
          : Number(bestSpecialtyUsageRaw.porcentaje) || 0,
        conteo: bestSpecialtyUsageRaw.conteo ?? 0,
      }
    : null;

  const specialtyTrendLabels = Array.isArray(data.specialtyTrendLabels) ? data.specialtyTrendLabels : [];
  const specialtyTrendSeries = data.specialtyTrendSeries || {};
  const specialtyTrendOptionsRaw = Array.isArray(data.specialtyTrendOptions)
    ? data.specialtyTrendOptions
    : Object.keys(specialtyTrendSeries);
  const specialtyTrendOptions = Array.from(new Set(specialtyTrendOptionsRaw));
  const specialtyTrendDefault = data.specialtyTrendDefault || specialtyTrendOptions[0] || null;

  const weeklySpecialtyLabels = Array.isArray(data.weeklySpecialtyLabels) ? data.weeklySpecialtyLabels : [];
  const weeklySpecialtySeries = data.weeklySpecialtySeries || {};
  const weeklySpecialtyDefault =
    data.weeklySpecialtyDefault || Object.keys(weeklySpecialtySeries)[0] || null;
  const weeklySpecialtyOptionsRaw = Array.isArray(data.weeklySpecialtyOptions)
    ? data.weeklySpecialtyOptions
    : Object.keys(weeklySpecialtySeries);
  const weeklySpecialtyOptions = Array.from(
    new Set(["Todas", ...weeklySpecialtyOptionsRaw.filter(Boolean)])
  );
  const weeklySummary = data.weeklySummary || {};
  const weeklyMonthsByYearRaw = data.weeklyMonthsByYear || {};
  const weeklyMonthsByYear = Object.fromEntries(
    Object.entries(weeklyMonthsByYearRaw).map(([yearKey, months]) => [
      Number(yearKey),
      Array.isArray(months)
        ? months.map((value) => Number(value)).filter((value) => Number.isFinite(value))
        : [],
    ])
  );
  const weeklyAvailableYears = Array.isArray(data.weeklyAvailableYears)
    ? data.weeklyAvailableYears.map((value) => Number(value)).filter((value) => Number.isFinite(value))
    : Object.keys(weeklyMonthsByYear).map((value) => Number(value)).filter((value) => Number.isFinite(value)).sort((a, b) => b - a);
  const weeklyAllMonths = Array.isArray(data.weeklyAllMonths)
    ? data.weeklyAllMonths.map((value) => Number(value)).filter((value) => Number.isFinite(value))
    : [];
  const weeklySelectedYear = Number.isFinite(data.weeklySelectedYear)
    ? data.weeklySelectedYear
    : Number.isFinite(Number(data.weeklySelectedYear))
      ? Number(data.weeklySelectedYear)
      : null;
  const weeklySelectedMonth = Number.isFinite(data.weeklySelectedMonth)
    ? data.weeklySelectedMonth
    : Number.isFinite(Number(data.weeklySelectedMonth))
      ? Number(data.weeklySelectedMonth)
      : null;
  const weeklyAvailableMonths =
    (weeklySelectedYear && weeklyMonthsByYear[weeklySelectedYear]) || weeklyAllMonths;

  const labelColorsView = labelColorsList.map((item, index) => ({
    ...item,
    chartId: item.id || `estado-${index}`,
  }));

  return {
    pageTitle: data.pageTitle || "Dashboard Hospital",
    labelColorsList,
    labelColorsView,
    etiquetasEspecialidadList,
    valoresEspecialidadList,
    especialidades: especialidadesWithAll,
    doctoresList,
    boxesList,
    diasSemanaList,
    datosBarrasList,
    occupiedValue,
    availableValue,
    estadoPercentagesData,
    estadoCountsData,
    totalBoxesData,
    horasAgendadasText,
    horasRealizadasText,
    horasAgendadasFloatValue,
    horasRealizadasFloatValue,
    especSeleccionada,
    fechaSeleccionada,
    profSeleccionado,
    boxSeleccionado,
    selectedBoxPeriodValue: resolvedBoxPeriod.value,
    selectedBoxPeriodLabel: resolvedBoxPeriod.label,
    selectedBoxPeriodDescription: resolvedBoxPeriod.description,
    boxUsageOptions,
    hasBestBoxUsage: Boolean(bestBoxUsageData),
    bestBoxUsageData,
    boxUsageTotalMinutes: data.boxUsageTotalMinutes || 0,
    selectedSpecialtyPeriodValue: resolvedSpecialtyPeriod.value,
    selectedSpecialtyPeriodLabel: resolvedSpecialtyPeriod.label,
    selectedSpecialtyPeriodDescription: resolvedSpecialtyPeriod.description,
    specialtyUsageOptions,
    hasBestSpecialtyUsage: Boolean(bestSpecialtyUsageData),
    bestSpecialtyUsageData,
    specialtyUsageTotalMinutes: data.specialtyUsageTotalMinutes || 0,
    specialtyTrendLabels,
    specialtyTrendSeries,
    specialtyTrendOptions,
    specialtyTrendDefault,
    weeklySpecialtyLabels,
    weeklySpecialtySeries,
    weeklySpecialtyDefault,
    weeklySpecialtyOptions,
    weeklySummary,
    weeklyAvailableYears,
    weeklyMonthsByYear,
    weeklyAvailableMonths,
    weeklyAllMonths,
    weeklySelectedYear,
    weeklySelectedMonth,
    hasLabelColors: labelColorsView.length > 0,
    horasAgendadas: data.horasAgendadas,
    horasRealizadas: data.horasRealizadas,
    horasAgendadasFloat: data.horasAgendadasFloat,
    horasRealizadasFloat: data.horasRealizadasFloat,
    datosBarras: data.datosBarras,
  };
}

router.get("/dashboard", requirePermission("dashboard.read"), async (req, res, next) => {
  try {
    const boxSummary = await fetchBoxAggregates();
    const boxUsagePeriodConfig = resolveBoxUsagePeriod(req.query.box_period);
    const specialtyUsagePeriodConfig = resolveBoxUsagePeriod(req.query.specialty_period);
    const boxUsage = computeBestBoxUsage(
      boxSummary.agendaItems,
      boxSummary.boxes,
      boxUsagePeriodConfig
    );
    const specialtyUsage = computeBestSpecialtyUsage(
      boxSummary.agendaItems,
      boxSummary.boxes,
      boxSummary.tipoBoxMap,
      specialtyUsagePeriodConfig
    );
    const requestedWeeklySpecialty =
      typeof req.query.especialidad === "string" ? req.query.especialidad : null;
    const requestedWeeklyYear = Number.parseInt(req.query.weekly_year ?? "", 10);
    const requestedWeeklyMonth = Number.parseInt(req.query.weekly_month ?? "", 10);

    const weeklyFinalized = computeWeeklyFinalizedWithFilters(
      boxSummary.agendaItems,
      boxSummary.boxes,
      boxSummary.tipoBoxMap,
      boxSummary.finalStateIds,
      {
        specialty: requestedWeeklySpecialty,
        year: Number.isFinite(requestedWeeklyYear) ? requestedWeeklyYear : null,
        month: Number.isFinite(requestedWeeklyMonth) ? requestedWeeklyMonth : null,
      }
    );
    const specialtyTrend = computeSpecialtyTrend(
      boxSummary.agendaItems,
      boxSummary.boxes,
      boxSummary.tipoBoxMap,
      boxSummary.finalStateIds,
      12
    );
    const baseData = buildStaticDashboardData(req.query);

    const selectedWeeklySpecialty =
      requestedWeeklySpecialty && weeklyFinalized.series[requestedWeeklySpecialty]
        ? requestedWeeklySpecialty
        : weeklyFinalized.defaultSpecialty;

    const dashboardData = {
      ...baseData,
      espec_sel: selectedWeeklySpecialty || baseData.espec_sel,
      boxes: boxSummary.boxes,
      etiquetasEspecialidad: boxSummary.etiquetasEspecialidad,
      valoresEspecialidad: boxSummary.valoresEspecialidad,
      especialidades: boxSummary.especialidades,
      totalBoxesCount: boxSummary.totalBoxesCount,
      labelColors: boxSummary.labelColors,
      estadoCounts: boxSummary.estadoCounts,
      estadoPercentages: boxSummary.estadoPercentages,
      occupiedCount: boxSummary.occupiedCount,
      availableCount: boxSummary.availableCount,
      bestBoxUsage: boxUsage.bestBox,
      boxUsagePeriodValue: boxUsage.periodValue,
      boxUsagePeriodLabel: boxUsage.periodLabel,
      boxUsageOptions: boxUsage.options,
      boxUsageTotalMinutes: boxUsage.totalMinutes,
      bestSpecialtyUsage: specialtyUsage.bestSpecialty,
      specialtyUsagePeriodValue: specialtyUsage.periodValue,
      specialtyUsagePeriodLabel: specialtyUsage.periodLabel,
      specialtyUsageOptions: specialtyUsage.options,
      specialtyUsageTotalMinutes: specialtyUsage.totalMinutes,
      weeklySpecialtyLabels: weeklyFinalized.labels,
      weeklySpecialtySeries: weeklyFinalized.series,
      weeklySpecialtyDefault: selectedWeeklySpecialty || weeklyFinalized.defaultSpecialty,
      weeklySpecialtyOptions: weeklyFinalized.options,
      weeklySummary: weeklyFinalized.summaries,
      weeklyAvailableYears: weeklyFinalized.availableYears,
      weeklyMonthsByYear: weeklyFinalized.monthsByYear,
      weeklyAllMonths: weeklyFinalized.allMonths,
      weeklySelectedYear: weeklyFinalized.selectedYear,
      weeklySelectedMonth: weeklyFinalized.selectedMonth,
      specialtyTrendLabels: specialtyTrend.labels,
      specialtyTrendSeries: specialtyTrend.series,
      specialtyTrendOptions: specialtyTrend.options,
      specialtyTrendDefault: specialtyTrend.defaultSpecialty,
    };

    const viewModel = buildDashboardViewModel(dashboardData);

    if (req.headers.accept && req.headers.accept.includes("application/json")) {
      return res.json({
        horas_agendadas: viewModel.horasAgendadas,
        horas_realizadas: viewModel.horasRealizadas,
        horas_agendadas_float: viewModel.horasAgendadasFloat,
        horas_realizadas_float: viewModel.horasRealizadasFloat,
        datos_barras: viewModel.datosBarras,
        weekly_labels: viewModel.weeklySpecialtyLabels,
        weekly_series: viewModel.weeklySpecialtySeries,
        weekly_default: viewModel.weeklySpecialtyDefault,
        weekly_options: viewModel.weeklySpecialtyOptions,
        weekly_summary: viewModel.weeklySummary,
        weekly_years: viewModel.weeklyAvailableYears,
        weekly_months: viewModel.weeklyAvailableMonths,
        weekly_months_map: viewModel.weeklyMonthsByYear,
        weekly_all_months: viewModel.weeklyAllMonths,
        weekly_selected_year: viewModel.weeklySelectedYear,
        weekly_selected_month: viewModel.weeklySelectedMonth,
      });
    }

    res.render("dashboard", {
      ...viewModel,
      user: req.session.user,
    });
  } catch (error) {
    next(error);
  }
});

export default router;
