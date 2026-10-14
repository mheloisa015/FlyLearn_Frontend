(function () {
  let user = null;
  try { user = JSON.parse(localStorage.getItem('flylearn_user')); } catch (e) {}
  if (!user || !user.id) { location.replace('login.html'); return; }

  document.addEventListener('click', function (e) {
    const a = e.target.closest('.sidebar-foot a');
    if (a) localStorage.removeItem('flylearn_user');
  });
})();