export default function requireAuth(req, res, next) {
  console.log("=== requireAuth Debug ===");
  console.log("Session exists:", !!req.session);
  console.log("User in session:", req.session?.user);
  console.log("IdToken exists:", !!req.session?.user?.idToken);
  
  if (!req.session?.user || !req.session.user.idToken) {
    req.flash("error", "Falta token de autorización");1
    return res.redirect("/login");
  }
  next();
}