const {
  CognitoIdentityProviderClient,
  InitiateAuthCommand
} = require("@aws-sdk/client-cognito-identity-provider");

const client = new CognitoIdentityProviderClient({});

/**
 * POST /auth/login
 */
module.exports.login = async (event) => {
  try {
    const { username, password } = JSON.parse(event.body || "{}");

    if (!username || !password) {
      return response(400, { ok: false, error: "username y password son obligatorios" });
    }

    const cmd = new InitiateAuthCommand({
      AuthFlow: "USER_PASSWORD_AUTH",
      ClientId: process.env.USER_POOL_CLIENT_ID,
      AuthParameters: {
        USERNAME: username,
        PASSWORD: password
      }
    });

    const out = await client.send(cmd);

    if (out.ChallengeName) {
      return response(403, { ok: false, challenge: out.ChallengeName });
    }

    const auth = out.AuthenticationResult || {};
    return response(200, {
      ok: true,
      idToken: auth.IdToken,
      accessToken: auth.AccessToken,
      refreshToken: auth.RefreshToken,
      expiresIn: auth.ExpiresIn
    });
  } catch (err) {
    console.error(err);
    return response(401, { ok: false, error: "Credenciales inválidas o usuario no confirmado" });
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
