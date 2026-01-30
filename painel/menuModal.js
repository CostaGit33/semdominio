const MenuModal = {
  initialize() {
    const menuButton = document.getElementById('menuButton');
    const menu = document.getElementById('menu');

    if (!menuButton || !menu) return;

    /* === Abrir / Fechar menu no botão === */
    menuButton.addEventListener('click', (e) => {
      e.stopPropagation(); // impede fechar imediatamente
      menu.classList.toggle('visible');
    });

    /* === Impede clique dentro do menu de fechar === */
    menu.addEventListener('click', (e) => {
      e.stopPropagation();
    });

    /* === Fecha se clicar fora === */
    document.addEventListener('click', () => {
      menu.classList.remove('visible');
    });

    /* === Fecha com ESC (padrão app profissional) === */
    document.addEventListener('keydown', (e) => {
      if (e.key === "Escape") {
        menu.classList.remove('visible');
      }
    });
  }
};

export default MenuModal;
