// Middleware de no-cache para proteger rutas autenticadas
export default function noCache(req, res, next) {
  // Solo aplicar no-cache a rutas que no sean static files o assets
  if (!req.path.includes('/css/') && 
      !req.path.includes('/js/') && 
      !req.path.includes('/images/')) {
    res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');
  }
  next();
}
