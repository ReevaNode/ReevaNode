import express from "express";
const router = express.Router();

router.post("/update-session-preferences", (req, res) => {
  const { idioma, aspecto } = req.body;
  
  if (idioma) req.session.userLang = idioma;
  if (aspecto) req.session.userTheme = aspecto;
  
  req.session.save((err) => {
    if (err) {
      console.error('Error al guardar sesión:', err);
      return res.status(500).json({ ok: false, error: 'Error al guardar sesión' });
    }
    res.json({ ok: true });
  });
});

export default router;