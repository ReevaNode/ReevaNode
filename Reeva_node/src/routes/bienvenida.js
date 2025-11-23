// ruta de bienvenida
import { Router } from "express";
import { requirePermission } from "../middlewares/requirePermission.js";
import checkEmpresas from "../middlewares/checkEmpresas.js";
import { ScanCommand } from "@aws-sdk/lib-dynamodb";
import db from "../../db.js";
import { retryWithBackoff, CircuitBreaker, SimpleCache } from "../utils/resilience.js";
import Logger from "../utils/logger.js";

const router = Router();
const logger = new Logger("BIENVENIDA");

// inicializar Circuit Breaker y Cache 
const agendaCircuitBreaker = new CircuitBreaker({
  failureThreshold: 3,    // abrir despues de 3 fallos
  successThreshold: 2,    // cerrar despues de 2 exitos
  timeout: 30000          // 30 segundos antes de reintentar
});

const agendaCache = new SimpleCache({
  ttl: 30000,    // 30 segundos de cache
  maxSize: 50
});

router.get("/bienvenida", requirePermission("bienvenidos.read"), checkEmpresas, async (req, res) => {
  // ✅ Si no tiene empresas, redirigir a parametrización
  if (!req.tieneEmpresas) {
    console.log('ℹ️ Usuario sin empresas, redirigiendo a parametrización');
    return res.redirect('/parametrizacion');
  }

  const cacheKey = 'agenda_latest';
  let agendaData = null;
  let fromCache = false;
  let systemDegraded = false;

  try {
    // 1. intentar obtener desde cache
    const cachedData = agendaCache.get(cacheKey);
    if (cachedData) {
      agendaData = cachedData;
      fromCache = true;
      console.log('[BIENVENIDA] Usando datos del cache');
    } else {
      // 2. si no hay cache, consultar DynamoDB con Circuit Breaker + Retry
      console.log('[BIENVENIDA] Cache miss - consultando DynamoDB');
      
      // funcion que consulta DynamoDB
      const fetchAgenda = async () => {
        return await retryWithBackoff(
          async () => {
            const command = new ScanCommand({ TableName: "agenda" });
            return await db.send(command);
          },
          {
            maxRetries: 3,
            initialDelay: 100,
            maxDelay: 2000,
            factor: 2,
            onRetry: (attempt, delay, error) => {
              console.log(`[BIENVENIDA] Retry ${attempt}/3 después de ${delay}ms debido a: ${error.message}`);
            }
          }
        );
      };

      // fallback si Circuit Breaker esta abierto o falla
      const fallbackAgenda = async () => {
        console.log('[BIENVENIDA] ⚠️  Usando fallback - DynamoDB no disponible');
        systemDegraded = true;
        return { Items: [] }; // retornar datos vacios
      };

      // ejecutar con Circuit Breaker
      const result = await agendaCircuitBreaker.execute(fetchAgenda, fallbackAgenda);
      
      if (result.Items && result.Items.length > 0) {
        // guardar en cache
        agendaCache.set(cacheKey, result.Items);
        agendaData = result.Items;
      } else {
        agendaData = [];
      }
    }

    // 3. procesar datos de agenda
    let next_appointment_date = null;
    let next_appointment_time = null;
    let tipo_consulta = null;

    if (agendaData && agendaData.length > 0) {
      // ordenar por horainicio descendente
      const sortedAgendas = agendaData.sort((a, b) => {
        const dateA = new Date(a.horainicio);
        const dateB = new Date(b.horainicio);
        return dateB - dateA;
      });

      const agenda = sortedAgendas[0];
      const inicio = new Date(agenda.horainicio);
      const termino = new Date(agenda.horatermino);

      next_appointment_date = inicio.toLocaleDateString("es-ES", {
        day: "2-digit",
        month: "long",
        year: "numeric",
      });

      next_appointment_time =
        inicio.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" }) +
        " - " +
        termino.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });

      tipo_consulta = agenda.idtipoconsulta;
    } else {
      logger.info('No se encontraron agendas');
    }

    // 4. renderizar vista con indicadores de estado
    res.render("Bienvenida-y-Opciones", {
      user: req.session.user,
      next_appointment_date,
      next_appointment_time,
      tipo_consulta,
      // indicadores de resiliencia
      systemDegraded,
      fromCache,
      warningMessage: systemDegraded 
        ? "El sistema está experimentando problemas temporales. Algunos datos pueden no estar actualizados." 
        : null,
      activePage: 'bienvenida'
    });

  } catch (error) {
    console.error("[BIENVENIDA] Error crítico:", error);
    
    // Graceful Degradation: renderizar pagina con mensaje para usuario
    res.render("Bienvenida-y-Opciones", {
      user: req.session.user,
      next_appointment_date: null,
      next_appointment_time: null,
      tipo_consulta: null,
      systemDegraded: true,
      fromCache: false,
      warningMessage: "El sistema está temporalmente fuera de servicio. Por favor, intente más tarde.",
      activePage: 'bienvenida'
    });
  }
});

export default router;
