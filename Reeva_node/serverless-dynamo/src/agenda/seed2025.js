const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const {
  BatchWriteCommand,
  DynamoDBDocumentClient,
  ScanCommand,
} = require("@aws-sdk/lib-dynamodb");
const crypto = require("node:crypto");

const docClient = DynamoDBDocumentClient.from(new DynamoDBClient({}));

const DURATIONS_MINUTES = [15, 20, 30, 45];
const START_DAY_MINUTES = 8 * 60; // 08:00
const END_DAY_MINUTES = 20 * 60; // 20:00

const MONTHLY_AGENDA_COUNTS = {
  "2025-01": 40,
  "2025-02": 55,
  "2025-03": 60,
  "2025-04": 70,
  "2025-05": 80,
  "2025-06": 75,
  "2025-07": 85,
  "2025-08": 90,
  "2025-09": 95,
  "2025-10": 110,
  "2025-11": 105,
  "2025-12": 120,
};

const chunk = (arr, size) => {
  const batches = [];
  for (let i = 0; i < arr.length; i += size) {
    batches.push(arr.slice(i, i + size));
  }
  return batches;
};

async function scanTable(tableName) {
  const items = [];
  let ExclusiveStartKey;

  do {
    const { Items = [], LastEvaluatedKey } = await docClient.send(
      new ScanCommand({ TableName: tableName, ExclusiveStartKey })
    );
    items.push(...Items);
    ExclusiveStartKey = LastEvaluatedKey;
  } while (ExclusiveStartKey);

  return items;
}

const randomFrom = (list = []) =>
  list[Math.floor(Math.random() * list.length)];

const formatDateTime = (date) => {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  const hh = String(date.getHours()).padStart(2, "0");
  const mi = String(date.getMinutes()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd} ${hh}:${mi}:00`;
};

const toMinutes = (hours, minutes = 0) => hours * 60 + minutes;

const clampEndMinutes = (startMinutes, duration) => {
  const maxDuration = Math.min(duration, END_DAY_MINUTES - startMinutes);
  return startMinutes + maxDuration;
};

const ensureId = (item, keys = []) => {
  for (const key of keys) {
    if (item[key]) return String(item[key]);
  }
  return null;
};

async function seedAgenda2025() {
  const tableName = process.env.TABLE_NAME;
  const boxTable = process.env.BOX_TABLE;
  const userTable = process.env.USUARIO_TABLE;
  const tipoConsultaTable = process.env.TIPO_CONSULTA_TABLE;
  const tipoEstadoTable = process.env.TIPO_ESTADO_TABLE;

  if (
    !tableName ||
    !boxTable ||
    !userTable ||
    !tipoConsultaTable ||
    !tipoEstadoTable
  ) {
    throw new Error("Faltan variables de entorno requeridas");
  }

  const [boxes, usuarios, tiposConsulta, tiposEstado] = await Promise.all([
    scanTable(boxTable),
    scanTable(userTable),
    scanTable(tipoConsultaTable),
    scanTable(tipoEstadoTable),
  ]);

  if (
    !boxes.length ||
    !usuarios.length ||
    !tiposConsulta.length ||
    !tiposEstado.length
  ) {
    throw new Error("No hay datos suficientes en tablas relacionadas");
  }

  const validBoxes = boxes
    .map((box) => ({
      idBox: ensureId(box, ["idBox", "id"]),
    }))
    .filter((item) => item.idBox);

  const validUsers = usuarios
    .map((usuario) => ({
      idUsuario: ensureId(usuario, ["idUsuario", "idusuario", "id"]),
    }))
    .filter((item) => item.idUsuario);

  const validConsultas = tiposConsulta
    .map((consulta) => ({
      idTipoConsulta: ensureId(consulta, [
        "idTipoConsulta",
        "idtipoconsulta",
        "id",
      ]),
    }))
    .filter((item) => item.idTipoConsulta);

  const estadosFinalizados = tiposEstado
    .filter((estado) =>
      String(estado.estado || "")
        .toLowerCase()
        .includes("final")
    )
    .map((estado) =>
      ensureId(estado, ["idTipoEstado", "idEstado", "id", "idtipoestado"])
    )
    .filter(Boolean);

  const todosLosEstados = tiposEstado
    .map((estado) =>
      ensureId(estado, ["idTipoEstado", "idEstado", "id", "idtipoestado"])
    )
    .filter(Boolean);

  const pickEstado = () => {
    if (estadosFinalizados.length && Math.random() < 0.65) {
      return randomFrom(estadosFinalizados);
    }
    return randomFrom(todosLosEstados);
  };

  const entries = [];

  for (const [monthKey, count] of Object.entries(MONTHLY_AGENDA_COUNTS)) {
    const [year, rawMonth] = monthKey.split("-");
    const monthIndex = Number(rawMonth) - 1;
    const yearNum = Number(year);

    if (Number.isNaN(monthIndex) || Number.isNaN(yearNum)) continue;

    const daysInMonth = new Date(yearNum, monthIndex + 1, 0).getDate();
    for (let i = 0; i < count; i += 1) {
      const randomDay = Math.ceil(Math.random() * daysInMonth);
      const baseStartMinutes =
        Math.floor(
          Math.random() *
            (toMinutes(19, 30) - START_DAY_MINUTES + 1)
        ) + START_DAY_MINUTES;
      const startMinutes = baseStartMinutes - (baseStartMinutes % 5);
      const duration = randomFrom(DURATIONS_MINUTES);
      const endMinutes = clampEndMinutes(startMinutes, duration);

      const startDate = new Date(yearNum, monthIndex, randomDay);
      startDate.setHours(0, 0, 0, 0);
      startDate.setMinutes(startMinutes);

      const endDate = new Date(yearNum, monthIndex, randomDay);
      endDate.setHours(0, 0, 0, 0);
      endDate.setMinutes(endMinutes);

      entries.push({
        idAgenda: crypto.randomUUID(),
        idBox: randomFrom(validBoxes).idBox,
        idUsuario: randomFrom(validUsers).idUsuario,
        idTipoConsulta: randomFrom(validConsultas).idTipoConsulta,
        idEstado: pickEstado(),
        horainicio: formatDateTime(startDate),
        horaTermino: formatDateTime(endDate),
      });
    }
  }

  const batches = chunk(entries, 25);

  for (const batch of batches) {
    let request = {
      RequestItems: {
        [tableName]: batch.map((Item) => ({ PutRequest: { Item } })),
      },
    };

    while (request) {
      const { UnprocessedItems = {} } = await docClient.send(
        new BatchWriteCommand(request)
      );
      if (
        UnprocessedItems[tableName] &&
        UnprocessedItems[tableName].length
      ) {
        request = { RequestItems: UnprocessedItems };
      } else {
        request = null;
      }
    }
  }

  return {
    statusCode: 200,
    body: JSON.stringify({ ok: true, inserted: entries.length }),
  };
}

exports.handler = async () => {
  try {
    return await seedAgenda2025();
  } catch (error) {
    console.error("Error al poblar agenda 2025:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({ ok: false, error: error.message }),
    };
  }
};
