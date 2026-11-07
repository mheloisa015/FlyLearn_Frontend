(function () {
  let user = null;
  try { user = JSON.parse(localStorage.getItem('flylearn_user')); } catch (e) {}
  if (!user || !user.id) { location.replace('login.html'); return; }

  document.addEventListener('click', function (e) {
    const a = e.target.closest('.sidebar-foot a');
    if (a) {
      const apiBase = ['localhost', '127.0.0.1'].includes(location.hostname)
        ? 'https://flylearn.onrender.com'
        : '/api';
      fetch(apiBase + '/logout/', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        keepalive: true
      }).catch(() => {});
      localStorage.removeItem('flylearn_user');
    }
  });
})();