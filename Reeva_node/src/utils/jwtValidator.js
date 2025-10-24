// validacion real de JWT con las claves publicas de cognito
import jwt from 'jsonwebtoken';
import jwkToPem from 'jwk-to-pem';
import { config } from '../config/index.js';
import Logger from './logger.js';

const logger = new Logger('JWT_VALIDATOR');

// cache para no pedir las claves todo el tiempo
let cacheJwks = null;
let tiempoCache = 0;
const DURACION_CACHE = 3600000; // 1 hora

// obtener las claves publicas de cognito
async function obtenerJWKS() {
  const ahora = Date.now();
  
  // usar cache si esta fresco
  if (cacheJwks && (ahora - tiempoCache) < DURACION_CACHE) {
    return cacheJwks;
  }

  try {
    const url = `${config.cognito.issuerUrl}/.well-known/jwks.json`;
    
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`Error obteniendo JWKS: ${response.statusText}`);
    }
    
    const jwks = await response.json();
    
    cacheJwks = jwks;
    tiempoCache = ahora;
    
    logger.info('JWKS obtenidas y cacheadas', { cantidadClaves: jwks.keys.length });
    
    return jwks;
  } catch (error) {
    logger.error('Error obteniendo JWKS', { error: error.message });
    throw error;
  }
}

// buscar la clave publica que corresponde al token
async function obtenerClavePublica(kid) {
  const jwks = await obtenerJWKS();
  const clave = jwks.keys.find(k => k.kid === kid);
  
  if (!clave) {
    throw new Error(`No se encontro clave publica para kid: ${kid}`);
  }
  
  return jwkToPem(clave);
}

// validar el token de verdad
export async function validarToken(token) {
  if (!token) {
    throw new Error('Token no proporcionado');
  }

  try {
    // decodificar header para sacar el kid
    const headerDecodificado = jwt.decode(token, { complete: true });
    
    if (!headerDecodificado) {
      throw new Error('Token invalido - no se pudo decodificar');
    }

    const { kid } = headerDecodificado.header;
    
    if (!kid) {
      throw new Error('Token invalido - falta kid en header');
    }

    // obtener la clave publica
    const clavePublica = await obtenerClavePublica(kid);

    // verificar el token con la clave
    const decodificado = jwt.verify(token, clavePublica, {
      issuer: config.cognito.issuerUrl,
      audience: config.cognito.userPoolClientId,
      algorithms: ['RS256'],
    });

    logger.debug('Token validado correctamente', { 
      sub: decodificado.sub,
      exp: decodificado.exp,
    });

    return decodificado;
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      logger.warn('Token expirado', { error: error.message });
      throw new Error('Token expirado');
    } else if (error.name === 'JsonWebTokenError') {
      logger.warn('Token invalido', { error: error.message });
      throw new Error('Token invalido');
    } else {
      logger.error('Error validando token', { error: error.message });
      throw error;
    }
  }
}

// middleware para validar jwt en requests
export function middlewareJWT(req, res, next) {
  const token = req.session?.user?.idToken || req.headers.authorization?.replace('Bearer ', '');

  if (!token) {
    return res.status(401).json({ ok: false, error: 'Token no proporcionado' });
  }

  validarToken(token)
    .then(decodificado => {
      req.user = decodificado;
      next();
    })
    .catch(error => {
      logger.warn('Autenticacion fallida', { 
        error: error.message,
        ruta: req.path,
      });
      
      // si expiro destruir la sesion
      if (req.session?.user && error.message.includes('expirado')) {
        req.session.destroy();
      }
      
      res.status(401).json({ ok: false, error: error.message });
    });
}

export default {
  validarToken,
  middlewareJWT,
};
