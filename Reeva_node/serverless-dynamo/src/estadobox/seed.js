const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { BatchWriteCommand, DynamoDBDocumentClient } = require("@aws-sdk/lib-dynamodb");

const docClient = DynamoDBDocumentClient.from(new DynamoDBClient({}));

const ESTADOS_BOX = [
  { idEstadoBox: "1", estado: "Habilitado" },
  { idEstadoBox: "2", estado: "Inhabilitado" },
  { idEstadoBox: "3", estado: "habilitado" },
  { idEstadoBox: "4", estado: "inhabilitado" },
];

exports.seed = async () => {
  const tableName = process.env.TABLE_NAME;

  if (!tableName) {
    throw new Error("TABLE_NAME no está definido");
  }

  const params = {
    RequestItems: {
      [tableName]: ESTADOS_BOX.map((item) => ({
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
      inserted: ESTADOS_BOX.length,
    }),
  };
};
