// src/services/openaiService.js
// servicio para clasificar intenciones del usuario con openai

import OpenAI from "openai";
import { config } from "../config/index.js";
import { CircuitBreaker } from "../utils/resilience.js";
import { generateSystemPrompt, normalizeInput, loadChatbotConfig } from "../utils/promptManager.js";

// cliente de openai (singleton)
let openaiClient = null;

// inicializa el cliente solo una vez
function getOpenAIClient() {
  if (!openaiClient) {
    if (!config.openai.apiKey) {
      throw new Error("OpenAI API Key no configurada");
    }
    
    openaiClient = new OpenAI({
      apiKey: config.openai.apiKey,
    });
  }
  return openaiClient;
}

// circuit breaker para no saturar la api de openai
const openaiCircuitBreaker = new CircuitBreaker({
  name: "openai-api",
  failureThreshold: 3,
  resetTimeout: 60000,
  timeout: 30000,
});

// clasifica la intencion del usuario usando gpt-4o-mini
// retorna un json con intent y params
export async function classifyIntent(userInput, context = {}) {
  const client = getOpenAIClient();
  
  try {
    // cargar config y generar prompt
    const chatbotConfig = context.config || await loadChatbotConfig();
    const userContent = normalizeInput(userInput);
    const systemPrompt = generateSystemPrompt(chatbotConfig, context.datosActuales);
    
    console.log("Clasificando intencion del usuario...");
    console.log("Input:", userContent);
    
    const response = await openaiCircuitBreaker.execute(async () => {
      return await client.chat.completions.create({
        model: config.openai.model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userContent },
        ],
        temperature: config.openai.temperature,
        max_tokens: config.openai.maxTokens,
      });
    });
    
    const result = response.choices?.[0]?.message?.content ?? "";
    
    console.log("Respuesta de OpenAI:", result);
    
    // parsear la respuesta json
    try {
      const json = JSON.parse(result);
      return json;
    } catch (parseError) {
      console.error("Error al parsear JSON de OpenAI:", result);
      throw new Error("Respuesta de OpenAI no es un JSON valido");
    }
    
  } catch (error) {
    console.error("Error en classifyIntent:", error);
    
    // si el circuit breaker esta abierto, retornar error generico
    if (error.message.includes("Circuit breaker is OPEN")) {
      console.warn("OpenAI no disponible, usando intencion por defecto");
      return {
        intent: "error_servicio",
        params: {},
        error: "Servicio temporalmente no disponible",
      };
    }
    
    throw error;
  }
}

// genera una respuesta de texto libre (no clasificacion)
export async function generateResponse(prompt, options = {}) {
  const client = getOpenAIClient();
  
  try {
    const response = await openaiCircuitBreaker.execute(async () => {
      return await client.chat.completions.create({
        model: options.model || config.openai.model,
        messages: [
          { role: "system", content: options.systemPrompt || "Eres un asistente util y conciso." },
          { role: "user", content: prompt },
        ],
        temperature: options.temperature || config.openai.temperature,
        max_tokens: options.maxTokens || config.openai.maxTokens,
      });
    });
    
    return response.choices?.[0]?.message?.content ?? "";
    
  } catch (error) {
    console.error("Error en generateResponse:", error);
    throw error;
  }
}

// verifica que openai este funcionando
export async function checkHealth() {
  try {
    const client = getOpenAIClient();
    
    // hacer un request minimo para verificar
    await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: "test" }],
      max_tokens: 5,
    });
    
    return {
      status: "healthy",
      circuitBreakerState: openaiCircuitBreaker.getState(),
    };
  } catch (error) {
    return {
      status: "unhealthy",
      error: error.message,
      circuitBreakerState: openaiCircuitBreaker.getState(),
    };
  }
}

export default {
  classifyIntent,
  generateResponse,
  checkHealth,
};
