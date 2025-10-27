import express from "express";
const router = express.Router();

router.post("/update-session-preferences", (req, res) => {
  const { idioma, aspecto } = req.body;
  if (idioma) req.session.userLang = idioma;
  if (aspecto) req.session.userTheme = aspecto;
  res.json({ ok: true });
});

export default router;
