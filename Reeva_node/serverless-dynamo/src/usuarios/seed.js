const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const {
  BatchWriteCommand,
  DynamoDBDocumentClient,
  ScanCommand,
} = require("@aws-sdk/lib-dynamodb");
const crypto = require("node:crypto");

const docClient = DynamoDBDocumentClient.from(new DynamoDBClient({}));

const FIRST_NAMES = [
  "Alfredo",
  "Camila",
  "Diego",
  "Fernanda",
  "Ignacio",
  "Javiera",
  "Matías",
  "Constanza",
  "Valentina",
  "Sebastián",
  "Tomás",
  "Daniela",
  "Catalina",
  "Benjamín",
  "Sofía",
  "Felipe",
  "Martina",
  "Francisca",
  "Joaquín",
  "Pablo",
];

const LAST_NAMES = [
  "Muñoz",
  "González",
  "Rojas",
  "Díaz",
  "Soto",
  "Contreras",
  "Silva",
  "Martínez",
  "Hernández",
  "Gutiérrez",
  "Araya",
  "Navarro",
  "Valenzuela",
  "Castillo",
  "Vega",
  "Rivera",
  "Ortiz",
  "Carrasco",
  "Torres",
  "Bravo",
];

const chunk = (arr, size) => {
  const batches = [];
  for (let i = 0; i < arr.length; i += size) {
    batches.push(arr.slice(i, i + size));
  }
  return batches;
};

const randomFrom = (list) => list[Math.floor(Math.random() * list.length)];

const randomPhone = () => {
  let digits = "9";
  for (let i = 0; i < 8; i += 1) {
    digits += Math.floor(Math.random() * 10);
  }
  return digits;
};

async function scanTable(tableName) {
  const results = [];
  let ExclusiveStartKey;

  do {
    const { Items = [], LastEvaluatedKey } = await docClient.send(
      new ScanCommand({ TableName: tableName, ExclusiveStartKey })
    );
    results.push(...Items);
    ExclusiveStartKey = LastEvaluatedKey;
  } while (ExclusiveStartKey);

  return results;
}

async function seedUsers() {
  const userTable = process.env.TABLE_NAME;
  const tipoUsuarioTable = process.env.TIPO_USUARIO_TABLE;
  const tipoProfesionalTable = process.env.TIPO_PROFESIONAL_TABLE;
  const personalizacionTable = process.env.PERSONALIZACION_TABLE;

  if (!userTable || !tipoUsuarioTable || !tipoProfesionalTable || !personalizacionTable) {
    throw new Error("Faltan variables de entorno requeridas");
  }

  const [tiposUsuario, tiposProfesional, personalizaciones] = await Promise.all([
    scanTable(tipoUsuarioTable),
    scanTable(tipoProfesionalTable),
    scanTable(personalizacionTable),
  ]);

  if (!tiposUsuario.length || !tiposProfesional.length || !personalizaciones.length) {
    throw new Error("No hay datos suficientes en tablas relacionadas");
  }

  const items = Array.from({ length: 100 }, () => {
    const firstName = randomFrom(FIRST_NAMES);
    const lastName = randomFrom(LAST_NAMES);

    return {
      idUsuario: crypto.randomUUID(),
      idTipoUsuario: randomFrom(tiposUsuario).idTipoUsuario,
      idTipoProfesional: randomFrom(tiposProfesional).idTipoProfesional,
      idPersonalizacion: randomFrom(personalizaciones).idPersonalizacion,
      nombreProfesional: `${firstName} ${lastName}`,
      pasillo: Math.floor(Math.random() * 10) + 1,
      telefono: randomPhone(),
    };
  });

  const batches = chunk(items, 25);

  for (const batch of batches) {
    let request = {
      RequestItems: {
        [userTable]: batch.map((Item) => ({ PutRequest: { Item } })),
      },
    };

    while (request) {
      const { UnprocessedItems = {} } = await docClient.send(new BatchWriteCommand(request));
      if (UnprocessedItems[userTable] && UnprocessedItems[userTable].length) {
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

exports.handler = async () => {
  try {
    return await seedUsers();
  } catch (error) {
    console.error("Error al poblar usuarios:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({ ok: false, error: error.message }),
    };
  }
};
