// src/services/chatbotService.js
// orquestador principal del chatbot
// maneja intenciones y respuestas

import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, ScanCommand, QueryCommand, GetCommand } from "@aws-sdk/lib-dynamodb";
import { config } from "../config/index.js";
import { classifyIntent } from "./openaiService.js";
import { sendWhatsAppMessage, generateTwiML } from "./twilioService.js";
import { loadChatbotConfig } from "../utils/promptManager.js";

const client = new DynamoDBClient({
  region: config.aws.region,
  credentials: {
    accessKeyId: config.aws.accessKeyId,
    secretAccessKey: config.aws.secretAccessKey,
    sessionToken: config.aws.sessionToken,
  },
});

const docClient = DynamoDBDocumentClient.from(client);

// procesa un mensaje entrante del webhook de twilio
// clasifica la intencion y genera una respuesta
export async function processIncomingMessage(webhookData) {
  try {
    const userMessage = webhookData.body;
    const from = webhookData.from;
    
    console.log("Mensaje entrante de:", from);
    console.log("Contenido:", userMessage);
    
    // cargar config del chatbot desde dynamodb
    const chatbotConfig = await loadChatbotConfig();
    
    // clasificar que quiere hacer el usuario
    const classification = await classifyIntent(userMessage, { config: chatbotConfig });
    
    console.log("Intencion clasificada:", classification.intent);
    console.log("Parametros:", classification.params);
    
    // manejar la intencion clasificada
    let responseMessage = "";
    
    switch (classification.intent) {
      case "welcome_user":
        responseMessage = chatbotConfig.mensajeBienvenida;
        break;
        
      case `agendar_${chatbotConfig.tipo}`:
        responseMessage = await handleAgendar(classification.params, chatbotConfig);
        break;
        
      case `consultar_${chatbotConfig.nombrePlural}_disponibles`:
        responseMessage = await handleConsultarDisponibles(chatbotConfig);
        break;
        
      case "consultar_estado_doctor":
        responseMessage = await handleConsultarDoctor(classification.params, chatbotConfig);
        break;
        
      case `consultar_estado_${chatbotConfig.tipo}`:
        responseMessage = await handleConsultarEstadoBox(classification.params, chatbotConfig);
        break;
        
      case "error_servicio":
        responseMessage = "Lo siento, el servicio está temporalmente no disponible. Por favor, intenta de nuevo en unos minutos.";
        break;
        
      default:
        responseMessage = "Lo siento, no entendí tu solicitud. Por favor, intenta reformular tu pregunta.";
    }
    
    // generar xml para responder a twilio
    const twiml = generateTwiML(responseMessage);
    
    return {
      success: true,
      intent: classification.intent,
      response: responseMessage,
      twiml,
    };
    
  } catch (error) {
    console.error("Error procesando mensaje:", error);
    
    const errorMessage = "Lo siento, ocurrió un error al procesar tu mensaje. Por favor, intenta de nuevo.";
    const twiml = generateTwiML(errorMessage);
    
    return {
      success: false,
      error: error.message,
      response: errorMessage,
      twiml,
    };
  }
}

// maneja cuando el usuario quiere agendar un box
async function handleAgendar(params, config) {
  try {
    const disponibles = await getBoxesDisponibles();
    
    if (disponibles.length === 0) {
      return `Lo siento, no hay ${config.nombrePlural} disponibles en este momento.`;
    }
    
    // tomar el primer box disponible
    const box = disponibles[0];
    const hora = box.horaDisponible ? new Date(box.horaDisponible).toLocaleTimeString('es-CL') : "próxima hora disponible";
    const boxId = box.idbox || box.idBox;
    const url = `${config.urlBase}/info-box/${boxId}`;
    
    return `El ${config.nombreSingular} ${box.numero} está disponible hasta las ${hora}.\n\n¿Quieres hacer una reserva? Usa el siguiente link:\n${url}`;
    
  } catch (error) {
    console.error("Error en handleAgendar:", error);
    return `Ocurrió un error al buscar ${config.nombrePlural} disponibles. Por favor, intenta de nuevo.`;
  }
}

// maneja cuando el usuario quiere ver boxes disponibles
async function handleConsultarDisponibles(config) {
  try {
    const disponibles = await getBoxesDisponibles();
    
    if (disponibles.length === 0) {
      return `Lo siento, no hay ${config.nombrePlural} disponibles en este momento.`;
    }
    
    // mostrar maximo 5 boxes unicos
    const uniqueBoxes = [];
    const seen = new Set();
    
    for (let box of disponibles) {
      if (!seen.has(box.numero) && uniqueBoxes.length < 5) {
        seen.add(box.numero);
        uniqueBoxes.push(box);
      }
    }
    
    let message = `${config.nombrePlural.charAt(0).toUpperCase() + config.nombrePlural.slice(1)} disponibles:\n\n`;
    
    for (let box of uniqueBoxes) {
      const hora = box.horaDisponible ? new Date(box.horaDisponible).toLocaleTimeString('es-CL') : "Disponible";
      const boxId = box.idbox || box.idBox;
      const url = `${config.urlBase}/info-box/${boxId}`;
      message += `${config.nombreSingular.charAt(0).toUpperCase() + config.nombreSingular.slice(1)} ${box.numero}\n`;
      message += `   Disponible hasta: ${hora}\n`;
      message += `   Link: ${url}\n\n`;
    }
    
    return message;
    
  } catch (error) {
    console.error("Error en handleConsultarDisponibles:", error);
    return `Ocurrió un error al consultar ${config.nombrePlural} disponibles. Por favor, intenta de nuevo.`;
  }
}

// maneja consulta de doctor (pendiente de implementar)
async function handleConsultarDoctor(params, config) {
  return "La consulta de estado de doctores estara disponible proximamente.";
}

// maneja consulta de estado de un box especifico
async function handleConsultarEstadoBox(params, config) {
  try {
    const numeroBox = params.box || params[config.tipo];
    
    if (!numeroBox) {
      return `Por favor, especifica el número del ${config.nombreSingular} que deseas consultar.`;
    }
    
    // buscar el box en la bd
    const box = await getBoxByNumero(numeroBox);
    
    if (!box) {
      return `No se encontró el ${config.nombreSingular} ${numeroBox}.`;
    }
    
    // obtener el estado actual del box
    const estado = box.idestadobox ? await getEstadoBox(box.idestadobox) : null;
    const estadoNombre = estado?.estado || "Desconocido";
    
    const boxId = box.idbox || box.idBox;
    const url = `${config.urlBase}/info-box/${boxId}`;
    
    return `${config.nombreSingular.charAt(0).toUpperCase() + config.nombreSingular.slice(1)} ${box.numero}\n` +
           `   Estado: ${estadoNombre}\n` +
           `   Piso: ${box.piso || "N/A"}\n` +
           `   Pasillo: ${box.pasillo || "N/A"}\n\n` +
           `Ver más detalles: ${url}`;
    
  } catch (error) {
    console.error("Error en handleConsultarEstadoBox:", error);
    return `Ocurrió un error al consultar el estado del ${config.nombreSingular}. Por favor, intenta de nuevo.`;
  }
}

// obtiene boxes que NO tienen agenda activa en este momento
async function getBoxesDisponibles() {
  try {
    const ahora = new Date();
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    const finDia = new Date(hoy);
    finDia.setHours(23, 59, 59, 999);
    
    // traer todos los boxes de la bd
    const boxesCommand = new ScanCommand({
      TableName: config.dynamodb.tablas.box,
    });
    const boxesResult = await docClient.send(boxesCommand);
    const boxes = boxesResult.Items || [];
    
    // traer todas las agendas
    const agendasCommand = new ScanCommand({
      TableName: config.dynamodb.tablas.agenda,
    });
    const agendasResult = await docClient.send(agendasCommand);
    let agendas = agendasResult.Items || [];
    
    // filtrar solo agendas de hoy
    agendas = agendas.filter(agenda => {
      if (!agenda.horainicio) return false;
      const fechaAgenda = new Date(agenda.horainicio);
      return fechaAgenda >= hoy && fechaAgenda <= finDia;
    });
    
    // crear set de boxes que tienen agenda activa ahora
    const boxesOcupados = new Set();
    agendas.forEach(agenda => {
      const inicio = new Date(agenda.horainicio);
      const fin = agenda.horafin ? new Date(agenda.horafin) : new Date(inicio.getTime() + 60*60*1000);
      
      // si la agenda esta activa en este momento
      if (inicio <= ahora && fin >= ahora) {
        boxesOcupados.add(agenda.idBox || agenda.idbox);
      }
    });
    
    // retornar solo los boxes que no estan ocupados
    const boxesDisponibles = boxes.filter(box => {
      const boxId = box.idbox || box.idBox;
      return !boxesOcupados.has(boxId);
    });
    
    // agregar info de cuando estaran ocupados
    const boxesConInfo = boxesDisponibles.map(box => {
      const boxId = box.idbox || box.idBox;
      // buscar proxima agenda de este box
      const proximaAgenda = agendas
        .filter(a => (a.idBox || a.idbox) === boxId && new Date(a.horainicio) > ahora)
        .sort((a, b) => new Date(a.horainicio) - new Date(b.horainicio))[0];
      
      return {
        ...box,
        horaDisponible: proximaAgenda ? proximaAgenda.horainicio : null,
      };
    });
    
    return boxesConInfo;
    
  } catch (error) {
    console.error("Error obteniendo boxes disponibles:", error);
    return [];
  }
}

// busca un box por su numero
async function getBoxByNumero(numero) {
  try {
    const command = new ScanCommand({
      TableName: config.dynamodb.tablas.box,
      FilterExpression: "numero = :numero",
      ExpressionAttributeValues: {
        ":numero": parseInt(numero, 10),
      },
    });
    
    const result = await docClient.send(command);
    
    return result.Items && result.Items.length > 0 ? result.Items[0] : null;
    
  } catch (error) {
    console.error("Error buscando box:", error);
    return null;
  }
}

// obtiene el estado de un box desde la tabla estadobox
async function getEstadoBox(idEstado) {
  try {
    const command = new GetCommand({
      TableName: config.dynamodb.tablas.estadoBox,
      Key: {
        idestado: parseInt(idEstado, 10),
      },
    });
    
    const result = await docClient.send(command);
    
    return result.Item || null;
    
  } catch (error) {
    console.error("Error obteniendo estado de box:", error);
    return null;
  }
}

// envia una notificacion proactiva de whatsapp
export async function sendNotification(to, message) {
  try {
    const result = await sendWhatsAppMessage(to, message);
    
    return {
      success: result.success,
      messageSid: result.messageSid,
      error: result.error,
    };
    
  } catch (error) {
    console.error("Error enviando notificación:", error);
    return {
      success: false,
      error: error.message,
    };
  }
}

// notifica cambio de estado de un box a multiples destinatarios
export async function notifyBoxStateChange(box, nuevoEstado, recipients) {
  try {
    const config = await loadChatbotConfig();
    
    const message = `Actualización de ${config.nombreSingular}\n\n` +
                   `${config.nombreSingular.charAt(0).toUpperCase() + config.nombreSingular.slice(1)} ${box.numero}\n` +
                   `Nuevo estado: ${nuevoEstado}\n` +
                   `Piso: ${box.piso || "N/A"}\n` +
                   `Pasillo: ${box.pasillo || "N/A"}`;
    
    // enviar a todos en paralelo
    const results = await Promise.all(
      recipients.map(recipient => sendWhatsAppMessage(recipient, message))
    );
    
    const successful = results.filter(r => r.success).length;
    const failed = results.length - successful;
    
    return {
      success: true,
      sent: successful,
      failed,
      results,
    };
    
  } catch (error) {
    console.error("Error notificando cambio de estado:", error);
    return {
      success: false,
      error: error.message,
    };
  }
}

export default {
  processIncomingMessage,
  sendNotification,
  notifyBoxStateChange,
};
