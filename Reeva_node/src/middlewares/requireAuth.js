// middleware para verificar que el usuario este autenticado
import { validarToken } from "../utils/jwtValidator.js";
import Logger from "../utils/logger.js";

const logger = new Logger('AUTH_MIDDLEWARE');

export default async function requireAuth(req, res, next) {
  logger.debug('Verificando autenticacion', { ruta: req.path });
  
  if (!req.session?.user || !req.session.user.idToken) {
    logger.warn('Acceso denegado - sin token', { ruta: req.path });
    req.flash("error", "Debes iniciar sesion para acceder");
    return res.redirect("/login");
  }

  try {
    // validar token de verdad
    const decodificado = await validarToken(req.session.user.idToken);
    
    // agregar info del usuario al request
    req.user = decodificado;
    
    logger.debug('Autenticacion exitosa', { 
      sub: decodificado.sub,
      ruta: req.path,
    });
    
    next();
  } catch (error) {
    logger.warn('Token invalido o expirado', { 
      error: error.message,
      ruta: req.path,
    });
    
    // destruir sesion si el token no es valido
    req.session.destroy();
    req.flash("error", "Sesion invalida o expirada");
    return res.redirect("/login");
  }
}