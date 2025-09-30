const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { BatchWriteCommand, DynamoDBDocumentClient } = require("@aws-sdk/lib-dynamodb");

const docClient = DynamoDBDocumentClient.from(new DynamoDBClient({}));

const ESTADOS = [
  { idEstado: "1", estado: "Libre", atendido: 0, vino: 0 },
  { idEstado: "2", estado: "Paciente Ausente", atendido: 0, vino: 0 },
  { idEstado: "3", estado: "Paciente Esperando", atendido: 0, vino: 1 },
  { idEstado: "4", estado: "En Atención", atendido: 1, vino: 1 },
  { idEstado: "5", estado: "Inhabilitado", atendido: 0, vino: 0 },
  { idEstado: "6", estado: "Finalizado", atendido: 0, vino: 0 },
];

exports.seed = async () => {
  const tableName = process.env.TABLE_NAME;

  if (!tableName) {
    throw new Error("TABLE_NAME no está definido");
  }

  const params = {
    RequestItems: {
      [tableName]: ESTADOS.map((item) => ({
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
      inserted: ESTADOS.length,
    }),
  };
};
