// services/websocketService.js
import { WebSocketServer } from 'ws';
import Logger from '../utils/logger.js';

const logger = new Logger('WEBSOCKET');

let wss = null;

// inicializar websocket server
export function initWebSocket(server) {
  wss = new WebSocketServer({ server });

  wss.on('connection', (ws, req) => {
    const clientIp = req.socket.remoteAddress;
    logger.info('nuevo cliente conectado', { ip: clientIp });

    ws.on('close', () => {
      logger.info('cliente desconectado', { ip: clientIp });
    });

    ws.on('error', (error) => {
      logger.error('error en websocket', { error: error.message, ip: clientIp });
    });
  });

  logger.info('websocket server inicializado');
}

// broadcast a todos los clientes conectados
export function broadcastBoxUpdate(data) {
  if (!wss) {
    logger.warn('websocket server no inicializado, no se puede hacer broadcast');
    return;
  }

  const message = JSON.stringify(data);
  let clientesNotificados = 0;

  wss.clients.forEach((client) => {
    if (client.readyState === 1) { // 1 = OPEN
      client.send(message);
      clientesNotificados++;
    }
  });

  logger.info('broadcast enviado', { 
    box_id: data.box_id, 
    estado: data.new_state_text,
    clientes: clientesNotificados 
  });
}

export default { initWebSocket, broadcastBoxUpdate };
