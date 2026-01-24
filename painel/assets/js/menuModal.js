const MenuModal = {
  initialize: function() {
    const menuButton = document.getElementById('menuButton');
    const menu = document.getElementById('menu');

    if (menuButton && menu) {
      menuButton.addEventListener('click', () => {
        menu.classList.toggle('visible');
      });

      // Fechar o menu se clicar fora dele
      document.addEventListener('click', (event) => {
        if (!menu.contains(event.target) && !menuButton.contains(event.target)) {
          menu.classList.remove('visible');
        }
      });
    }
  }
};

export default MenuModal;

