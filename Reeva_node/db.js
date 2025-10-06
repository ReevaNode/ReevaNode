// cliente de dynamodb
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { config } from "./src/config/index.js";

// crear cliente
const client = new DynamoDBClient({
  region: config.aws.region,
});

const db = DynamoDBDocumentClient.from(client);

// probar conexion
(async () => {
  try {
    console.log(`✓ Cliente DynamoDB configurado para region: ${config.aws.region}`);
  } catch (err) {
    console.error("Error al configurar DynamoDB:", err);
  }
})();

export default db;