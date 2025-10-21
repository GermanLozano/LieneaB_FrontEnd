// capas.js
// ==================== CONFIG ======================
const API_BASE = 'http://localhost:3000/api';

// ==================== MAPA BASE ====================
const map = L.map('map', { zoomControl: false }).setView([4.6624981, -74.0843214], 14);

// Múltiples mapas base
const osmLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '© OpenStreetMap contributors'
});

const cartoLayer = L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
  attribution: '© CARTO'
});

// Agregar capa base por defecto
osmLayer.addTo(map);
L.control.zoom({ position: 'bottomright' }).addTo(map);

// ------------------- HELPERS AUTH / UTIL --------------------
function getToken() {
  return localStorage.getItem('token') || null;
}

function getAuthHeaders() {
  const token = getToken();
  const h = { 'Content-Type': 'application/json' };
  if (token) h['Authorization'] = `Bearer ${token}`;
  return h;
}

function isAuthenticated() {
  return !!getToken();
}

function showLoginModal() {
  const m = document.getElementById('loginModal');
  if (m) m.style.display = 'flex';
  else alert('Debe iniciar sesión para realizar esta acción.');
}

// ================ CONTROL DE CAPAS ==================
function crearControlCapas() {
  const baseMaps = {
    "OpenStreetMap": osmLayer,
    "Carto Light": cartoLayer
  };

  const overlayMaps = {};
  L.control.layers(baseMaps, overlayMaps, { position: 'topleft' }).addTo(map);
}

// ==================== GRUPO EDITABLE ====================
const editableLayers = new L.featureGroup().addTo(map);

// ==================== CAPA  PUNTO =================
const layerPuntos = L.geoJSON(null, {
  pointToLayer: (feature, latlng) => L.marker(latlng),
  onEachFeature: (feature, layer) => {
    const p = feature.properties || {};
    const nombre = p.nombre ?? '-';
    const tipo = p.tipo ?? '-';
    const ciudad = p.ciudad ?? '-';
    const horario = p.horario ?? '-';
    const rating = p.rating ?? '-';
    const descripcion = p.descripcion ?? '-';
    const estado = p.estado ?? '';
    const fecha_reporte = p.fecha_reporte ?? '-';
    const longitud = p.lng ?? (feature.geometry?.coordinates?.[0] ?? '-');
    const latitud = p.lat ?? (feature.geometry?.coordinates?.[1] ?? '-');

    layer.bindPopup(
      `<b>Nombre:</b> ${escapeHtml(nombre)}
      <br><b>Tipo:</b> ${escapeHtml(tipo)}
      <br><b>Ciudad:</b> ${escapeHtml(ciudad)}
      <br><b>Horario:</b> ${escapeHtml(horario)}
      <br><b>Rating:</b> ${escapeHtml(rating)}
      <br><b>Descripcion:</b> ${escapeHtml(descripcion)}
      <br><b>Estado:</b> ${escapeHtml(estado)}
      <br><b>Fecha de Reporte:</b> ${escapeHtml(fecha_reporte)}
      <br><b>Longitud:</b> ${escapeHtml(String(longitud))}
      <br><b>Latitud:</b> ${escapeHtml(String(latitud))}`
    );

    // asociar acciones y agregar al grupo editable
    attachActionsToLayer(layer, 'places'); // nota: uso 'places' para coincidir con API_BASE (/api/places)
    editableLayers.addLayer(layer);
  }
}).addTo(map);

// ==================== FUNCION PARA CARGAR LOS PUNTOS =================
async function cargarPuntos() {
  try {
    const res = await fetch(`${API_BASE}/places?format=geojson`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const body = await res.json();
    console.log('Respuesta del backend (cargarPuntos):', body);

    // 1) Si ya es FeatureCollection
    if (body && body.type === 'FeatureCollection' && Array.isArray(body.features)) {
      layerPuntos.clearLayers();
      layerPuntos.addData(body);
    }
    // 2) Si viene envuelto: { success, message, data: [ rows ] }
    else if (body && Array.isArray(body.data)) {
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

      layerPuntos.clearLayers();
      layerPuntos.addData({ type: 'FeatureCollection', features });
    }
    // 3) Si viene simplemente { data: { ... } } o un único objeto
    else if (body && body.data && !Array.isArray(body.data) && typeof body.data === 'object') {
      const row = body.data;
      let geometry = null;
      if (row.geojson) {
        try { geometry = (typeof row.geojson === 'string') ? JSON.parse(row.geojson) : row.geojson; }
        catch (e) { console.warn('geojson parse error single row', e); }
      }
      if (!geometry && (row.lng !== undefined && row.lat !== undefined)) {
        geometry = { type: 'Point', coordinates: [Number(row.lng), Number(row.lat)] };
      }
      const feat = { type: 'Feature', geometry, properties: (() => { const p = { ...row }; delete p.geojson; return p; })() };
      layerPuntos.clearLayers();
      layerPuntos.addData({ type: 'FeatureCollection', features: [feat] });
    } else {
      console.warn('Formato de respuesta inesperado. Se esperaba FeatureCollection o { data: [...] }', body);
      return;
    }

    if (layerPuntos.getLayers().length > 0) {
      map.fitBounds(layerPuntos.getBounds(), { maxZoom: 16, padding: [20, 20] });
    } else {
      console.log('No hay features para mostrar.');
    }
  } catch (err) {
    console.error('Error cargando puntos:', err);
  }
}

//====================== LLAMAR A LA FUNCION CARGAR PUNTOS ================
cargarPuntos();
crearControlCapas();


// =================== CREAR NUEVAS GEOMETRÍAS (POST) ===================
map.on(L.Draw.Event.CREATED, async function (event) {
  // verificación de sesión
  if (!isAuthenticated()) {
    alert('Debes iniciar sesión para agregar un punto.');
    showLoginModal();
    return;
  }

  const layer = event.layer;
  const type = event.layerType; // marker, polygon, polyline, rectangle
  let geojson = layer.toGeoJSON();

  // pedimos atributos al usuario (puedes sustituir por un modal/form)
  const nombre = prompt("Nombre del objeto:", "") || '';
  const tipoVal = prompt("Tipo (ej: Riña, Vandalismo, Atracos):", "") || '';
  const descripcion = prompt("Descripción:", "") || '';
  const ciudad = prompt("Ciudad (opcional):", "") || '';
  const horario = prompt("Horario (opcional):", "") || '';
  const ratingStr = prompt("Rating (opcional, número):", "") || '';
  const rating = ratingStr ? parseFloat(ratingStr) : null;
  const estado = 'reciente';

  if (type === 'marker') {
    const coords = geojson.geometry && geojson.geometry.coordinates;
    const lng = coords ? Number(coords[0]) : null;
    const lat = coords ? Number(coords[1]) : null;

    if (lat === null || lng === null) {
      alert('No se pudieron obtener las coordenadas del punto.');
      return;
    }

    const data = {
      nombre,
      lat,
      lng,
      tipo: tipoVal,
      ciudad,
      horario: horario || null,
      rating,
      descripcion,
      estado
    };

    try {
      const resp = await fetch(API_BASE + '/places', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(data)
      });

      const body = await resp.json().catch(() => null);
      if (!resp.ok) {
        console.error('Error al crear punto:', resp.status, body);
        alert('Error al guardar el punto: ' + (body?.message || resp.status));
        return;
      }

      alert('Punto guardado');
      await cargarPuntos();
    } catch (err) {
      console.error(err);
      alert('Error al guardar: ' + (err.message || err));
    }
  } else {
    alert('Solo se permite crear marcadores (markers) con este flujo.');
  }
});

// =================== FUNCION: GUARDAR GEOMETRIA (PUT) ===================
async function sendPutForLayer(tableName, id, layer) {
  if (!isAuthenticated()) {
    showLoginModal();
    throw new Error('Usuario no autenticado');
  }

  // obtener coordenadas segun tipo de layer (Marker o GeoJSON)
  let lat = null, lng = null;
  if (layer instanceof L.Marker) {
    const ll = layer.getLatLng();
    lat = ll.lat; lng = ll.lng;
  } else {
    const g = layer.toGeoJSON();
    if (g && g.geometry && g.geometry.type === 'Point' && Array.isArray(g.geometry.coordinates)) {
      lng = g.geometry.coordinates[0];
      lat = g.geometry.coordinates[1];
    }
  }

  const data = {};
  if (lat !== null && lng !== null) {
    data.lat = Number(lat);
    data.lng = Number(lng);
  } else {
    throw new Error('No hay coordenadas disponibles para guardar');
  }

  const url = `${API_BASE}/${tableName}/${id}`;
  const resp = await fetch(url, {
    method: 'PUT',
    headers: getAuthHeaders(),
    body: JSON.stringify(data)
  });

  if (!resp.ok) {
    const txt = await resp.text().catch(() => null);
    throw new Error(`Error guardando geometría: ${resp.status} ${txt || ''}`);
  }
  return await resp.json().catch(() => null);
}

// ================ ADJUNTAR ACCIONES A LA CAPA (Eliminar, Editar Atributos, Editar Geometría) ==============
function attachActionsToLayer(layer, tableName) {
  // Evitar añadir listeners duplicados
  layer.off('popupopen');

  // Construir popup con botones y datos (se actualiza cada vez que se llama)
  const props = (layer.feature && layer.feature.properties) ? layer.feature.properties : {};
  const nombre = props.nombre || 'Objeto';
  const tipo = props.tipo || '';
  const ciudad = props.ciudad || '';
  const horario = props.horario || '-';
  const rating = props.rating ?? '';
  const descripcion = props.descripcion || '';
  const estado = props.estado ?? '';
  const fecha_reporte = props.fecha_reporte ?? '';
  const longitud = props.lng ?? (layer.feature?.geometry?.coordinates?.[0] ?? '-');
  const latitud = props.lat ?? (layer.feature?.geometry?.coordinates?.[1] ?? '-');
  const id = props.id || props.ID || '';

  const popupHtml = `
    <div class="popup-content">
      <div><b>Nombre:</b> ${escapeHtml(nombre)}</div>
      <div><b>Tipo:</b> ${escapeHtml(tipo)}</div>
      <div><b>Ciudad:</b> ${escapeHtml(ciudad)}</div>
      <div><b>Horario:</b> ${escapeHtml(horario)}</div>
      <div><b>Rating:</b> ${escapeHtml(String(rating))}</div>
      <div><b>Descripción:</b> ${escapeHtml(descripcion)}</div>
      <div><b>Estado:</b> ${escapeHtml(estado)}</div>
      <div><b>Fecha de Reporte:</b> ${escapeHtml(String(fecha_reporte))}</div>
      <div><b>Coordenadas:</b> ${escapeHtml(String(latitud))}, ${escapeHtml(String(longitud))}</div>
      <hr style="margin:6px 0;">
      <div style="display:flex; gap:6px;">
        <button class="btn-edit-attrs" data-id="${id}" data-table="${tableName}">Editar</button>
        <button class="btn-edit-geom" data-id="${id}" data-table="${tableName}">Editar geometría</button>
        <button class="btn-del" data-id="${id}" data-table="${tableName}">Eliminar</button>
      </div>
    </div>
  `;

  // Asignar popup (reemplaza el que existiera)
  layer.bindPopup(popupHtml);

  // Ahora sí añadimos el listener 'popupopen' para manejar los botones
  layer.on('popupopen', function (e) {
    try {
      const node = e.popup._contentNode;
      if (!node) return;

      // ELIMINAR
      const btnDel = node.querySelector('.btn-del');
      if (btnDel) {
        btnDel.onclick = async () => {
          if (!isAuthenticated()) { showLoginModal(); return; }

          const idBtn = btnDel.dataset.id;
          const tableBtn = btnDel.dataset.table || tableName || 'places';
          if (!idBtn) { alert('No hay ID para eliminar.'); return; }
          if (!confirm('Confirmar eliminación?')) return;
          try {
            const resp = await fetch(`${API_BASE}/${tableBtn}/${idBtn}`, {
              method: 'DELETE',
              headers: getAuthHeaders()
            });
            const body = await resp.json().catch(() => null);
            if (!resp.ok) throw new Error(body?.message || resp.status);
            await cargarPuntos();
            alert('Eliminado correctamente.');
            layer.closePopup();
          } catch (err) {
            console.error(err);
            alert('Error al eliminar: ' + (err.message || err));
          }
        };
      }

      // EDITAR ATRIBUTOS
      const btnEdit = node.querySelector('.btn-edit-attrs');
      if (btnEdit) {
        btnEdit.onclick = async () => {
          if (!isAuthenticated()) { showLoginModal(); return; }

          const idBtn = btnEdit.dataset.id || id;
          const tableBtn = btnEdit.dataset.table || tableName || 'places';
          if (!idBtn) { alert('No hay ID para editar.'); return; }

          const nuevoNombre = prompt('Nombre:', layer.feature?.properties?.nombre || nombre) || '';
          const nuevoTipo = prompt('Tipo:', layer.feature?.properties?.tipo || tipo) || '';
          const nuevaDesc = prompt('Descripción:', layer.feature?.properties?.descripcion || descripcion) || '';
          const nuevaCiudad = prompt('Ciudad (opcional):', layer.feature?.properties?.ciudad || ciudad) || '';
          const nuevoHorario = prompt('Horario (opcional):', layer.feature?.properties?.horario || horario) || '';
          const nuevoRatingStr = prompt('Rating (opcional, número):', String(layer.feature?.properties?.rating ?? '')) || '';
          const nuevoRating = nuevoRatingStr ? parseFloat(nuevoRatingStr) : null;
          const nuevoEstado = prompt('Estado (opcional):', layer.feature?.properties?.estado || estado) || '';

          const featureToSend = layer.toGeoJSON();
          const propsToSend = Object.assign({}, featureToSend.properties || {}, {
            nombre: nuevoNombre,
            tipo: nuevoTipo,
            descripcion: nuevaDesc,
            ciudad: nuevaCiudad || null,
            horario: nuevoHorario || null,
            rating: nuevoRating,
            estado: nuevoEstado || null
          });

          if (layer instanceof L.Marker) {
            const ll = layer.getLatLng();
            propsToSend.lat = Number(ll.lat);
            propsToSend.lng = Number(ll.lng);
          } else if (featureToSend.geometry && featureToSend.geometry.type === 'Point') {
            propsToSend.lng = Number(featureToSend.geometry.coordinates[0]);
            propsToSend.lat = Number(featureToSend.geometry.coordinates[1]);
          }

          try {
            const resp = await fetch(`${API_BASE}/${tableBtn}/${idBtn}`, {
              method: 'PUT',
              headers: getAuthHeaders(),
              body: JSON.stringify(propsToSend)
            });
            const body = await resp.json().catch(() => null);
            if (!resp.ok) throw new Error(body?.message || resp.status);
            await cargarPuntos();
            alert('Atributos actualizados correctamente.');
            layer.closePopup();
          } catch (err) {
            console.error(err);
            alert('Error al actualizar: ' + (err.message || err));
          }
        };
      }

      // EDITAR GEOMETRÍA
      const btnEditGeom = node.querySelector('.btn-edit-geom');
      if (btnEditGeom) {
        btnEditGeom.onclick = async () => {
          if (!isAuthenticated()) { showLoginModal(); return; }

          const idBtn = btnEditGeom.dataset.id || id;
          const tableBtn = btnEditGeom.dataset.table || tableName || 'places';
          if (!idBtn) { alert('No hay ID para editar geometría.'); return; }

          // --- MARKER (mover punto con drag) ---
          if (layer instanceof L.Marker) {
            try {
              const dragging = layer.dragging;
              // Si ya está en modo edición (drag activado), desactivar y guardar
              if (dragging && dragging.enabled && dragging.enabled()) {
                dragging.disable();
                try {
                  await sendPutForLayer(tableBtn, idBtn, layer);
                  alert('Geometría guardada (marker).');
                  await cargarPuntos();
                } catch (err) {
                  console.error('Error guardando geometría marker:', err);
                  alert('Error al guardar la geometría: ' + (err.message || err));
                }
              } else {
                // activar drag para mover
                if (dragging && dragging.enable) {
                  dragging.enable();
                  // cerrar popup para que no estorbe mientras se arrastra
                  layer.closePopup();
                  alert('Arrastra el marcador a la nueva posición y vuelve a pulsar "Editar geometría" para guardar.');
                } else {
                  alert('Arrastre no soportado para este marcador.');
                }
              }
            } catch (err) {
              console.error('Error edit geom marker:', err);
              alert('No es posible editar la geometría del marcador: ' + (err.message || err));
            }
            return;
          }

          // --- POLYLINE / POLYGON / OTRAS GEOMETRÍAS ---
          try {
            // Leaflet.draw editing API
            if (layer.editing && layer.editing.enabled && layer.editing.enabled()) {
              // estaba en edición -> desactivar y guardar
              layer.editing.disable();
              try {
                await sendPutForLayer(tableBtn, idBtn, layer);
                alert('Geometría guardada.');
                await cargarPuntos();
              } catch (err) {
                console.error('Error guardando geometría (feature):', err);
                alert('Error al guardar la geometría: ' + (err.message || err));
              }
            } else if (layer.editing && layer.editing.enable) {
              // activar edición (mover vértices)
              layer.editing.enable();
              // cerrar popup para mejor UX
              layer.closePopup();
              alert('Edita la geometría (mueve vértices) y pulsa "Editar geometría" de nuevo para guardar.');
            } else {
              alert('Edición de geometría no disponible en este entorno.');
            }
          } catch (err) {
            console.error('Error edit geom:', err);
            alert('No es posible activar la edición de geometría: ' + (err.message || err));
          }
        };
      }


    } catch (err) {
      console.error('attachActionsToLayer popupopen error:', err);
    }
  }); // end popupopen
} // end attachActionsToLayer
ToLayer


// escape básico para popup HTML
function escapeHtml(str) {
  if (!str && str !== 0) return '';
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
