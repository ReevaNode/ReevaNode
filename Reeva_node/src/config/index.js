// configuracion centralizada para no hardcodear nada
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// cargar .env desde src/.env
dotenv.config({ path: path.resolve(__dirname, '../.env') });

export const config = {
  // AWS
  aws: {
    region: process.env.AWS_REGION || 'us-east-1',
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    sessionToken: process.env.AWS_SESSION_TOKEN,
    labRole: process.env.LABROLE,
    profile: process.env.AWS_PROFILE || 'default',
  },

  // Cognito
  cognito: {
    userPoolId: process.env.USER_POOL_ID,
    userPoolClientId: process.env.USER_POOL_CLIENT_ID,
    region: process.env.AWS_REGION || 'us-east-1',
    issuerUrl: `https://cognito-idp.${process.env.AWS_REGION || 'us-east-1'}.amazonaws.com/${process.env.USER_POOL_ID}`,
  },

  // Tablas DynamoDB
  dynamodb: {
    tablas: {
      users: process.env.USER_TABLE || 'aws-cognito-jwt-login-dev-users',
      agenda: process.env.AGENDA_TABLE || 'agenda',
      box: process.env.BOX_TABLE || 'box',
      estadoBox: process.env.ESTADO_BOX_TABLE || 'estadobox',
      items: process.env.ITEMS_TABLE || 'items',
      personalizacion: process.env.PERSONALIZACION_TABLE || 'personalizacion',
      registroAgenda: process.env.REGISTRO_AGENDA_TABLE || 'registroagenda',
      tipoBox: process.env.TIPO_BOX_TABLE || 'tipobox',
      tipoConsulta: process.env.TIPO_CONSULTA_TABLE || 'tipoconsulta',
      tipoEstado: process.env.TIPO_ESTADO_TABLE || 'tipoestado',
      tipoItem: process.env.TIPO_ITEM_TABLE || 'tipoitem',
      tipoProfesional: process.env.TIPO_PROFESIONAL_TABLE || 'tipoprofesional',
      tipoUsuario: process.env.TIPO_USUARIO_TABLE || 'tipousuario',
      usuario: process.env.USUARIO_TABLE || 'usuario',
    },
  },

  // Seguridad
  seguridad: {
    jwtSecret: process.env.JWT_SECRET,
    sessionSecret: process.env.SESSION_SECRET,
    sessionMaxAge: parseInt(process.env.SESSION_MAX_AGE || '300000', 10), // 5 min default
    sessionSecure: process.env.NODE_ENV === 'production',
    sessionSameSite: process.env.SESSION_SAME_SITE || 'lax',
  },

  // App
  app: {
    port: parseInt(process.env.PORT || '3000', 10),
    nodeEnv: process.env.NODE_ENV || 'development',
    stage: process.env.STAGE || 'dev',
    logLevel: process.env.LOG_LEVEL || 'debug',
  },

  // Feature flags
  features: {
    autoProvisionUsers: process.env.AUTO_PROVISION_USERS === 'true',
  },

  // SNS
  sns: {
    topicArn: process.env.SNS_TOPIC_ARN,
    adminEmail: process.env.ADMIN_EMAIL,
  },

  // Rate Limiting
  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000', 10), // 15 min
    maxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100', 10),
  },

  // CORS
  cors: {
    origin: process.env.CORS_ORIGIN?.split(',') || ['http://localhost:3000'],
  },
};

// validar que esten las variables importantes
export function validarConfig() {
  const requeridas = [
    'AWS_REGION',
    'USER_POOL_ID',
    'USER_POOL_CLIENT_ID',
    'JWT_SECRET',
    'SESSION_SECRET',
  ];

  const faltantes = requeridas.filter(key => !process.env[key]);
  
  if (faltantes.length > 0) {
    throw new Error(`Faltan variables de entorno: ${faltantes.join(', ')}`);
  }

  console.log('✓ Configuracion validada correctamente');
}

export default config;
