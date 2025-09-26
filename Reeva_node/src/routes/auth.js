// src/routes/auth.js

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

const router = Router();
const client = new CognitoIdentityProviderClient({ region: process.env.AWS_REGION || "us-east-1" });

// DynamoDB
const dynamoClient = new DynamoDBClient({ region: process.env.AWS_REGION || "us-east-1" });
const docClient = DynamoDBDocumentClient.from(dynamoClient);

// === HELPERS ===

// Obtener usuario por sub (ID de Cognito)
async function getUser(userId) {
  try {
    const command = new GetCommand({
      TableName: process.env.USER_TABLE,
      Key: { userId },
    });
    const result = await docClient.send(command);
    return result.Item || null;
  } catch (err) {
    console.error("Error getUser:", err);
    return null;
  }
}

// Guardar usuario existente (actualiza login u otros campos)
async function saveUser(user) {
  try {
    const command = new PutCommand({
      TableName: process.env.USER_TABLE,
      Item: {
        ...user,
        updatedAt: new Date().toISOString(),
      },
    });
    await docClient.send(command);
    return true;
  } catch (err) {
    console.error("Error saveUser:", err);
    return false;
  }
}

// === RUTAS ===
// Mostrar login
router.get("/login", (req, res) => {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  res.setHeader("Surrogate-Control", "no-store");
  // Bloqueo: si ya hay sesión, no permitir entrar al login 
  if (req.session.user) {
    return res.redirect("/bienvenida");
  }

  const errorMsg = req.flash("error");
  res.render("login", { error: errorMsg });
});

// Redirección raíz
router.get("/", (req, res) => {
  if (req.session?.user) {
    return res.redirect("/bienvenida");
  }
  res.redirect("/login");
});

// === LOGIN POST ===
router.post("/auth/login", async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ ok: false, error: "username y password son obligatorios" });
    }

    // Cognito auth
    const cmd = new InitiateAuthCommand({
      AuthFlow: "USER_PASSWORD_AUTH",
      ClientId: process.env.USER_POOL_CLIENT_ID,
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

    // Decodificar token con librería jwt
    const claims = jwt.decode(auth.IdToken);

    if (!claims) {
      return res.status(401).json({ ok: false, error: "Token no válido" });
    }

    // Buscar usuario en Dynamo
    let user = await getUser(claims.sub);

    // Cambio: ya NO creamos usuario automáticamente
    if (!user) {
      return res.status(403).json({
        ok: false,
        error: "Usuario no registrado en el sistema. Contacte con un administrador."
      });
    }

    // Actualizar lastLogin
    await saveUser({ ...user, lastLogin: new Date().toISOString() });

    // Guardar en sesión
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

    return res.json({
      ok: true,
      message: "Login exitoso",
      user: {
        email: user.email,
        username: user.username,
        roles: user.roles,
        permissions: user.permissions
      }
    });

  } catch (err) {
    console.error("Error en login:", err);
    return res.status(401).json({ ok: false, error: "Credenciales inválidas o usuario no confirmado" });
  }
});

// === LOGOUT ===
router.get("/logout", (req, res) => {
  req.session.destroy(() => {
    res.redirect("/login");
  });
});

export default router;
