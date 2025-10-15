// -------------------- CONFIG --------------------
const API_BASE = 'http://localhost:3000/api';

// -------------------- MAPA BASE--------------------
const map = L.map('map', { zoomControl: false }).setView([4.6624981, -74.0843214], 14);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);
L.control.zoom({ position: 'bottomright' }).addTo(map);

// -------------------- CAPAS - PUNTO --------------------
const layerPuntos = L.geoJSON(null, {
  pointToLayer: (feature, latlng) => L.marker(latlng),
  onEachFeature: (feature, layer) => {
    const nombre = feature.properties?.nombre ?? '-';
    const tipo = feature.properties?.tipo ?? '-';
    const ciudad = feature.properties?.ciudad ?? '-';
    const horario = feature.properties?.horario ?? '-'
    const rating = feature.properties?.rating ?? '-';
    const descripcion = feature.properties?.descripcion ?? '-';
    const estado = feature.properties?.estado ?? '';
    const fecha_reporte = feature.properties?.fecha_reporte ?? '-';
    const longitud = feature.properties?.lng?? '-';
    const latitud = feature.properties?.lat ?? '-';
    layer.bindPopup(
      `<b>Nombre:</b> ${nombre}
      <br><b>Tipo:</b> ${tipo}
      <br><b>Ciudad:</b> ${ciudad}
      <br><b>Horario:</b> ${horario}
      <br><b>Rating:</b> ${rating}
      <br><b>Descripcion:</b> ${descripcion}
      <br><b>Estado:</b> ${estado}
      <br><b>Fecha de Reporte:</b> ${fecha_reporte}
      <br><b>Longitud:</b> ${longitud}
      <br><b>Latitud:</b> ${latitud}`
    );
  }
}).addTo(map);

//----------------- FUNCION PARA CARGAR LOS PUNTOS -------
async function cargarPuntos() {
  try {
    const res = await fetch(`${API_BASE}/places?format=geojson`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const fc = await res.json();

    // Validación mínima
    if (!fc || fc.type !== 'FeatureCollection' || !Array.isArray(fc.features)) {
      console.warn('Respuesta no es FeatureCollection');
      return;
    }

    layerPuntos.clearLayers();
    layerPuntos.addData(fc);

    // Ajustar vista si hay puntos
    const bounds = layerPuntos.getBounds();
    if (bounds.isValid && !bounds.isEmpty()) map.fitBounds(bounds, { maxZoom: 16 });
  } catch (err) {
    console.error('Error cargando puntos:', err);
  }
}

//---------------- LLAMAR A LA FUNCION DECARGAR PUNTOS -------
cargarPuntos();

// -------------------- DRAWER (panel lateral) --------------------
// Elementos del DOM
const drawer = document.getElementById('drawer');
const drawerToggle = document.getElementById('drawerToggle');
const drawerClose = document.getElementById('drawerClose');
const drawerList = document.getElementById('drawerList');
const applyFilters = document.getElementById('applyFilters');

function abrirDrawer() {
  if (!drawer) return;
  drawer.classList.add('open');
  drawer.setAttribute('aria-hidden', 'false');
  // ocultar el botón toggle para que no tape el título "Lugares"
  if (drawerToggle) drawerToggle.classList.add('hidden');
}

function cerrarDrawer() {
  if (!drawer) return;
  drawer.classList.remove('open');
  drawer.setAttribute('aria-hidden', 'true');
  // volver a mostrar el botón toggle y devolverle el foco
  if (drawerToggle) {
    drawerToggle.classList.remove('hidden');
    drawerToggle.focus();
  }
}

drawerToggle && drawerToggle.addEventListener('click', abrirDrawer);
drawerClose && drawerClose.addEventListener('click', cerrarDrawer);
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') cerrarDrawer(); });

// Poblar la lista del drawer a partir de una FeatureCollection o array de features
function poblarDrawerLista(fcOrArray) {
  if (!drawerList) return;
  drawerList.innerHTML = '';
  let features = [];
  if (!fcOrArray) return;
  if (fcOrArray.type === 'FeatureCollection' && Array.isArray(fcOrArray.features)) features = fcOrArray.features;
  else if (Array.isArray(fcOrArray)) features = fcOrArray;

  features.forEach(f => {
    const props = f.properties || {};
    const nombre = props.nombre || props.title || 'Sin nombre';
    const tipo = props.tipo ? ` — ${props.tipo}` : '';
    const item = document.createElement('div');
    item.className = 'drawer-item';
    item.innerHTML = `<strong>${escapeHtml(nombre)}</strong><br><small>${escapeHtml(tipo)}</small>`;
    item.addEventListener('click', () => {
      // centrar en la feature si tiene coords
      const geom = f.geometry;
      if (geom && geom.type === 'Point' && Array.isArray(geom.coordinates)) {
        const [lng, lat] = geom.coordinates;
        map.setView([lat, lng], 17);
      }
      cerrarDrawer();
    });
    drawerList.appendChild(item);
  });
}

// Mostrar en drawer cuando los puntos se carguen: re-define cargarPuntos para notificar
// (Alternativa: podríamos disparar un evento; aquí llamamos manualmente desde cargarPuntos si se desea)

// Manejo básico de filtros: consulta API con query params
applyFilters && applyFilters.addEventListener('click', async () => {
  const city = document.getElementById('filterCity')?.value.trim() || '';
  const type = document.getElementById('filterType')?.value.trim() || '';
  const params = new URLSearchParams();
  if (city) params.set('city', city);
  if (type) params.set('type', type);
  try {
    const res = await fetch(`${API_BASE}/places?format=geojson&` + params.toString());
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const fc = await res.json();
    layerPuntos.clearLayers();
    layerPuntos.addData(fc);
    poblarDrawerLista(fc);
    const bounds = layerPuntos.getBounds();
    if (bounds.isValid && !bounds.isEmpty()) map.fitBounds(bounds, { maxZoom: 16 });
  } catch (err) {
    console.error('Error aplicando filtros:', err);
  }
});

// Opcional: cuando cargarPuntos finaliza, podrías llamar a poblarDrawerLista desde allí.
