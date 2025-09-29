const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { BatchWriteCommand, DynamoDBDocumentClient } = require("@aws-sdk/lib-dynamodb");

const docClient = DynamoDBDocumentClient.from(new DynamoDBClient({}));

const TIPOS_BOX = [
  { idTipoBox: "8", tipoBox: "General" },
  { idTipoBox: "9", tipoBox: "Cirugía" },
  { idTipoBox: "10", tipoBox: "Odontología" },
  { idTipoBox: "11", tipoBox: "Pediatría" },
  { idTipoBox: "12", tipoBox: "Ginecología" },
  { idTipoBox: "13", tipoBox: "Dermatología" },
  { idTipoBox: "14", tipoBox: "Oftalmología" },
];

exports.seed = async () => {
  const tableName = process.env.TABLE_NAME;

  if (!tableName) {
    throw new Error("TABLE_NAME no está definido");
  }

  const params = {
    RequestItems: {
      [tableName]: TIPOS_BOX.map((item) => ({
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
      inserted: TIPOS_BOX.length,
    }),
  };
};
