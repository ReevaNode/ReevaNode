const {
  CognitoIdentityProviderClient,
  InitiateAuthCommand
} = require("@aws-sdk/client-cognito-identity-provider");

const client = new CognitoIdentityProviderClient({});

/**
 * POST /auth/refresh
 * Body: { "refreshToken": "<REFRESH_TOKEN>" }
 * Respuesta: { idToken, accessToken, expiresIn }
 */
module.exports.refresh = async (event) => {
  try {
    const { refreshToken } = JSON.parse(event.body || "{}");

    if (!refreshToken) {
      return response(400, { ok: false, error: "refreshToken es obligatorio" });
    }

    const cmd = new InitiateAuthCommand({
      AuthFlow: "REFRESH_TOKEN_AUTH",
      ClientId: process.env.USER_POOL_CLIENT_ID,
      AuthParameters: {
        REFRESH_TOKEN: refreshToken
      }
    });

    const out = await client.send(cmd);
    const auth = out.AuthenticationResult || {};

    return response(200, {
      ok: true,
      idToken: auth.IdToken,
      accessToken: auth.AccessToken,
      expiresIn: auth.ExpiresIn
    });
  } catch (err) {
    console.error(err);
    return response(400, { ok: false, error: "No se pudo refrescar el token" });
  }
};

function response(statusCode, body) {
  return {
    statusCode,
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify(body)
  };
}
