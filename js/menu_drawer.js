document.addEventListener('DOMContentLoaded', () => {
  const sidebar = document.getElementById('left-sidebar');
  const toggle = document.getElementById('sidebar-toggle');

  // Alternar clase expanded
  toggle.addEventListener('click', () => {
    sidebar.classList.toggle('expanded');
    sidebar.classList.toggle('collapsed');
  });


});
