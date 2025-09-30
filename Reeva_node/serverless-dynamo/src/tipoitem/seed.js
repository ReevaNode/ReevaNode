const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { BatchWriteCommand, DynamoDBDocumentClient } = require("@aws-sdk/lib-dynamodb");

const docClient = DynamoDBDocumentClient.from(new DynamoDBClient({}));

const TIPOS_ITEM = [
  { idTipoItem: "1", tipoItem: "Silla" },
  { idTipoItem: "2", tipoItem: "Mesa" },
  { idTipoItem: "3", tipoItem: "Camilla" },
  { idTipoItem: "4", tipoItem: "Escritorio" },
  { idTipoItem: "5", tipoItem: "Computador" },
  { idTipoItem: "6", tipoItem: "Balanza" },
];

exports.seed = async () => {
  const tableName = process.env.TABLE_NAME;

  if (!tableName) {
    throw new Error("TABLE_NAME no está definido");
  }

  const params = {
    RequestItems: {
      [tableName]: TIPOS_ITEM.map((item) => ({
        PutRequest: { Item: item },
      })),
    },
  };

  await docClient.send(new BatchWriteCommand(params));

  return {
    statusCode: 200,
    body: JSON.stringify({
      ok: true,
      table: tableName,
      inserted: TIPOS_ITEM.length,
    }),
  };
};
