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

    // renderizar vista
    res.render("Bienvenida-y-Opciones", {
      user: req.session.user,
      activePage: 'bienvenida',
      // parametrización
      nombreEmpresa: nombreEmpresa,
      nombreNivel2: req.parametrizacionLabels?.nombreNivel2 || 'Cama',
      nombreNivel2Plural: req.parametrizacionLabels?.nombreNivel2Plural || 'Camas'
    });

  } catch (error) {
    logger.error('Error en ruta bienvenida:', error);
    
    // Graceful Degradation: renderizar pagina con mensaje de error en logs
    res.render("Bienvenida-y-Opciones", {
      user: req.session.user,
      activePage: 'bienvenida'
    });
  }
});

export default router;
