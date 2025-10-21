//====================== DRAW CONTROL ======================
try {
  if (window.drawControl) {
    map.removeControl(window.drawControl);
    window.drawControl = null;
  }
} catch (e) { /* ignore */ }

window.drawControl = new L.Control.Draw({
  position: 'bottomleft',
  draw: {
    polygon: false,
    polyline: false,
    rectangle: false,
    circle: false,
    marker: true,
    circlemarker: false
  },
  edit: {
    featureGroup: editableLayers
  }
});


map.addControl(window.drawControl);