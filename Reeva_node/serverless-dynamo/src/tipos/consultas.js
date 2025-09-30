const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { BatchWriteCommand, DynamoDBDocumentClient } = require("@aws-sdk/lib-dynamodb");

const docClient = DynamoDBDocumentClient.from(new DynamoDBClient({}));

const CONSULTAS = [
  { idTipoConsulta: "1", tipoConsulta: "Ingreso" },
  { idTipoConsulta: "2", tipoConsulta: "Control" },
  { idTipoConsulta: "3", tipoConsulta: "Alta" },
  { idTipoConsulta: "4", tipoConsulta: "Gestión" },
];

exports.seed = async () => {
  const tableName = process.env.TABLE_NAME;

  if (!tableName) {
    throw new Error("TABLE_NAME no está definido");
  }

  const params = {
    RequestItems: {
      [tableName]: CONSULTAS.map((item) => ({
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
      inserted: CONSULTAS.length,
    }),
  };
};
