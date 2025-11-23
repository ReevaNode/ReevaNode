// src/utils/promptManager.js
// genera prompts dinamicos para openai basados en config de dynamodb

import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, ScanCommand } from "@aws-sdk/lib-dynamodb";
import { config } from "../config/index.js";

const client = new DynamoDBClient({
  region: config.aws.region,
  credentials: {
    accessKeyId: config.aws.accessKeyId,
    secretAccessKey: config.aws.secretAccessKey,
    sessionToken: config.aws.sessionToken,
  },
});

const docClient = DynamoDBDocumentClient.from(client);

// genera el prompt del sistema para openai
// parametrizable segun tipo de recurso (box, cama, sala, etc)
export function generateSystemPrompt(resourceConfig, datosActuales = null) {
  const {
    tipo = "box",
    nombreSingular = "box",
    nombrePlural = "boxes",
    contexto = "Hospital Padre Hurtado, Santiago de Chile",
    sistemaNombre = "BoxCare",
  } = resourceConfig;

  let promptBase = `
Eres el orquestador del sistema de gestión de ${nombrePlural} de Reeva, ${sistemaNombre}, utilizado en ${contexto}.

Tu tarea es identificar la intención del usuario y devolver únicamente un objeto JSON válido y estricto según las acciones disponibles.

Acciones disponibles:
- "welcome_user" → Saludar al usuario cuando saluda. Ejemplos: "Hola", "Buenos días", "Qué tal", "Buenas tardes", "hey"
- "agendar_${tipo}" → Agendar ${nombreSingular} a una hora específica (si no se especifica hora, usar "hora": -1)
- "consultar_${nombrePlural}_disponibles" → Consultar ${nombrePlural} disponibles actualmente
- "consultar_estado_doctor" → Consultar estado actual de un doctor específico
- "consultar_estado_${tipo}" → Consultar estado actual de un ${nombreSingular}

⚠️ Importante:
- Devuelve **solo el JSON**, sin explicaciones ni texto adicional.
- Si falta información, devuelve los parámetros con null o -1 según corresponda.
- No inventes intenciones ni parámetros que no existan.

Formato de salida esperado:
{
  "intent": "nombre_de_la_accion",
  "params": {
    "doctor": "...",
    "${tipo}": "...",
    "hora": "..."
  }
}`;

  // agregar contexto si hay datos actuales
  if (datosActuales && datosActuales.length > 0) {
    promptBase += `

Contexto actual del sistema:
- Total de ${nombrePlural} disponibles: ${datosActuales.length}
- ${nombrePlural} disponibles: ${datosActuales.map(d => d.numero || d.id).join(", ")}
`;
  }

  return promptBase;
}

// carga la config del chatbot desde dynamodb
export async function loadChatbotConfig() {
  try {
    const command = new ScanCommand({
      TableName: config.dynamodb.tablas.personalizacion,
      FilterExpression: "categoria = :cat",
      ExpressionAttributeValues: {
        ":cat": "chatbot",
      },
    });

    const result = await docClient.send(command);
    
    if (!result.Items || result.Items.length === 0) {
      console.warn("No se encontro configuracion de chatbot en DynamoDB, usando valores por defecto");
      return getDefaultConfig();
    }

    // convertir items a objeto
    const configObj = {};
    result.Items.forEach(item => {
      configObj[item.clave] = item.valor;
    });

    return {
      tipo: configObj.tipo_recurso || "box",
      nombreSingular: configObj.nombre_singular || "box",
      nombrePlural: configObj.nombre_plural || "boxes",
      contexto: configObj.contexto || "Hospital Padre Hurtado, Santiago de Chile",
      sistemaNombre: configObj.sistema_nombre || "BoxCare",
      mensajeBienvenida: configObj.mensaje_bienvenida || getDefaultWelcomeMessage(),
      urlBase: configObj.url_base || process.env.APP_URL || "http://localhost:3000",
    };
  } catch (error) {
    console.error("Error cargando configuracion de chatbot:", error);
    return getDefaultConfig();
  }
}

// config por defecto si no hay en dynamodb
function getDefaultConfig() {
  return {
    tipo: "box",
    nombreSingular: "box",
    nombrePlural: "boxes",
    contexto: "Hospital Padre Hurtado, Santiago de Chile",
    sistemaNombre: "BoxCare",
    mensajeBienvenida: getDefaultWelcomeMessage(),
    urlBase: process.env.APP_URL || "http://localhost:3000",
  };
}

// mensaje de bienvenida por defecto
function getDefaultWelcomeMessage() {
  return "¡Hola! Bienvenido(a) al asistente de gestión de boxes del Hospital Padre Hurtado. Estoy aquí para ayudarte a consultar la disponibilidad de boxes, agendar horas o revisar el estado de un doctor.";
}

// normaliza el input del usuario a string
export function normalizeInput(userInput) {
  if (typeof userInput === "string") return userInput;
  if (!userInput) return "";
  
  // soporte para eventos http
  if (typeof userInput.body === "string") return userInput.body;
  if (userInput.body && typeof userInput.body === "object") {
    if (typeof userInput.body.message === "string") return userInput.body.message;
    return JSON.stringify(userInput.body);
  }
  if (typeof userInput.message === "string") return userInput.message;
  
  try {
    return JSON.stringify(userInput);
  } catch {
    return String(userInput);
  }
}

export default {
  generateSystemPrompt,
  loadChatbotConfig,
  normalizeInput,
};
