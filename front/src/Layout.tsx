import { Link, NavLink, Outlet } from 'react-router';
import { Banner } from './Banner';
import { useSesion } from './sesion';

const enlaceNav = ({ isActive }: { isActive: boolean }) =>
  `voz-terminal text-sm hover:text-espectro ${isActive ? 'text-ambar' : 'text-hueso/80'}`;

export function Layout() {
  const { usuario, salir } = useSesion();
  return (
    <>
      <Banner />
      <header className="border-b border-hueso/10">
        <nav
          aria-label="Principal"
          className="mx-auto flex max-w-6xl flex-wrap items-baseline justify-between gap-x-8 gap-y-2 px-4 py-4 sm:px-6"
        >
          <Link to="/" className="font-serif text-2xl font-extrabold tracking-tight text-hueso">
            Trasto<span className="text-ambar">Maldito</span>
          </Link>
          <div className="flex items-baseline gap-6">
            <NavLink to="/catalogo" className={enlaceNav}>
              &gt; catálogo
            </NavLink>
            {usuario ? (
              <>
                <NavLink to="/carrito" className={enlaceNav}>
                  &gt; carrito
                </NavLink>
                <NavLink to="/pedidos" className={enlaceNav}>
                  &gt; pedidos
                </NavLink>
                <NavLink to="/perfil" className={enlaceNav}>
                  &gt; perfil
                </NavLink>
                {usuario.role === 'admin' && (
                  <NavLink to="/admin" className={enlaceNav}>
                    &gt; admin
                  </NavLink>
                )}
                <button type="button" onClick={salir} className="voz-terminal text-sm text-hueso/80 hover:text-sangre">
                  Salir
                </button>
              </>
            ) : (
              <NavLink to="/entrar" className={enlaceNav}>
                &gt; entrar
              </NavLink>
            )}
          </div>
        </nav>
      </header>
      <main>
        <Outlet />
      </main>
      <footer className="mt-24 border-t border-hueso/10">
        <p className="voz-terminal mx-auto max-w-6xl px-4 py-8 text-xs text-hueso/60 sm:px-6">
          Tienda ficticia de práctica para ethical hacking. Datos, personas y pagos son inventados. Corre solo en tu equipo (127.0.0.1).
        </p>
      </footer>
    </>
  );
}
