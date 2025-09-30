const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { BatchWriteCommand, DynamoDBDocumentClient } = require("@aws-sdk/lib-dynamodb");

const docClient = DynamoDBDocumentClient.from(new DynamoDBClient({}));

const PREFERENCIAS = [
  { idPersonalizacion: "1", aspecto: "claro", idioma: "español" },
  { idPersonalizacion: "2", aspecto: "claro", idioma: "ingles" },
  { idPersonalizacion: "3", aspecto: "oscuro", idioma: "español" },
  { idPersonalizacion: "4", aspecto: "oscuro", idioma: "inglés" },
];

exports.seed = async () => {
  const tableName = process.env.TABLE_NAME;

  if (!tableName) {
    throw new Error("TABLE_NAME no está definido");
  }

  const params = {
    RequestItems: {
      [tableName]: PREFERENCIAS.map((item) => ({
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
      inserted: PREFERENCIAS.length,
    }),
  };
};
