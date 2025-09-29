const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const {
  BatchWriteCommand,
  DynamoDBDocumentClient,
  ScanCommand,
} = require("@aws-sdk/lib-dynamodb");
const crypto = require("node:crypto");

const docClient = DynamoDBDocumentClient.from(new DynamoDBClient({}));

const DURATIONS_MINUTES = [15, 20, 30, 45];

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

const randomFrom = (list) => list[Math.floor(Math.random() * list.length)];

const formatDateTime = (date) => {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  const hh = String(date.getHours()).padStart(2, "0");
  const mi = String(date.getMinutes()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd} ${hh}:${mi}:00`;
};

async function seedAgenda() {
  const tableName = process.env.TABLE_NAME;
  const boxTable = process.env.BOX_TABLE;
  const userTable = process.env.USUARIO_TABLE;
  const tipoConsultaTable = process.env.TIPO_CONSULTA_TABLE;
  const tipoEstadoTable = process.env.TIPO_ESTADO_TABLE;

  if (!tableName || !boxTable || !userTable || !tipoConsultaTable || !tipoEstadoTable) {
    throw new Error("Faltan variables de entorno requeridas");
  }

  const [boxes, usuarios, tiposConsulta, tiposEstado] = await Promise.all([
    scanTable(boxTable),
    scanTable(userTable),
    scanTable(tipoConsultaTable),
    scanTable(tipoEstadoTable),
  ]);

  if (!boxes.length || !usuarios.length || !tiposConsulta.length || !tiposEstado.length) {
    throw new Error("No hay datos suficientes en tablas relacionadas");
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const startOfDayMinutes = 8 * 60; // 08:00
  const endOfDayMinutes = 20 * 60; // 20:00
  const maxDuration = Math.max(...DURATIONS_MINUTES);
  const startRange = endOfDayMinutes - maxDuration;

  const agendaItems = Array.from({ length: 200 }, () => {
    const startRaw =
      Math.floor(Math.random() * (startRange - startOfDayMinutes + 1)) + startOfDayMinutes;
    const startMinutes = startRaw - (startRaw % 5);
    const duration = randomFrom(DURATIONS_MINUTES);
    const endMinutes = Math.min(startMinutes + duration, endOfDayMinutes);

    const startDate = new Date(today);
    startDate.setMinutes(startMinutes);

    const endDate = new Date(today);
    endDate.setMinutes(endMinutes);

    return {
      idAgenda: crypto.randomUUID(),
      idBox: randomFrom(boxes).idBox,
      idUsuario: randomFrom(usuarios).idUsuario,
      idTipoConsulta: randomFrom(tiposConsulta).idTipoConsulta,
      idEstado: randomFrom(tiposEstado).idEstado,
      horainicio: formatDateTime(startDate),
      horaTermino: formatDateTime(endDate),
    };
  });

  const batches = chunk(agendaItems, 25);

  for (const batch of batches) {
    let request = {
      RequestItems: {
        [tableName]: batch.map((Item) => ({ PutRequest: { Item } })),
      },
    };

    while (request) {
      const { UnprocessedItems = {} } = await docClient.send(new BatchWriteCommand(request));
      if (UnprocessedItems[tableName] && UnprocessedItems[tableName].length) {
        request = { RequestItems: UnprocessedItems };
      } else {
        request = null;
      }
    }
  }

  return {
    statusCode: 200,
    body: JSON.stringify({ ok: true, inserted: agendaItems.length }),
  };
}

exports.handler = async () => {
  try {
    return await seedAgenda();
  } catch (error) {
    console.error("Error al poblar agenda:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({ ok: false, error: error.message }),
    };
  }
};
