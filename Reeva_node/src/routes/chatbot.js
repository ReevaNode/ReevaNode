// src/routes/chatbot.js
// endpoints del chatbot de whatsapp

import express from "express";
import { parseWebhookBody, validateWebhookSignature } from "../services/twilioService.js";
import { processIncomingMessage, sendNotification } from "../services/chatbotService.js";
import { checkHealth as checkOpenAIHealth } from "../services/openaiService.js";
import { checkHealth as checkTwilioHealth } from "../services/twilioService.js";
import { config } from "../config/index.js";
import requireAuth from "../middlewares/requireAuth.js";

const router = express.Router();

// webhook de twilio para recibir mensajes de whatsapp
// este endpoint es publico (no requiere auth)
router.post("/chatbot/webhook", async (req, res) => {
  try {
    console.log("Webhook recibido de Twilio");
    
    // validar firma de twilio para seguridad
    if (config.twilio.validateSignature) {
      const signature = req.headers['x-twilio-signature'];
      const url = `${req.protocol}://${req.get('host')}${req.originalUrl}`;
      
      const isValid = validateWebhookSignature(signature, url, req.body);
      
      if (!isValid) {
        console.error("Firma de webhook invalida");
        return res.status(403).send("Forbidden");
      }
    }
    
    // express ya parsea el body automaticamente
    const webhookData = {
      from: req.body.From || null,
      to: req.body.To || null,
      body: req.body.Body || "",
      profileName: req.body.ProfileName || null,
      messageSid: req.body.MessageSid || null,
      numMedia: parseInt(req.body.NumMedia || "0", 10),
      metadata: req.body.ChannelMetadata || null,
    };
    
    console.log("Mensaje de WhatsApp:", webhookData.from);
    console.log("Contenido:", webhookData.body);
    
    // procesar mensaje con chatbot
    const result = await processIncomingMessage(webhookData);
    
    // responder con xml de twilio
    res.set('Content-Type', 'application/xml');
    res.send(result.twiml);
    
  } catch (error) {
    console.error("Error en webhook:", error);
    
    // responder con mensaje de error
    const errorTwiml = `<Response><Message>Lo siento, ocurrio un error. Por favor, intenta de nuevo.</Message></Response>`;
    res.set('Content-Type', 'application/xml');
    res.status(500).send(errorTwiml);
  }
});

// endpoint para enviar notificaciones manuales
// requiere autenticacion
router.post("/chatbot/send", requireAuth, async (req, res) => {
  try {
    const { to, message } = req.body;
    
    if (!to || !message) {
      return res.status(400).json({
        success: false,
        error: "Se requieren los campos 'to' y 'message'",
      });
    }
    
    console.log("Enviando notificacion manual a:", to);
    
    const result = await sendNotification(to, message);
    
    res.json(result);
    
  } catch (error) {
    console.error("Error enviando notificacion:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// health check para verificar estado del chatbot
router.get("/chatbot/health", async (req, res) => {
  try {
    const [openaiHealth, twilioHealth] = await Promise.all([
      checkOpenAIHealth(),
      checkTwilioHealth(),
    ]);
    
    const isHealthy = openaiHealth.status === "healthy" && twilioHealth.status === "healthy";
    
    res.status(isHealthy ? 200 : 503).json({
      status: isHealthy ? "healthy" : "unhealthy",
      services: {
        openai: openaiHealth,
        twilio: twilioHealth,
      },
      timestamp: new Date().toISOString(),
    });
    
  } catch (error) {
    console.error("Error en health check:", error);
    res.status(503).json({
      status: "unhealthy",
      error: error.message,
      timestamp: new Date().toISOString(),
    });
  }
});

// endpoint de testing para desarrollo
// simula un mensaje de whatsapp
router.post("/chatbot/test", async (req, res) => {
  try {
    const { message } = req.body;
    
    if (!message) {
      return res.status(400).json({
        success: false,
        error: "Se requiere el campo 'message'",
      });
    }
    
    // simular datos de webhook
    const webhookData = {
      from: "whatsapp:+56900000000",
      to: config.twilio.whatsappFrom,
      body: message,
      profileName: "Test User",
      messageSid: "TEST_MESSAGE_SID",
    };
    
    const result = await processIncomingMessage(webhookData);
    
    res.json({
      success: true,
      intent: result.intent,
      response: result.response,
      twiml: result.twiml,
    });
    
  } catch (error) {
    console.error("Error en test:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

export default router;
