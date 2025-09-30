const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const {
  BatchWriteCommand,
  DynamoDBDocumentClient,
  ScanCommand,
} = require("@aws-sdk/lib-dynamodb");

const docClient = DynamoDBDocumentClient.from(new DynamoDBClient({}));

const chunk = (arr, size) => {
  const batches = [];
  for (let i = 0; i < arr.length; i += size) {
    batches.push(arr.slice(i, i + size));
  }
  return batches;
};

async function scanTable(tableName) {
  const results = [];
  let ExclusiveStartKey;

  do {
    const { Items = [], LastEvaluatedKey } = await docClient.send(
      new ScanCommand({ TableName: tableName, ExclusiveStartKey })
    );
    results.push(...Items);
    ExclusiveStartKey = LastEvaluatedKey;
  } while (ExclusiveStartKey);

  return results;
}

const randomFrom = (list) => list[Math.floor(Math.random() * list.length)];

async function seedBoxes() {
  const tableName = process.env.TABLE_NAME;
  const estadoBoxTable = process.env.ESTADO_BOX_TABLE;
  const tipoBoxTable = process.env.TIPO_BOX_TABLE;

  if (!tableName || !estadoBoxTable || !tipoBoxTable) {
    throw new Error("Faltan variables de entorno requeridas");
  }

  const [estados, tipos] = await Promise.all([
    scanTable(estadoBoxTable),
    scanTable(tipoBoxTable),
  ]);

  if (!estados.length || !tipos.length) {
    throw new Error("Tablas relacionadas sin datos");
  }

  const numbers = Array.from({ length: 150 }, (_, i) => i + 1);

  const boxes = numbers.map((numero) => ({
    idBox: numero.toString(),
    idEstadoBox: randomFrom(estados).idEstado,
    pasillo: Math.floor(Math.random() * 10) + 1,
    idTipoBox: randomFrom(tipos).idTipoBox,
    piso: "",
    numero,
  }));

  const batches = chunk(boxes, 25);

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
    body: JSON.stringify({ ok: true, inserted: boxes.length }),
  };
}

exports.seed = async () => {
  try {
    return await seedBoxes();
  } catch (error) {
    console.error("Error al poblar boxes:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({ ok: false, error: error.message }),
    };
  }
};
