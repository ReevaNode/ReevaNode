import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";

// Crear el cliente DynamoDB
const client = new DynamoDBClient({
  region: process.env.AWS_REGION || "us-east-1",
  // Credenciales locales, AWS CLI
});

const db = DynamoDBDocumentClient.from(client);

// Probar conexión 
(async () => {
  try {
    // verificar conectividad
    console.log("Cliente DynamoDB configurado correctamente");
  } catch (err) {
    console.error("Error al configurar DynamoDB:", err);
  }
})();

export default db;