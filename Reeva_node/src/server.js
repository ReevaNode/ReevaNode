// arrancar el servidor
import http from 'http';
import app from './app.js';
import { config } from './config/index.js';
import Logger from './utils/logger.js';
import { initWebSocket } from './services/websocketService.js';

const logger = new Logger('SERVER');
const PORT = config.app.port;

// crear servidor http para compartir con websocket
const server = http.createServer(app);

// inicializar websocket
initWebSocket(server);

server.listen(PORT, () => {
  logger.info(`Servidor iniciado correctamente`, {
    port: PORT,
    ambiente: config.app.nodeEnv,
    stage: config.app.stage,
  });
  console.log(`\n✓ API escuchando en http://localhost:${PORT}`);
  console.log(`✓ WebSocket activo en ws://localhost:${PORT}`);
  console.log(`✓ Ambiente: ${config.app.nodeEnv}`);
  console.log(`✓ Region AWS: ${config.aws.region}\n`);
});
