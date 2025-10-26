// middleware para verificar permisos de administrador
import Logger from '../utils/logger.js';

const logger = new Logger('ADMIN_MIDDLEWARE');

export function requireAdmin(req, res, next) {
  const user = req.session?.user;

  // verificar autenticacion
  if (!user) {
    logger.warn('intento de acceso sin autenticacion');
    req.flash('error', 'debes iniciar sesion para acceder a esta pagina');
    return res.redirect('/login');
  }

  // verificar permiso de administrador
  if (!user.permissions || !user.permissions.includes('admin.database')) {
    logger.warn('intento de acceso sin permisos de admin', {
      userId: user.sub,
      email: user.email,
      permissions: user.permissions
    });
    
    return res.status(403).render('Bienvenida-y-Opciones', {
      user,
      next_appointment_date: null,
      next_appointment_time: null,
      tipo_consulta: null,
      systemDegraded: false,
      fromCache: false,
      warningMessage: 'no tienes permisos para acceder a esta seccion'
    });
  }

  logger.debug('acceso admin autorizado', {
    userId: user.sub,
    email: user.email
  });

  next();
}
