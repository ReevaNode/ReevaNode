export function requirePermission(permission) {
  return (req, res, next) => {
    const user = req.session?.user;

    if (!user) {
      req.flash("error", "Debes iniciar sesión para acceder a esta página");
      return res.redirect("/login");
    }

    if (!user.permissions || !user.permissions.includes(permission)) {
      console.warn(`Usuario ${user.email} no tiene el permiso ${permission}`);
      return res.render("Bienvenida-y-Opciones", { user }); 
    }

    next();
  };
}
