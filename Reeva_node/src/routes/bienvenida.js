// ruta de bienvenida
import { Router } from "express";
import { requirePermission } from "../middlewares/requirePermission.js";
import checkEmpresas from "../middlewares/checkEmpresas.js";
import Logger from "../utils/logger.js";

const router = Router();
const logger = new Logger("BIENVENIDA");

router.get("/bienvenida", requirePermission("bienvenidos.read"), checkEmpresas, async (req, res) => {
  if (!req.tieneEmpresas) {
    logger.info('Usuario sin empresas, redirigiendo a parametrización');
    return res.redirect('/parametrizacion');
  }

  try {
    // Obtener empresa activa
    const empresas = req.empresas || [];
    const empresaActiva = empresas.find(e => e.activa === 1 || e.activa === '1') || empresas[0];
    const nombreEmpresa = empresaActiva?.nombre || 'Empresa';
    
    logger.info(`Renderizando bienvenida para empresa: ${nombreEmpresa}`);
    logger.info(`Parametrización cargada:`, res.locals.parametrizacion);

    // renderizar vista
    res.render("Bienvenida-y-Opciones", {
      user: req.session.user,
      activePage: 'bienvenida',
      // parametrización desde middleware loadParametrizacion
      nombreEmpresa: nombreEmpresa,
      nombreNivel1: res.locals.parametrizacion?.nombreNivel1 || 'Pasillo',
      nombreNivel2: res.locals.parametrizacion?.nombreNivel2 || 'Mesa',
      nombreNivel3: res.locals.parametrizacion?.nombreNivel3 || 'Ocupante',
      nombreNivel4: res.locals.parametrizacion?.nombreNivel4 || 'Elemento',
      // Labels pluralizados
      nombreNivel1Plural: res.locals.parametrizacionLabels?.nivel1Plural || 'Pasillos',
      nombreNivel2Plural: res.locals.parametrizacionLabels?.nivel2Plural || 'Mesas',
      nombreNivel3Plural: res.locals.parametrizacionLabels?.nivel3Plural || 'Ocupantes',
      nombreNivel4Plural: res.locals.parametrizacionLabels?.nivel4Plural || 'Elementos',
      // Pasar también la parametrización completa
      parametrizacion: res.locals.parametrizacion
    });

  } catch (error) {
    logger.error('Error en ruta bienvenida:', error);
    
    // Graceful Degradation: renderizar pagina con mensaje de error en logs
    res.render("Bienvenida-y-Opciones", {
      user: req.session.user,
      activePage: 'bienvenida',
      nombreEmpresa: 'Empresa',
      nombreNivel1: 'Pasillo',
      nombreNivel2: 'Mesa',
      nombreNivel3: 'Ocupante',
      nombreNivel4: 'Elemento',
      nombreNivel1Plural: 'Pasillos',
      nombreNivel2Plural: 'Mesas',
      nombreNivel3Plural: 'Ocupantes',
      nombreNivel4Plural: 'Elementos'
    });
  }
});

export default router;
