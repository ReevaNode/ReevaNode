// src/app.js
import dotenv from "dotenv";
dotenv.config();

import express from "express";
import cors from "cors";
import morgan from "morgan";
import path from "path";
import { fileURLToPath } from "url";
import requireAuth from "./middlewares/requireAuth.js";


// Routers
import authRouter from "./routes/auth.js";
import bienvenidaRouter from "./routes/bienvenida.js";

const app = express();

// ====== Config Paths ======
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);



import session from "express-session";
import flash from "connect-flash";

app.use(session({
  secret: process.env.SESSION_SECRET || "clave-secreta",
  resave: false,
  saveUninitialized: false,
  rolling: true,
  cookie: {
    maxAge: 5 * 60 * 1000,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production"
  }
}));

app.use(flash());

// ====== Middlewares ======
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true })); 
app.use(morgan("dev"));

// ====== Static Files ======
app.use(express.static(path.join(__dirname, "public")));

// ====== View Engine ======
app.set("views", path.join(__dirname, "views"));
app.set("view engine", "ejs");

// ====== Routes ======
app.use("/", authRouter);
app.use("/", requireAuth, bienvenidaRouter);

// ====== 404 ======
app.use((req, res) => {
  res.status(404).send("Página no encontrada");
});

export default app;
