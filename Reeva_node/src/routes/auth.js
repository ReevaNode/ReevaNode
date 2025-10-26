// rutas de autenticacion
import { Router } from "express";
import jwt from "jsonwebtoken"; 
import {
  CognitoIdentityProviderClient,
  InitiateAuthCommand,
} from "@aws-sdk/client-cognito-identity-provider";

import {
  DynamoDBClient
} from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand
} from "@aws-sdk/lib-dynamodb";

import { sendAuthNotification, sendErrorNotification } from "../services/notificationService.js";
import { fetchPersonalization } from "../services/personalizationService.js";
import { config } from "../config/index.js";

const router = Router();
const client = new CognitoIdentityProviderClient({ region: config.aws.region });

// dynamo
const dynamoClient = new DynamoDBClient({ region: config.aws.region });
const docClient = DynamoDBDocumentClient.from(dynamoClient);

// helpers

// obtener usuario por sub
async function obtenerUsuario(userId) {
  try {
    const command = new GetCommand({
      TableName: config.dynamodb.tablas.users,
      Key: { userId },
    });
    const result = await docClient.send(command);
    return result.Item || null;
  } catch (err) {
    console.error("Error obtenerUsuario:", err);
    return null;
  }
}

// guardar usuario
async function guardarUsuario(user) {
  try {
    const command = new PutCommand({
      TableName: config.dynamodb.tablas.users,
      Item: {
        ...user,
        updatedAt: new Date().toISOString(),
      },
    });
    await docClient.send(command);
    return true;
  } catch (err) {
    console.error("Error guardarUsuario:", err);
    return false;
  }
}

// rutas

// mostrar login
router.get("/login", (req, res) => {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  res.setHeader("Surrogate-Control", "no-store");
  
  // si ya hay sesion mandar a bienvenida
  if (req.session.user) {
    return res.redirect("/bienvenida");
  }

  const errorMsg = req.flash("error");
  res.render("login", { error: errorMsg });
});

// redireccion raiz
router.get("/", (req, res) => {
  if (req.session?.user) {
    return res.redirect("/bienvenida");
  }
  res.redirect("/login");
});

// login post
router.post("/auth/login", async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ ok: false, error: "username y password son obligatorios" });
    }

    // autenticar con cognito
    const cmd = new InitiateAuthCommand({
      AuthFlow: "USER_PASSWORD_AUTH",
      ClientId: config.cognito.userPoolClientId,
      AuthParameters: {
        USERNAME: username,
        PASSWORD: password,
      },
    });

    const out = await client.send(cmd);

    if (out.ChallengeName) {
      return res.status(403).json({ ok: false, error: "Challenge requerido", challenge: out.ChallengeName });
    }

    const auth = out.AuthenticationResult || {};

    // decodificar token
    const claims = jwt.decode(auth.IdToken);

    if (!claims) {
      return res.status(401).json({ ok: false, error: "Token no valido" });
    }

    // buscar usuario en dynamo
    let user = await obtenerUsuario(claims.sub);

    // no crear usuario automaticamente, debe existir
    if (!user) {
      return res.status(403).json({
        ok: false,
        error: "Usuario no registrado en el sistema. Contacta con un administrador."
      });
    }

    // actualizar ultimo login
    await guardarUsuario({ ...user, lastLogin: new Date().toISOString() });

    // datos para notificacion
    const datosNotif = {
      email: user.email,
      username: user.username,
      roles: user.roles || [],
      userAgent: req.get('User-Agent'),
      ip: req.ip || req.connection.remoteAddress
    };

    // enviar notificacion (async, no bloquea)
    sendAuthNotification('LOGIN', datosNotif).catch(err => {
      console.error('Error enviando notificacion de login:', err);
    });

    // guardar en sesion
    req.session.user = {
      idToken: auth.IdToken,
      accessToken: auth.AccessToken,
      refreshToken: auth.RefreshToken,
      email: user.email,
      username: user.username,
      sub: user.userId,
      roles: user.roles || [],
      permissions: user.permissions || [],
    };

    try {
      console.log('Obteniendo personalización para:', user.email);
      const personalization = await fetchPersonalization(auth.IdToken);
      const prefs = personalization.personalization || {};

      // Extraer preferencias
      const userLang = prefs.idioma || 'es';
      const userTheme = prefs.aspecto || 'claro';

      // Guardar en sesion
      req.session.userLang = userLang;
      req.session.userTheme = userTheme;

      console.log('Personalización aplicada:', {
        email: user.email,
        idioma: userLang,
        aspecto: userTheme
      });

    } catch (err) {
      console.warn('No se pudo obtener personalización:', err.message);
      
      // Valores por defecto si falla
      req.session.userLang = 'es';
      req.session.userTheme = 'claro';
      
      console.log('Usando valores por defecto:', {
        idioma: req.session.userLang,
        aspecto: req.session.userTheme
      });
    }

    // respuesta
    return res.json({
      ok: true,
      message: "Login exitoso",
      user: {
        email: user.email,
        username: user.username,
        roles: user.roles,
        permissions: user.permissions,
        idioma: req.session.userLang,
        aspecto: req.session.userTheme
      }
    });

  } catch (err) {
    console.error("Error en login:", err);
    
    // notificar error critico
    sendErrorNotification('LOGIN_ERROR', {
      error: err.message,
      username: req.body?.username,
      userAgent: req.get('User-Agent'),
      ip: req.ip || req.connection.remoteAddress
    }).catch(notifErr => {
      console.error('Error enviando notificacion de error:', notifErr);
    });
    
    return res.status(401).json({ ok: false, error: "Credenciales invalidas o usuario no confirmado" });
  }
});

router.post("/update-session-preferences", async (req, res) => {
  try {
    const { idioma, aspecto } = req.body;
    
    if (!req.session.user) {
      return res.status(401).json({ ok: false, error: "No hay sesión activa" });
    }
    
    // Validar parametros
    if (!idioma || !aspecto) {
      return res.status(400).json({ 
        ok: false, 
        error: "Parámetros idioma y aspecto son obligatorios" 
      });
    }
    
    // Actualizar sesion
    req.session.userLang = idioma;
    req.session.userTheme = aspecto;
    
    console.log('Sesión actualizada:', {
      email: req.session.user.email,
      idioma,
      aspecto
    });
    
    return res.json({
      ok: true,
      message: "Sesión actualizada",
      preferences: { idioma, aspecto }
    });
    
  } catch (error) {
    console.error("Error actualizando sesión:", error);
    return res.status(500).json({ 
      ok: false, 
      error: "Error al actualizar sesión" 
    });
  }
});

// logout
router.get("/logout", async (req, res) => {
  try {
    // guardar datos del usuario antes de destruir
    const userData = req.session?.user;
    
    if (userData) {
      const datosNotif = {
        email: userData.email,
        username: userData.username,
        roles: userData.roles || [],
        userAgent: req.get('User-Agent'),
        ip: req.ip || req.connection.remoteAddress
      };

      // notificar logout (async)
      sendAuthNotification('LOGOUT', datosNotif).catch(err => {
        console.error('Error enviando notificacion de logout:', err);
      });
    }

    req.session.destroy(() => {
      res.redirect("/login");
    });
    
  } catch (error) {
    console.error("Error en logout:", error);
    req.session.destroy(() => {
      res.redirect("/login");
    });
  }
});

export default router;
