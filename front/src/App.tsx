import { Route, Routes } from 'react-router';
import { Admin } from './Admin';
import { Carrito } from './Carrito';
import { Catalogo, FichaReliquia } from './Catalogo';
import { Entrar } from './Entrar';
import { Inicio } from './Inicio';
import { Layout } from './Layout';
import { DetallePedido, ListaPedidos } from './Pedidos';
import { Pago } from './Pago';
import { Perfil } from './Perfil';
import { Registro } from './Registro';
import { ProveedorSesion, RutaProtegida } from './sesion';

function NoEncontrada() {
  return <h1 className="mx-auto max-w-6xl px-4 pt-12 text-4xl sm:px-6">Página no encontrada</h1>;
}

export function App() {
  return (
    <ProveedorSesion>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Inicio />} />
          <Route path="catalogo" element={<Catalogo />} />
          <Route path="catalogo/:id" element={<FichaReliquia />} />
          <Route path="entrar" element={<Entrar />} />
          <Route path="registro" element={<Registro />} />
          <Route path="carrito" element={<RutaProtegida><Carrito /></RutaProtegida>} />
          <Route path="pago" element={<RutaProtegida><Pago /></RutaProtegida>} />
          <Route path="pedidos" element={<RutaProtegida><ListaPedidos /></RutaProtegida>} />
          <Route path="pedidos/:id" element={<RutaProtegida><DetallePedido /></RutaProtegida>} />
          <Route path="perfil" element={<RutaProtegida><Perfil /></RutaProtegida>} />
          <Route path="admin" element={<RutaProtegida><Admin /></RutaProtegida>} />
          <Route path="*" element={<NoEncontrada />} />
        </Route>
      </Routes>
    </ProveedorSesion>
  );
}
