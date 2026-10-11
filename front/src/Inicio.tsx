import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { TarjetaReliquia } from './Catalogo';
import { pedirReliquias, type Relic } from './reliquias';

const BENEFICIOS = ['Envío gratis a todo Chile', 'Devolución dentro de 30 días', 'Cupón de bienvenida: 50 % en tu primera compra'];

export function Inicio() {
  const [nuevas, setNuevas] = useState<Relic[]>([]);

  useEffect(() => {
    let vigente = true;
    pedirReliquias('').then((r) => {
      if (vigente && r.fase === 'listo') setNuevas(r.items);
    });
    return () => {
      vigente = false;
    };
  }, []);

  return (
    <>
      <section className="relative isolate flex min-h-[78svh] items-end overflow-hidden border-b border-hueso/10 bg-tinta">
        <img src="/img/hero.png" alt="" className="absolute inset-0 -z-20 h-full w-full object-cover" />
        <div className="absolute inset-0 -z-10 bg-gradient-to-r from-vacio via-vacio/70 to-transparent" aria-hidden="true" />
        <div className="mx-auto w-full max-w-6xl px-4 pb-16 pt-32 sm:px-6">
          <p className="voz-terminal mb-5 text-sm text-ambar sm:text-base" aria-hidden="true">
            <span className="hero-linea">&gt; buscar &quot;algo que no deberías llevarte&quot;</span>
          </p>
          <h1 className="hero-titular max-w-[14ch] text-5xl sm:text-7xl">Objetos que alguien dejó de buscar</h1>
          <p className="hero-titular mt-5 max-w-[46ch] text-lg text-hueso/80">
            Antigüedades con historia, sacadas de casas de Valparaíso, Cerro Alegre y Chillán. Algunas siguen en la casa.
          </p>
          <div className="hero-titular mt-8 flex flex-wrap gap-3">
            <Link to="/catalogo" className="boton boton-primario">
              Ver el catálogo
            </Link>
          </div>
        </div>
      </section>

      <ul className="voz-terminal mx-auto flex max-w-6xl flex-wrap justify-between gap-x-8 gap-y-2 px-4 py-5 text-sm text-hueso/75 sm:px-6">
        {BENEFICIOS.map((b) => (
          <li key={b}>{b}</li>
        ))}
      </ul>

      {nuevas.length > 0 && (
        <section aria-labelledby="recien-llegadas" className="mx-auto mt-14 max-w-6xl px-4 sm:px-6">
          <div className="mb-6 flex items-baseline justify-between gap-4">
            <h2 id="recien-llegadas" className="text-3xl">
              Recién llegadas
            </h2>
            <Link to="/catalogo" className="voz-terminal text-sm text-espectro underline-offset-4 hover:underline">
              Ver todo el catálogo
            </Link>
          </div>
          <ul className="-mx-4 flex snap-x gap-4 overflow-x-auto px-4 pb-4 sm:mx-0 sm:px-0">
            {nuevas.map((r) => (
              <li key={r.id} className="w-64 shrink-0 snap-start">
                <TarjetaReliquia relic={r} />
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
