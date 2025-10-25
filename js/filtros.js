// js/filtros.js
// Versión mínima: toggle panel + cerrar fuera/ESC + poblar selects + aplicar filtros (tipo, estado, ciudad).
(function () {
  const API_BASE = 'http://localhost:3000/api'; // coincide con capas.js

  // util simple para construir query string
  const qs = obj =>
    Object.keys(obj)
      .filter(k => obj[k] !== null && obj[k] !== undefined && obj[k] !== '')
      .map(k => encodeURIComponent(k) + '=' + encodeURIComponent(obj[k]))
      .join('&');

  // detecta placeholders "Todos"
  function isPlaceholder(val) {
    if (val === null || val === undefined) return true;
    const s = String(val).trim().toLowerCase();
    return s === '' || ['todos', 'todas', '— todos —', '— todas —', '-- todos --', 'all'].includes(s);
  }

  // lee valores del form y devuelve params para la API
  function readFilterValues(form) {
    const tipoRaw = form.querySelector('#filter-tipo')?.value || '';
    const estadoRaw = form.querySelector('#filter-estado')?.value || '';
    const ciudadRaw = form.querySelector('#filter-ciudad')?.value || '';

    const tipo = isPlaceholder(tipoRaw) ? '' : tipoRaw.trim();
    const estado = isPlaceholder(estadoRaw) ? '' : estadoRaw.trim();
    const ciudad = isPlaceholder(ciudadRaw) ? '' : ciudadRaw.trim();

    const params = {};
    if (ciudad) params.city = ciudad;
    if (tipo) params.type = tipo;
    if (estado) params.estado = estado;
    return params;
  }

  // escape básico
  function escapeHtml(s) {
    if (!s && s !== 0) return '';
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  // Poblar selects a partir del array de rows que devuelve tu backend (data array)
  function populateSelectsFromRows(form, rows = []) {
    const tipos = new Set();
    const estados = new Set();
    const ciudades = new Set();

    (rows || []).forEach(r => {
      if (r.tipo) tipos.add(String(r.tipo).trim());
      if (r.estado) estados.add(String(r.estado).trim());
      if (r.ciudad) ciudades.add(String(r.ciudad).trim());
    });

    const fill = (selId, set, defaultText) => {
      const sel = form.querySelector(selId);
      if (!sel) return;
      const current = sel.value;
      sel.innerHTML = '';
      const d = document.createElement('option');
      d.value = '';
      d.textContent = defaultText;
      sel.appendChild(d);
      [...set].sort().forEach(v => {
        const o = document.createElement('option');
        o.value = v;
        o.textContent = v;
        sel.appendChild(o);
      });
      if (current) {
        try { sel.value = current; } catch (e) {}
      }
    };

    fill('#filter-tipo', tipos, 'Todos');
    fill('#filter-estado', estados, 'Todos');
    fill('#filter-ciudad', ciudades, 'Todas');
  }

  // Fetch simple: obtiene /api/places (sin filtros) y devuelve data[] si existe
  async function fetchAllRows() {
    try {
      const res = await fetch(`${API_BASE}/places`);
      if (!res.ok) {
        console.warn('[Filters] fetchAllRows HTTP', res.status);
        return [];
      }
      const json = await res.json();
      // tu backend tiene { success, message, data: [...] }
      if (Array.isArray(json)) return json;
      if (Array.isArray(json.data)) return json.data;
      // buscar primer array en el objeto
      for (const k in json) if (Array.isArray(json[k])) return json[k];
      return [];
    } catch (err) {
      console.error('[Filters] fetchAllRows error', err);
      return [];
    }
  }

  // Aplicar filtros: pide formato geojson para obtener FeatureCollection; si no, intenta transformar data[] como en capas.js
  async function applyFiltersAndUpdateLayer(params = {}) {
    // construir url con format=geojson para recibir FeatureCollection cuando el backend lo soporte
    const q = qs(Object.assign({}, params));
    const url = `${API_BASE}/places${q ? '?' + q + '&format=geojson' : '?format=geojson'}`;

    try {
      const res = await fetch(url);
      if (!res.ok) {
        console.error('[Filters] apply fetch error', res.status);
        return;
      }
      const body = await res.json();

      // Preferimos FeatureCollection si viene así
      if (body && body.type === 'FeatureCollection' && Array.isArray(body.features)) {
        if (typeof layerPuntos !== 'undefined' && layerPuntos && typeof layerPuntos.clearLayers === 'function') {
          layerPuntos.clearLayers();
          layerPuntos.addData(body);
        } else {
          console.warn('[Filters] layerPuntos no encontrado o inválido; asegúrate que capas.js declaró layerPuntos global.');
        }
        return;
      }

      // Si backend devolvió { data: [...] } (filas), convertir a FeatureCollection igual que en capas.js
      if (body && Array.isArray(body.data)) {
        const features = body.data.map(row => {
          let geometry = null;
          if (row.geojson) {
            try { geometry = (typeof row.geojson === 'string') ? JSON.parse(row.geojson) : row.geojson; }
            catch (e) { console.warn('geojson parse error for row.id=', row.id, e); }
          }
          if (!geometry && (row.lng !== undefined && row.lat !== undefined)) {
            geometry = { type: 'Point', coordinates: [Number(row.lng), Number(row.lat)] };
          }
          const props = { ...row };
          delete props.geojson;
          return { type: 'Feature', geometry, properties: props };
        });

        if (typeof layerPuntos !== 'undefined' && layerPuntos && typeof layerPuntos.clearLayers === 'function') {
          layerPuntos.clearLayers();
          layerPuntos.addData({ type: 'FeatureCollection', features });
        } else {
          console.warn('[Filters] layerPuntos no encontrado o inválido; asegúrate que capas.js declaró layerPuntos global.');
        }
        return;
      }

      // Otro formato inesperado: log
      console.warn('[Filters] Respuesta inesperada al aplicar filtros:', body);
    } catch (err) {
      console.error('[Filters] applyFiltersAndUpdateLayer error', err);
    }
  }

  // UI: toggle panel, close outside, ESC, submit -> apply filters
  function wireUI() {
    const openBtn = document.getElementById('open-filters-btn');
    const panel = document.getElementById('filtersPanel');
    const form = document.getElementById('filters-form');
    const closeBtn = document.getElementById('filters-close');
    const resetBtn = document.getElementById('filter-reset'); // <- agregado

    if (!openBtn || !panel || !form) {
      console.warn('[Filters] Elementos faltantes: open-filters-btn / filtersPanel / filters-form');
      return;
    }

    // iniciar cerrado
    panel.setAttribute('aria-hidden', 'true');
    panel.classList.remove('open');

    function closePanel() {
      panel.classList.remove('open');
      panel.setAttribute('aria-hidden', 'true');
      document.removeEventListener('click', onDocClick, true);
      document.removeEventListener('keydown', onKeyDown, true);
      openBtn.classList.remove('active');
    }
    function openPanel() {
      panel.classList.add('open');
      panel.setAttribute('aria-hidden', 'false');
      setTimeout(() => {
        document.addEventListener('click', onDocClick, true);
        document.addEventListener('keydown', onKeyDown, true);
      }, 0);
      openBtn.classList.add('active');
      // focus al primer input/select
      const first = form.querySelector('select, input, button');
      if (first) first.focus();
    }

    openBtn.addEventListener('click', (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      const isOpen = panel.classList.contains('open');
      if (isOpen) closePanel(); else openPanel();
    });

    // cerrar cuando se pulsa el botón de cierre dentro del panel
    closeBtn && closeBtn.addEventListener('click', (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      closePanel();
    });

    // evitar que clicks dentro del panel lo cierren
    panel.addEventListener('click', ev => ev.stopPropagation());

    // click fuera -> cerrar
    function onDocClick(e) {
      if (openBtn.contains(e.target)) return;
      if (panel.contains(e.target)) return;
      closePanel();
    }

    // ESC -> cerrar
    function onKeyDown(e) {
      if (e.key === 'Escape' || e.key === 'Esc') closePanel();
    }

    // submit -> aplicar filtros (no cierra el panel)
    form.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const params = readFilterValues(form);
      await applyFiltersAndUpdateLayer(params);
    });

    // RESET: restablece selects y recarga todos los puntos
    if (resetBtn) {
      resetBtn.addEventListener('click', async (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        try {
          // 1) reset form UI
          form.reset();
          // 2) repoblar selects con los valores actuales del backend (por si cambiaron)
          const rows = await fetchAllRows();
          populateSelectsFromRows(form, rows);
          // 3) aplicar sin filtros => recargar todos los puntos
          await applyFiltersAndUpdateLayer({});
        } catch (err) {
          console.error('[Filters] error en reset:', err);
        }
      });
    }
  }

  // Inicial: poblar selects con los valores disponibles
  async function initialPopulate() {
    const form = document.getElementById('filters-form');
    if (!form) return;
    const rows = await fetchAllRows();
    populateSelectsFromRows(form, rows);
  }

  document.addEventListener('DOMContentLoaded', () => {
    wireUI();
    initialPopulate();
  });

  // Export opcional para debugging
  window.SimpleFilters = {
    applyFiltersAndUpdateLayer,
    fetchAllRows
  };
})();
