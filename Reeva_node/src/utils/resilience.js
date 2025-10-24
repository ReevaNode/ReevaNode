/**
 * UTILIDADES DE RESILIENCIA - CHAOS ENGINEERING
 * implementacion de patrones de tolerancia a fallos
 */

/**
 * retry con exponential backoff
 * @param {Function} fn - funcion a ejecutar con retry
 * @param {Object} options - config
 * @returns {Promise} - resultado de la funcion
 */
export async function retryWithBackoff(fn, options = {}) {
  const {
    maxRetries = 3,
    initialDelay = 100,
    maxDelay = 5000,
    factor = 2,
    onRetry = null
  } = options;

  let lastError;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      // no reintentar si no es un error recuperable
      if (!isRetriableError(error)) {
        throw error;
      }

      // ultimo intento, lanzar error
      if (attempt === maxRetries - 1) {
        throw error;
      }

      // calcular delay con exponential backoff
      const delay = Math.min(
        initialDelay * Math.pow(factor, attempt),
        maxDelay
      );

      // callback de retry (para logging)
      if (onRetry) {
        onRetry(attempt + 1, delay, error);
      }

      console.log(`[RETRY] Intento ${attempt + 1}/${maxRetries} falló. Reintentando en ${delay}ms...`);
      console.log(`[RETRY] Error: ${error.name} - ${error.message}`);

      // esperar antes del siguiente intento
      await sleep(delay);
    }
  }

  throw lastError;
}

/**
 * determina si un error es recuperable (retriable)
 * @param {Error} error - error a evaluar
 * @returns {boolean}
 */
function isRetriableError(error) {
  const retriableErrors = [
    'ProvisionedThroughputExceededException',
    'ThrottlingException',
    'RequestLimitExceeded',
    'ServiceUnavailable',
    'InternalServerError',
    'TimeoutError',
    'NetworkingError'
  ];

  return retriableErrors.some(errorType => 
    error.name === errorType || 
    error.code === errorType ||
    error.message?.includes(errorType)
  );
}

/**
 * sleep helper
 * @param {number} ms - ms a esperar
 * @returns {Promise}
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Circuit Breaker
 * protege el sistema de cascadas de fallos
 */
export class CircuitBreaker {
  constructor(options = {}) {
    this.failureThreshold = options.failureThreshold || 5;
    this.successThreshold = options.successThreshold || 2;
    this.timeout = options.timeout || 60000; // 1 minuto
    this.monitoringPeriod = options.monitoringPeriod || 10000; // 10 segundos
    
    this.state = 'CLOSED'; // CLOSED, OPEN, HALF_OPEN
    this.failures = 0;
    this.successes = 0;
    this.nextAttempt = Date.now();
    this.lastFailureTime = null;

    console.log('[CIRCUIT BREAKER] Inicializado:', {
      failureThreshold: this.failureThreshold,
      timeout: this.timeout
    });
  }

  async execute(fn, fallback = null) {
    // si circuito esta ABIERTO
    if (this.state === 'OPEN') {
      if (Date.now() < this.nextAttempt) {
        console.log('[CIRCUIT BREAKER] OPEN - Rechazando request');
        
        if (fallback) {
          console.log('[CIRCUIT BREAKER] Ejecutando fallback...');
          return await fallback();
        }
        
        throw new Error('Circuit breaker is OPEN');
      }
      
      // intentar recuperacion (HALF_OPEN)
      this.state = 'HALF_OPEN';
      this.successes = 0;
      console.log('[CIRCUIT BREAKER] Cambiando a HALF_OPEN - Probando recuperación');
    }

    try {
      const result = await fn();
      
      // exito
      this.onSuccess();
      return result;
      
    } catch (error) {
      // fallo
      this.onFailure();
      
      // si hay fallback, ejecutarlo
      if (fallback && this.state === 'OPEN') {
        console.log('[CIRCUIT BREAKER] Ejecutando fallback después de fallo');
        return await fallback();
      }
      
      throw error;
    }
  }

  onSuccess() {
    this.failures = 0;

    if (this.state === 'HALF_OPEN') {
      this.successes++;
      console.log(`[CIRCUIT BREAKER] Éxito en HALF_OPEN (${this.successes}/${this.successThreshold})`);
      
      if (this.successes >= this.successThreshold) {
        this.state = 'CLOSED';
        console.log('[CIRCUIT BREAKER] Cambiado a CLOSED - Sistema recuperado');
      }
    }
  }

  onFailure() {
    this.failures++;
    this.lastFailureTime = Date.now();
    
    console.log(`[CIRCUIT BREAKER] Fallo registrado (${this.failures}/${this.failureThreshold})`);

    if (this.state === 'HALF_OPEN') {
      // si falla en HALF_OPEN, volver a OPEN inmediatamente
      this.state = 'OPEN';
      this.nextAttempt = Date.now() + this.timeout;
      console.log('[CIRCUIT BREAKER] Fallo en HALF_OPEN - Volviendo a OPEN');
      return;
    }

    if (this.failures >= this.failureThreshold) {
      this.state = 'OPEN';
      this.nextAttempt = Date.now() + this.timeout;
      console.log('[CIRCUIT BREAKER] ⚠️  ABIERTO - Demasiados fallos consecutivos');
      console.log(`[CIRCUIT BREAKER] Próximo intento en ${this.timeout}ms`);
    }
  }

  getState() {
    return {
      state: this.state,
      failures: this.failures,
      successes: this.successes,
      nextAttempt: this.nextAttempt,
      lastFailureTime: this.lastFailureTime
    };
  }

  reset() {
    this.state = 'CLOSED';
    this.failures = 0;
    this.successes = 0;
    console.log('[CIRCUIT BREAKER] Reset manual');
  }
}

/**
 * cache simple en memoria
 */
export class SimpleCache {
  constructor(options = {}) {
    this.ttl = options.ttl || 60000; // 1 minuto por defecto
    this.maxSize = options.maxSize || 100;
    this.cache = new Map();
    
    console.log('[CACHE] Inicializado:', { ttl: this.ttl, maxSize: this.maxSize });
  }

  set(key, value) {
    // limpiar cache si esta lleno
    if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }

    this.cache.set(key, {
      value,
      timestamp: Date.now()
    });

    console.log(`[CACHE] SET: ${key}`);
  }

  get(key) {
    const item = this.cache.get(key);

    if (!item) {
      console.log(`[CACHE] MISS: ${key}`);
      return null;
    }

    // verificar si expiro
    if (Date.now() - item.timestamp > this.ttl) {
      this.cache.delete(key);
      console.log(`[CACHE] EXPIRED: ${key}`);
      return null;
    }

    console.log(`[CACHE] HIT: ${key}`);
    return item.value;
  }

  clear() {
    this.cache.clear();
    console.log('[CACHE] Limpiado');
  }

  size() {
    return this.cache.size;
  }
}
