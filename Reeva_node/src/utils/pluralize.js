/**
 * Utilidad para pluralizar y singularizar sustantivos en español
 * - Si termina en vocal: agrega 's' (pluralizar) / quita 's' (singularizar)
 * - Si termina en consonante: agrega 'es' (pluralizar) / quita 'es' (singularizar)
 */

/**
 * Singulariza una palabra (inverso de pluralizar)
 * @param {string} palabra - La palabra a singularizar
 * @returns {string} La palabra singularizada
 * 
 * @example
 * singularizar('Mesas') // 'Mesa'
 * singularizar('Boxes') // 'Box'
 * singularizar('Pasillos') // 'Pasillo'
 * singularizar('Ocupantes') // 'Ocupante'
 */
export const singularizar = (palabra) => {
  if (!palabra || typeof palabra !== 'string') {
    return palabra;
  }

  palabra = palabra.trim();
  
  // Si termina en 'es' (más de 4 letras)
  if (palabra.length > 4 && palabra.toLowerCase().endsWith('es')) {
    const ultimaLetraAntes = palabra.charAt(palabra.length - 3).toLowerCase();
    const vocales = ['a', 'e', 'i', 'o', 'u'];
    
    // Si la letra antes de 'es' es consonante, probablemente sea 'es' del plural
    if (!vocales.includes(ultimaLetraAntes)) {
      return palabra.slice(0, -2);
    }
  }
  
  // Si termina en 's' (y no en 'es')
  if (palabra.toLowerCase().endsWith('s') && !palabra.toLowerCase().endsWith('es')) {
    return palabra.slice(0, -1);
  }

  return palabra;
};

/**
 * Pluraliza una palabra según las reglas del español
 * - Si termina en vocal: agrega 's'
 * - Si termina en consonante: agrega 'es'
 */

/**
 * Pluraliza una palabra
 * @param {string} palabra - La palabra a pluralizar
 * @returns {string} La palabra pluralizada
 * 
 * @example
 * pluralizar('Mesa') // 'Mesas'
 * pluralizar('Box') // 'Boxes'
 * pluralizar('Pasillo') // 'Pasillos'
 * pluralizar('Ocupante') // 'Ocupantes'
 */
export const pluralizar = (palabra) => {
  if (!palabra || typeof palabra !== 'string') {
    return palabra;
  }

  palabra = palabra.trim();
  const ultimaLetra = palabra.toLowerCase().charAt(palabra.length - 1);
  const vocales = ['a', 'e', 'i', 'o', 'u'];

  if (vocales.includes(ultimaLetra)) {
    return palabra + 's';
  } else {
    return palabra + 'es';
  }
};

/**
 * Crea el texto de "Matriz + [nombreNivel2]" en plural
 * @param {string} nombreNivel2 - El nombre del nivel 2 (ej: 'Mesa', 'Box')
 * @returns {string} El texto 'Matriz' + plural (ej: 'Matriz Mesas')
 * 
 * @example
 * getMatrizLabel('Mesa') // 'Matriz Mesas'
 * getMatrizLabel('Box') // 'Matriz Boxes'
 */
export const getMatrizLabel = (nombreNivel2 = 'Mesa') => {
  return `Matriz ${pluralizar(nombreNivel2)}`;
};

/**
 * Crea el texto de "Listado + [nombreNivel2]" en plural
 * @param {string} nombreNivel2 - El nombre del nivel 2
 * @returns {string} El texto 'Listado' + plural
 * 
 * @example
 * getListadoLabel('Mesa') // 'Listado Mesas'
 * getListadoLabel('Box') // 'Listado Boxes'
 */
export const getListadoLabel = (nombreNivel2 = 'Mesa') => {
  return `Listado ${pluralizar(nombreNivel2)}`;
};

/**
 * Crea el texto de "Gestionar + [nombreNivel2]" en plural
 * @param {string} nombreNivel2 - El nombre del nivel 2
 * @returns {string} El texto 'Gestionar' + plural
 * 
 * @example
 * getGestionarLabel('Mesa') // 'Gestionar Mesas'
 */
export const getGestionarLabel = (nombreNivel2 = 'Mesa') => {
  return `Gestionar ${pluralizar(nombreNivel2)}`;
};

/**
 * Crea etiquetas completas basadas en los nombres de niveles
 * @param {object} parametrizacion - Objeto con nombreNivel1, nombreNivel2, nombreNivel3
 * @returns {object} Objeto con labels pluralizados para usar en las vistas
 * 
 * @example
 * getParametrizacionLabels({ nombreNivel1: 'Pasillo', nombreNivel2: 'Mesa', nombreNivel3: 'Ocupante' })
 * // Retorna:
 * // {
 * //   nivel1Plural: 'Pasillos',
 * //   nivel2Plural: 'Mesas',
 * //   nivel3Plural: 'Ocupantes',
 * //   matrizLabel: 'Matriz Mesas',
 * //   listadoLabel: 'Listado Mesas',
 * //   gestionarLabel: 'Gestionar Mesas'
 * // }
 */
export const getParametrizacionLabels = (parametrizacion = {}) => {
  const {
    nombreNivel1 = 'Pasillo',
    nombreNivel2 = 'Mesa',
    nombreNivel3 = 'Ocupante',
    nombreNivel4 = 'Instrumento'
  } = parametrizacion;

  return {
    nivel1Plural: pluralizar(nombreNivel1),
    nivel2Plural: pluralizar(nombreNivel2),
    nivel3Plural: pluralizar(nombreNivel3),
    nivel4Plural: pluralizar(nombreNivel4),
    nivel1Singular: nombreNivel1,
    nivel2Singular: nombreNivel2,
    nivel3Singular: nombreNivel3,
    nivel4Singular: nombreNivel4,
    matrizLabel: getMatrizLabel(nombreNivel2),
    listadoLabel: getListadoLabel(nombreNivel2),
    gestionarLabel: getGestionarLabel(nombreNivel2)
  };
};

export default {
  singularizar,
  pluralizar,
  getMatrizLabel,
  getListadoLabel,
  getGestionarLabel,
  getParametrizacionLabels
};
