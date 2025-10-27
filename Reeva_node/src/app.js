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
import requireAuth from "./middlewares/requireAuth.js";
import { config, validarConfig } from "./config/index.js";
import { loggerRequest, loggerError } from "./utils/logger.js";
import Logger from "./utils/logger.js";

// rutas
import authRouter from "./routes/auth.js";
import bienvenidaRouter from "./routes/bienvenida.js";
import dashboardRouter from "./routes/dashboard.js";
import adminBDDRouter from "./routes/adminBDD.js";
import agendaRouter from "./routes/agenda.js";
import matrizBoxRouter from "./routes/matrizBox.js";

const app = express();

// paths
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// config de sesion segura
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
  // Usuario
  res.locals.user = req.session.user || null;
  
  // Preferencias de personalización con valores por defecto
  res.locals.userLang = req.session.userLang || 'es';
  res.locals.userTheme = req.session.userTheme || 'claro';
  
  // Variables de entorno necesarias en el frontend
  const authApiBase = process.env.AUTH_API_BASE || config.api?.authBase;
  res.locals.AUTH_API_BASE = authApiBase;
  
  // Debug detallado (puedes comentar despues de verificar)
  if (req.session.user) {
    console.log('Sesión actual:', {
      email: req.session.user.email,
      idioma: res.locals.userLang,
      aspecto: res.locals.userTheme,
      hasToken: !!req.session.user.idToken
    });
  }
  
  // Advertencia si falta AUTH_API_BASE
  if (!process.env.AUTH_API_BASE) {
    console.warn('AUTH_API_BASE no está definida en .env, usando fallback:', authApiBase);
  }
  
  next();
});

app.use(express.json({ limit: '50mb' })); // aumentar limite para crear multiples agendas
app.use(express.urlencoded({ extended: true, limit: '50mb' })); 
app.use(morgan("dev"));
app.use(loggerRequest); 

// archivos estáticos
app.use(express.static(path.join(__dirname, "public")));

// motor de vistas
app.set("views", path.join(__dirname, "views"));
app.set("view engine", "ejs");

// rutas
app.use("/", authRouter);
app.use("/", requireAuth, bienvenidaRouter);
app.use("/", requireAuth, dashboardRouter);
app.use("/", requireAuth, adminBDDRouter);
app.use("/", requireAuth, agendaRouter);
app.use("/", requireAuth, matrizBoxRouter);

// 404
app.use((req, res) => {
  res.status(404).send("Pagina no encontrada");
});

// manejo de errores
app.use(loggerError);

export default app;