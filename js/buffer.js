

(function () {
  let bufferLayer = null;        // L.GeoJSON polygon for buffer
  let bufferHitsLayer = null;    // L.LayerGroup for highlighted points inside buffer
  let activeClickHandler = null;
  let waitingForMapInterval = null;

  function dbg(...a) { console.log('[BufferUI]', ...a); }
  function warn(...a) { console.warn('[BufferUI]', ...a); }
  function err(...a) { console.error('[BufferUI]', ...a); }

  function panelInfo(panel, text, type = 'info') {
    if (!panel) return;
    let node = panel.querySelector('.buffer-info');
    if (!node) {
      node = document.createElement('div');
      node.className = 'buffer-info';
      node.style.fontSize = '13px';
      node.style.margin = '6px 4px';
      panel.querySelector('.buffer-body')?.insertBefore(node, panel.querySelector('.buffer-body').firstChild);
    }
    node.textContent = text || '';
    node.style.color = type === 'error' ? '#f59e0b' : '#444';
  }

  // ------------------ Map helpers ------------------
  function isLeafletMap(m) {
    return m && typeof m.getContainer === 'function' && typeof m.on === 'function' && typeof m.off === 'function';
  }

  function findLeafletMap() {
    if (typeof window !== 'undefined' && window.map && isLeafletMap(window.map)) return window.map;
    try { if (typeof map !== 'undefined' && isLeafletMap(map)) return map; } catch (e) {}
    try {
      if (typeof layerPuntos !== 'undefined' && layerPuntos && layerPuntos._map && isLeafletMap(layerPuntos._map)) {
        return layerPuntos._map;
      }
    } catch (e) {}
    return null;
  }

  function waitForMapThen(cb, timeoutMs = 8000, intervalMs = 200) {
    if (typeof cb !== 'function') return;
    const start = Date.now();
    if (waitingForMapInterval) clearInterval(waitingForMapInterval);
    waitingForMapInterval = setInterval(() => {
      const m = findLeafletMap();
      if (m) {
        clearInterval(waitingForMapInterval);
        waitingForMapInterval = null;
        dbg('Map detectado por waitForMapThen');
        cb(m);
        return;
      }
      if (Date.now() - start > timeoutMs) {
        clearInterval(waitingForMapInterval);
        waitingForMapInterval = null;
        warn('Timeout esperando mapa Leaflet (waitForMapThen)');
        cb(null);
      }
    }, intervalMs);
  }

  // ------------------ Turf / Buffer ------------------
  function createBufferGeoJSON(latlng, diameterMeters) {
    if (typeof turf === 'undefined') {
      warn('turf no está disponible; incluye turf.min.js en el HTML');
      return null;
    }
    const radius = Number(diameterMeters) / 2;
    if (!Number.isFinite(radius) || radius <= 0) return null;
    try {
      const pt = turf.point([latlng.lng, latlng.lat]);
      const buff = turf.buffer(pt, radius, { units: 'meters' });
      return buff;
    } catch (e) {
      err('Error creating buffer with turf:', e);
      return null;
    }
  }

  function ensureRemoveBuffer() {
    if (bufferLayer) {
      try { bufferLayer.remove(); } catch (e) {}
      bufferLayer = null;
    }
    if (bufferHitsLayer) {
      try { bufferHitsLayer.remove(); } catch (e) {}
      bufferHitsLayer = null;
    }
  }

  // Esta función resalta (no elimina) los puntos dentro del buffer.
  // Crea bufferHitsLayer con circleMarkers que visualmente resaltan los puntos que caen dentro.
  function highlightPointsInside(bufferGeoJSON) {
    // limpiar hits previos
    if (bufferHitsLayer) {
      try { bufferHitsLayer.clearLayers(); } catch (e) {}
      try { bufferHitsLayer.remove(); } catch (e) {}
      bufferHitsLayer = null;
    }

    // si no existe layerPuntos no podemos hacer matching; avisar y devolver 0
    if (typeof layerPuntos === 'undefined' || !layerPuntos || typeof layerPuntos.toGeoJSON !== 'function') {
      warn('layerPuntos no disponible — no se resaltarán puntos dentro del buffer.');
      return 0;
    }

    const all = layerPuntos.toGeoJSON ? layerPuntos.toGeoJSON() : { type: 'FeatureCollection', features: [] };
    const feats = Array.isArray(all.features) ? all.features : [];

    const insideFeatures = [];
    feats.forEach((feat) => {
      try {
        // turf.booleanPointInPolygon acepta punto feature o point geometry
        const isIn = turf.booleanPointInPolygon(feat, bufferGeoJSON);
        if (isIn) insideFeatures.push(feat);
      } catch (e) {
        // fallback: intentar con propiedades lat/lng
        const p = feat.properties || {};
        if (p.lat !== undefined && p.lng !== undefined) {
          try {
            const pt = turf.point([Number(p.lng), Number(p.lat)]);
            if (turf.booleanPointInPolygon(pt, bufferGeoJSON)) insideFeatures.push(feat);
          } catch (err) {}
        }
      }
    });

    // crear capa de hits
    bufferHitsLayer = L.layerGroup();
    insideFeatures.forEach((f) => {
      const coords = (f.geometry && f.geometry.coordinates) ? f.geometry.coordinates : [(f.properties && f.properties.lng), (f.properties && f.properties.lat)];
      const lng = Number(coords[0]);
      const lat = Number(coords[1]);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
      const marker = L.circleMarker([lat, lng], {
        radius: 8,
        color: '#fff',
        weight: 2,
        fillColor: '#f59e0b',
        fillOpacity: 1,
        className: 'buffer-hit-marker'
      });
      // intentar reusar popup info si existe en properties
      const p = f.properties || {};
      const popupHtml = `<div class="buffer-hit-popup"><b>${p.nombre || '-'}</b><br/>${p.tipo ? `<em>${p.tipo}</em><br/>` : ''}ID: ${p.id ?? ''}</div>`;
      marker.bindTooltip(popupHtml, { direction: 'top', offset: [0, -10], permanent: false, sticky: true });
      bufferHitsLayer.addLayer(marker);
    });

    bufferHitsLayer.addTo(findLeafletMap() || (window.map || map));

    return insideFeatures.length;
  }

  // Añade el polígono del buffer y un popup con info (diametro y conteo)
  function addBufferAndFilter(bufferGeoJSON, diameterMeters) {
    ensureRemoveBuffer();

    const targetMap = findLeafletMap() || (window.map || map);
    if (!targetMap) {
      warn('No se encontró mapa Leaflet para añadir buffer.');
      return;
    }

    try {
      bufferLayer = L.geoJSON(bufferGeoJSON, {
        style: { color: '#d33', weight: 2, fillOpacity: 0.12 }
      }).addTo(targetMap);
    } catch (e) {
      err('No se pudo agregar buffer al mapa:', e);
      return;
    }

    // resaltar puntos dentro sin eliminar los originales
    let count = 0;
    try {
      count = highlightPointsInside(bufferGeoJSON);
    } catch (e) {
      warn('Error al resaltar puntos dentro del buffer:', e);
      count = 0;
    }

    // bind popup en el polygon: diameter + count
    const popupContent = `<div class="buffer-popup">
      <div><strong>Buffer</strong></div>
      <div>Diámetro: <b>${Math.round(Number(diameterMeters) || 0)} m</b></div>
      <div>Puntos dentro: <b>${count}</b></div>
      <div style="margin-top:6px; font-size:12px; color:#666;">(Click en el polígono para cerrar)</div>
    </div>`;

    // abrir el popup centrado en el centroid aproximado
    try {
      bufferLayer.eachLayer((lyr) => {
        if (lyr && typeof lyr.bindPopup === 'function') {
          lyr.bindPopup(popupContent);
          lyr.on('click', (ev) => {
            try { lyr.openPopup(ev.latlng); } catch (e) {}
          });
        }
      });
    } catch (e) {
      // fallback: abrir popup en bounds center
      try {
        const bounds = bufferLayer.getBounds();
        const center = bounds.getCenter();
        L.popup({ maxWidth: 260 }).setLatLng(center).setContent(popupContent).openOn(targetMap);
      } catch (ee) {}
    }

    // ajustar vista para mostrar buffer y hits
    try {
      const bounds = bufferLayer.getBounds();
      if (bufferHitsLayer && bufferHitsLayer.getLayers && bufferHitsLayer.getLayers().length) {
        const temp = L.featureGroup(bufferHitsLayer.getLayers());
        const merged = temp.getBounds().extend(bounds);
        (targetMap).fitBounds(merged.pad ? merged.pad(0.15) : merged, { maxZoom: 16, padding: [20, 20] });
      } else {
        (targetMap).fitBounds(bounds, { maxZoom: 16, padding: [20, 20] });
      }
    } catch (e) { /* ignore */ }
  }

  // ------------------ Click mode ------------------
  function deactivateClickMode(panel) {
    const theMap = findLeafletMap();
    if (activeClickHandler && theMap && typeof theMap.off === 'function') {
      try { theMap.off('click', activeClickHandler); } catch (e) {}
    }
    activeClickHandler = null;
    const container = (theMap && typeof theMap.getContainer === 'function') ? theMap.getContainer() : document.getElementById('map');
    if (container && container.style) container.style.cursor = '';
    // if (panel) panelInfo(panel, 'Modo click desactivado.');
  }

  function enableClickToCreateBuffer(diameterMeters, panel) {
    const theMap = findLeafletMap();
    if (!theMap) {
      panelInfo(panel, 'Esperando inicialización del mapa...');
      waitForMapThen((m) => {
        if (!m) {
          panelInfo(panel, 'No se detectó mapa Leaflet en el tiempo esperado.', 'error');
          return;
        }
        enableClickToCreateBuffer(diameterMeters, panel);
      }, 8000, 200);
      return;
    }

    if (typeof theMap.getContainer !== 'function') {
      panelInfo(panel, 'Mapa detectado pero no expone getContainer.', 'error');
      dbg('theMap object:', theMap);
      return;
    }


    if (activeClickHandler && typeof theMap.off === 'function') {
      try { theMap.off('click', activeClickHandler); } catch (e) {}
      activeClickHandler = null;
    }

    const container = theMap.getContainer ? theMap.getContainer() : document.getElementById('map');
    if (container && container.style) container.style.cursor = 'crosshair';

    activeClickHandler = function (ev) {
      const latlng = ev && ev.latlng ? ev.latlng : null;
      if (!latlng) {
        panelInfo(panel, 'Click inválido.', 'error');
        deactivateClickMode(panel);
        return;
      }
      const geo = createBufferGeoJSON(latlng, diameterMeters);
      if (!geo) {
        panelInfo(panel, 'No se pudo crear el buffer (revisa el valor).', 'error');
        deactivateClickMode(panel);
        return;
      }
      addBufferAndFilter(geo, diameterMeters);
      deactivateClickMode(panel);
    };

    try {
      if (typeof theMap.on === 'function') theMap.on('click', activeClickHandler);
      else {
        warn('Mapa sin método on(); no se puede activar modo click correctamente.');
        panelInfo(panel, 'No se pudo activar modo click (mapa no expone API de eventos).', 'error');
      }
    } catch (e) {
      err('Error añadiendo click handler al mapa:', e);
      panelInfo(panel, 'Error activando modo click (ver consola).', 'error');
    }
  }

  // ------------------ UI wiring ------------------
  function movePanelToBody(panel) {
    if (!panel) return;
    if (panel.parentElement !== document.body) {
      document.body.appendChild(panel);
      dbg('bufferPanel movido a document.body');
    }
  }

  function findOpenButton() {
    const byId = document.getElementById('open-buffer-btn');
    if (byId) return byId;
    return document.querySelector('[data-action="buffer"]');
  }

  function openPanel(panel, openBtn) {
    panel.classList.add('open');
    panel.setAttribute('aria-hidden', 'false');
    openBtn && openBtn.classList.add('active');
    setTimeout(() => {
      document.addEventListener('click', onDocClick, true);
      document.addEventListener('keydown', onKeyDown, true);
    }, 0);
  }
  function closePanel(panel, openBtn) {
    panel.classList.remove('open');
    panel.setAttribute('aria-hidden', 'true');
    openBtn && openBtn.classList.remove('active');
    document.removeEventListener('click', onDocClick, true);
    document.removeEventListener('keydown', onKeyDown, true);
  }

  function onDocClick(e) {
    const panel = document.getElementById('bufferPanel');
    const openBtn = findOpenButton();
    if (!panel) return;
    if (openBtn && openBtn.contains(e.target)) return;
    if (panel.contains(e.target)) return;
    closePanel(panel, openBtn);
  }
  function onKeyDown(e) {
    if (e.key === 'Escape' || e.key === 'Esc') {
      const panel = document.getElementById('bufferPanel');
      const openBtn = findOpenButton();
      if (panel) closePanel(panel, openBtn);
    }
  }

  function wireUI() {
    const panel = document.getElementById('bufferPanel');
    const form = document.getElementById('buffer-form');
    const input = document.getElementById('buffer-diameter');
    const activateBtn = document.getElementById('buffer-activate');
    const resetBtn = document.getElementById('buffer-reset');
    const closeBtn = document.getElementById('buffer-close');

    if (!panel) { warn('bufferPanel no encontrado'); return; }
    if (!form) { warn('buffer-form no encontrado'); return; }

    movePanelToBody(panel);

    const openBtn = findOpenButton();
    if (!openBtn) { warn('Botón abrir buffer no encontrado'); return; }
    dbg('openBtn resuelto a', openBtn);

    panel.setAttribute('aria-hidden', 'true');
    panel.classList.remove('open');

    openBtn.addEventListener('click', function (ev) {
      ev.preventDefault();
      ev.stopPropagation();
      if (typeof ev.stopImmediatePropagation === 'function') ev.stopImmediatePropagation();
      const isOpen = panel.classList.contains('open');
      if (isOpen) closePanel(panel, openBtn);
      else openPanel(panel, openBtn);
    }, true);

    panel.addEventListener('click', ev => ev.stopPropagation());

    closeBtn && closeBtn.addEventListener('click', (ev) => {
      ev.preventDefault(); ev.stopPropagation();
      closePanel(panel, openBtn);
      deactivateClickMode(panel);
    });

    activateBtn && activateBtn.addEventListener('click', (ev) => {
      ev.preventDefault(); ev.stopPropagation();
      const val = Number(input.value);
      if (!val || !isFinite(val) || val <= 0) {
        panelInfo(panel, 'Ingrese un diámetro válido (>0).', 'error');
        return;
      }
      enableClickToCreateBuffer(val, panel);
    });

    resetBtn && resetBtn.addEventListener('click', (ev) => {
      ev.preventDefault(); ev.stopPropagation();
      deactivateClickMode(panel);
      ensureRemoveBuffer();
    });

    dbg('Buffer UI wired (highlights mode)');
  }

  document.addEventListener('DOMContentLoaded', () => {
    try { wireUI(); dbg('buffer_ui.js inicializado (highlights)'); } catch (e) { err('Error inicializando buffer UI:', e); }
  });

})();
