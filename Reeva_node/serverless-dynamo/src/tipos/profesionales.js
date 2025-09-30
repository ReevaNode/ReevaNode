const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { BatchWriteCommand, DynamoDBDocumentClient } = require("@aws-sdk/lib-dynamodb");

const docClient = DynamoDBDocumentClient.from(new DynamoDBClient({}));

const PROFESIONALES = [
  { idTipoProfesional: "8", tipoProfesional: "Médico General" },
  { idTipoProfesional: "9", tipoProfesional: "Cirujano" },
  { idTipoProfesional: "10", tipoProfesional: "Odontólogo" },
  { idTipoProfesional: "11", tipoProfesional: "Pediatra" },
  { idTipoProfesional: "12", tipoProfesional: "Ginecólogo" },
  { idTipoProfesional: "13", tipoProfesional: "Dermatólogo" },
  { idTipoProfesional: "14", tipoProfesional: "Oftalmólogo" },
];

exports.seed = async () => {
  const tableName = process.env.TABLE_NAME;

  if (!tableName) {
    throw new Error("TABLE_NAME no está definido");
  }

  const params = {
    RequestItems: {
      [tableName]: PROFESIONALES.map((item) => ({
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
      inserted: PROFESIONALES.length,
    }),
  };
};
