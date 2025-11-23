// src/public/js/parametrizacion.js 

class ParametrizacionManager {
  constructor() {
    this.pasoActual = 1;
    this.totalPasos = 4;
    this.configuracion = {
      nombreEmpresa: '',
      nombreNivel1: '',
      nombreNivel2: '',
      nombreNivel3: '', // Ocupante
      espacios: [],
      ocupantes: []
    };
    
    const urlParams = new URLSearchParams(window.location.search);
    this.desde = urlParams.get('desde') || null;
    
    this.init();
  }

  init() {
    this.setupEventListeners();
    this.actualizarNavegacion();
  }

  setupEventListeners() {
    // Navegación
    document.getElementById('btn-siguiente')?.addEventListener('click', () => this.siguientePaso());
    document.getElementById('btn-anterior')?.addEventListener('click', () => this.pasoAnterior());

    // Inputs Paso 1
    document.getElementById('input-empresa')?.addEventListener('input', (e) => {
      this.configuracion.nombreEmpresa = e.target.value;
    });

    document.getElementById('input-nivel1')?.addEventListener('input', (e) => {
      this.configuracion.nombreNivel1 = e.target.value;
    });

    document.getElementById('input-nivel2')?.addEventListener('input', (e) => {
      this.configuracion.nombreNivel2 = e.target.value;
    });

    document.getElementById('input-nivel3')?.addEventListener('input', (e) => {
      this.configuracion.nombreNivel3 = e.target.value;
    });

    // Agregar espacio
    document.getElementById('btn-agregar-espacio')?.addEventListener('click', () => {
      this.agregarEspacio();
    });

    // Agregar ocupante
    document.getElementById('btn-agregar-ocupante')?.addEventListener('click', () => {
      this.agregarOcupante();
    });

    document.getElementById('nuevo-ocupante')?.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        this.agregarOcupante();
      }
    });

    // Botones finales
    document.getElementById('btn-editar-config')?.addEventListener('click', () => {
      this.irAPaso(1);
    });

    document.getElementById('btn-confirmar')?.addEventListener('click', () => {
      this.guardarConfiguracion();
    });
  }

  siguientePaso() {
    if (this.pasoActual === 1) {
      if (!this.validarPaso1()) return;
    }

    if (this.pasoActual === 2) {
      if (!this.validarPaso2()) return;
    }

    if (this.pasoActual < this.totalPasos) {
      this.irAPaso(this.pasoActual + 1);
    }
  }

  pasoAnterior() {
    if (this.pasoActual > 1) {
      if (this.pasoActual === 2) {
        this.configuracion.espacios = [];
      }
      
      this.irAPaso(this.pasoActual - 1);
    }
  }

  irAPaso(numeroPaso) {
    document.querySelectorAll('.paso-content').forEach(paso => {
      paso.classList.remove('active');
    });

    document.getElementById(`paso-${numeroPaso}`).classList.add('active');

    document.querySelectorAll('.progress-step').forEach((step, index) => {
      step.classList.remove('active', 'completed');
      
      if (index + 1 < numeroPaso) {
        step.classList.add('completed');
      } else if (index + 1 === numeroPaso) {
        step.classList.add('active');
      }
    });

    this.pasoActual = numeroPaso;
    this.actualizarNavegacion();

    if (numeroPaso === 1) {
      this.cargarNombresEnPaso1();
    } else if (numeroPaso === 2) {
      this.actualizarTextosPaso2();
      this.renderizarEspacios();
    } else if (numeroPaso === 3) {
      this.renderizarOcupantesLista();
    } else if (numeroPaso === 4) {
      this.renderizarVistaPrevia();
    }
  }

  actualizarNavegacion() {
    const btnAnterior = document.getElementById('btn-anterior');
    const btnSiguiente = document.getElementById('btn-siguiente');

    btnAnterior.disabled = this.pasoActual === 1;

    if (this.pasoActual === this.totalPasos) {
      btnSiguiente.style.display = 'none';
    } else {
      btnSiguiente.innerHTML = 'Siguiente <i class="fas fa-arrow-right"></i>';
      btnSiguiente.style.display = 'flex';
    }
  }

  cargarNombresEnPaso1() {
    const empresaInput = document.getElementById('input-empresa');
    const nivel1Input = document.getElementById('input-nivel1');
    const nivel2Input = document.getElementById('input-nivel2');
    const nivel3Input = document.getElementById('input-nivel3');
    
    if (empresaInput) empresaInput.value = this.configuracion.nombreEmpresa;
    if (nivel1Input) nivel1Input.value = this.configuracion.nombreNivel1;
    if (nivel2Input) nivel2Input.value = this.configuracion.nombreNivel2;
    if (nivel3Input) nivel3Input.value = this.configuracion.nombreNivel3;
  }

  // ===== VALIDACIONES =====
  validarPaso1() {
    const { nombreEmpresa, nombreNivel1, nombreNivel2 } = this.configuracion;

    if (!nombreEmpresa.trim()) {
      this.mostrarNotificacion('Ingresa el nombre de tu empresa', 'warning');
      return false;
    }

    if (!nombreNivel1.trim()) {
      this.mostrarNotificacion('Ingresa el nombre del Nivel 1', 'warning');
      return false;
    }

    if (!nombreNivel2.trim()) {
      this.mostrarNotificacion('Ingresa el nombre del Nivel 2', 'warning');
      return false;
    }

    if (!this.configuracion.nombreNivel3.trim()) {
      this.configuracion.nombreNivel3 = 'Ocupante';
    }

    return true;
  }

  validarPaso2() {
    const nombreNivel1 = this.configuracion.nombreNivel1 || 'elemento';
    const nombreNivel2 = this.configuracion.nombreNivel2 || 'box';

    if (this.configuracion.espacios.length === 0) {
      this.mostrarNotificacion('Agrega al menos un/a ' + nombreNivel1, 'warning');
      return false;
    }

    for (let espacio of this.configuracion.espacios) {
      if (!espacio.pasilloNombre.trim()) {
        this.mostrarNotificacion('Todos los/as ' + nombreNivel1 + ' deben tener nombre', 'warning');
        return false;
      }

      if (espacio.mesas.length === 0) {
        this.mostrarNotificacion('Cada ' + nombreNivel1 + ' debe tener al menos un/a ' + nombreNivel2, 'warning');
        return false;
      }

      for (let mesa of espacio.mesas) {
        if (!mesa.nombre.trim()) {
          this.mostrarNotificacion('Todos los/as ' + nombreNivel2 + ' deben tener nombre', 'warning');
          return false;
        }
      }
    }

    return true;
  }

  // ===== PASO 2: ESPACIOS Y MESAS =====
  actualizarTextosPaso2() {
    const titulo = document.querySelector('#paso-2 .paso-titulo');
    const btnTexto = document.getElementById('btn-agregar-texto');

    const nivel1 = this.configuracion.nombreNivel1 || 'Nivel 1';

    if (titulo) {
      titulo.textContent = 'Configurar Estructura';
    }

    if (btnTexto) {
      btnTexto.textContent = `Agregar ${nivel1}`;
    }
  }

  agregarEspacio() {
    const nuevoEspacio = {
      espacioId: `esp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      numero: this.configuracion.espacios.length + 1,
      pasilloNombre: '',
      mesas: []
    };

    this.configuracion.espacios.push(nuevoEspacio);
    this.renderizarEspacios();
  }

  eliminarEspacio(espacioId) {
    this.configuracion.espacios = this.configuracion.espacios.filter(e => e.espacioId !== espacioId);
    
    this.configuracion.espacios.forEach((espacio, index) => {
      espacio.numero = index + 1;
    });

    this.renderizarEspacios();
  }

  actualizarNombreEspacio(espacioId, valor) {
    const espacio = this.configuracion.espacios.find(e => e.espacioId === espacioId);
    if (espacio) {
      espacio.pasilloNombre = valor;
    }
  }

  agregarMesa(espacioId) {
    const espacio = this.configuracion.espacios.find(e => e.espacioId === espacioId);
    if (espacio) {
      const nuevaMesa = {
        id: `mesa-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        numero: espacio.mesas.length + 1,
        nombre: ''
      };
      espacio.mesas.push(nuevaMesa);
      this.renderizarEspacios();
    }
  }

  eliminarMesa(espacioId, mesaId) {
    const espacio = this.configuracion.espacios.find(e => e.espacioId === espacioId);
    if (espacio) {
      espacio.mesas = espacio.mesas.filter(m => m.id !== mesaId);
      
      espacio.mesas.forEach((mesa, index) => {
        mesa.numero = index + 1;
      });
      
      this.renderizarEspacios();
    }
  }

  actualizarNombreMesa(espacioId, mesaId, valor) {
    const espacio = this.configuracion.espacios.find(e => e.espacioId === espacioId);
    if (espacio) {
      const mesa = espacio.mesas.find(m => m.id === mesaId);
      if (mesa) {
        mesa.nombre = valor;
      }
    }
  }

  renderizarEspacios() {
    const container = document.getElementById('espacios-container');
    
    if (!container) return;

    const nombreNivel1 = this.configuracion.nombreNivel1 || 'Nivel 1';
    const nombreNivel2 = this.configuracion.nombreNivel2 || 'Box';

    if (this.configuracion.espacios.length === 0) {
      container.innerHTML = `
        <div style="text-align: center; padding: 40px 20px; color: var(--text-secondary);">
          <i class="fas fa-warehouse" style="font-size: 48px; opacity: 0.3; margin-bottom: 15px;"></i>
          <p style="font-size: 15px; font-weight: 600;">No hay ${nombreNivel1} configurados</p>
          <p style="font-size: 13px; margin-top: 8px;">Haz clic en "Agregar" para comenzar</p>
        </div>
      `;
      return;
    }

    container.innerHTML = this.configuracion.espacios.map(espacio => `
      <div class="espacio-card">
        <div class="espacio-header">
          <div class="espacio-titulo-editable">
            <div class="espacio-numero">${espacio.numero}</div>
            <input 
              type="text" 
              class="espacio-nombre-input"
              placeholder="Nombre del ${nombreNivel1}..." 
              value="${espacio.pasilloNombre}"
              oninput="parametrizacion.actualizarNombreEspacio('${espacio.espacioId}', this.value)"
            >
            <button class="btn-editar-nombre" title="Editar nombre">
              <i class="fas fa-pencil-alt"></i>
            </button>
          </div>
          <button 
            class="btn-eliminar-espacio" 
            onclick="parametrizacion.eliminarEspacio('${espacio.espacioId}')"
          >
            <i class="fas fa-trash"></i>
            Eliminar
          </button>
        </div>

        <div class="mesas-section">
          ${espacio.mesas.length > 0 ? `
            <div class="mesas-grid">
              ${espacio.mesas.map(mesa => `
                <div class="mesa-card">
                  <button 
                    class="btn-eliminar-mesa" 
                    onclick="parametrizacion.eliminarMesa('${espacio.espacioId}', '${mesa.id}')"
                  >
                    <i class="fas fa-times"></i>
                  </button>
                  <div class="mesa-numero-badge">${mesa.numero}</div>
                  <input 
                    type="text" 
                    placeholder="${nombreNivel2} ${mesa.numero}" 
                    value="${mesa.nombre}"
                    oninput="parametrizacion.actualizarNombreMesa('${espacio.espacioId}', '${mesa.id}', this.value)"
                  >
                </div>
              `).join('')}
            </div>
          ` : ''}
          
          <button 
            class="btn-agregar-mesa" 
            onclick="parametrizacion.agregarMesa('${espacio.espacioId}')"
          >
            <i class="fas fa-plus"></i>
            Agregar ${nombreNivel2}
          </button>
        </div>
      </div>
    `).join('');
  }

  // ===== PASO 3: OCUPANTES =====
  agregarOcupante() {
    const inputNuevoOcupante = document.getElementById('nuevo-ocupante');
    const nombre = inputNuevoOcupante?.value.trim();

    if (!nombre) {
      alert('Por favor ingresa un nombre');
      return;
    }

    this.configuracion.ocupantes.push({
      id: Date.now(),
      nombre
    });

    inputNuevoOcupante.value = '';
    this.renderizarOcupantesLista();
  }

  eliminarOcupante(ocupanteId) {
    this.configuracion.ocupantes = this.configuracion.ocupantes.filter(o => o.id !== ocupanteId);
    this.renderizarOcupantesLista();
  }

  renderizarOcupantesLista() {
    const container = document.getElementById('ocupantes-lista');
    
    if (!container) return;

    if (this.configuracion.ocupantes.length === 0) {
      container.innerHTML = '';
      return;
    }

    container.innerHTML = this.configuracion.ocupantes.map(ocupante => `
      <div class="ocupante-item">
        <div class="ocupante-info">
          <i class="fas fa-user-circle"></i>
          <span>${ocupante.nombre}</span>
        </div>
        <button type="button" class="btn-eliminar-ocupante" onclick="parametrizacion.eliminarOcupante(${ocupante.id})">
          <i class="fas fa-trash"></i>
        </button>
      </div>
    `).join('');
  }

  // ===== PASO 4: VISTA PREVIA =====
  renderizarVistaPrevia() {
    const previewContainer = document.getElementById('preview-final');
    
    if (!previewContainer) return;

    const totalMesas = this.configuracion.espacios.reduce((sum, e) => sum + e.mesas.length, 0);
    const nivel3Display = this.configuracion.nombreNivel3 || 'Ocupante';

    previewContainer.innerHTML = `
      <div class="preview-header">
        <div class="preview-empresa">
          <i class="fas fa-building"></i> ${this.configuracion.nombreEmpresa}
        </div>
        <div class="preview-estructura-info">
          ${this.configuracion.espacios.length} ${this.configuracion.nombreNivel1}
          • ${totalMesas} ${this.configuracion.nombreNivel2}
          • ${this.configuracion.ocupantes.length} ${nivel3Display}
        </div>
      </div>

      <div class="preview-espacios">
        ${this.configuracion.espacios.map(espacio => `
          <div class="preview-espacio-card">
            <div class="preview-espacio-nombre">
              <i class="fas fa-warehouse"></i>
              ${espacio.pasilloNombre}
            </div>
            <div class="preview-mesas-list">
              ${espacio.mesas.map(mesa => `
                <div class="preview-mesa-item">
                  <i class="fas fa-box"></i>
                  ${mesa.nombre}
                </div>
              `).join('')}
            </div>
          </div>
        `).join('')}
      </div>

      ${this.configuracion.ocupantes.length > 0 ? `
        <div class="preview-ocupantes-section">
          <h3 class="preview-ocupantes-title">
            ${nivel3Display}s Registrados/as (${this.configuracion.ocupantes.length})
          </h3>
          <div class="preview-ocupantes-grid">
            ${this.configuracion.ocupantes.map(ocupante => `
              <div class="preview-ocupante-card">
                <i class="fas fa-user-circle"></i>
                ${ocupante.nombre}
              </div>
            `).join('')}
          </div>
        </div>
      ` : ''}
    `;
  }

  // ===== GUARDAR =====

  async guardarConfiguracion() {
    const loadingOverlay = this.mostrarLoading();

    try {
      const response = await fetch('/parametrizacion/guardar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          configuracion: this.configuracion,
          desde: this.desde 
        })
      });

      const result = await response.json();

      if (result.success) {
        this.mostrarNotificacion('¡Configuración guardada!', 'success');
        
        setTimeout(() => {
          window.location.href = result.redirect || '/bienvenida';
        }, 1500);
      } else {
        throw new Error(result.message || 'Error al guardar');
      }

    } catch (error) {
      console.error('Error:', error);
      this.mostrarNotificacion('Error: ' + error.message, 'error');
    } finally {
      this.ocultarLoading(loadingOverlay);
    }
  }

  // ===== UTILIDADES =====
  mostrarNotificacion(mensaje, tipo = 'info') {
    const iconos = {
      success: 'fa-check-circle',
      error: 'fa-exclamation-circle',
      warning: 'fa-exclamation-triangle'
    };

    const notif = document.createElement('div');
    notif.className = `notificacion notificacion-${tipo}`;
    notif.innerHTML = `<i class="fas ${iconos[tipo]}"></i><span>${mensaje}</span>`;

    document.body.appendChild(notif);

    setTimeout(() => {
      notif.remove();
    }, 3000);
  }

  mostrarLoading() {
    const overlay = document.createElement('div');
    overlay.className = 'loading-overlay active';
    overlay.innerHTML = `
      <div class="loading-content">
        <div class="spinner"></div>
        <p>Guardando...</p>
      </div>
    `;
    document.body.appendChild(overlay);
    return overlay;
  }

  ocultarLoading(overlay) {
    if (overlay) {
      overlay.remove();
    }
  }
}

let parametrizacion;

document.addEventListener('DOMContentLoaded', () => {
  parametrizacion = new ParametrizacionManager();
});
