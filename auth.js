

function getUser() {
  try { return JSON.parse(localStorage.getItem('ef_user')); } 
  catch { return null; }
}

function isAdmin() {
  const u = getUser();
  return u && u.role === 'admin';
}

function isLoggedIn() {
  return !!getUser();
}

async function logout() {
  try {
    await fetch('backend/auth.php?action=logout', { method: 'POST' });
  } catch {}
  localStorage.removeItem('ef_user');
  window.location.href = 'login.html';
}

async function checkSession() {
  try {
    const res  = await fetch('backend/auth.php?action=me');
    const data = await res.json();
    if (!data.logged_in) localStorage.removeItem('ef_user');
    return data.logged_in;
  } catch {
    return false;
  }
}
