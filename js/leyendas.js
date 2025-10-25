// legend.js
// Requiere: que exista un botón con data-action="legend" (en tu drawer) y window.layerPuntos o la API /api/places

(function () {
  const API_BASE = 'http://localhost:3000/api';
  const btnLegend = document.querySelector('[data-action="legend"]');
  const legendPanel = document.getElementById('legendPanel');
  const legendClose = document.getElementById('legend-close');
  const legendReset = document.getElementById('legend-reset');

  // colores de paleta para tipos (se asignan en orden)
  const palette = ['#1f77b4','#ff7f0e','#2ca02c','#d62728','#9467bd','#8c564b','#e377c2','#7f7f7f','#bcbd22','#17becf'];

  let activeFilters = {
    tipos: new Set(),
    estados: new Set(),
    rating: new Set()
  };

  // abrir/cerrar panel
  function toggleLegend(show) {
    if (!legendPanel) return;
    const s = Boolean(show);
    legendPanel.setAttribute('aria-hidden', s ? 'false' : 'true');
  }

  btnLegend && btnLegend.addEventListener('click', (e) => {
    e.preventDefault();
    const isOpen = legendPanel && legendPanel.getAttribute('aria-hidden') === 'false';
    toggleLegend(!isOpen);
  });
  legendClose && legendClose.addEventListener('click', () => toggleLegend(false));

  // Llamar para cargar datos y construir leyenda
  async function buildLegendFromBackend() {
    try {
      const res = await fetch(`${API_BASE}/places`);
      if (!res.ok) {
        console.warn('Leyenda: no se pudo obtener /places', res.status);
        return buildFromLayer();
      }
      const body = await res.json().catch(() => null);
      const rows = Array.isArray(body?.data) ? body.data : (Array.isArray(body) ? body : []);
      if (!rows || rows.length === 0) return buildFromLayer();
      renderLegend(rows);
    } catch (err) {
      console.warn('Leyenda: error fetching places, fallback a layer', err);
      buildFromLayer();
    }
  }

  // Fallback: intenta usar window.layerPuntos si existe y ya tiene layers
  function buildFromLayer() {
    try {
      if (!window.layerPuntos) { console.warn('Leyenda fallback: layerPuntos no disponible'); return; }
      const rows = [];
      window.layerPuntos.eachLayer(l => {
        if (!l.feature || !l.feature.properties) return;
        rows.push(l.feature.properties);
      });
      if (rows.length === 0) return;
      renderLegend(rows);
    } catch (err) {
      console.error('Leyenda fallback error:', err);
    }
  }

  // Renderiza la leyenda a partir de un array de filas ({tipo, estado, rating, ...})
  function renderLegend(rows) {
    // normalizar strings (trim, lower for grouping)
    const tiposMap = new Map(); // tipo => count
    const estadosMap = new Map();
    const ratingCounts = { low: 0, mid: 0, high: 0 };

    rows.forEach(r => {
      const tipo = (r.tipo || 'sin tipo').toString().trim();
      tiposMap.set(tipo, (tiposMap.get(tipo) || 0) + 1);

      const estado = (r.estado || 'desconocido').toString().trim();
      estadosMap.set(estado, (estadosMap.get(estado) || 0) + 1);

      const rating = r.rating !== undefined && r.rating !== null ? parseFloat(r.rating) : NaN;
      if (!isNaN(rating)) {
        if (rating < 2) ratingCounts.low++;
        else if (rating < 4) ratingCounts.mid++;
        else ratingCounts.high++;
      }
    });

    // tipos
    const containerTipos = document.querySelector('#legend-types .legend-items');
    const containerEstados = document.querySelector('#legend-states .legend-items');
    const containerRating = document.querySelector('#legend-rating .legend-items');
    if (!containerTipos || !containerEstados || !containerRating) return;

    containerTipos.innerHTML = '';
    containerEstados.innerHTML = '';
    containerRating.innerHTML = '';

    // asignar color por tipo
    let idx = 0;
    for (const [tipo, cnt] of tiposMap.entries()) {
      const color = palette[idx % palette.length];
      idx++;
      const item = createLegendItem({ key: tipo, label: tipo, count: cnt, color, kind: 'tipo' });
      containerTipos.appendChild(item);
    }

    // estados (usar pills)
    for (const [estado, cnt] of estadosMap.entries()) {
      const color = estado === 'verificado' ? '#2ca02c' : (estado === 'resuelto' ? '#1f77b4' : (estado === 'reciente' ? '#ff7f0e' : '#888'));
      const item = createLegendItem({ key: estado, label: estado, count: cnt, color, kind: 'estado', pill: true });
      containerEstados.appendChild(item);
    }

    // rating boxes
    const lowItem = createLegendItem({ key: 'rating_low', label: 'Rating < 2', count: ratingCounts.low, color: '#d62728', kind: 'rating' });
    const midItem = createLegendItem({ key: 'rating_mid', label: '2 ≤ Rating < 4', count: ratingCounts.mid, color: '#ff7f0e', kind: 'rating' });
    const highItem = createLegendItem({ key: 'rating_high', label: 'Rating ≥ 4', count: ratingCounts.high, color: '#2ca02c', kind: 'rating' });
    containerRating.appendChild(lowItem);
    containerRating.appendChild(midItem);
    containerRating.appendChild(highItem);

    // attach reset
    legendReset && (legendReset.onclick = resetFilters);
  }

  // crea nodo DOM para un item de leyenda
  function createLegendItem({ key, label, count = 0, color = '#999', kind = 'tipo', pill = false }) {
    const el = document.createElement('div');
    el.className = 'legend-item' + (pill ? ' pill' : '');
    el.dataset.key = key;
    el.dataset.kind = kind;

    const sw = document.createElement('div');
    sw.className = 'swatch';
    sw.style.background = color;

    const labelNode = document.createElement('div');
    labelNode.className = 'label';
    labelNode.textContent = label;

    const countNode = document.createElement('div');
    countNode.className = 'count';
    countNode.textContent = count;

    el.appendChild(sw);
    el.appendChild(labelNode);
    el.appendChild(countNode);

    // click toggles filter
    el.addEventListener('click', (e) => {
      const k = el.dataset.key;
      const kd = el.dataset.kind;
      toggleFilter(kd, k, el);
    });

    return el;
  }

  // toggle filter state and apply to layerPuntos
  function toggleFilter(kind, key, elNode) {
    const set = (kind === 'tipo') ? activeFilters.tipos : (kind === 'estado') ? activeFilters.estados : activeFilters.rating;
    if (set.has(key)) {
      set.delete(key);
      elNode.classList.remove('inactive');
    } else {
      set.add(key);
      elNode.classList.add('inactive');
    }
    applyFiltersToLayer();
  }

  // reset all filters
  function resetFilters() {
    activeFilters.tipos.clear();
    activeFilters.estados.clear();
    activeFilters.rating.clear();
    document.querySelectorAll('#legendPanel .legend-item').forEach(n => n.classList.remove('inactive'));
    applyFiltersToLayer();
  }

  // Aplica filtros recorriendo window.layerPuntos (si existe)
  function applyFiltersToLayer() {
    if (!window.layerPuntos || typeof window.layerPuntos.eachLayer !== 'function') {
      console.warn('Leyenda: layerPuntos no disponible para filtrar');
      return;
    }
    window.layerPuntos.eachLayer(layer => {
      const p = layer.feature && layer.feature.properties ? layer.feature.properties : {};
      const tipo = (p.tipo || '').toString();
      const estado = (p.estado || '').toString();
      const rating = p.rating !== undefined && p.rating !== null ? parseFloat(p.rating) : NaN;

      // evaluar rating sets: compare to keys 'rating_low' etc
      let ratingMatch = false;
      if (activeFilters.rating.size === 0) ratingMatch = true;
      else {
        for (const k of activeFilters.rating) {
          if (k === 'rating_low' && !isNaN(rating) && rating < 2) ratingMatch = true;
          if (k === 'rating_mid' && !isNaN(rating) && rating >= 2 && rating < 4) ratingMatch = true;
          if (k === 'rating_high' && !isNaN(rating) && rating >= 4) ratingMatch = true;
        }
      }

      const tipoAllowed = (activeFilters.tipos.size === 0) || activeFilters.tipos.has(tipo);
      const estadoAllowed = (activeFilters.estados.size === 0) || activeFilters.estados.has(estado);

      const visible = tipoAllowed && estadoAllowed && ratingMatch;

      // mostrar/ocultar (usamos setStyle cuando exista o add/remove layer)
      try {
        if (visible) {
          if (!map.hasLayer(layer)) map.addLayer(layer);
          layer.setStyle && layer.setStyle({ opacity: 1 });
          layer.getElement && layer.getElement()?.classList?.remove('leaflet-marker-hidden');
        } else {
          if (map.hasLayer(layer)) map.removeLayer(layer);
        }
      } catch (err) {
        // fallback: hide marker by setOpacity on icon (if marker)
        if (layer instanceof L.Marker) {
          try {
            if (visible) {
              if (!map.hasLayer(layer)) map.addLayer(layer);
              layer.setOpacity && layer.setOpacity(1);
            } else {
              if (map.hasLayer(layer)) map.removeLayer(layer);
            }
          } catch (e) { /**/ }
        }
      }
    });
  }

  // Si el mapa o layerPuntos se carga más tarde, reintentar aplicar filtros y reconstruir leyenda.
  function waitForLayerThenBuild(timeout = 3000) {
    const start = Date.now();
    (function check() {
      if (window.layerPuntos && window.layerPuntos.getLayers && window.layerPuntos.getLayers().length > 0) {
        // construir a partir del layer si no lo hicimos ya
        buildFromLayer();
        return;
      }
      if (Date.now() - start > timeout) {
        // intentar backend de todos modos
        buildLegendFromBackend();
        return;
      }
      setTimeout(check, 200);
    })();
  }

  // inicial
  document.addEventListener('DOMContentLoaded', () => {
    // intentar construir desde layer primero (si está), sino desde backend
    if (window.layerPuntos && window.layerPuntos.getLayers && window.layerPuntos.getLayers().length > 0) {
      buildFromLayer();
    } else {
      // si capas.js carga después, esperar un poco
      waitForLayerThenBuild(3500);
    }
  });

  // también reconstruir si se carga nuevo dataset. componente capas.js puede disparar evento "data:loaded"
  window.addEventListener('data:loaded', () => {
    console.log('Leyenda: evento data:loaded recibido, reconstruyendo leyenda');
    buildFromLayer();
  });

})();
