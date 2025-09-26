/**
 * GET /me
 * Requiere Authorization: Bearer <ID_TOKEN o ACCESS_TOKEN>
 * API Gateway HTTP API valida el JWT con Cognito (authorizer jwt).
 * Las claims quedan disponibles en event.requestContext.authorizer.jwt.claims
 */
module.exports.me = async (event) => {
  const claims = event?.requestContext?.authorizer?.jwt?.claims || {};
  // Ejemplo de respuesta con campos útiles
  return {
    statusCode: 200,
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      ok: true,
      sub: claims.sub,
      email: claims.email,
      username: claims["cognito:username"],
      groups: claims["cognito:groups"] || [],
      claims
    })
  };
};
