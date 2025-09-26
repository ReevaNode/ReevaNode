// middleware/auth.js 
const {
  CognitoIdentityProviderClient,
  InitiateAuthCommand
} = require("@aws-sdk/client-cognito-identity-provider");

const cognitoClient = new CognitoIdentityProviderClient({
  region: process.env.AWS_REGION
});

// Decodificar JWT básico (solo para obtener exp)
function decodeJWT(token) {
  try {
    const payload = token.split('.')[1];
    const decoded = JSON.parse(Buffer.from(payload, 'base64').toString());
    return decoded;
  } catch (err) {
    return null;
  }
}

// Middleware para verificar y renovar tokens automáticamente
const checkAndRefreshTokens = async (req, res, next) => {
  // Solo aplicar en rutas que requieren autenticación
  if (!req.session.user || !req.session.user.idToken) {
    return next();
  }

  try {
    // Decodificar el token para verificar expiración
    const tokenPayload = decodeJWT(req.session.user.idToken);
    
    if (!tokenPayload) {
      console.log("Token inválido, cerrando sesión");
      req.session.destroy();
      return res.redirect('/login');
    }

    const now = Math.floor(Date.now() / 1000);
    const tokenExp = tokenPayload.exp;
    
    // Si el token expira en menos de 5 minutos, renovarlo
    const fiveMinutes = 5 * 60;
    if (tokenExp - now < fiveMinutes) {
      console.log("Token próximo a expirar, renovando...");
      
      const refreshCommand = new InitiateAuthCommand({
        AuthFlow: "REFRESH_TOKEN_AUTH",
        ClientId: process.env.USER_POOL_CLIENT_ID,
        AuthParameters: {
          REFRESH_TOKEN: req.session.user.refreshToken
        }
      });

      const refreshResult = await cognitoClient.send(refreshCommand);
      const newTokens = refreshResult.AuthenticationResult;

      // Actualizar tokens en la sesión
      req.session.user.idToken = newTokens.IdToken;
      req.session.user.accessToken = newTokens.AccessToken;
      
      console.log("Tokens renovados exitosamente");
    }
    
    next();
  } catch (err) {
    console.error("Error al renovar tokens:", err);
    // Si no se pueden renovar, cerrar sesión
    req.session.destroy();
    res.redirect('/login');
  }
};

module.exports = {
  checkAndRefreshTokens,
  decodeJWT
};