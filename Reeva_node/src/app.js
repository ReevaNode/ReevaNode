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
  name: 'reeva.sid', // nombre custom para ocultar que es express
  cookie: {
    maxAge: config.seguridad.sessionMaxAge,
    httpOnly: true, // contra XSS
    secure: config.seguridad.sessionSecure, // solo HTTPS en prod
    sameSite: config.seguridad.sessionSameSite, // contra CSRF
    path: '/',
  }
}));

app.use(flash());

// middlewares
app.use(cors({
  origin: config.cors.origin,
  credentials: true,
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true })); 
app.use(morgan("dev"));
app.use(loggerRequest); // logger custom

// archivos estaticos
app.use(express.static(path.join(__dirname, "public")));

// motor de vistas
app.set("views", path.join(__dirname, "views"));
app.set("view engine", "ejs");

// rutas
app.use("/", authRouter);
app.use("/", requireAuth, bienvenidaRouter);
app.use("/", requireAuth, dashboardRouter);

// 404
app.use((req, res) => {
  res.status(404).send("Pagina no encontrada");
});

// manejo de errores
app.use(loggerError);

export default app;
