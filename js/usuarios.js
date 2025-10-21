
(function () {
  // --- Helpers ---
  function getToken() {
    return localStorage.getItem('token') || null;
  }
  function getUser() {
    try { return JSON.parse(localStorage.getItem('usuario') || 'null'); } catch (e) { return null; }
  }
  function isAuthenticated() { return !!getToken(); }
  function showLoginModal() {
    const m = document.getElementById('loginModal');
    if (m) { m.style.display = 'flex'; }
    else alert('Debe iniciar sesión para realizar esta acción.');
  }

  // --- Elementos del DOM ---
  const userBtn = document.getElementById('user-btn');
  const userInitial = document.getElementById('user-initial');    // botón avatar pequeño
  const userAvatar = document.getElementById('user-avatar');      // avatar grande dentro del menú (opcional)
  const userMenu = document.getElementById('user-menu');
  const userNameNode = document.getElementById('user-name');
  const userRoleNode = document.getElementById('user-role');
  const userEmailNode = document.getElementById('user-email');    // email encima del nombre
  const btnOpenLogin = document.getElementById('btn-open-login');
  const btnLogout = document.getElementById('btn-logout');

  // Si no existen los elementos mínimos, salir (evita errores)
  if (!userBtn || !userMenu) {
    // no abortamos silenciosamente, pero evitamos errores fatales
    console.warn('usuarios.js: elementos mínimos #user-btn o #user-menu no encontrados. Widget deshabilitado.');
    return;
  }

  // --- Renderizar widget según sesión ---
  function renderUserWidget() {
    const user = getUser();

    // Avatar pequeño del botón (initial)
    const initialNode = userInitial || userAvatar;
    if (isAuthenticated() && user) {
      // inicial = primera letra del nombre o del email
      const initial = (user.nombre && user.nombre[0]) ? user.nombre[0].toUpperCase()
                    : (user.email && user.email[0]) ? user.email[0].toUpperCase()
                    : 'In';
      if (initialNode) initialNode.textContent = initial;

      if (userAvatar) {
        // si hay nodo específico para avatar grande, lo rellenamos (inicial o icono)
        userAvatar.textContent = initial;
      }

      if (userNameNode) userNameNode.textContent = user.nombre || user.email || 'Usuario';
      if (userRoleNode) userRoleNode.textContent = user.rol ? String(user.rol) : 'usuario';
      if (userEmailNode) userEmailNode.textContent = user.email || '';

      // mostrar/ocultar botones
      if (btnOpenLogin) btnOpenLogin.style.display = 'none';
      if (btnLogout) btnLogout.style.display = 'inline-block';

      // accesibilidad
      userBtn.setAttribute('title', user.nombre || user.email || 'Cuenta');
    } else {
      // estado invitado
      if (initialNode) initialNode.textContent = 'In';
      if (userAvatar) userAvatar.textContent = 'In ';
      if (userNameNode) userNameNode.textContent = 'Invitado';
      if (userRoleNode) userRoleNode.textContent = 'No autenticado';
      if (userEmailNode) userEmailNode.textContent = '';

      if (btnOpenLogin) btnOpenLogin.style.display = 'inline-block';
      if (btnLogout) btnLogout.style.display = 'none';

      userBtn.setAttribute('title', 'Cuenta (iniciar sesión)');
    }
  }

  // --- Mostrar / ocultar menú ---
  function toggleMenu(open) {
    const expanded = Boolean(open);
    userMenu.classList.toggle('open', expanded);
    userBtn.setAttribute('aria-expanded', expanded ? 'true' : 'false');
    userMenu.setAttribute('aria-hidden', expanded ? 'false' : 'true');
  }

  // Click fuera para cerrar
  function handleClickOutside(e) {
    if (!userMenu.contains(e.target) && !userBtn.contains(e.target)) {
      toggleMenu(false);
    }
  }

  // Logout: limpiar localStorage y notificar
  function logout() {
    localStorage.removeItem('token');
    localStorage.removeItem('usuario');
    renderUserWidget();
    toggleMenu(false);
    // notificar a otros módulos
    window.dispatchEvent(new CustomEvent('auth:logout'));
    window.dispatchEvent(new CustomEvent('user:logout'));
  }

  // Abrir modal login
  function openLogin() {
    toggleMenu(false);
    showLoginModal();
  }

  // --- Eventos del widget ---
  // Click en el botón avatar
  userBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (!isAuthenticated()) {
      openLogin();
      return;
    }
    // alternar menú
    toggleMenu(!userMenu.classList.contains('open'));
  });

  // botones internos (si existen)
  if (btnOpenLogin) btnOpenLogin.addEventListener('click', openLogin);
  if (btnLogout) btnLogout.addEventListener('click', logout);

  // cerrar con ESC
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') toggleMenu(false);
  });

  // cerrar al clickar fuera
  document.addEventListener('click', handleClickOutside);

  // re-render si cambia localStorage (otra pestaña)
  window.addEventListener('storage', (e) => {
    if (e.key === 'token' || e.key === 'usuario') renderUserWidget();
  });

  // soportar distintos eventos de login que puedas emitir en auth.js
  window.addEventListener('auth:login', () => { renderUserWidget(); });
  window.addEventListener('user:login', () => { renderUserWidget(); });

  // tambien reaccionar a logout global
  window.addEventListener('auth:logout', () => { renderUserWidget(); });
  window.addEventListener('user:logout', () => { renderUserWidget(); });

  // Inicial
  renderUserWidget();

})();
