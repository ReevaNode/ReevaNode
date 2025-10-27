// matriz_box.js

// actualizar hora de ultima actualizacion
function updateTime() {
    const now = new Date();
    const timeElement = document.getElementById('last-update-time');
    if (timeElement) {
        timeElement.textContent = now.toLocaleString('es-ES');
    }
}

// aplicar ancho a las barras de progreso
function initializeProgressBars() {
    document.querySelectorAll('.progress-fill[data-progress]').forEach(el => {
        const val = parseFloat(el.getAttribute('data-progress')) || 0;
        el.style.width = val + '%';
    });
}

// cambiar entre vista detallada y compacta
function cambiarVista(vista) {
    const container = document.getElementById('boxes-container');
    const btnDetallada = document.getElementById('btn-vista-detallada');
    const btnCompacta = document.getElementById('btn-vista-compacta');
    
    if (vista === 'compacta') {
        container.classList.add('vista-compacta');
        btnCompacta.classList.add('active');
        btnDetallada.classList.remove('active');
        localStorage.setItem('vistaMatriz', 'compacta');
    } else {
        container.classList.remove('vista-compacta');
        btnDetallada.classList.add('active');
        btnCompacta.classList.remove('active');
        localStorage.setItem('vistaMatriz', 'detallada');
    }
}

// colapsar/expandir seccion de especialidad
function toggleEspecialidad(especialidad) {
    const container = document.querySelector(`[data-especialidad="${especialidad}"] .boxes-container`);
    const icon = document.querySelector(`[data-especialidad="${especialidad}"] .collapse-icon`);
    
    if (container && icon) {
        container.classList.toggle('collapsed');
        icon.classList.toggle('collapsed');
    }
}

// contar boxes por estado y mostrar badges
function updateStatusSummary() {
    const boxes = document.querySelectorAll('.box-card');
    const counts = {
        total: boxes.length,
        libre: 0,
        atencion: 0,
        reservado: 0,
        finalizado: 0,
        inhabilitado: 0
    };

    boxes.forEach(box => {
        const estado = box.dataset.estado.toLowerCase();
        if (estado.includes('inhabilitado')) {
            counts.inhabilitado++;
        } else if (estado.includes('libre')) {
            counts.libre++;
        } else if (estado.includes('atención') || estado.includes('atencion')) {
            counts.atencion++;
        } else if (estado.includes('esperando') || estado.includes('ausente')) {
            counts.reservado++;
        } else if (estado.includes('finalizado')) {
            counts.finalizado++;
        }
    });

    const summaryContainer = document.getElementById('status-summary');
    if (summaryContainer) {
        summaryContainer.innerHTML = `
            <button class="status-filter-btn status-filter-total" onclick="filterByStatus('')">Total: ${counts.total}</button>
            <button class="status-filter-btn status-filter-libre" onclick="filterByStatus('libre')">Libre: ${counts.libre}</button>
            <button class="status-filter-btn status-filter-reservado" onclick="filterByStatus('esperando')">Reservado: ${counts.reservado}</button>
            <button class="status-filter-btn status-filter-atencion" onclick="filterByStatus('atencion')">En Atención: ${counts.atencion}</button>
            <button class="status-filter-btn status-filter-finalizado" onclick="filterByStatus('finalizado')">Finalizado: ${counts.finalizado}</button>
            <button class="status-filter-btn status-filter-inhabilitado" onclick="filterByStatus('inhabilitado')">Inhabilitado: ${counts.inhabilitado}</button>
        `;
    }
}

// filtrar cuando se hace click en los badges de arriba
function filterByStatus(estado, event) {
    const estadoFilter = document.getElementById('estadoFilter');
    
    // limpiar otros filtros
    document.getElementById('searchInput').value = '';
    document.getElementById('especialidadFilter').value = '';
    
    let filtroEstado = '';
    if (estado === 'libre') {
        filtroEstado = 'libre';
    } else if (estado === 'atención' || estado === 'atencion') {
        filtroEstado = 'en atención';
    } else if (estado === 'esperando') {
        // reservado agrupa paciente esperando y paciente ausente
        filtroEstado = 'reservado';
    } else if (estado === 'finalizado') {
        filtroEstado = 'finalizado';
    } else if (estado === 'inhabilitado') {
        filtroEstado = 'inhabilitado';
    }
    
    // setear el dropdown con el filtro elegido
    estadoFilter.value = filtroEstado;
    
    // marcar el badge activo
    const badges = document.querySelectorAll('#status-summary .status-filter-btn');
    badges.forEach(badge => badge.classList.remove('status-active'));
    if (estado !== '' && event && event.target) {
        event.target.classList.add('status-active');
    }
    
    // aplicar el filtro
    filterBoxes();
}

// aplicar filtros de busqueda/especialidad/estado
function filterBoxes() {
    const searchInput = document.getElementById('searchInput');
    const especialidadFilter = document.getElementById('especialidadFilter');
    const estadoFilter = document.getElementById('estadoFilter');
    
    const searchText = searchInput.value.toLowerCase().trim();
    const especialidadValue = especialidadFilter.value.toLowerCase();
    const estadoValue = estadoFilter.value.toLowerCase();
    
    const sections = document.querySelectorAll('.especialidad-section');
    let hasVisibleBoxes = false;
    
    sections.forEach(section => {
        const boxes = section.querySelectorAll('.box-card');
        let sectionHasVisibleBox = false;
        
        boxes.forEach(box => {
            const boxNumero = box.dataset.numero.toLowerCase();
            const boxEspecialidad = box.dataset.especialidad.toLowerCase();
            const boxEstado = box.dataset.estado.toLowerCase();
            
            let matchSearch = true;
            let matchEspecialidad = true;
            let matchEstado = true;
            
            // filtro por numero
            if (searchText && !boxNumero.includes(searchText)) {
                matchSearch = false;
            }
            
            // filtro por especialidad
            if (especialidadValue && boxEspecialidad !== especialidadValue) {
                matchEspecialidad = false;
            }
            
            // filtro por estado
            if (estadoValue) {
                if (estadoValue === 'reservado') {
                    // reservado incluye esperando y ausente
                    if (!boxEstado.includes('esperando') && !boxEstado.includes('ausente')) {
                        matchEstado = false;
                    }
                } else {
                    if (!boxEstado.includes(estadoValue)) {
                        matchEstado = false;
                    }
                }
            }
            
            // mostrar o esconder box
            if (matchSearch && matchEspecialidad && matchEstado) {
                box.style.display = 'block';
                sectionHasVisibleBox = true;
                hasVisibleBoxes = true;
            } else {
                box.style.display = 'none';
            }
        });
        
        // mostrar o esconder seccion completa
        section.style.display = sectionHasVisibleBox ? 'block' : 'none';
    });
    
    // mensaje de sin resultados
    const noResults = document.getElementById('no-filter-results');
    if (noResults) {
        noResults.style.display = hasVisibleBoxes ? 'none' : 'block';
    }
}

// init cuando carga la pagina
document.addEventListener('DOMContentLoaded', function() {
    console.log('matriz box js cargado');
    
    updateTime();
    initializeProgressBars();
    updateStatusSummary();
    
    // restaurar vista guardada
    const vistaGuardada = localStorage.getItem('vistaMatriz') || 'detallada';
    cambiarVista(vistaGuardada);
    
    // listeners para los filtros
    const searchInput = document.getElementById('searchInput');
    const especialidadFilter = document.getElementById('especialidadFilter');
    const estadoFilter = document.getElementById('estadoFilter');
    
    if (searchInput) {
        searchInput.addEventListener('input', filterBoxes);
    }
    
    if (especialidadFilter) {
        especialidadFilter.addEventListener('change', filterBoxes);
    }
    
    if (estadoFilter) {
        estadoFilter.addEventListener('change', filterBoxes);
    }
});
