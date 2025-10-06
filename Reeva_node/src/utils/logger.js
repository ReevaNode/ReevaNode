// logger para todo el proyecto
import { config } from '../config/index.js';

const NIVELES = {
  ERROR: 0,
  WARN: 1,
  INFO: 2,
  DEBUG: 3,
};

const NIVEL_ACTUAL = NIVELES[config.app.logLevel.toUpperCase()] || NIVELES.INFO;

class Logger {
  constructor(contexto = 'APP') {
    this.contexto = contexto;
  }

  _log(nivel, mensaje, datos = {}) {
    if (NIVELES[nivel] > NIVEL_ACTUAL) {
      return;
    }

    const timestamp = new Date().toISOString();
    const entrada = {
      timestamp,
      nivel,
      contexto: this.contexto,
      mensaje,
      ...datos,
    };

    // en produccion mandar a cloudwatch
    const salida = JSON.stringify(entrada);
    
    switch (nivel) {
      case 'ERROR':
        console.error(salida);
        break;
      case 'WARN':
        console.warn(salida);
        break;
      default:
        console.log(salida);
    }
  }

  error(mensaje, datos = {}) {
    this._log('ERROR', mensaje, datos);
  }

  warn(mensaje, datos = {}) {
    this._log('WARN', mensaje, datos);
  }

  info(mensaje, datos = {}) {
    this._log('INFO', mensaje, datos);
  }

  debug(mensaje, datos = {}) {
    this._log('DEBUG', mensaje, datos);
  }

  // para metricas
  metrica(nombre, valor, unidad = 'Count', datos = {}) {
    this.info(`METRICA: ${nombre}`, {
      metrica: nombre,
      valor,
      unidad,
      ...datos,
    });
  }

  // para medir tiempos
  trace(operacion, duracionMs, datos = {}) {
    this.info(`TRACE: ${operacion}`, {
      operacion,
      duracionMs,
      ...datos,
    });
  }
}

// middleware para loggear requests
export function loggerRequest(req, res, next) {
  const logger = new Logger('HTTP');
  const inicio = Date.now();

  logger.info('Request entrante', {
    metodo: req.method,
    ruta: req.path,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
  });

  // cuando termine el request
  res.on('finish', () => {
    const duracion = Date.now() - inicio;
    
    logger.trace('Request completado', duracion, {
      metodo: req.method,
      ruta: req.path,
      status: res.statusCode,
      duracionMs: duracion,
    });

    // avisar si es muy lento
    if (duracion > 1000) {
      logger.warn('Request lento detectado', {
        metodo: req.method,
        ruta: req.path,
        duracionMs: duracion,
      });
    }
  });

  next();
}

// middleware para errores
export function loggerError(err, req, res, next) {
  const logger = new Logger('ERROR_HANDLER');
  
  logger.error('Error no manejado', {
    error: err.message,
    stack: err.stack,
    metodo: req.method,
    ruta: req.path,
    body: req.body,
    query: req.query,
  });

  // responder al cliente
  res.status(err.status || 500).json({
    ok: false,
    error: config.app.nodeEnv === 'production' 
      ? 'Error interno del servidor' 
      : err.message,
  });
}

export default Logger;
