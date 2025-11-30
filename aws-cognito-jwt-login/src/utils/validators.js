/**
 * validators.js - Validación y sanitización segura para registro y autenticación
 * 
 * Incluye:
 * - Validación de email
 * - Validación de contraseña
 * - Sanitización de entrada
 * - Prevención de ataques (XSS, injection)
 */

// ===== CONSTANTES DE SEGURIDAD =====
const PASSWORD_MIN_LENGTH = 8;
const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*(),.?":{}|<>]).{8,}$/;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SAFE_STRING_REGEX = /^[a-zA-Z0-9\s\-_'.áéíóúñÁÉÍÓÚÑ]*$/;
const MAX_STRING_LENGTH = 100;
const MAX_EMAIL_LENGTH = 254;
const MAX_PASSWORD_LENGTH = 128;

// ===== VALIDADORES =====

/**
 * Valida formato y seguridad del email
 * @param {string} email - Email a validar
 * @returns {object} { isValid: boolean, error: string|null }
 */
const validateEmail = (email) => {
  if (!email) {
    return { isValid: false, error: 'El email es requerido' };
  }

  if (typeof email !== 'string') {
    return { isValid: false, error: 'El email debe ser texto' };
  }

  // Sanitizar: convertir a minúsculas y trimear espacios
  const cleanEmail = email.trim().toLowerCase();

  // Validar longitud
  if (cleanEmail.length > MAX_EMAIL_LENGTH) {
    return { isValid: false, error: 'El email es demasiado largo' };
  }

  // Validar formato
  if (!EMAIL_REGEX.test(cleanEmail)) {
    return { isValid: false, error: 'El email tiene un formato inválido' };
  }

  // Validar contra inyección SQL y XSS
  if (cleanEmail.includes(';') || cleanEmail.includes('--') || cleanEmail.includes('/*')) {
    return { isValid: false, error: 'El email contiene caracteres inválidos' };
  }

  return { isValid: true, error: null, sanitized: cleanEmail };
};

/**
 * Valida seguridad y fortaleza de la contraseña
 * @param {string} password - Contraseña a validar
 * @returns {object} { isValid: boolean, error: string|null }
 */
const validatePassword = (password) => {
  if (!password) {
    return { isValid: false, error: 'La contraseña es requerida' };
  }

  if (typeof password !== 'string') {
    return { isValid: false, error: 'La contraseña debe ser texto' };
  }

  // NO trimear - la contraseña puede tener espacios
  const pwd = password;

  // Validar longitud mínima
  if (pwd.length < PASSWORD_MIN_LENGTH) {
    return { 
      isValid: false, 
      error: `La contraseña debe tener mínimo ${PASSWORD_MIN_LENGTH} caracteres` 
    };
  }

  // Validar longitud máxima
  if (pwd.length > MAX_PASSWORD_LENGTH) {
    return { isValid: false, error: 'La contraseña es demasiado larga' };
  }

  // Validar complejidad: mayúscula, minúscula, número, carácter especial
  if (!PASSWORD_REGEX.test(pwd)) {
    return {
      isValid: false,
      error: 'La contraseña debe contener mayúscula, minúscula, número y carácter especial (!@#$%^&*)'
    };
  }

  // Validar contra contraseñas comunes (lista básica)
  const commonPasswords = ['password', 'admin123', '12345678', 'qwerty123'];
  if (commonPasswords.some(common => pwd.toLowerCase().includes(common))) {
    return { isValid: false, error: 'La contraseña es muy común y no segura' };
  }

  return { isValid: true, error: null };
};

/**
 * Valida que las contraseñas coincidan
 * @param {string} password - Contraseña
 * @param {string} confirmPassword - Confirmación de contraseña
 * @returns {object} { isValid: boolean, error: string|null }
 */
const validatePasswordMatch = (password, confirmPassword) => {
  if (!password || !confirmPassword) {
    return { isValid: false, error: 'Ambas contraseñas son requeridas' };
  }

  if (password !== confirmPassword) {
    return { isValid: false, error: 'Las contraseñas no coinciden' };
  }

  return { isValid: true, error: null };
};

/**
 * Sanitiza y valida string genérico (nombre, apellido, etc)
 * @param {string} str - String a validar
 * @param {object} options - { minLength, maxLength, allowEmpty }
 * @returns {object} { isValid: boolean, error: string|null, sanitized: string }
 */
const validateString = (str, options = {}) => {
  const { minLength = 2, maxLength = MAX_STRING_LENGTH, allowEmpty = false } = options;

  if (!str && !allowEmpty) {
    return { isValid: false, error: 'Este campo es requerido' };
  }

  if (!str && allowEmpty) {
    return { isValid: true, error: null, sanitized: '' };
  }

  if (typeof str !== 'string') {
    return { isValid: false, error: 'Debe ser texto' };
  }

  // Trimear espacios
  const cleanStr = str.trim();

  // Validar longitud mínima
  if (cleanStr.length < minLength) {
    return { isValid: false, error: `Mínimo ${minLength} caracteres` };
  }

  // Validar longitud máxima
  if (cleanStr.length > maxLength) {
    return { isValid: false, error: `Máximo ${maxLength} caracteres` };
  }

  // Validar caracteres seguros
  if (!SAFE_STRING_REGEX.test(cleanStr)) {
    return { isValid: false, error: 'Contiene caracteres no permitidos' };
  }

  // Prevenir inyección SQL y XSS
  if (containsInjectionAttempt(cleanStr)) {
    return { isValid: false, error: 'Contiene caracteres inválidos' };
  }

  return { isValid: true, error: null, sanitized: cleanStr };
};

/**
 * Detecta intentos de inyección SQL o XSS
 * @param {string} str - String a verificar
 * @returns {boolean}
 */
const containsInjectionAttempt = (str) => {
  const injectionPatterns = [
    /(<|>|{|})/g,           // HTML tags
    /(--|;|\/\*|\*\/)/g,     // SQL comments
    /(OR|AND|UNION|SELECT|INSERT|DELETE|DROP|UPDATE|CREATE|ALTER)/gi, // SQL keywords
    /(javascript:|onerror=|onclick=|onload=)/gi, // Event handlers
  ];

  return injectionPatterns.some(pattern => pattern.test(str));
};

/**
 * Valida datos completos de registro
 * @param {object} data - { email, password, confirmPassword }
 * @returns {object} { isValid: boolean, errors: object, sanitized: object }
 */
const validateSignupData = (data) => {
  const errors = {};
  const sanitized = {};

  if (!data) {
    return {
      isValid: false,
      errors: { general: 'Datos requeridos' },
      sanitized: {}
    };
  }

  // Validar email
  const emailValidation = validateEmail(data.email);
  if (!emailValidation.isValid) {
    errors.email = emailValidation.error;
  } else {
    sanitized.email = emailValidation.sanitized;
  }

  // Validar contraseña
  const passwordValidation = validatePassword(data.password);
  if (!passwordValidation.isValid) {
    errors.password = passwordValidation.error;
  }

  // Validar que coincidan contraseñas
  const matchValidation = validatePasswordMatch(data.password, data.confirmPassword);
  if (!matchValidation.isValid) {
    errors.confirmPassword = matchValidation.error;
  }

  const isValid = Object.keys(errors).length === 0;

  return {
    isValid,
    errors: isValid ? null : errors,
    sanitized: isValid ? sanitized : {}
  };
};

/**
 * Valida datos completos de login
 * @param {object} data - { email, password }
 * @returns {object} { isValid: boolean, errors: object, sanitized: object }
 */
const validateLoginData = (data) => {
  const errors = {};
  const sanitized = {};

  if (!data) {
    return {
      isValid: false,
      errors: { general: 'Datos requeridos' },
      sanitized: {}
    };
  }

  // Validar email
  const emailValidation = validateEmail(data.email || data.username);
  if (!emailValidation.isValid) {
    errors.email = emailValidation.error;
  } else {
    sanitized.email = emailValidation.sanitized;
  }

  // Validar contraseña (básica)
  if (!data.password) {
    errors.password = 'La contraseña es requerida';
  } else if (typeof data.password !== 'string') {
    errors.password = 'La contraseña debe ser texto';
  } else if (data.password.length > MAX_PASSWORD_LENGTH) {
    errors.password = 'La contraseña es demasiado larga';
  } else {
    sanitized.password = data.password; // No sanitizar contraseña
  }

  const isValid = Object.keys(errors).length === 0;

  return {
    isValid,
    errors: isValid ? null : errors,
    sanitized: isValid ? sanitized : {}
  };
};

/**
 * Valida rate limiting - previene fuerza bruta
 * @param {string} identifier - Email u otro identificador único
 * @param {number} maxAttempts - Intentos máximos permitidos
 * @param {number} windowMs - Ventana de tiempo en ms
 * @returns {boolean}
 */
const checkRateLimit = (identifier, maxAttempts = 5, windowMs = 15 * 60 * 1000) => {
  // Esta función debería usar Redis o DynamoDB en producción
  // Por ahora es un placeholder
  console.warn('Rate limiting no configurado. Usar Redis o DynamoDB en producción.');
  return true;
};

/**
 * Genera respuesta segura de error
 * No expone detalles del sistema
 * @param {string} message - Mensaje para el usuario
 * @param {number} statusCode - Código HTTP
 * @param {boolean} includeDetails - Incluir detalles técnicos (solo desarrollo)
 * @returns {object}
 */
const createSecureErrorResponse = (message, statusCode = 400, includeDetails = false) => {
  const response = {
    success: false,
    message: message || 'Ocurrió un error'
  };

  // En producción NUNCA exponer detalles
  if (includeDetails && process.env.NODE_ENV === 'development') {
    response.details = {
      timestamp: new Date().toISOString(),
      status: statusCode
    };
  }

  return { statusCode, body: response };
};

/**
 * Genera respuesta exitosa
 * @param {object} data - Datos a retornar
 * @param {number} statusCode - Código HTTP
 * @returns {object}
 */
const createSuccessResponse = (data, statusCode = 200) => {
  return {
    statusCode,
    body: {
      success: true,
      data: data
    }
  };
};

// ===== EXPORTAR =====
module.exports = {
  validateEmail,
  validatePassword,
  validatePasswordMatch,
  validateString,
  validateSignupData,
  validateLoginData,
  checkRateLimit,
  createSecureErrorResponse,
  createSuccessResponse,
  containsInjectionAttempt
};
