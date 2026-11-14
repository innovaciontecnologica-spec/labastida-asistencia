/* LABASTIDA 2.4.2 · Gestión de alumnos. No habilita escrituras del servidor.
 * Extensión del índice 2.3.9: misma sesión y mismo cliente API institucional.
 * Los únicos datos persistidos son actor + requestId opaco pendiente.
 */
(function (root) {
  'use strict';
  const VERSION = '2.4.2-gestion-alumnos';
  const STORAGE_PREFIX = 'labastida242.pendiente.v1:';
  const PAYLOAD_FIELDS = ['operacion', 'fecha', 'nombre', 'matricula', 'grupoId', 'alumnoId', 'motivo', 'confirmarHomonimos'];
  const canManage = user => Boolean(user && user.rol === 'general' && user.perfilPersonalizado !== true);
  const validRequestId = value => typeof value === 'string' && /^[A-Za-z0-9_-]{12,120}$/.test(value);
  function normalizeGrade(value) {
    const normalized=String(value??'').trim().normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/[.°ºª\s_-]/g,'');
    return ({PRIMERO:'1',SEGUNDO:'2',TERCERO:'3',CUARTO:'4',QUINTO:'5',SEXTO:'6',MATERNAL:'M'})[normalized]||normalized;
  }
  function gradeLabel(value) {
    const normalized=normalizeGrade(value);
    return /^\d+$/.test(normalized)?normalized+'°':normalized==='M'?'Maternal':String(value??'').trim();
  }
  const groupLabel = group => group ? [group.nivel, gradeLabel(group.grado), group.seccion || '(sección pendiente)'].join(' ') : '—';
  function validDate(value) {
    if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;
    const date=new Date(value+'T12:00:00Z');
    return !Number.isNaN(date.getTime())&&date.toISOString().slice(0,10)===value;
  }
  const unique = values => [...new Set(values.map(String))].sort((a, b) => a.localeCompare(b, 'es', { numeric: true }));
  function normalizedPayload(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value) || !['ALTA', 'TRASLADO'].includes(value.operacion)) throw Error('Previsualización no reconocida.');
    const clean = {};
    for (const key of PAYLOAD_FIELDS) if (Object.prototype.hasOwnProperty.call(value, key)) {
      if (key === 'confirmarHomonimos') {
        if (typeof value[key] !== 'boolean') throw Error('Confirmación de homónimos inválida.');
      } else if (typeof value[key] !== 'string') throw Error('Datos de previsualización inválidos.');
      clean[key] = value[key];
    }
    if (!validDate(clean.fecha) || !clean.grupoId || !clean.motivo || (clean.operacion === 'ALTA' && !clean.nombre) || (clean.operacion === 'TRASLADO' && !clean.alumnoId)) throw Error('Previsualización incompleta o fecha del servidor inválida.');
    return Object.freeze(clean);
  }
  function pendingRecord(raw, actor) {
    if (!raw) return null;
    const value = JSON.parse(raw);
    if (!value || Object.keys(value).sort().join(',') !== 'actor,requestId' || value.actor !== actor || !validRequestId(value.requestId)) throw Error('La solicitud pendiente guardada necesita revisión.');
    return { actor: value.actor, requestId: value.requestId };
  }
  const pure = Object.freeze({ VERSION, canManage, validRequestId, normalizeGrade, gradeLabel, groupLabel, validDate, normalizedPayload, pendingRecord });
  if (typeof module === 'object' && module.exports) module.exports = pure;
  if (typeof document === 'undefined') return;

  const byId = id => document.getElementById(id);
  const host = byId('view-alumnos');
  const nav = byId('tab-alumnos');
  if (!host || !nav) return;
  const ui = {
    actor: '', token: null, generation: 0, readSequence: 0, active: false,
    catalog: null, mode: 'ALTA', selected: null, preview: null,
    pending: null, storageBlocked: false, busy: false, committing: false, reconciling: false,
    results: [], page: 0, total: 0, pageSize: 20, lastSearch: null
  };
  const controls = [];
  const getUser = () => typeof state !== 'undefined' ? state.user : null;
  const getToken = () => typeof state !== 'undefined' ? state.token : null;
  const canonical = () => typeof LA20_CAPTURA_PRODUCCION !== 'undefined' && LA20_CAPTURA_PRODUCCION === true;
  const authorized = () => canManage(getUser()) && Boolean(getToken());
  const snapshot = () => ({ generation: ui.generation, token: getToken(), actor: String(getUser()?.usuario || '') });
  const current = snap => authorized() && snap.generation === ui.generation && snap.token === getToken() && snap.actor === ui.actor && snap.token === ui.token;
  const readyToRead = () => authorized() && ui.catalog?.initialized === true;
  const hasPending = () => Boolean(ui.pending || ui.storageBlocked);
  const canWrite = () => readyToRead() && canonical() && ui.catalog.writesEnabled === true && ui.preview?.writesEnabled === true && !hasPending();
  function node(tag, attrs, ...children) {
    const n = document.createElement(tag);
    for (const [key, value] of Object.entries(attrs || {})) {
      if (key === 'class') n.className = value;
      else if (key === 'text') n.textContent = value;
      else if (key === 'hidden') n.hidden = value;
      else n.setAttribute(key, String(value));
    }
    children.flat().forEach(child => n.appendChild(typeof child === 'string' ? document.createTextNode(child) : child));
    return n;
  }
  function input(id, attrs = {}) { const n = node('input', { id, autocomplete: 'off', ...attrs }); controls.push(n); return n; }
  function select(id) { const n = node('select', { id }); controls.push(n); return n; }
  function field(label, id, control) { return node('div', { class: 'field' }, node('label', { for: id, text: label }), control); }
  function button(id, label, secondary = true) { return node('button', { id, type: 'button', class: 'btn' + (secondary ? ' sec' : ''), text: label }); }
  function options(control, entries, placeholder, selected = '') {
    const children = [node('option', { value: '', text: placeholder }), ...entries.map(entry => node('option', { value: entry.value, text: entry.label }))];
    control.replaceChildren(...children); control.value = entries.some(e => String(e.value) === String(selected)) ? String(selected) : '';
  }
  function announce(message, error = false) {
    const n = byId('la242-message'); n.textContent = message || ''; n.hidden = !message;
    n.setAttribute('role', error ? 'alert' : 'status'); n.className = 'la242-message' + (error ? ' la242-error' : '');
  }
  function errorMessage(error) { return String(error?.message || 'No se pudo completar la consulta.'); }
  function checkResponse(data) {
    if (!data || data.success !== true || data.version !== VERSION) throw Error('La versión del módulo de alumnos no coincide. No se habilitará el guardado.');
    return data;
  }
  function stores() {
    const found = [];
    for (const name of ['localStorage', 'sessionStorage']) { try { if (root[name]) found.push(root[name]); } catch (_) { /* Dispositivo restringido. */ } }
    return found;
  }
  const storageKey = actor => STORAGE_PREFIX + encodeURIComponent(actor);
  function loadPending(actor) {
    let found = null, blocked = false;
    for (const store of stores()) {
      try {
        const record = pendingRecord(store.getItem(storageKey(actor)), actor);
        if (record && found && record.requestId !== found.requestId) blocked = true;
        if (record) found = record;
      } catch (_) { blocked = true; }
    }
    ui.pending = found; ui.storageBlocked = blocked;
  }
  function persistPending(record) {
    loadPending(record.actor);
    if (ui.storageBlocked || (ui.pending && ui.pending.requestId !== record.requestId)) throw Error('Existe otra solicitud pendiente de esta cuenta. Consúltala antes de continuar.');
    for (const store of stores()) {
      try {
        store.setItem(storageKey(record.actor), JSON.stringify(record));
        if (pendingRecord(store.getItem(storageKey(record.actor)), record.actor)?.requestId === record.requestId) { ui.pending = record; return; }
      } catch (_) { /* Probar almacén de sesión, sin persistir datos escolares. */ }
    }
    throw Error('El navegador no permite conservar el folio pendiente. No se envió ningún movimiento. Habilita almacenamiento para este sitio.');
  }
  function clearResolved(record) {
    let failed = false;
    for (const store of stores()) {
      try {
        const saved = pendingRecord(store.getItem(storageKey(record.actor)), record.actor);
        if (saved && saved.requestId !== record.requestId) { failed = true; continue; }
        if (saved) store.removeItem(storageKey(record.actor));
      } catch (_) { failed = true; }
    }
    if (!failed) { ui.pending = null; ui.storageBlocked = false; }
    return !failed;
  }
  function newRequestId() {
    if (root.crypto?.randomUUID) return 'LA242-' + root.crypto.randomUUID();
    if (!root.crypto?.getRandomValues) throw Error('Este navegador no puede generar un identificador seguro. No se envió el movimiento.');
    const bytes = new Uint8Array(24); root.crypto.getRandomValues(bytes);
    return 'LA242-' + [...bytes].map(b => b.toString(16).padStart(2, '0')).join('');
  }

  function mount() {
    host.classList.add('la242');
    const refreshButton = button('la242-refresh', 'Actualizar catálogo');
    const title = node('div', { class: 'subhead la242-head' },
      node('div', {}, node('div', { class: 'la242-eyebrow', text: 'DIRECCIÓN GENERAL · CONTROL DE MATRÍCULA' }),
        node('h2', { text: 'Gestión de alumnos' }), node('p', { text: 'Altas y cambios de salón del ciclo vigente, con revisión y registro de cada movimiento.' })), refreshButton);
    const service = node('div', { id: 'la242-service', class: 'status', role: 'status', text: 'Consulta el estado del módulo para comenzar.' });
    const message = node('div', { id: 'la242-message', class: 'la242-message', 'aria-live': 'polite', hidden: true });
    const pending = node('section', { id: 'la242-pending', class: 'la242-pending card', hidden: true, 'aria-labelledby': 'la242-pending-title' },
      node('h3', { id: 'la242-pending-title', text: 'Hay una solicitud pendiente de verificar' }),
      node('p', { text: 'No crees ni reenvíes otro movimiento. La consulta del folio no modifica datos y debe realizarse con la cuenta que lo envió.' }),
      node('p', {}, node('strong', { text: 'Folio: ' }), node('code', { id: 'la242-request-id' })),
      button('la242-inspect', 'Consultar resultado de esta solicitud'),
      node('p', { id: 'la242-pending-detail', class: 'quiet', 'aria-live': 'polite' }));
    const mode = node('fieldset', { class: 'la242-modes' }, node('legend', { text: '¿Qué necesitas hacer?' }));
    for (const [value, text] of [['ALTA', 'Dar de alta un alumno'], ['TRASLADO', 'Cambiar de salón']]) {
      const radio = input('la242-mode-' + value, { type: 'radio', name: 'la242-mode', value }); radio.checked = value === 'ALTA';
      radio.addEventListener('change', () => { if (!ui.busy && !hasPending() && radio.checked) changeMode(value); });
      mode.appendChild(node('label', { class: 'la242-mode', for: radio.id }, radio, node('span', { text })));
    }
    const query = input('la242-query', { type: 'search', maxlength: '100', placeholder: 'Nombre, matrícula o grupo' });
    const searchLevel = select('la242-search-level'), searchGroup = select('la242-search-group');
    const searchButton = button('la242-search', 'Buscar alumnos', false); searchButton.type = 'submit';
    const searchForm = node('form', { id: 'la242-search-form', class: 'la242-search-form' },
      node('div', { class: 'formgrid' }, field('Buscar alumno', query.id, query), field('Nivel de la búsqueda', searchLevel.id, searchLevel), field('Grupo (grado y sección)', searchGroup.id, searchGroup)),
      node('div', { class: 'buttonrow' }, searchButton));
    const table = node('table', { class: 'data la242-table' }, node('caption', { text: 'Alumnos encontrados' }),
      node('thead', {}, node('tr', {}, ['Alumno', 'Matrícula', 'Grupo actual', 'Acción'].map(text => node('th', { scope: 'col', text })))), node('tbody', { id: 'la242-results' }));
    const searchArea = node('section', { id: 'la242-search-area', hidden: true, class: 'card', 'aria-labelledby': 'la242-search-title' },
      node('h3', { id: 'la242-search-title', text: '1. Encuentra al alumno' }), searchForm,
      node('p', { id: 'la242-search-count', class: 'quiet', 'aria-live': 'polite', text: 'La búsqueda muestra resultados paginados; no descarga toda la matrícula.' }),
      node('div', { class: 'datawrap' }, table), node('div', { class: 'buttonrow la242-pagination' }, button('la242-prev', 'Anterior'), node('span', { id: 'la242-page', class: 'quiet' }), button('la242-next', 'Siguiente')),
      node('div', { id: 'la242-selected', class: 'la242-selected', hidden: true, 'aria-live': 'polite' }));
    const name = input('la242-name', { type: 'text', minlength: '3', maxlength: '110', required: 'required' });
    const enrollment = input('la242-enrollment', { type: 'text', maxlength: '60' });
    const fieldsAlta = node('div', { id: 'la242-alta-fields', class: 'formgrid' }, field('Nombre completo del alumno', name.id, name), field('Matrícula (si corresponde)', enrollment.id, enrollment));
    const level = select('la242-level'), grade = select('la242-grade'), group = select('la242-group');
    group.required = true;
    const reason = node('textarea', { id: 'la242-reason', minlength: '8', maxlength: '200', required: 'required', rows: '3', placeholder: 'Describe el motivo administrativo del alta o cambio de salón.' }); controls.push(reason);
    const homonym = input('la242-homonyms', { type: 'checkbox' });
    const homonymField = node('label', { id: 'la242-homonym-field', class: 'la242-check', for: homonym.id }, homonym, node('span', { text: 'Si existen alumnos con el mismo nombre, confirmo que se trata de una persona distinta. Esta confirmación no permite duplicar una matrícula.' }));
    const previewButton = button('la242-preview-button', 'Revisar movimiento sin guardar', false); previewButton.type = 'submit';
    const form = node('form', { id: 'la242-form', class: 'card' }, node('h3', { id: 'la242-form-title', text: 'Datos del alta' }), fieldsAlta,
      node('fieldset', { class: 'la242-destination' }, node('legend', { text: 'Salón de destino' }),
        node('div', { class: 'la242-select-grid' }, field('Nivel', level.id, level), field('Grado', grade.id, grade), field('Grupo / sección', group.id, group))),
      node('p', { id: 'la242-scope-note', class: 'quiet', text: 'Solo se muestran grupos activos del catálogo. No se crean grupos ni se supone su cupo.' }),
      field('Motivo del movimiento', reason.id, reason), homonymField,
      node('div', { class: 'buttonrow' }, previewButton));
    const confirm = input('la242-confirm', { type: 'checkbox' });
    const preview = node('section', { id: 'la242-preview', class: 'card la242-preview', hidden: true, tabindex: '-1', 'aria-labelledby': 'la242-preview-title' },
      node('h3', { id: 'la242-preview-title', text: 'Revisa antes de confirmar' }), node('dl', { id: 'la242-summary', class: 'la242-summary' }),
      node('ul', { id: 'la242-warnings', class: 'la242-warnings' }),
      node('p', { id: 'la242-preview-state', class: 'status' }),
      node('label', { class: 'la242-check', for: confirm.id }, confirm, node('span', { text: 'Revisé los datos y autorizo expresamente este movimiento.' })),
      node('div', { class: 'buttonrow' }, button('la242-save', 'Confirmar y guardar movimiento', false), button('la242-edit', 'Volver a los datos')));
    host.replaceChildren(title, service, message, pending, mode, searchArea, form, preview,
      node('p', { class: 'quiet la242-footnote', text: 'Este módulo no elimina alumnos, no realiza promociones de grado y no modifica SmartCoop. La fecha efectiva y los permisos se verifican en el servidor.' }));
    refreshButton.addEventListener('click', () => void loadState());
    byId('la242-inspect').addEventListener('click', () => void inspectPending());
    searchForm.addEventListener('submit', event => { event.preventDefault(); void search(0); });
    searchLevel.addEventListener('change', () => { updateSearchGroups(); invalidateSearch(); });
    searchGroup.addEventListener('change', invalidateSearch);
    query.addEventListener('input', invalidateSearch);
    byId('la242-prev').addEventListener('click', () => void search(ui.page - 1));
    byId('la242-next').addEventListener('click', () => void search(ui.page + 1));
    form.addEventListener('submit', event => { event.preventDefault(); void previsualize(); });
    [name, enrollment, reason, homonym].forEach(n => n.addEventListener(n.type === 'checkbox' ? 'change' : 'input', invalidatePreview));
    level.addEventListener('change', () => { invalidatePreview(); updateDestination('level'); });
    grade.addEventListener('change', () => { invalidatePreview(); updateDestination('grade'); });
    group.addEventListener('change', invalidatePreview);
    confirm.addEventListener('change', syncControls);
    byId('la242-save').addEventListener('click', () => void save());
    byId('la242-edit').addEventListener('click', () => { invalidatePreview(); byId('la242-reason').focus(); });
    const icon = node('span', { class: 'lab2-nav-icon', 'aria-hidden': 'true', text: '▤' }); nav.prepend(icon);
    syncControls();
  }

  function activeGroups() { return (ui.catalog?.grupos || []).filter(g => g.activo === true && g.provisional !== true); }
  function updateDestination(changed = '') {
    const level = byId('la242-level'), grade = byId('la242-grade'), group = byId('la242-group');
    const groups = activeGroups().filter(g => ui.mode !== 'TRASLADO' || (ui.selected && g.nivel === ui.selected.nivel && normalizeGrade(g.grado) === normalizeGrade(ui.selected.grado) && g.id !== ui.selected.grupoId));
    const old = { level: level.value, grade: grade.value, group: group.value };
    const levelValues = unique(groups.map(g => g.nivel));
    const fixedLevel = ui.mode === 'TRASLADO' ? String(ui.selected?.nivel || '') : old.level;
    options(level, levelValues.map(value => ({ value, label: value })), 'Selecciona nivel', fixedLevel);
    if (ui.mode === 'TRASLADO' && fixedLevel && levelValues.includes(fixedLevel)) level.value = fixedLevel;
    const gradeValues = unique(groups.filter(g => g.nivel === level.value).map(g => normalizeGrade(g.grado)));
    options(grade, gradeValues.map(value => ({ value, label: gradeLabel(value) })), 'Selecciona grado', ui.mode === 'TRASLADO' ? normalizeGrade(ui.selected?.grado || '') : changed === 'level' ? '' : old.grade);
    options(group, groups.filter(g => g.nivel === level.value && normalizeGrade(g.grado) === grade.value).map(g => ({ value: g.id, label: String(g.seccion || '(sección pendiente)') + ' · ' + g.id })), 'Selecciona grupo / sección', changed ? '' : old.group);
    syncControls();
  }
  function updateSearchGroups() {
    const level = byId('la242-search-level').value, selected = byId('la242-search-group').value;
    options(byId('la242-search-group'), (ui.catalog?.grupos || []).filter(g => !level || g.nivel === level).map(g => ({ value: g.id, label: groupLabel(g) })), 'Todos los grupos del nivel', selected);
  }
  function invalidatePreview() { if (hasPending() || ui.busy) return; ui.preview = null; byId('la242-preview').hidden = true; byId('la242-confirm').checked = false; syncControls(); }
  function invalidateSearch() {
    if (hasPending() || ui.busy) return;
    ui.readSequence++; ui.lastSearch = null; ui.results = []; ui.page = 0; ui.total = 0;
    byId('la242-results').replaceChildren(); byId('la242-search-count').textContent = 'Pulsa Buscar alumnos para aplicar los filtros.'; syncControls();
  }
  function changeMode(mode) {
    ui.mode = mode; ui.selected = null; ui.results = []; ui.lastSearch = null; ui.page = 0; ui.total = 0; ui.readSequence++;
    byId('la242-mode-ALTA').checked = mode === 'ALTA'; byId('la242-mode-TRASLADO').checked = mode === 'TRASLADO';
    byId('la242-search-area').hidden = mode !== 'TRASLADO'; byId('la242-alta-fields').hidden = mode !== 'ALTA'; byId('la242-homonym-field').hidden = mode !== 'ALTA';
    byId('la242-name').required = mode === 'ALTA'; byId('la242-homonyms').checked = false;
    byId('la242-form-title').textContent = mode === 'ALTA' ? 'Datos del alta' : '2. Elige el salón de destino';
    byId('la242-scope-note').textContent = mode === 'ALTA' ? 'Solo se muestran grupos activos del catálogo. No se crean grupos ni se supone su cupo.' : 'El traslado conserva el mismo nivel, grado y ciclo. No es una promoción de grado.';
    byId('la242-selected').replaceChildren(); byId('la242-selected').hidden = true; byId('la242-results').replaceChildren();
    invalidatePreview(); updateDestination('level'); syncControls();
  }
  function syncControls() {
    const blocked = !readyToRead() || ui.busy || hasPending();
    controls.forEach(control => { control.disabled = blocked; });
    byId('la242-level').disabled = blocked || ui.mode === 'TRASLADO';
    byId('la242-grade').disabled = blocked || ui.mode === 'TRASLADO' || !byId('la242-level').value;
    byId('la242-group').disabled = blocked || !byId('la242-grade').value;
    byId('la242-preview-button').disabled = blocked || (ui.mode === 'TRASLADO' && !ui.selected);
    byId('la242-search').disabled = blocked;
    byId('la242-prev').disabled = blocked || !ui.lastSearch || ui.page <= 0;
    byId('la242-next').disabled = blocked || !ui.lastSearch || (ui.page + 1) * ui.pageSize >= ui.total;
    byId('la242-confirm').disabled = ui.busy || !canWrite();
    byId('la242-save').disabled = ui.busy || !canWrite() || !byId('la242-confirm').checked;
    byId('la242-edit').disabled = ui.busy || hasPending();
    byId('la242-refresh').disabled = ui.busy || !authorized();
    byId('la242-inspect').disabled = ui.busy || !ui.pending?.requestId || !authorized();
    byId('la242-form').setAttribute('aria-busy', String(ui.busy));
    byId('la242-pending').hidden = !hasPending();
    byId('la242-request-id').textContent = ui.pending?.requestId || 'Registro local no verificable';
    byId('la242-page').textContent = ui.lastSearch ? 'Página ' + (ui.page + 1) : '';
    host.querySelectorAll('[data-la242-select]').forEach(b => { b.disabled = blocked; });
  }
  function serviceText() {
    const c = ui.catalog;
    if (!c) return 'Módulo sin verificar. El guardado permanece bloqueado.';
    const basic = 'Fecha del servidor: ' + c.fecha + ' · Ciclo: ' + c.ciclo + '. ';
    if (!c.initialized) return basic + 'Instalación pendiente. No se habilitarán movimientos.';
    if (!canonical()) return basic + 'ENTORNO DE REVISIÓN: se permite consultar y previsualizar; no guardar.';
    if (!c.writesEnabled) return basic + 'ESCRITURA DESHABILITADA: puedes buscar y revisar; no se guardarán movimientos.';
    return basic + 'El servidor permite movimientos; cada uno requiere previsualización y confirmación expresa.';
  }
  async function loadState() {
    if (!authorized() || ui.busy) return;
    invalidatePreview(); ui.busy = true; syncControls(); const snap = snapshot(), seq = ++ui.readSequence;
    try {
      const d = checkResponse(await api('la242Estado'));
      if (!current(snap) || seq !== ui.readSequence || !ui.active) return;
      if (!Array.isArray(d.grupos) || typeof d.initialized !== 'boolean' || typeof d.writesEnabled !== 'boolean' || typeof d.fecha !== 'string' || typeof d.ciclo !== 'string') throw Error('El catálogo del módulo está incompleto.');
      const ids = new Set();
      for (const g of d.grupos) {
        if (!g || typeof g.id !== 'string' || !g.id || ids.has(g.id) || typeof g.nivel !== 'string' || g.grado === undefined) throw Error('El catálogo contiene grupos inválidos o duplicados.');
        ids.add(g.id);
      }
      ui.catalog = d;
      options(byId('la242-search-level'), unique(d.grupos.map(g => g.nivel)).map(value => ({ value, label: value })), 'Todos los niveles', byId('la242-search-level').value);
      updateSearchGroups(); updateDestination(); byId('la242-service').textContent = serviceText();
      if (Array.isArray(d.bloqueos) && d.bloqueos.length) announce(d.bloqueos.map(String).join(' · '), true); else announce('');
    } catch (error) { if (current(snap) && seq === ui.readSequence) { ui.catalog = null; byId('la242-service').textContent = serviceText(); announce(errorMessage(error), true); } }
    finally { if (current(snap) && seq === ui.readSequence) { ui.busy = false; syncControls(); } }
  }
  async function search(page) {
    if (!readyToRead() || ui.busy || hasPending() || ui.mode !== 'TRASLADO' || page < 0) return;
    const query = byId('la242-query').value.trim(), nivel = byId('la242-search-level').value, grupoId = byId('la242-search-group').value;
    if (!query && !grupoId) { announce('Escribe un nombre, matrícula o grupo, o selecciona un grupo concreto.', true); byId('la242-query').focus(); return; }
    const params = { query, page, pageSize: 20 }; if (nivel) params.nivel = nivel; if (grupoId) params.grupoId = grupoId;
    const snap = snapshot(), seq = ++ui.readSequence; ui.busy = true; syncControls(); announce('Buscando alumnos…');
    try {
      const d = checkResponse(await api('la242Buscar', params));
      if (!current(snap) || seq !== ui.readSequence || !ui.active) return;
      if (!Array.isArray(d.alumnos) || !Number.isSafeInteger(d.total) || d.total<0 || !Number.isSafeInteger(d.page) || d.page !== page || !Number.isSafeInteger(d.pageSize) || d.pageSize < 1 || d.pageSize > 50 || d.alumnos.length > d.pageSize || d.alumnos.length>d.total) throw Error('La respuesta de búsqueda no es válida.');
      const studentIds=new Set();
      for(const student of d.alumnos){
        if(!student||typeof student.alumnoId!=='string'||!student.alumnoId||studentIds.has(student.alumnoId)||typeof student.nombre!=='string'||typeof student.grupoId!=='string'||typeof student.nivel!=='string'||student.grado===undefined||typeof student.ciclo!=='string')throw Error('La búsqueda contiene fichas incompletas o duplicadas.');
        studentIds.add(student.alumnoId);
      }
      ui.results = d.alumnos; ui.page = d.page; ui.total = d.total; ui.pageSize = d.pageSize; ui.lastSearch = params;
      byId('la242-results').replaceChildren(...d.alumnos.map(student => {
        const choose = button('', 'Seleccionar'); choose.removeAttribute('id'); choose.setAttribute('data-la242-select', 'true');
        choose.addEventListener('click', () => selectStudent(student));
        return node('tr', {}, node('td', { text: String(student.nombre || '') }), node('td', { text: String(student.matricula || '—') }), node('td', { text: groupLabel(student) }), node('td', {}, choose));
      }));
      byId('la242-search-count').textContent = d.total ? d.total + ' resultados · ' + d.alumnos.length + ' en esta página.' : 'No se encontraron alumnos con estos filtros.';
      announce('');
    } catch (error) { if (current(snap) && seq === ui.readSequence) announce(errorMessage(error), true); }
    finally { if (current(snap) && seq === ui.readSequence) { ui.busy = false; syncControls(); } }
  }
  function selectStudent(student) {
    if (ui.busy || hasPending() || !readyToRead() || !ui.results.includes(student) || !student.alumnoId) return;
    ui.selected = { ...student }; invalidatePreview();
    byId('la242-selected').replaceChildren(node('strong', { text: String(student.nombre) }), node('p', { text: 'Grupo actual: ' + groupLabel(student) + ' · Matrícula: ' + (student.matricula || '—') }));
    byId('la242-selected').hidden = false; updateDestination('level'); byId('la242-group').focus();
  }
  function requestData() {
    const groupId = byId('la242-group').value;
    const group = activeGroups().find(g => g.id === groupId);
    if (!group) throw Error('Selecciona un grupo activo del catálogo.');
    const motivo = byId('la242-reason').value.trim(); if (!motivo) throw Error('Escribe el motivo del movimiento.');
    const data = { operacion: ui.mode, grupoId: groupId, motivo };
    if (ui.mode === 'ALTA') {
      data.nombre = byId('la242-name').value.trim(); data.matricula = byId('la242-enrollment').value.trim(); data.confirmarHomonimos = byId('la242-homonyms').checked;
      if (!data.nombre) throw Error('Escribe el nombre completo del alumno.');
    } else {
      const student = ui.selected;
      if (!student || student.nivel !== group.nivel || normalizeGrade(student.grado) !== normalizeGrade(group.grado) || student.grupoId === group.id) throw Error('Elige otro salón del mismo nivel y grado que el alumno seleccionado.');
      if (String(student.ciclo) !== String(ui.catalog.ciclo)) throw Error('El alumno no corresponde al ciclo activo.');
      data.alumnoId = student.alumnoId;
    }
    return data;
  }
  async function previsualize() {
    if (!readyToRead() || ui.busy || hasPending()) return;
    if (!byId('la242-form').reportValidity()) return;
    let data; try { data = requestData(); } catch (error) { announce(errorMessage(error), true); return; }
    invalidatePreview(); const snap = snapshot(), seq = ++ui.readSequence; ui.busy = true; syncControls(); announce('Revisando el movimiento sin guardar…');
    try {
      const d = checkResponse(await api('la242Previsualizar', data));
      if (!current(snap) || seq !== ui.readSequence || !ui.active) return;
      const payload = normalizedPayload(d.datos);
      if (typeof d.huella !== 'string' || !d.huella || d.huella.length > 512 || !d.resumen || !d.resumen.destino || !Array.isArray(d.advertencias) || typeof d.writesEnabled !== 'boolean' || !validDate(d.fecha) || payload.fecha!==d.fecha || payload.operacion !== data.operacion || payload.grupoId !== data.grupoId || (data.operacion === 'TRASLADO' && payload.alumnoId !== data.alumnoId)) throw Error('La previsualización no corresponde al movimiento solicitado.');
      const summary=d.resumen;
      if(summary.operacion!==payload.operacion||summary.destino.id!==payload.grupoId||summary.motivo!==payload.motivo||String(summary.ciclo)!==String(ui.catalog.ciclo)||typeof summary.nombre!=='string'||typeof summary.matricula!=='string'||
        (payload.operacion==='ALTA'&&(summary.nombre!==payload.nombre||summary.matricula!==payload.matricula))||
        (payload.operacion==='TRASLADO'&&(summary.alumnoId!==payload.alumnoId||!summary.origen||summary.origen.id!==ui.selected?.grupoId)))throw Error('El resumen visible no coincide con los datos que se guardarían. Vuelve a consultar.');
      ui.preview = { ...d, datos: payload }; byId('la242-confirm').checked = false;
      const r = d.resumen;
      const summaryRows = [['Operación', r.operacion === 'ALTA' ? 'Alta de alumno' : 'Cambio de salón'], ['Alumno', r.nombre], ['Matrícula', r.matricula || '—'], ['Grupo de origen', r.origen ? groupLabel(r.origen) : 'Alta nueva'], ['Grupo de destino', groupLabel(r.destino)], ['Ciclo', r.ciclo], ['Fecha efectiva', d.fecha], ['Motivo', r.motivo]];
      byId('la242-summary').replaceChildren(...summaryRows.flatMap(([label, value]) => [node('dt', { text: label }), node('dd', { text: String(value || '—') })]));
      byId('la242-warnings').replaceChildren(...d.advertencias.map(w => node('li', { text: String(w) })));
      byId('la242-preview-state').textContent = canWrite() ? 'La revisión no ha guardado nada. Confirma expresamente para registrar este movimiento.' : 'Solo previsualización: el guardado está deshabilitado para este entorno o por el servidor.';
      byId('la242-preview').hidden = false; byId('la242-preview').focus(); announce('Previsualización lista. Aún no se ha guardado ningún movimiento.');
    } catch (error) { if (current(snap) && seq === ui.readSequence) announce(errorMessage(error), true); }
    finally { if (current(snap) && seq === ui.readSequence) { ui.busy = false; syncControls(); } }
  }
  async function save() {
    if (ui.busy || !canWrite() || !byId('la242-confirm').checked) return;
    const snap = snapshot(); let record, payload;
    try {
      loadPending(ui.actor);
      if(hasPending())throw Error('Existe un folio pendiente de esta cuenta. Consúltalo antes de preparar otra solicitud.');
      record = { actor: ui.actor, requestId: newRequestId() };
      payload = Object.freeze({ ...ui.preview.datos, huella: ui.preview.huella, requestId: record.requestId });
      persistPending(record);
    } catch (error) { announce(errorMessage(error), true); syncControls(); return; }
    ui.busy = true; ui.committing = true; syncControls(); byId('la242-pending-detail').textContent = 'Enviando una sola vez. No cierres esta página hasta conocer el resultado.'; announce('Guardando el movimiento confirmado…');
    try {
      const d = checkResponse(await api('la242Guardar', payload));
      if (!current(snap)) return;
      if (d.estado !== 'CONFIRMADA' || d.requestId !== record.requestId) throw Error('El servidor no confirmó el folio esperado.');
      await onConfirmed(d, record, snap);
    } catch (error) {
      if (current(snap)) {
        // Solo la garantía explícita del servidor, ligada al MISMO folio,
        // permite liberar un rechazo anterior a cualquier efecto persistente.
        // Un code por sí solo, NO_ENCONTRADA o un fallo de red NO lo permiten.
        if(error?.rechazoSinCambios===true&&error.requestId===record.requestId){
          const cleared=clearResolved(record);
          ui.preview=null;byId('la242-preview').hidden=true;byId('la242-confirm').checked=false;
          if(cleared){
            byId('la242-pending-detail').textContent='';
            announce(errorMessage(error)+' El servidor confirmó que no se modificó ningún dato. Corrige o actualiza y vuelve a revisar el movimiento.',true);
          }else{
            byId('la242-pending-detail').textContent='Rechazo sin cambios confirmado por el servidor; el registro local no pudo liberarse. Solicita revisión antes de continuar.';
            announce('El movimiento fue rechazado sin cambios, pero el folio local requiere revisión.',true);
          }
          return;
        }
        byId('la242-pending-detail').textContent = 'Resultado no confirmado. ' + errorMessage(error) + ' Consulta el folio; no se reenviará automáticamente.';
        announce('La solicitud queda bloqueada hasta verificar su resultado. No generes otro folio.', true);
      }
    } finally { if (current(snap)) { ui.busy = false; ui.committing = false; syncControls(); } }
  }
  async function inspectPending() {
    if (!authorized() || ui.busy || !ui.pending || ui.pending.actor !== ui.actor) return;
    const snap = snapshot(), record = { ...ui.pending }; ui.busy = true; ui.reconciling = true; syncControls();
    byId('la242-pending-detail').textContent = 'Consultando el resultado del mismo folio, sin escribir…';
    try {
      const d = checkResponse(await api('la242Solicitud', { requestId: record.requestId }));
      if (!current(snap)) return;
      if (d.requestId !== record.requestId || !['CONFIRMADA', 'NO_ENCONTRADA', 'INDETERMINADA'].includes(d.estado)) throw Error('La consulta no devolvió el folio y estado esperados.');
      if (d.estado === 'CONFIRMADA') {
        const result = checkResponse(d.resultado);
        if (result.requestId !== record.requestId || result.estado !== 'CONFIRMADA') throw Error('La confirmación de la solicitud está incompleta.');
        await onConfirmed(result, record, snap);
      } else {
        byId('la242-pending-detail').textContent = d.estado === 'NO_ENCONTRADA' ? 'El servidor todavía no encontró este folio. Esto NO confirma que sea seguro reenviar. El formulario sigue bloqueado: solicita revisión administrativa.' : 'El resultado sigue indeterminado. No se permite otro movimiento hasta que la revisión administrativa concilie este folio.';
        announce('La consulta no modificó datos. Conserva el mismo folio.', true);
      }
    } catch (error) { if (current(snap)) { byId('la242-pending-detail').textContent = errorMessage(error); announce('No fue posible confirmar el resultado. El folio continúa pendiente.', true); } }
    finally { if (current(snap)) { ui.busy = false; ui.reconciling = false; syncControls(); } }
  }
  async function invalidateRosters(snap) {
    if (!current(snap)) return;
    if (typeof la16Limpiar === 'function') la16Limpiar();
    if (typeof la14Limpiar === 'function') { la14Limpiar(); if (typeof la14ActualizarAcceso === 'function') la14ActualizarAcceso(); }
    if (typeof la23LimpiarSesion_ === 'function') la23LimpiarSesion_();
    if (typeof la30Limpiar_ === 'function') la30Limpiar_();
    try {
      const d = await api('dashboard');
      if (current(snap) && d?.success && d.data) { state.data = d.data; if (typeof render === 'function') render(); }
    } catch (_) { if (current(snap)) byId('la242-pending-detail').textContent = 'Movimiento confirmado. Actualiza el resumen para ver los conteos nuevos.'; }
  }
  async function onConfirmed(result, record, snap) {
    const removed = clearResolved(record); ui.preview = null; byId('la242-preview').hidden = true; byId('la242-confirm').checked = false;
    if (!removed) {
      byId('la242-pending-detail').textContent = 'El servidor confirmó el movimiento, pero hay un folio local que no pudo conciliarse. No repitas la operación; consulta con esta cuenta.';
      announce('Movimiento confirmado. Revisa el folio local antes de otra operación.', true);
    } else {
      byId('la242-name').value = ''; byId('la242-enrollment').value = ''; byId('la242-reason').value = ''; byId('la242-homonyms').checked = false;
      ui.selected = null; ui.results = []; ui.lastSearch = null; ui.total = 0; ui.page = 0;
      byId('la242-results').replaceChildren(); byId('la242-selected').replaceChildren(); byId('la242-selected').hidden = true;
      byId('la242-search-count').textContent = 'Realiza una nueva consulta para ver los datos actualizados.';
      announce(String(result.mensaje || 'Movimiento confirmado.') + ' Folio: ' + record.requestId);
    }
    ui.catalog = null; byId('la242-service').textContent = 'Movimiento confirmado. Pulsa Actualizar catálogo antes de preparar otro.';
    await invalidateRosters(snap);
  }
  function limpiarSesion() {
    ui.generation++; ui.readSequence++; ui.active = false; ui.actor = ''; ui.token = null; ui.catalog = null; ui.preview = null; ui.selected = null; ui.pending = null; ui.storageBlocked = false; ui.busy = false; ui.committing = false; ui.reconciling = false;
    ui.results = []; ui.lastSearch = null; ui.page = 0; ui.total = 0;
    for (const id of ['la242-query', 'la242-name', 'la242-enrollment', 'la242-reason']) byId(id).value = '';
    for (const id of ['la242-search-level','la242-search-group'])options(byId(id),[],'Primero consulta el catálogo');
    for (const id of ['la242-confirm', 'la242-homonyms']) byId(id).checked = false;
    for (const id of ['la242-results', 'la242-summary', 'la242-warnings', 'la242-selected']) byId(id).replaceChildren();
    byId('la242-selected').hidden = true; byId('la242-preview').hidden = true; byId('la242-pending-detail').textContent = ''; byId('la242-request-id').textContent = '';
    byId('la242-search-count').textContent = 'La búsqueda muestra resultados paginados; no descarga toda la matrícula.';
    byId('la242-service').textContent = 'Consulta el estado del módulo para comenzar.'; announce(''); changeMode('ALTA'); actualizarMenu();
  }
  function actualizarMenu() { nav.classList.toggle('hide', !authorized()); }
  async function entrar() {
    if (!authorized()) { limpiarSesion(); return; }
    const actor = String(getUser().usuario || '');
    if (!actor) { limpiarSesion(); return; }
    if (ui.actor !== actor || ui.token !== getToken()) { limpiarSesion(); ui.actor = actor; ui.token = getToken(); loadPending(actor); }
    ui.active = true; actualizarMenu(); syncControls(); await loadState();
  }
  function salir() {
    ui.active = false; ui.readSequence++;
    if(!ui.committing&&!ui.reconciling)ui.busy=false;
    if (!hasPending()) { ui.preview = null; byId('la242-preview').hidden = true; byId('la242-confirm').checked = false; }
    syncControls();
  }
  mount();
  root.LabastidaGestion242 = Object.freeze({ ready: true, version: VERSION, puedeAcceder: authorized, actualizarMenu, entrar, salir, limpiarSesion, tieneSolicitudPendiente: hasPending });
  actualizarMenu();
})(typeof globalThis !== 'undefined' ? globalThis : window);
