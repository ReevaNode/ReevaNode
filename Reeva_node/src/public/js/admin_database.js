// admin database javascript
console.log('admin db js loaded');

// definicion de relaciones entre campos y tablas FK
const CAMPOS_RELACION = {
    idBox: { tabla: 'box', clavePrimaria: 'idBox' },
    idEstado: { tabla: 'tipoestado', clavePrimaria: 'idTipoEstado' },
    idTipoItem: { tabla: 'tipoitem', clavePrimaria: 'idTipoItem' },
    idTipoConsulta: { tabla: 'tipoconsulta', clavePrimaria: 'idTipoConsulta' },
    idUsuario: { tabla: 'usuario', clavePrimaria: 'idUsuario' },
    idEstadoBox: { tabla: 'estadobox', clavePrimaria: 'idEstadoBox' }
};

let currentTable = '';
let currentData = [];
let lastEvaluatedKey = null;
let currentLimit = 50;
let totalRecords = 0;
let tableFields = [];
let fieldInfo = {};
let editingId = null;
let currentFilters = {
    filter_field: '',
    filter_value: ''
};

// cargar datos de una tabla
async function loadTable(tableName, reset = true) {
    console.log('loading table:', tableName);
    
    currentTable = tableName;
    
    if (reset) {
        lastEvaluatedKey = null;
        currentData = [];
    }
    
    document.getElementById('contentArea').style.display = 'block';
    document.getElementById('contentTitle').textContent = `tabla: ${tableName}`;
    
    // determinar si es tabla agenda
    const isAgenda = tableName === 'agenda';
    
    // mostrar/ocultar filtro de fecha para agenda
    const agendaDateFilter = document.getElementById('agendaDateFilter');
    if (agendaDateFilter) {
        agendaDateFilter.style.display = isAgenda ? 'block' : 'none';
        
        // establecer fecha de hoy por defecto si es agenda
        if (isAgenda && reset) {
            const today = new Date().toISOString().split('T')[0];
            const dateStart = document.getElementById('agendaDateStart');
            if (dateStart && !dateStart.value) {
                dateStart.value = today;
            }
        }
    }
    
    // mostrar/ocultar botones segun tabla
    ['btnFilters', 'btnCreate', 'btnRefresh'].forEach(id => {
        const btn = document.getElementById(id);
        if (btn) btn.style.display = 'inline-block';
    });
    
    // botones multiples solo para agenda
    ['btnCreateMultiple', 'btnUpdateMultiple', 'btnDeleteMultiple'].forEach(id => {
        const btn = document.getElementById(id);
        if (btn) btn.style.display = isAgenda ? 'inline-block' : 'none';
    });
    
    document.getElementById('tableContainer').innerHTML = '<div class="loading">cargando datos...</div>';
    const pagination = document.getElementById('pagination');
    if (pagination) pagination.style.display = 'none';
    
    // construir parametros de consulta
    const params = new URLSearchParams({
        limit: currentLimit,
        ...currentFilters
    });
    
    if (lastEvaluatedKey) {
        params.append('lastKey', JSON.stringify(lastEvaluatedKey));
    }
    
    try {
        const response = await fetch(`/admin-bdd/api/${tableName}/list?${params}`);
        const data = await response.json();
        
        if (data.success) {
            if (reset) {
                currentData = data.data;
            } else {
                currentData = currentData.concat(data.data);
            }
            
            // ordenamiento especifico por tabla
            if (currentData.length > 0) {
                // agenda: mas recientes primero (por horainicio DESC)
                if (tableName === 'agenda') {
                    currentData.sort((a, b) => {
                        const dateA = new Date(a.horainicio || 0);
                        const dateB = new Date(b.horainicio || 0);
                        return dateB - dateA; // DESC
                    });
                }
                // tablas de catalogo: ordenar por ID ASC
                else if (['box', 'estadobox', 'personalizacion', 'tipobox', 'tipoconsulta', 
                          'tipoestado', 'tipoitem', 'tipoprofesional', 'tipousuario'].includes(tableName)) {
                    // mapeo de claves primarias
                    const primaryKeys = {
                        'box': 'idBox',
                        'estadobox': 'idEstado',
                        'personalizacion': 'idPersonalizacion',
                        'tipobox': 'idTipoBox',
                        'tipoconsulta': 'idTipoConsulta',
                        'tipoestado': 'idTipoEstado',
                        'tipoitem': 'idTipoItem',
                        'tipoprofesional': 'idTipoProfesional',
                        'tipousuario': 'idTipoUsuario'
                    };
                    
                    const pkField = primaryKeys[tableName];
                    if (pkField) {
                        currentData.sort((a, b) => {
                            const valA = a[pkField];
                            const valB = b[pkField];
                            
                            // intentar conversion numerica para IDs
                            const numA = parseInt(valA);
                            const numB = parseInt(valB);
                            
                            if (!isNaN(numA) && !isNaN(numB)) {
                                return numA - numB; // orden numerico ASC
                            }
                            
                            // fallback a string
                            return String(valA).localeCompare(String(valB)); // ASC
                        });
                    }
                }
                // items y usuario: sin ordenamiento especifico (dejar como viene de DB)
            }
            
            tableFields = data.fields;
            fieldInfo = data.field_info || {};
            totalRecords = data.total || currentData.length;
            lastEvaluatedKey = data.lastEvaluatedKey || null;
            
            renderTable(currentData, data.fields);
            renderPagination();
            populateFilterOptions();
        } else {
            showAlert('error', data.error || 'error al cargar datos');
        }
    } catch (error) {
        showAlert('error', 'error de conexion: ' + error.message);
    }
}

// renderizar tabla
function renderTable(data, fields) {
    if (data.length === 0) {
        document.getElementById('tableContainer').innerHTML = '<div class="loading">no hay datos en esta tabla</div>';
        return;
    }

    let html = '<table class="data-table"><thead><tr>';
    
    // headers con onclick para ordenar
    fields.forEach(field => {
        html += `<th style="cursor: pointer;" onclick="sortByColumn('${field}')" title="Click para ordenar por ${field}">${field}</th>`;
    });
    html += '<th>acciones</th></tr></thead><tbody>';
    
    // rows con formato mejorado
    data.forEach((row, index) => {
        html += '<tr>';
        fields.forEach(field => {
            let value = row[field];
            if (value === null || value === undefined) value = '';
            
            // si hay un valor display para fk, usarlo
            const displayField = `${field}_display`;
            if (row[displayField] !== undefined) {
                value = row[displayField];
            }
            
            // mostrar solo el valor formateado
            if (typeof value === 'string' && value.length > 50) {
                value = value.substring(0, 50) + '...';
            }
            
            html += `<td title="${row[displayField] || row[field] || ''}">${value}</td>`;
        });
        html += `<td>
            <button class="btn btn-primary" onclick="editRecord(${index})" style="margin-right: 0.25rem; padding: 0.25rem 0.5rem; font-size: 0.8rem;">editar</button>
            <button class="btn btn-danger" onclick="deleteRecord(${index})" style="padding: 0.25rem 0.5rem; font-size: 0.8rem;">eliminar</button>
        </td></tr>`;
    });
    
    html += '</tbody></table>';
    document.getElementById('tableContainer').innerHTML = html;
}

// ordenar tabla por columna
function sortByColumn(columnName) {
    if (currentData.length === 0) return;
    
    // detectar direccion de ordenamiento
    const lastSortColumn = currentFilters.order_by;
    const lastSortDir = currentFilters.order_dir || 'asc';
    
    let newDir = 'asc';
    if (lastSortColumn === columnName && lastSortDir === 'asc') {
        newDir = 'desc';
    }
    
    // ordenar datos en memoria
    currentData.sort((a, b) => {
        let valA = a[columnName];
        let valB = b[columnName];
        
        // manejar valores null/undefined
        if (valA === null || valA === undefined) valA = '';
        if (valB === null || valB === undefined) valB = '';
        
        // convertir a string para comparacion
        valA = String(valA).toLowerCase();
        valB = String(valB).toLowerCase();
        
        if (newDir === 'asc') {
            return valA < valB ? -1 : valA > valB ? 1 : 0;
        } else {
            return valA > valB ? -1 : valA < valB ? 1 : 0;
        }
    });
    
    // actualizar filtros actuales
    currentFilters.order_by = columnName;
    currentFilters.order_dir = newDir;
    
    // re-renderizar tabla
    renderTable(currentData, tableFields);
}

// renderizar paginacion
function renderPagination() {
    const paginationInfo = document.getElementById('paginationInfo');
    if (paginationInfo) {
        paginationInfo.textContent = `mostrando ${currentData.length} registros`;
    }
    
    let controls = '';
    if (lastEvaluatedKey) {
        controls += '<button class="btn btn-secondary" onclick="loadTable(currentTable, false)">cargar mas</button>';
    }
    
    const paginationControls = document.getElementById('paginationControls');
    if (paginationControls) {
        paginationControls.innerHTML = controls;
        document.getElementById('pagination').style.display = 'flex';
    }
}

// funciones de filtros
function toggleFilters() {
    const section = document.getElementById('filtersSection');
    if (section) {
        section.style.display = section.style.display === 'block' ? 'none' : 'block';
    }
}

function populateFilterOptions() {
    const filterFieldSelect = document.getElementById('filterField');
    
    if (filterFieldSelect) {
        filterFieldSelect.innerHTML = '<option value="">seleccionar campo...</option>';
        tableFields.forEach(field => {
            filterFieldSelect.innerHTML += `<option value="${field}">${field}</option>`;
        });
        filterFieldSelect.value = currentFilters.filter_field;
        
        // agregar evento para cambiar el tipo de input segun el campo seleccionado
        filterFieldSelect.addEventListener('change', async function() {
            await updateFilterValueInput(this.value);
        });
    }
    
    // poblar selector de ordenamiento con los mismos campos
    const sortFieldSelect = document.getElementById('sortField');
    if (sortFieldSelect) {
        sortFieldSelect.innerHTML = '<option value="">sin ordenamiento...</option>';
        tableFields.forEach(field => {
            sortFieldSelect.innerHTML += `<option value="${field}">${field}</option>`;
        });
    }
    
    const filterValue = document.getElementById('filterValue');
    if (filterValue) {
        filterValue.value = currentFilters.filter_value;
    }
}

// funcion para actualizar el input de filtro segun el tipo de campo
async function updateFilterValueInput(fieldName) {
    const filterValueContainer = document.getElementById('filterValue');
    if (!filterValueContainer) return;
    
    const parentDiv = filterValueContainer.parentElement;
    
    // si el campo esta en CAMPOS_RELACION, crear un select
    const relacionConfig = CAMPOS_RELACION[fieldName];
    
    if (relacionConfig) {
        const { tabla } = relacionConfig;
        
        try {
            const response = await fetch(`/admin-bdd/api/${currentTable}/field-options?field=${fieldName}`);
            const data = await response.json();
            
            if (data.success && data.options) {
                const isUserField = fieldName.toLowerCase().includes('usuario') || tabla === 'usuario';
                
                let newHTML = '';
                
                // agregar checkbox para campos de usuario
                if (isUserField) {
                    newHTML += `
                        <div class="mb-2">
                            <label class="inline-flex items-center">
                                <input type="checkbox" id="toggle-filter-${fieldName}" 
                                    onchange="toggleFilterUserDisplay('${fieldName}')" class="mr-2">
                                <span class="text-sm">mostrar como IDs</span>
                            </label>
                        </div>
                    `;
                }
                
                newHTML += `
                    <select id="filterValue" class="w-full border rounded p-2">
                        <option value="">seleccionar ${fieldName}...</option>
                `;
                
                data.options.forEach(option => {
                    const label = option.label || option.value;
                    const dataLabel = option.rawData && option.rawData.nombreProfesional ? option.rawData.nombreProfesional : label;
                    newHTML += `<option value="${option.value}" data-label="${dataLabel}">${label}</option>`;
                });
                
                newHTML += '</select>';
                
                parentDiv.innerHTML = newHTML;
            }
        } catch (error) {
            console.error('error obteniendo opciones:', error);
        }
    } else {
        // volver a input de texto normal
        parentDiv.innerHTML = `
            <input type="text" id="filterValue" class="w-full border rounded p-2" placeholder="ingrese valor...">
        `;
    }
}

// toggle para campos de usuario en filtros
function toggleFilterUserDisplay(fieldName) {
    const checkbox = document.getElementById(`toggle-filter-${fieldName}`);
    const select = document.getElementById('filterValue');
    
    if (!checkbox || !select) return;
    
    const showAsId = checkbox.checked;
    
    Array.from(select.options).forEach(option => {
        if (option.value) {
            const label = option.getAttribute('data-label');
            const id = option.value;
            
            if (showAsId) {
                option.textContent = id;
            } else {
                option.textContent = label || id;
            }
        }
    });
}


function applyFilters() {
    const filterField = document.getElementById('filterField');
    const filterValue = document.getElementById('filterValue');
    
    if (!filterField || !filterValue) return;
    
    const campo = filterField.value;
    const valor = filterValue.value.trim();
    
    if (!campo || !valor) {
        showAlert('error', 'debes seleccionar un campo y especificar un valor');
        return;
    }
    
    // filtrar datos en memoria
    let filteredData = [...currentData];
    
    filteredData = filteredData.filter(record => {
        const valorCampo = record[campo];
        
        // si el campo no existe, no coincide
        if (valorCampo === undefined || valorCampo === null) {
            return false;
        }
        
        const valorCampoStr = String(valorCampo);
        const valorBuscado = valor.toLowerCase();
        
        // busqueda especifica por tipo de campo
        if (campo.toLowerCase().includes('hora') || campo.toLowerCase().includes('fecha')) {
            // para fechas/horas, buscar coincidencias parciales
            // ejemplos:
            // - valorCampo: "2025-10-27 15:00:00"
            // - búsquedas válidas: "2025-10-27", "15:00", "2025-10-27 15:00", etc.
            return valorCampoStr.toLowerCase().includes(valorBuscado);
        } else if (campo.toLowerCase().includes('id')) {
            // para IDs (que pueden ser strings como "1", "65", etc)
            // comparar primero como strings exactos o parciales
            const valorCampoLower = valorCampoStr.toLowerCase();
            
            // 1. comparacion exacta de strings (ej: "65" === "65")
            if (valorCampoLower === valorBuscado) {
                return true;
            }
            
            // 2. comparacion parcial (ej: "6" incluido en "65")
            if (valorCampoLower.includes(valorBuscado)) {
                return true;
            }
            
            // 3. comparacion numerica solo si ambos pueden convertirse a numero
            // (util para comparar "65" con 65)
            const numCampo = Number(valorCampoStr);
            const numBuscado = Number(valor);
            if (!isNaN(numCampo) && !isNaN(numBuscado)) {
                return numCampo === numBuscado;
            }
            
            return false;
        } else {
            // para otros campos, busqueda flexible (contiene)
            return valorCampoStr.toLowerCase().includes(valorBuscado);
        }
    });
    
    // aplicar ordenamiento si se especificó
    const sortField = document.getElementById('sortField');
    const sortOrder = document.getElementById('sortOrder');
    
    if (sortField && sortField.value) {
        const field = sortField.value;
        const order = sortOrder ? sortOrder.value : 'asc';
        filteredData = sortData(filteredData, field, order);
    }
    
    if (filteredData.length === 0) {
        showAlert('info', `no se encontraron registros que coincidan con "${valor}" en ${campo}`);
    } else {
        const sortMsg = sortField && sortField.value 
            ? ` (ordenados por ${sortField.value} ${sortOrder.value === 'asc' ? 'ascendente' : 'descendente'})` 
            : '';
        showAlert('success', `se encontraron ${filteredData.length} registros${sortMsg}`);
    }
    
    // renderizar solo los datos filtrados
    renderTable(filteredData, tableFields);
}

function clearFilters() {
    currentFilters = {
        filter_field: '',
        filter_value: ''
    };
    
    // limpiar también los selectores de ordenamiento
    const sortField = document.getElementById('sortField');
    const sortOrder = document.getElementById('sortOrder');
    if (sortField) sortField.value = '';
    if (sortOrder) sortOrder.value = 'asc';
    
    // recargar tabla sin filtros
    loadTable(currentTable, true);
}

// funcion auxiliar para ordenar datos
function sortData(data, field, order = 'asc') {
    if (!field) return data;
    
    return [...data].sort((a, b) => {
        let valueA = a[field];
        let valueB = b[field];
        
        // manejar valores null/undefined
        if (valueA === null || valueA === undefined) valueA = '';
        if (valueB === null || valueB === undefined) valueB = '';
        
        // detectar tipo de dato para comparación apropiada
        const numA = Number(valueA);
        const numB = Number(valueB);
        
        if (!isNaN(numA) && !isNaN(numB)) {
            // comparación numérica
            return order === 'asc' ? numA - numB : numB - numA;
        } else if (field.toLowerCase().includes('fecha') || field.toLowerCase().includes('hora')) {
            // comparación de fechas
            const dateA = new Date(valueA);
            const dateB = new Date(valueB);
            return order === 'asc' ? dateA - dateB : dateB - dateA;
        } else {
            // comparación de strings
            const strA = String(valueA).toLowerCase();
            const strB = String(valueB).toLowerCase();
            if (order === 'asc') {
                return strA.localeCompare(strB);
            } else {
                return strB.localeCompare(strA);
            }
        }
    });
}

// funciones especificas para filtro de fecha de agenda
async function applyAgendaDateFilter() {
    if (currentTable !== 'agenda') {
        showAlert('error', 'este filtro solo funciona para la tabla agenda');
        return;
    }
    
    const dateStart = document.getElementById('agendaDateStart');
    const dateEnd = document.getElementById('agendaDateEnd');
    
    if (!dateStart || !dateStart.value) {
        showAlert('error', 'debes seleccionar al menos una fecha de inicio');
        return;
    }
    
    const startDate = dateStart.value; // formato: "2025-10-27"
    const endDate = dateEnd && dateEnd.value ? dateEnd.value : startDate;
    
    // mostrar loading
    document.getElementById('tableContainer').innerHTML = '<div class="loading">buscando agendas...</div>';
    
    try {
        // construir parametros para consulta por indice
        const params = new URLSearchParams({
            dateStart: startDate,
            dateEnd: endDate,
            limit: 1000 // obtener muchos registros para el rango de fecha
        });
        
        const response = await fetch(`/admin-bdd/api/agenda/by-date?${params}`);
        const data = await response.json();
        
        if (data.success) {
            currentData = data.data || [];
            
            // aplicar ordenamiento por horainicio DESC por defecto
            currentData.sort((a, b) => {
                const dateA = new Date(a.horainicio || 0);
                const dateB = new Date(b.horainicio || 0);
                return dateB - dateA;
            });
            
            // aplicar ordenamiento adicional si se especificó
            const sortField = document.getElementById('sortField');
            const sortOrder = document.getElementById('sortOrder');
            if (sortField && sortField.value) {
                currentData = sortData(currentData, sortField.value, sortOrder ? sortOrder.value : 'asc');
            }
            
            const sortMsg = sortField && sortField.value 
                ? ` (ordenados por ${sortField.value} ${sortOrder.value === 'asc' ? 'ascendente' : 'descendente'})` 
                : '';
            showAlert('success', `se encontraron ${currentData.length} agendas entre ${startDate} y ${endDate}${sortMsg}`);
            renderTable(currentData, tableFields);
        } else {
            showAlert('error', data.error || 'error al buscar agendas');
            currentData = [];
            renderTable([], tableFields);
        }
    } catch (error) {
        console.error('error aplicando filtro de fecha:', error);
        showAlert('error', 'error de conexión: ' + error.message);
    }
}

function clearAgendaDateFilter() {
    const dateStart = document.getElementById('agendaDateStart');
    const dateEnd = document.getElementById('agendaDateEnd');
    
    if (dateStart) dateStart.value = '';
    if (dateEnd) dateEnd.value = '';
    
    // recargar tabla sin filtro de fecha
    loadTable(currentTable, true);
}

// refresh table
function refreshTable() {
    if (currentTable) {
        loadTable(currentTable, true);
    }
}

// funciones de modales
function showCreateModal(multiple = false) {
    const modal = document.getElementById('formModal');
    if (!modal) return;
    
    editingId = null;
    const modalTitle = document.getElementById('modalTitle');
    
    // modo multiple solo para agenda
    if (multiple && currentTable === 'agenda') {
        if (modalTitle) modalTitle.textContent = 'crear multiples agendas';
        renderAgendaMultipleForm();
        modal.style.display = 'block';
        return;
    }
    
    // modo simple (todas las tablas)
    if (modalTitle) modalTitle.textContent = 'crear nuevo registro';
    
    // ocultar modo multiple
    const multipleCheckbox = document.getElementById('multipleCheckbox');
    if (multipleCheckbox) multipleCheckbox.style.display = 'none';
    
    const singleMode = document.getElementById('singleMode');
    const multipleMode = document.getElementById('multipleMode');
    if (singleMode) singleMode.style.display = 'block';
    if (multipleMode) multipleMode.style.display = 'none';
    
    renderFormFields({});
    modal.style.display = 'block';
}

function showUpdateModal() {
    const modal = document.getElementById('updateModal');
    if (!modal) {
        showAlert('error', 'modal de actualizacion no encontrado');
        return;
    }
    
    if (currentTable === 'agenda') {
        renderAgendaUpdateForm();
    } else {
        renderFilterFields('updateFilters');
        renderUpdateFields();
    }
    
    modal.style.display = 'block';
}

function showDeleteModal() {
    const modal = document.getElementById('deleteModal');
    if (!modal) {
        showAlert('error', 'modal de eliminacion no encontrado');
        return;
    }
    
    if (currentTable === 'agenda') {
        renderAgendaDeleteForm();
    } else {
        renderFilterFields('deleteFilters');
    }
    
    modal.style.display = 'block';
}

function closeModal() {
    const modal = document.getElementById('formModal');
    if (modal) modal.style.display = 'none';
}

// editar y eliminar registros
function editRecord(index) {
    const record = currentData[index];
    if (!record) return;
    
    editingId = record[tableFields[0]]; // usar primer campo como id
    
    const modalTitle = document.getElementById('modalTitle');
    if (modalTitle) {
        modalTitle.textContent = 'editar registro';
    }
    
    // ocultar checkbox de multiple en edicion
    const multipleCheckbox = document.getElementById('multipleCheckbox');
    if (multipleCheckbox) multipleCheckbox.style.display = 'none';
    
    const singleMode = document.getElementById('singleMode');
    const multipleMode = document.getElementById('multipleMode');
    if (singleMode) singleMode.style.display = 'block';
    if (multipleMode) multipleMode.style.display = 'none';
    
    renderFormFields(record);
    const modal = document.getElementById('formModal');
    if (modal) {
        modal.style.display = 'block';
    }
}

function deleteRecord(index) {
    const record = currentData[index];
    if (!record) return;
    
    if (!confirm('estas seguro de que quieres eliminar este registro?')) {
        return;
    }
    
    // mapeo de claves primarias por tabla (debe coincidir con el backend)
    const primaryKeyMap = {
        'agenda': 'idAgenda',
        'box': 'idBox',
        'estadobox': 'idEstado',
        'items': 'idItem',
        'personalizacion': 'idPers',
        'tipobox': 'idTipoBox',
        'tipoconsulta': 'idTipoConsulta',
        'tipoestado': 'idTipoEstado',
        'tipoitem': 'idTipoItem',
        'tipoprofesional': 'idTipoProfesional',
        'tipousuario': 'idTipoUsuario',
        'usuario': 'idUsuario'
    };
    
    const primaryKey = primaryKeyMap[currentTable];
    if (!primaryKey) {
        showAlert('error', 'no se pudo determinar la clave primaria');
        return;
    }
    
    const deleteData = { [primaryKey]: record[primaryKey] };

    fetch(`/admin-bdd/api/${currentTable}/delete`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(deleteData)
    })
    .then(response => response.json())
    .then(result => {
        if (result.success) {
            showAlert('success', 'registro eliminado correctamente');
            refreshTable();
        } else {
            showAlert('error', result.error || 'error al eliminar');
        }
    })
    .catch(error => {
        showAlert('error', 'error de conexion: ' + error.message);
    });
}

// alerts
function showAlert(type, message) {
    console.log(`alert ${type}: ${message}`);
    
    const alertSuccess = document.getElementById('alertSuccess');
    const alertError = document.getElementById('alertError');
    
    if (alertSuccess) alertSuccess.style.display = 'none';
    if (alertError) alertError.style.display = 'none';
    
    if (type === 'success' && alertSuccess) {
        alertSuccess.textContent = message;
        alertSuccess.style.display = 'block';
    } else if (alertError) {
        alertError.textContent = message;
        alertError.style.display = 'block';
    }
    
    setTimeout(() => {
        if (alertSuccess) alertSuccess.style.display = 'none';
        if (alertError) alertError.style.display = 'none';
    }, 5000);
}

// renderizar campos del formulario
async function renderFormFields(data) {
    let html = '';
    
    // mapeo de claves primarias por tabla (debe coincidir con el backend)
    const primaryKeyMap = {
        'agenda': 'idAgenda',
        'box': 'idBox',
        'estadobox': 'idEstado',
        'items': 'idItem',
        'personalizacion': 'idPers',
        'tipobox': 'idTipoBox',
        'tipoconsulta': 'idTipoConsulta',
        'tipoestado': 'idTipoEstado',
        'tipoitem': 'idTipoItem',
        'tipoprofesional': 'idTipoProfesional',
        'tipousuario': 'idTipoUsuario',
        'usuario': 'idUsuario'
    };
    
    const tablePrimaryKey = primaryKeyMap[currentTable];
    
    for (const field of tableFields) {
        const value = data ? (data[field] || '') : '';
        const fieldData = fieldInfo[field] || {};
        
        // determinar si este campo es LA clave primaria de esta tabla
        const isPrimaryKey = (field === tablePrimaryKey);
        
        // si estamos creando: omitir campo PK (se autogenera con UUID)
        if (!editingId && isPrimaryKey) {
            continue; // omitir campo PK al crear
        }
        
        // al editar: mostrar PK como readonly + hidden para enviar
        if (editingId && isPrimaryKey) {
            html += `
                <div class="form-group">
                    <label class="block text-sm text-gray-600 mb-2">${field} (no modificable)</label>
                    <input type="text" value="${value}" readonly 
                           class="w-full border rounded p-2 bg-gray-100" />
                    <input type="hidden" name="${field}" value="${value}" />
                </div>
            `;
        } else if (fieldData.is_relation) {
            // campo fk con select
            const options = await getFieldOptions(field);
            
            // determinar si es un campo de usuario para agregar el toggle
            const isUserField = (field === 'idUsuario' || field.toLowerCase().includes('usuario'));
            
            html += `
                <div class="form-group">
                    <label class="block text-sm text-gray-600 mb-2">${field}</label>
                    ${isUserField ? `
                        <div class="flex items-center gap-2 mb-2">
                            <input type="checkbox" id="toggle-${field}" onchange="toggleUserDisplay('${field}')" />
                            <label for="toggle-${field}" class="text-xs text-gray-500">Mostrar como IDs</label>
                        </div>
                    ` : ''}
                    <select name="${field}" id="select-${field}" class="w-full border rounded p-2 focus:border-primary focus:ring-primary bg-white">
                        <option value="">— seleccionar ${field} —</option>`;
            
            options.forEach(option => {
                const selected = value == option.value ? 'selected' : '';
                html += `<option value="${option.value}" ${selected} data-label="${option.label}">${option.label}</option>`;
            });
            
            html += `</select></div>`;
        } else if (field.toLowerCase().includes('horainicio') || field.toLowerCase().includes('horatermino')) {
            // campos especificos de hora inicio/termino usando el mismo patron que infobox/agenda
            let timeValue = '';
            let dateValue = '';
            
            if (value) {
                // el valor viene como "2025-08-17t08:00:00" (formato iso)
                if (value.includes('t') || value.includes('T')) {
                    // formato iso: "2025-08-17t08:00:00"
                    const parts = value.toLowerCase().split('t');
                    dateValue = parts[0]; // "2025-08-17"
                    timeValue = parts[1].substring(0, 5); // "08:00"
                } else if (value.includes(' ')) {
                    // formato con espacio: "2025-08-17 08:00:00"
                    const parts = value.split(' ');
                    dateValue = parts[0]; // "2025-08-17"
                    timeValue = parts[1].substring(0, 5); // "08:00"
                } else if (value.includes('-')) {
                    // solo fecha
                    dateValue = value;
                    timeValue = '08:00'; // hora por defecto
                }
            } else {
                // valores por defecto cuando es null
                const today = new Date();
                dateValue = today.toISOString().split('T')[0]; // fecha de hoy
                timeValue = '08:00'; // 8:00 am por defecto
            }
            
            html += `
                <div class="form-group">
                    <label class="block text-sm text-gray-600 mb-2">${field}</label>
                    <div class="grid grid-cols-2 gap-4">
                        <div>
                            <label class="block text-xs text-gray-500 mb-1">fecha</label>
                            <input type="date" name="${field}_date" value="${dateValue}" 
                                   class="w-full border rounded p-2 focus:border-primary focus:ring-primary" required />
                        </div>
                        <div>
                            <label class="block text-xs text-gray-500 mb-1">hora</label>
                            <input type="time" name="${field}_time" value="${timeValue}" 
                                   class="w-full border rounded p-2 focus:border-primary focus:ring-primary" required />
                        </div>
                    </div>
                </div>
            `;
        } else if (field.includes('hora') || field.includes('fecha')) {
            // campo de fecha/hora con formato mejorado
            let dateValue = '';
            let timeValue = '';
            
            if (value) {
                // si el valor viene como "2025-08-17 14:30:00"
                const parts = value.split(' ');
                if (parts.length >= 2) {
                    dateValue = parts[0]; // "2025-08-17"
                    timeValue = parts[1].substring(0, 5); // "14:30"
                } else if (parts.length === 1) {
                    // solo fecha
                    dateValue = parts[0];
                    timeValue = '08:00';
                }
            }
            
            html += `
                <div class="form-group">
                    <label class="block text-sm text-gray-600 mb-2">${field}</label>
                    <div class="grid grid-cols-2 gap-4">
                        <div>
                            <label class="block text-xs text-gray-500 mb-1">fecha</label>
                            <input type="date" name="${field}_date" value="${dateValue}" 
                                   class="w-full border rounded p-2 focus:border-primary focus:ring-primary" />
                        </div>
                        <div>
                            <label class="block text-xs text-gray-500 mb-1">hora</label>
                            <input type="time" name="${field}_time" value="${timeValue}" 
                                   class="w-full border rounded p-2 focus:border-primary focus:ring-primary" />
                        </div>
                    </div>
                </div>
            `;
        } else {
            // campo normal
            const placeholder = value ? '' : `ingrese ${field.toLowerCase()}`;
            html += `
                <div class="form-group">
                    <label class="block text-sm text-gray-600 mb-2">${field}</label>
                    <input type="text" name="${field}" value="${value}" placeholder="${placeholder}"
                           class="w-full border rounded p-2 focus:border-primary focus:ring-primary" />
                </div>
            `;
        }
    }
    
    const formFields = document.getElementById('formFields');
    if (formFields) {
        formFields.innerHTML = html;
    }
}

// obtener opciones para campos fk
async function getFieldOptions(fieldName, tableName = null) {
    try {
        const tabla = tableName || currentTable;
        const response = await fetch(`/admin-bdd/api/${tabla}/field_options?field=${fieldName}`);
        const data = await response.json();
        
        if (data.success && data.options) {
            console.log(`getFieldOptions(${fieldName}):`, data.options.slice(0, 3)); // mostrar primeras 3 opciones
        }
        
        return data.success ? data.options : [];
    } catch (error) {
        console.error('error getting field options:', error);
        return [];
    }
}

// renderizar campos de filtro para modales
function renderFilterFields(containerId) {
    let html = '';
    tableFields.forEach(field => {
        html += `
            <div class="form-group">
                <label class="block text-sm text-gray-600 mb-2">${field}</label>
                <input type="text" name="filter_${field}" placeholder="valor para filtrar ${field}" 
                       class="w-full border rounded p-2 focus:border-primary focus:ring-primary" />
            </div>
        `;
    });
    const container = document.getElementById(containerId);
    if (container) {
        container.innerHTML = html;
    }
}

// renderizar campos de actualizacion
function renderUpdateFields() {
    let html = '';
    tableFields.forEach(field => {
        const isId = field.toLowerCase().includes('id') && field === tableFields[0];
        if (!isId) {  // no permitir actualizar ids
            html += `
                <div class="form-group">
                    <label class="block text-sm text-gray-600 mb-2">${field}</label>
                    <input type="text" name="update_${field}" placeholder="nuevo valor para ${field}" 
                           class="w-full border rounded p-2 focus:border-primary focus:ring-primary" />
                </div>
            `;
        }
    });
    const updateFields = document.getElementById('updateFields');
    if (updateFields) {
        updateFields.innerHTML = html;
    }
}

// guardar registro
async function saveRecord() {
    const form = document.getElementById('recordForm');
    if (!form) return;
    
    const formData = new FormData(form);
    
    // detectar si es creacion multiple de agenda
    const fechaInicio = formData.get('fecha_inicio');
    const fechaFin = formData.get('fecha_fin');
    
    if (currentTable === 'agenda' && fechaInicio && fechaFin) {
        // crear multiples agendas
        console.log('🚀 Iniciando creación múltiple de agendas...');
        console.log('Fecha inicio:', fechaInicio);
        console.log('Fecha fin:', fechaFin);
        try {
            await createMultipleAgendas(formData);
        } catch (error) {
            console.error('❌ Error en createMultipleAgendas:', error);
            showAlert('error', 'Error al crear agendas: ' + error.message);
        }
        return;
    }
    
    const data = {};
    
    // procesar campos normales
    for (let [key, value] of formData.entries()) {
        if (!key.endsWith('_date') && !key.endsWith('_time')) {
            data[key] = value;
        }
    }
    
    // procesar campos de fecha/hora estandar
    const dateFields = {};
    const timeFields = {};
    
    for (let [key, value] of formData.entries()) {
        if (key.endsWith('_date')) {
            const fieldName = key.replace('_date', '');
            dateFields[fieldName] = value;
        } else if (key.endsWith('_time')) {
            const fieldName = key.replace('_time', '');
            timeFields[fieldName] = value;
        }
    }
    
    // combinar fecha y hora (tanto para campos normales como horainicio/horatermino)
    for (const fieldName in dateFields) {
        if (timeFields[fieldName]) {
            data[fieldName] = `${dateFields[fieldName]} ${timeFields[fieldName]}:00`;
        }
    }

    const action = editingId ? 'update' : 'create';

    try {
        const response = await fetch(`/admin-bdd/api/${currentTable}/${action}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(data)
        });

        const result = await response.json();
        
        if (result.success) {
            showAlert('success', editingId ? 'registro actualizado correctamente' : 'registro creado correctamente');
            closeModal();
            refreshTable();
        } else {
            // mostrar error sin cerrar el modal
            showAlert('error', result.error || 'error al guardar');
            console.error('error details:', result);
        }
    } catch (error) {
        showAlert('error', 'error de conexion: ' + error.message);
    }
}

// cerrar modales adicionales
function closeUpdateModal() {
    const modal = document.getElementById('updateModal');
    if (modal) modal.style.display = 'none';
}

function closeDeleteModal() {
    const modal = document.getElementById('deleteModal');
    if (modal) modal.style.display = 'none';
}

// ejecutar actualizacion multiple
async function executeUpdate() {
    const filters = {};
    const updateData = {};
    
    // recoger filtros (inputs y selects)
    const filterContainer = document.getElementById('updateFilters');
    if (filterContainer) {
        const filterInputs = filterContainer.querySelectorAll('input, select');
        filterInputs.forEach(input => {
            const fieldName = input.name.replace('filter_', '');
            if (input.value && input.value.trim()) {
                filters[fieldName] = input.value.trim();
            }
        });
    }
    
    // recoger datos de actualizacion (inputs y selects)
    const updateContainer = document.getElementById('updateFields');
    if (updateContainer) {
        const updateInputs = updateContainer.querySelectorAll('input, select');
        updateInputs.forEach(input => {
            const fieldName = input.name;
            // solo incluir si tiene valor (para campos opcionales)
            if (input.value && input.value.trim() && input.value !== '') {
                updateData[fieldName] = input.value.trim();
            }
        });
    }
    
    if (Object.keys(filters).length === 0) {
        showAlert('error', 'debes especificar al menos un filtro');
        return;
    }
    
    if (Object.keys(updateData).length === 0) {
        showAlert('error', 'debes especificar al menos un campo a actualizar');
        return;
    }
    
    try {
        const endpoint = currentTable === 'agenda' ? 
            `/admin-bdd/api/agenda/update-multiple` : 
            `/admin-bdd/api/${currentTable}/update`;
            
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                multiple: true,
                filters: filters,
                update_data: updateData
            })
        });

        const result = await response.json();
        
        if (result.success) {
            showAlert('success', `${result.updated_count} registros actualizados`);
            closeUpdateModal();
            refreshTable();
        } else {
            showAlert('error', result.error || 'error al actualizar');
        }
    } catch (error) {
        showAlert('error', 'error de conexion: ' + error.message);
    }
}

// ejecutar borrado multiple  
async function executeDelete() {
    const filters = {};
    
    // recoger filtros (inputs y selects)
    const filterContainer = document.getElementById('deleteFilters');
    if (filterContainer) {
        const filterInputs = filterContainer.querySelectorAll('input, select');
        filterInputs.forEach(input => {
            const fieldName = input.name.replace('filter_', '');
            if (input.value && input.value.trim()) {
                filters[fieldName] = input.value.trim();
            }
        });
    }
    
    if (Object.keys(filters).length === 0) {
        showAlert('error', 'debes especificar al menos un filtro');
        return;
    }
    
    if (!confirm('estas absolutamente seguro? esta accion no se puede deshacer.')) {
        return;
    }
    
    try {
        const endpoint = currentTable === 'agenda' ? 
            `/admin-bdd/api/agenda/delete-multiple` : 
            `/admin-bdd/api/${currentTable}/delete`;
            
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                multiple: true,
                filters: filters
            })
        });

        const result = await response.json();
        
        if (result.success) {
            showAlert('success', `${result.deleted_count} registros eliminados`);
            closeDeleteModal();
            refreshTable();
        } else {
            showAlert('error', result.error || 'error al eliminar');
        }
    } catch (error) {
        showAlert('error', 'error de conexion: ' + error.message);
    }
}

// ============ FUNCIONES ESPECIALES PARA AGENDA ============

async function renderAgendaMultipleForm() {
    const singleMode = document.getElementById('singleMode');
    const multipleMode = document.getElementById('multipleMode');
    if (singleMode) singleMode.style.display = 'block'; // mostrar singleMode para usar formFields
    if (multipleMode) multipleMode.style.display = 'none';
    
    const formFields = document.getElementById('formFields');
    if (!formFields) return;
    
    // obtener opciones de selects (especificar tabla correcta)
    const usuarios = await getFieldOptions('idUsuario', 'agenda');
    const tipoConsulta = await getFieldOptions('idTipoConsulta', 'agenda');
    const estados = await getFieldOptions('idEstado', 'agenda');
    
    const html = `
        <div class="form-group">
            <label>fecha inicio</label>
            <input type="date" name="fecha_inicio" class="w-full border rounded p-2" required />
        </div>
        <div class="form-group">
            <label>fecha fin</label>
            <input type="date" name="fecha_fin" class="w-full border rounded p-2" required />
        </div>
        <div class="form-group">
            <label>tipo consulta</label>
            <select name="idTipoConsulta" class="w-full border rounded p-2" required>
                <option value="random">— random —</option>
                ${tipoConsulta.map(opt => `<option value="${opt.value}">${opt.label}</option>`).join('')}
            </select>
        </div>
        <div class="form-group">
            <label>usuario/profesional</label>
            <select name="idUsuario" class="w-full border rounded p-2" required>
                <option value="random">— random —</option>
                ${usuarios.map(opt => `<option value="${opt.value}">${opt.label}</option>`).join('')}
            </select>
        </div>
        <div class="form-group">
            <label>estado</label>
            <select name="idEstado" class="w-full border rounded p-2" required>
                <option value="2" selected>paciente ausente</option>
                ${estados.map(opt => `<option value="${opt.value}">${opt.label}</option>`).join('')}
            </select>
        </div>
        <div class="alert alert-info mt-4 p-3 bg-blue-50 border border-blue-200 rounded">
            <i class="ri-information-line"></i> Se generarán agendas para <strong>todos los boxes</strong> en el rango de fechas especificado, 
            con horarios de 08:00 a 18:00, duraciones random (10, 15, 30 o 60 minutos) y 85% de probabilidad de ocupación.
        </div>
    `;
    
    formFields.innerHTML = html;
}

async function renderAgendaUpdateForm() {
    const boxes = await getFieldOptions('idBox', 'agenda');
    const tipoConsulta = await getFieldOptions('idTipoConsulta', 'agenda');
    const estados = await getFieldOptions('idEstado', 'agenda');
    
    const filtersHTML = `
        <div class="form-group">
            <label>fecha inicio</label>
            <input type="date" name="filter_fecha_inicio" class="w-full border rounded p-2" required />
        </div>
        <div class="form-group">
            <label>hora inicio (opcional)</label>
            <input type="time" name="filter_hora_inicio" class="w-full border rounded p-2" />
            <small class="text-gray-500">si no se especifica, se usa 00:00:00</small>
        </div>
        <div class="form-group">
            <label>fecha fin</label>
            <input type="date" name="filter_fecha_fin" class="w-full border rounded p-2" required />
        </div>
        <div class="form-group">
            <label>hora fin (opcional)</label>
            <input type="time" name="filter_hora_fin" class="w-full border rounded p-2" />
            <small class="text-gray-500">si no se especifica, se usa 23:59:59</small>
        </div>
        <div class="form-group">
            <label>box (opcional)</label>
            <select name="filter_idBox" class="w-full border rounded p-2">
                <option value="">— todos —</option>
                ${boxes.map(opt => `<option value="${opt.value}">${opt.label}</option>`).join('')}
            </select>
        </div>
    `;
    
    const fieldsHTML = `
        <div class="form-group">
            <label>tipo consulta (opcional)</label>
            <select name="idTipoConsulta" class="w-full border rounded p-2">
                <option value="">— no modificar —</option>
                ${tipoConsulta.map(opt => `<option value="${opt.value}">${opt.label}</option>`).join('')}
            </select>
        </div>
        <div class="form-group">
            <label>estado (opcional)</label>
            <select name="idEstado" class="w-full border rounded p-2">
                <option value="">— no modificar —</option>
                ${estados.map(opt => `<option value="${opt.value}">${opt.label}</option>`).join('')}
            </select>
        </div>
    `;
    
    const updateFilters = document.getElementById('updateFilters');
    const updateFields = document.getElementById('updateFields');
    if (updateFilters) updateFilters.innerHTML = filtersHTML;
    if (updateFields) updateFields.innerHTML = fieldsHTML;
}

async function renderAgendaDeleteForm() {
    const boxes = await getFieldOptions('idBox', 'agenda');
    
    const filtersHTML = `
        <div class="form-group">
            <label>fecha inicio</label>
            <input type="date" name="filter_fecha_inicio" class="w-full border rounded p-2" required />
        </div>
        <div class="form-group">
            <label>fecha fin</label>
            <input type="date" name="filter_fecha_fin" class="w-full border rounded p-2" required />
        </div>
        <div class="form-group">
            <label>box (opcional)</label>
            <select name="filter_idBox" class="w-full border rounded p-2">
                <option value="">— todos —</option>
                ${boxes.map(opt => `<option value="${opt.value}">${opt.label}</option>`).join('')}
            </select>
        </div>
    `;
    
    const deleteFilters = document.getElementById('deleteFilters');
    if (deleteFilters) deleteFilters.innerHTML = filtersHTML;
}

async function createMultipleAgendas(formData) {
    console.log('📋 createMultipleAgendas iniciada');
    console.log('FormData recibida:', Object.fromEntries(formData));
    
    const fechaInicio = formData.get('fecha_inicio');
    const fechaFin = formData.get('fecha_fin');
    let idTipoConsulta = formData.get('idTipoConsulta');
    let idUsuario = formData.get('idUsuario');
    const idEstado = formData.get('idEstado') || '2';
    
    console.log('Valores extraídos:', { fechaInicio, fechaFin, idTipoConsulta, idUsuario, idEstado });
    
    if (!fechaInicio || !fechaFin) {
        console.error('❌ Faltan campos requeridos');
        showAlert('error', 'debes completar todos los campos requeridos');
        return;
    }
    
    // obtener todos los boxes disponibles
    console.log('📦 Obteniendo boxes disponibles...');
    const boxes = await getFieldOptions('idBox', 'agenda');
    if (boxes.length === 0) {
        showAlert('error', 'no hay boxes disponibles');
        return;
    }
    
    showAlert('info', `Generando agendas para ${boxes.length} boxes...`);
    
    // CARGAR TODAS LAS AGENDAS EXISTENTES
    console.log('📊 Cargando agendas existentes...');
    let agendasExistentes = [];
    try {
        const response = await fetch(`/admin-bdd/api/agenda/list?limit=10000`);
        const data = await response.json();
        if (data.success) {
            agendasExistentes = data.data || [];
        }
    } catch (error) {
        console.error('Error cargando agendas:', error);
    }
    
    console.log(`📊 Agendas existentes totales: ${agendasExistentes.length}`);
    
    // Crear un mapa de agendas por box para verificar conflictos rápidamente
    const agendasPorBox = {};
    boxes.forEach(box => {
        const agendasDelBox = agendasExistentes
            .filter(a => String(a.idBox) === String(box.value))
            .map(a => ({
                inicio: new Date(a.horainicio),
                fin: new Date(a.horaTermino)
            }));
        agendasPorBox[box.value] = agendasDelBox;
        console.log(`📦 Box ${box.value}: ${agendasDelBox.length} agendas existentes`);
    });
    
    // Función para verificar si hay conflicto de horario
    const tieneConflicto = (idBox, inicio, fin) => {
        const agendasBox = agendasPorBox[idBox] || [];
        return agendasBox.some(agenda => {
            // Hay conflicto si los rangos se superponen
            return (inicio < agenda.fin && fin > agenda.inicio);
        });
    };
    
    // generar horarios siguiendo la logica de poblar_datos.py
    const agendas = [];
    const duracionesPosibles = [10, 15, 30, 60]; // minutos
    const horaInicioDia = 8; // 08:00
    const horaFinDia = 18; // 18:00
    
    const dateInicio = new Date(fechaInicio + 'T00:00:00');
    const dateFin = new Date(fechaFin + 'T00:00:00');
    
    // iterar por cada box
    for (const box of boxes) {
        console.log(`\n🔄 Procesando box ${box.value}...`);
        
        // iterar por cada dia en el rango
        for (let d = new Date(dateInicio); d <= dateFin; d.setDate(d.getDate() + 1)) {
            const fechaActual = d.toISOString().split('T')[0];
            console.log(`  📅 Procesando fecha: ${fechaActual}`);
            
            let horaActual = new Date(`${fechaActual}T${String(horaInicioDia).padStart(2,'0')}:00:00`);
            const horaLimite = new Date(`${fechaActual}T${String(horaFinDia).padStart(2,'0')}:00:00`);
            
            let intentos = 0;
            let creados = 0;
            let rechazados = 0;
            
            // generar slots para este dia y este box
            while (horaActual < horaLimite) {
                // 85% de probabilidad de crear slot (como en python)
                if (Math.random() < 0.85) {
                    intentos++;
                    const duracion = duracionesPosibles[Math.floor(Math.random() * duracionesPosibles.length)];
                    const horaTermino = new Date(horaActual.getTime() + duracion * 60000);
                    
                    if (horaTermino <= horaLimite) {
                        // VERIFICAR QUE NO HAYA CONFLICTO DE HORARIO
                        const hayConflicto = tieneConflicto(box.value, horaActual, horaTermino);
                        
                        if (!hayConflicto) {
                            creados++;
                            // seleccionar valores random si es necesario
                            let tipoConsultaFinal = idTipoConsulta;
                            let usuarioFinal = idUsuario;
                            
                            if (idTipoConsulta === 'random') {
                                // tipos: 1=ingreso, 2=control, 3=alta, 4=gestion
                                tipoConsultaFinal = String(Math.floor(Math.random() * 4) + 1);
                            }
                            
                            if (idUsuario === 'random') {
                                // obtener usuarios y seleccionar uno random (lo haremos en backend)
                                usuarioFinal = 'random';
                            }
                            
                            // formatear fechas como "YYYY-MM-DD HH:mm:ss" (no ISO)
                            const formatoFecha = (date) => {
                                const year = date.getFullYear();
                                const month = String(date.getMonth() + 1).padStart(2, '0');
                                const day = String(date.getDate()).padStart(2, '0');
                                const hours = String(date.getHours()).padStart(2, '0');
                                const minutes = String(date.getMinutes()).padStart(2, '0');
                                const seconds = String(date.getSeconds()).padStart(2, '0');
                                return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
                            };
                            
                            const nuevaAgenda = {
                                idAgenda: crypto.randomUUID(),
                                idBox: box.value,
                                horainicio: formatoFecha(horaActual),
                                horaTermino: formatoFecha(horaTermino),
                                idUsuario: usuarioFinal,
                                idTipoConsulta: tipoConsultaFinal,
                                idEstado: idEstado
                            };
                            
                            agendas.push(nuevaAgenda);
                            
                            // Agregar al mapa local para evitar conflictos con las nuevas agendas
                            agendasPorBox[box.value].push({
                                inicio: new Date(horaActual),
                                fin: new Date(horaTermino)
                            });
                        } else {
                            rechazados++;
                        }
                    }
                    
                    horaActual = horaTermino;
                } else {
                    // saltar 30 minutos si no se crea slot
                    horaActual = new Date(horaActual.getTime() + 30 * 60000);
                }
            }
            
            console.log(`    ✅ Intentos: ${intentos}, Creados: ${creados}, Rechazados por conflicto: ${rechazados}`);
        }
    }
    
    console.log(`\n📊 RESUMEN FINAL: ${agendas.length} agendas generadas`);
    
    if (agendas.length === 0) {
        console.warn('⚠️ No se generaron agendas. Verifica los logs anteriores.');
        showAlert('error', 'no se generaron agendas. Es posible que todos los horarios ya estén ocupados o que no haya probabilidad suficiente de generar slots.');
        return;
    }
    
    try {
        console.log('📡 Enviando agendas al servidor...');
        console.log('📦 Payload:', { agendas: agendas.slice(0, 3), total: agendas.length }); // muestra las primeras 3
        
        const response = await fetch(`/admin-bdd/api/agenda/create-multiple`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ agendas })
        });
        
        console.log('📡 Respuesta HTTP status:', response.status, response.statusText);
        
        const result = await response.json();
        console.log('📡 Respuesta del servidor:', result);
        
        if (result.success) {
            showAlert('success', `${result.count || agendas.length} agendas creadas correctamente`);
            closeModal();
            refreshTable();
        } else {
            console.error('❌ Error del servidor:', result.error);
            showAlert('error', result.error || 'error al crear agendas');
        }
    } catch (error) {
        console.error('❌ Error de conexión:', error);
        showAlert('error', 'error de conexion: ' + error.message);
    }
}

// ============ FIN FUNCIONES AGENDA ============

// inicializar cuando se carga la pagina
document.addEventListener('DOMContentLoaded', function() {
    console.log('admin db javascript cargado correctamente');
    
    // cerrar modales al hacer clic fuera
    window.onclick = function(event) {
        const formModal = document.getElementById('formModal');
        const updateModal = document.getElementById('updateModal');
        const deleteModal = document.getElementById('deleteModal');
        
        if (event.target === formModal) {
            closeModal();
        }
        if (event.target === updateModal) {
            closeUpdateModal();
        }
        if (event.target === deleteModal) {
            closeDeleteModal();
        }
    }
});

// Toggle entre mostrar IDs o nombres de usuario
function toggleUserDisplay(fieldName) {
    const checkbox = document.getElementById(`toggle-${fieldName}`);
    const select = document.getElementById(`select-${fieldName}`);
    
    if (!checkbox || !select) {
        console.log('toggleUserDisplay: no se encontró checkbox o select para', fieldName);
        return;
    }
    
    const showAsId = checkbox.checked;
    
    console.log(`toggleUserDisplay(${fieldName}): checkbox.checked = ${showAsId}`);
    
    // recorrer todas las opciones y alternar entre ID y nombre
    Array.from(select.options).forEach(option => {
        if (option.value) {
            const label = option.getAttribute('data-label');
            const id = option.value;
            
            if (showAsId) {
                // checkbox MARCADO = mostrar ID
                option.textContent = id;
            } else {
                // checkbox DESMARCADO = mostrar nombre (default)
                option.textContent = label || id;
            }
        }
    });
}
