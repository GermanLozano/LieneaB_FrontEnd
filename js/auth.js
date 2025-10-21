// js/auth.js
const AUTH_API = 'http://localhost:3000/api/auth';

document.addEventListener('DOMContentLoaded', () => {
  const loginModal = document.getElementById('loginModal');
  const btnLogin = document.getElementById('btnLogin');
  const emailInput = document.getElementById('email');
  const passwordInput = document.getElementById('password');
  const errorText = document.getElementById('loginError');

  if (!loginModal || !btnLogin) {
    console.error('auth.js: elementos del DOM no encontrados (loginModal btnLogin).');
    return;
  }

  // Verificar token al inicio (no bloqueante)
  (async () => {
    const token = localStorage.getItem('token');
    console.log('[auth] token inicial en localStorage:', !!token);
    if (!token) {
      loginModal.style.display = 'flex';
      return;
    }

    const ok = await verificarSesion(token);
    console.log('[auth] verificarSesion inicial =>', ok);
    loginModal.style.display = ok ? 'none' : 'flex';
  })();

  // Listener de login
  btnLogin.addEventListener('click', async () => {
    errorText.textContent = '';
    const email = (emailInput.value || '').trim();
    const password = (passwordInput.value || '').trim();

    if (!email || !password) {
      errorText.textContent = 'Por favor completa los campos.';
      return;
    }

    try {
      console.log('[auth] enviando login', { email });
      const res = await fetch(`${AUTH_API}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });

      console.log('[auth] status login:', res.status);
      const body = await res.json().catch(() => null);
      console.log('[auth] body login:', body);

      if (res.ok && body && body.success && body.data?.token) {
        const token = body.data.token;
        localStorage.setItem('token', token);
        localStorage.setItem('usuario', JSON.stringify(body.data.user || {}));
        console.log('[auth] token guardado en localStorage. Verificando /me...');

        // Verificar token inmediatamente (para evitar reload con token inválido)
        const ok = await verificarSesion(token);
        console.log('[auth] verificarSesion POST-login =>', ok);
        if (ok) {
          loginModal.style.display = 'none';
          // notificar a la app que el login ha tenido éxito
          window.dispatchEvent(new CustomEvent('auth:login', {
            detail: {
              user: body.data.user || null
            }
          }));

          // cerrar modal y limpiar formulario
          loginModal.style.display = 'none';
          emailInput.value = '';
          passwordInput.value = '';

        } else {
          errorText.textContent = 'Token inválido tras login. Intenta de nuevo.';
          console.warn('[auth] token no válido después del login');
          localStorage.removeItem('token');
          localStorage.removeItem('usuario');
        }

      } else {
        const msg = (body && body.message) ? body.message : 'Credenciales incorrectas';
        errorText.textContent = msg;
        console.warn('[auth] login rechazado:', msg);
      }

    } catch (err) {
      console.error('[auth] error login', err);
      errorText.textContent = 'Error de conexión con el servidor';
    }
  });
});

async function verificarSesion(token) {
  if (!token) return false;
  try {
    console.log('[auth] verificarSesion: token presente, llamando /me');
    const res = await fetch(`${AUTH_API}/me`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    console.log('[auth] /me status:', res.status);
    const body = await res.json().catch(() => null);
    console.log('[auth] /me body:', body);
    return !!(res.ok && body && body.success);
  } catch (err) {
    console.error('[auth] verificarSesion error:', err);
    return false;
  }
}

function cerrarSesion() {
  localStorage.removeItem('token');
  localStorage.removeItem('usuario');
  location.reload();
}
