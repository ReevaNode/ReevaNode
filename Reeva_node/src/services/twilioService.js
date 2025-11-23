// src/services/twilioService.js
// servicio para enviar mensajes de whatsapp con twilio

import twilio from "twilio";
import { config } from "../config/index.js";
import { CircuitBreaker } from "../utils/resilience.js";

let twilioClient = null;

// inicializa el cliente de twilio solo una vez
function getTwilioClient() {
  if (!twilioClient) {
    if (!config.twilio.accountSid || !config.twilio.authToken) {
      throw new Error("Credenciales de Twilio no configuradas");
    }
    
    twilioClient = twilio(config.twilio.accountSid, config.twilio.authToken);
  }
  return twilioClient;
}

// circuit breaker para evitar saturar la api de twilio
const twilioCircuitBreaker = new CircuitBreaker({
  name: "twilio-api",
  failureThreshold: 5,
  resetTimeout: 60000,
  timeout: 10000,
});

// envia un mensaje de whatsapp a un numero
export async function sendWhatsAppMessage(to, message, options = {}) {
  const client = getTwilioClient();
  
  try {
    // formatear numero con prefijo whatsapp:
    const toNumber = to.startsWith("whatsapp:") ? to : `whatsapp:${to}`;
    const fromNumber = options.from || config.twilio.whatsappFrom;
    
    console.log("Enviando WhatsApp a:", toNumber);
    console.log("Mensaje:", message.substring(0, 50) + "...");
    
    const result = await twilioCircuitBreaker.execute(async () => {
      return await client.messages.create({
        from: fromNumber,
        to: toNumber,
        body: message,
        ...options.twilioOptions,
      });
    });
    
    console.log("Mensaje enviado. SID:", result.sid);
    
    return {
      success: true,
      messageSid: result.sid,
      status: result.status,
      to: toNumber,
      from: fromNumber,
    };
    
  } catch (error) {
    console.error("Error enviando mensaje de WhatsApp:", error);
    
    // si el circuit breaker esta abierto, retornar error temporal
    if (error.message.includes("Circuit breaker is OPEN")) {
      return {
        success: false,
        error: "Servicio de mensajería temporalmente no disponible",
        circuitBreakerOpen: true,
      };
    }
    
    return {
      success: false,
      error: error.message,
      errorCode: error.code,
    };
  }
}

// envia whatsapp a multiples destinatarios
export async function sendBulkWhatsAppMessages(recipients, message, options = {}) {
  console.log(`Enviando ${recipients.length} mensajes de WhatsApp...`);
  
  const results = {
    total: recipients.length,
    sent: 0,
    failed: 0,
    errors: [],
  };
  
  // enviar en batches para no saturar la api
  const batchSize = options.batchSize || 5;
  for (let i = 0; i < recipients.length; i += batchSize) {
    const batch = recipients.slice(i, i + batchSize);
    
    const promises = batch.map(async (recipient) => {
      const result = await sendWhatsAppMessage(recipient, message, options);
      
      if (result.success) {
        results.sent++;
      } else {
        results.failed++;
        results.errors.push({
          recipient,
          error: result.error,
        });
      }
      
      return result;
    });
    
    await Promise.all(promises);
    
    // pausa entre batches para evitar rate limiting
    if (i + batchSize < recipients.length) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
  
  console.log(`Envio masivo completado: ${results.sent} exitosos, ${results.failed} fallidos`);
  
  return results;
}

// genera xml de respuesta para twilio webhook
export function generateTwiML(message, additionalMessages = []) {
  let twiml = `<Response>`;
  
  twiml += `<Message>${escapeXml(message)}</Message>`;
  
  additionalMessages.forEach(msg => {
    twiml += `<Message>${escapeXml(msg)}</Message>`;
  });
  
  twiml += `</Response>`;
  
  return twiml;
}

// escapa caracteres especiales para xml
function escapeXml(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

// parsea el body del webhook de twilio
export function parseWebhookBody(body, isBase64 = false) {
  try {
    let bodyStr = body;
    if (isBase64) {
      bodyStr = Buffer.from(body, 'base64').toString('utf8');
    }
    
    // parsear formato url-encoded
    const params = new URLSearchParams(bodyStr);
    const parsed = {};
    
    for (const [key, value] of params.entries()) {
      parsed[key] = decodeURIComponent(value);
    }
    
    if (parsed.ChannelMetadata) {
      try {
        parsed.ChannelMetadata = JSON.parse(parsed.ChannelMetadata);
      } catch (e) {}
    }
    
    return {
      from: parsed.From || null,
      to: parsed.To || null,
      body: parsed.Body || "",
      profileName: parsed.ProfileName || null,
      messageSid: parsed.MessageSid || null,
      numMedia: parseInt(parsed.NumMedia || "0", 10),
      metadata: parsed.ChannelMetadata || null,
    };
    
  } catch (error) {
    console.error("Error parseando webhook de Twilio:", error);
    return {
      error: error.message,
      rawBody: body,
    };
  }
}

// valida que el webhook venga de twilio
export function validateWebhookSignature(signature, url, params) {
  const client = getTwilioClient();
  
  try {
    return twilio.validateRequest(
      config.twilio.authToken,
      signature,
      url,
      params
    );
  } catch (error) {
    console.error("Error validando firma de webhook:", error);
    return false;
  }
}

// verifica que twilio este funcionando
export async function checkHealth() {
  try {
    const client = getTwilioClient();
    
    // hacer un request simple para validar credenciales
    await client.api.accounts(config.twilio.accountSid).fetch();
    
    return {
      status: "healthy",
      accountSid: config.twilio.accountSid,
      circuitBreakerState: twilioCircuitBreaker.getState(),
    };
  } catch (error) {
    return {
      status: "unhealthy",
      error: error.message,
      circuitBreakerState: twilioCircuitBreaker.getState(),
    };
  }
}

export default {
  sendWhatsAppMessage,
  sendBulkWhatsAppMessages,
  generateTwiML,
  parseWebhookBody,
  validateWebhookSignature,
  checkHealth,
};
