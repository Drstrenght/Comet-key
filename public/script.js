let adminToken = null;

async function api(method, path, body = null) {
  const headers = { 'Content-Type': 'application/json' };
  if (adminToken) headers['x-admin-token'] = adminToken;

  const res = await fetch(path, {
    method,
    headers,
    body: body ? JSON.stringify(body) : null
  });

  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function login() {
  const pw = document.getElementById('password').value.trim();
  const err = document.getElementById('loginError');
  err.textContent = '';

  try {
    const data = await api('POST', '/admin/login', { password: pw });
    if (data.success) {
      adminToken = data.adminToken;
      document.getElementById('loginScreen').classList.add('hidden');
      document.getElementById('dashboard').classList.remove('hidden');
    } else {
      err.textContent = data.error || 'Login failed';
    }
  } catch (e) {
    err.textContent = 'Cannot reach server – check if node server.js is running';
    console.error(e);
  }
}

async function updateScript() {
  const code = document.getElementById('scriptInput').value.trim();
  const status = document.getElementById('saveStatus');
  status.textContent = '';

  try {
    const data = await api('POST', '/admin/update-script', { script: code });
    status.textContent = data.message || 'Saved – next loads will be obfuscated';
    status.style.color = '#a5ffac';
  } catch (e) {
    status.textContent = 'Save failed';
    status.style.color = '#ff6b6b';
  }
}

async function generateKey() {
  const days = document.getElementById('days').value;
  const max = document.getElementById('maxSessions').value;
  const out = document.getElementById('keyOutput');
  out.textContent = '';

  try {
    const data = await api('POST', '/admin/generate-key', { days, maxSessions: max });
    out.textContent = data.success ? `Key: ${data.key}` : (data.error || 'Failed');
  } catch (e) {
    out.textContent = 'Error generating key';
  }
}

function logout() {
  adminToken = null;
  document.getElementById('dashboard').classList.add('hidden');
  document.getElementById('loginScreen').classList.remove('hidden');
  document.getElementById('password').value = '';
}