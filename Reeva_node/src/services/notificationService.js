import { SNSClient, PublishCommand } from "@aws-sdk/client-sns";
import dayjs from "dayjs";

const snsClient = new SNSClient({ region: process.env.AWS_REGION || "us-east-1" });

/**
 * Enviar notificacion de evento de autenticacion
 * @param {string} eventType - 'LOGIN' o 'LOGOUT'
 * @param {Object} userData - Datos del usuario
 */
export async function sendAuthNotification(eventType, userData) {
  try {
    const timestamp = dayjs().format('DD/MM/YYYY HH:mm:ss');
    const eventTypeText = eventType === 'LOGIN' ? 'INICIO DE SESION' : 'CIERRE DE SESION';
    
    const message = {
      eventType,
      timestamp,
      user: {
        email: userData.email,
        username: userData.username,
        roles: userData.roles || []
      },
      metadata: {
        userAgent: userData.userAgent || 'Unknown',
        ip: userData.ip || 'Unknown'
      }
    };

    const subject = `🚨 REEVA - ${eventTypeText} Detectado`;
    
    const messageBody = `
SISTEMA REEVA - NOTIFICACION DE SEGURIDAD

EVENTO: ${eventTypeText}
FECHA/HORA: ${timestamp}

USUARIO:
   Email: ${userData.email}
   Username: ${userData.username}
   Roles: ${userData.roles?.join(', ') || 'Sin roles'}

DETALLES TECNICOS:
   User Agent: ${userData.userAgent || 'No disponible'}
   IP: ${userData.ip || 'No disponible'}

---
Sistema de Monitoreo REEVA
Mensaje automatico - No responder
`;

    const publishCommand = new PublishCommand({
      TopicArn: process.env.SNS_TOPIC_ARN,
      Message: messageBody,
      Subject: subject,
      MessageAttributes: {
        eventType: {
          DataType: 'String',
          StringValue: eventType
        },
        userEmail: {
          DataType: 'String', 
          StringValue: userData.email
        },
        timestamp: {
          DataType: 'String',
          StringValue: timestamp
        }
      }
    });

    const result = await snsClient.send(publishCommand);
    console.log(`Notificacion ${eventType} enviada exitosamente:`, result.MessageId);
    
    return { success: true, messageId: result.MessageId };
    
  } catch (error) {
    console.error(`Error enviando notificacion ${eventType}:`, error);
    return { success: false, error: error.message };
  }
}

/**
 * Enviar notificacion de error critico
 * @param {string} errorType - Tipo de error
 * @param {Object} errorData - Datos del error
 */
export async function sendErrorNotification(errorType, errorData) {
  try {
    const timestamp = dayjs().format('DD/MM/YYYY HH:mm:ss');
    
    const messageBody = `
🚨 SISTEMA REEVA - ERROR CRITICO

TIPO DE ERROR: ${errorType}
FECHA/HORA: ${timestamp}

DETALLES:
${JSON.stringify(errorData, null, 2)}

---
Sistema de Monitoreo REEVA
Requiere atencion inmediata
`;

    const publishCommand = new PublishCommand({
      TopicArn: process.env.SNS_TOPIC_ARN,
      Message: messageBody,
      Subject: `🚨 REEVA - Error Critico: ${errorType}`,
      MessageAttributes: {
        eventType: {
          DataType: 'String',
          StringValue: 'ERROR'
        },
        errorType: {
          DataType: 'String',
          StringValue: errorType
        },
        timestamp: {
          DataType: 'String',
          StringValue: timestamp
        }
      }
    });

    const result = await snsClient.send(publishCommand);
    console.log(`Notificacion de error enviada:`, result.MessageId);
    
    return { success: true, messageId: result.MessageId };
    
  } catch (error) {
    console.error(`Error enviando notificacion de error:`, error);
    return { success: false, error: error.message };
  }
}

