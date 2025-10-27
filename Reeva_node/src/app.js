// src/app.js
import dotenv from "dotenv";
dotenv.config();

import express from "express";
import cors from "cors";
import morgan from "morgan";
import path from "path";
import { fileURLToPath } from "url";
import session from "express-session";
import flash from "connect-flash";
import cookieParser from "cookie-parser";
import i18n from "./config/i18n.js";

import requireAuth from "./middlewares/requireAuth.js";
import { config, validarConfig } from "./config/index.js";
import { loggerRequest, loggerError } from "./utils/logger.js";

// rutas
import authRouter from "./routes/auth.js";
import bienvenidaRouter from "./routes/bienvenida.js";
import dashboardRouter from "./routes/dashboard.js";
import adminBDDRouter from "./routes/adminBDD.js";
import agendaRouter from "./routes/agenda.js";
import matrizBoxRouter from "./routes/matrizBox.js";
import languageRouter from "./routes/language.js"; 

const app = express();

// paths
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ===== Middlewares base =====
app.use(cookieParser());
app.use(i18n.init);

app.use(session({
  secret: config.seguridad.sessionSecret,
  resave: false,
  saveUninitialized: false,
  rolling: true,
  name: 'reeva.sid',
  cookie: {
    maxAge: config.seguridad.sessionMaxAge,
    httpOnly: true,
    secure: config.seguridad.sessionSecure,
    sameSite: config.seguridad.sessionSameSite,
    path: '/',
  }
}));

app.use(flash());

// middlewares
app.use(cors({
  origin: config.cors.origin,
  credentials: true,
}));

app.use((req, res, next) => {
  res.locals.user = req.session.user || null;

  // Preferencias del usuario
  const lang = req.session.userLang || 'es';
  const theme = req.session.userTheme || 'claro';

  i18n.setLocale(req, lang);
  res.locals.__ = res.__; 

  res.locals.userLang = lang;
  res.locals.userTheme = theme;

  // Variables de entorno para frontend
  const authApiBase = process.env.AUTH_API_BASE || config.api?.authBase;
  res.locals.AUTH_API_BASE = authApiBase;

  // Log de sesion
  if (req.session.user) {
    console.log('Sesión actual:', {
      email: req.session.user.email,
      idioma: lang,
      aspecto: theme,
      hasToken: !!req.session.user.idToken
    });
  }

  if (!process.env.AUTH_API_BASE) {
    console.warn('AUTH_API_BASE no está definida en .env, usando fallback:', authApiBase);
  }

  next();
});

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(morgan("dev"));
app.use(loggerRequest);

app.use(express.static(path.join(__dirname, "public")));
app.use("/languages", express.static(path.join(__dirname, "languages")));

app.set("views", path.join(__dirname, "views"));
app.set("view engine", "ejs");

app.use("/", authRouter);
app.use("/", requireAuth, bienvenidaRouter);
app.use("/", requireAuth, dashboardRouter);
app.use("/", requireAuth, adminBDDRouter);
app.use("/", requireAuth, agendaRouter);
app.use("/", requireAuth, matrizBoxRouter);
app.use("/", languageRouter); 

// ===== 404 =====
app.use((req, res) => {
  res.status(404).send("Página no encontrada");
});

// ===== Manejo de errores =====
app.use(loggerError);

export default app;