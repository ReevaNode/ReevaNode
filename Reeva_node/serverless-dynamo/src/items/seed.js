const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const {
  BatchWriteCommand,
  DynamoDBDocumentClient,
  ScanCommand,
} = require("@aws-sdk/lib-dynamodb");
const crypto = require("node:crypto");

const docClient = DynamoDBDocumentClient.from(new DynamoDBClient({}));

const chunk = (arr, size) => {
  const result = [];
  for (let i = 0; i < arr.length; i += size) {
    result.push(arr.slice(i, i + size));
  }
  return result;
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

async function seedItems() {
  const tableName = process.env.TABLE_NAME;
  const boxTable = process.env.BOX_TABLE;
  const tipoItemTable = process.env.TIPO_ITEM_TABLE;

  if (!tableName || !boxTable || !tipoItemTable) {
    throw new Error("Faltan variables de entorno requeridas");
  }

  const [boxes, tiposItem] = await Promise.all([
    scanTable(boxTable),
    scanTable(tipoItemTable),
  ]);

  if (!boxes.length || !tiposItem.length) {
    throw new Error("No hay datos suficientes en tablas relacionadas");
  }

  const seen = new Set();
  const items = [];

  while (items.length < 15 && seen.size < boxes.length * tiposItem.length) {
    const idBox = randomFrom(boxes).idBox;
    const idTipoItem = randomFrom(tiposItem).idTipoItem;
    const key = `${idBox}#${idTipoItem}`;

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    items.push({
      idItem: crypto.randomUUID(),
      idBox,
      idTipoItem,
      cantidad: Math.floor(Math.random() * 3) + 1,
    });
  }

  const batches = chunk(items, 25);

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
    body: JSON.stringify({ ok: true, inserted: items.length }),
  };
}

exports.seed = async () => {
  try {
    return await seedItems();
  } catch (error) {
    console.error("Error al poblar items:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({ ok: false, error: error.message }),
    };
  }
};
