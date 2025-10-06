// middleware para renovar tokens automaticamente
import {
  CognitoIdentityProviderClient,
  InitiateAuthCommand
} from "@aws-sdk/client-cognito-identity-provider";
import { config } from "../config/index.js";

const cognitoClient = new CognitoIdentityProviderClient({
  region: config.aws.region
});

// decodificar jwt basico (solo para ver exp)
export function decodificarJWT(token) {
  try {
    const payload = token.split('.')[1];
    const decodificado = JSON.parse(Buffer.from(payload, 'base64').toString());
    return decodificado;
  } catch (err) {
    return null;
  }
}

// middleware para verificar y renovar tokens si es necesario
export const checkAndRefreshTokens = async (req, res, next) => {
  // solo aplicar en rutas que requieren auth
  if (!req.session.user || !req.session.user.idToken) {
    return next();
  }

  try {
    // decodificar para ver expiracion
    const tokenPayload = decodificarJWT(req.session.user.idToken);
    
    if (!tokenPayload) {
      console.log("Token invalido, cerrando sesion");
      req.session.destroy();
      return res.redirect('/login');
    }

    const ahora = Math.floor(Date.now() / 1000);
    const tokenExp = tokenPayload.exp;
    
    // si expira en menos de 5 min, renovarlo
    const cincoMinutos = 5 * 60;
    if (tokenExp - ahora < cincoMinutos) {
      console.log("Token proximo a expirar, renovando...");
      
      const refreshCommand = new InitiateAuthCommand({
        AuthFlow: "REFRESH_TOKEN_AUTH",
        ClientId: config.cognito.userPoolClientId,
        AuthParameters: {
          REFRESH_TOKEN: req.session.user.refreshToken
        }
      });

      const refreshResult = await cognitoClient.send(refreshCommand);
      const nuevosTokens = refreshResult.AuthenticationResult;

      // actualizar tokens en sesion
      req.session.user.idToken = nuevosTokens.IdToken;
      req.session.user.accessToken = nuevosTokens.AccessToken;
      
      console.log("Tokens renovados exitosamente");
    }
    
    next();
  } catch (err) {
    console.error("Error al renovar tokens:", err);
    // si no se pueden renovar, cerrar sesion
    req.session.destroy();
    res.redirect('/login');
  }
};