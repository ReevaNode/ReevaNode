// middleware para verificar permisos
export function requirePermission(permiso) {
  return (req, res, next) => {
    const user = req.session?.user;

    if (!user) {
      if (req.session) {
        req.flash("error", "Debes iniciar sesion para acceder a esta pagina");
      }
      return res.redirect("/login");
    }

    if (!user.permissions || !user.permissions.includes(permiso)) {
      console.warn(`Usuario ${user.email} no tiene el permiso ${permiso}`);
      return res.render("Bienvenida-y-Opciones", {
        user,
        next_appointment_date: null,
        next_appointment_time: null,
        tipo_consulta: null,
        warningMessage: null,
        systemDegraded: false,
        fromCache: false
      });
    }

    next();
  };
}
