// arrancar el servidor
import app from './app.js';
import { config } from './config/index.js';
import Logger from './utils/logger.js';

const logger = new Logger('SERVER');
const PORT = config.app.port;

app.listen(PORT, () => {
  logger.info(`Servidor iniciado correctamente`, {
    port: PORT,
    ambiente: config.app.nodeEnv,
    stage: config.app.stage,
  });
  console.log(`\n✓ API escuchando en http://localhost:${PORT}`);
  console.log(`✓ Ambiente: ${config.app.nodeEnv}`);
  console.log(`✓ Region AWS: ${config.aws.region}\n`);
});
