// Pantalla mínima de perfil de usuario (E1-T2)
// Épica: Autenticación y Roles
//
// Consume `sessionStore` para mostrar y editar el perfil básico y para cerrar
// sesión. Se mantiene sincronizada vía suscripción reactiva.

import { useCallback, useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { sessionStore } from './session';
import type { Sesion, UsuarioPerfil } from './session';

const ETIQUETA_ROL: Record<UsuarioPerfil['rol'], string> = {
  paciente: 'Paciente',
  fisioterapeuta: 'Fisioterapeuta',
};

/** Hook que expone la sesión vigente y se re-renderiza ante cambios. */
function useSesion(): Sesion | null {
  const [sesion, setSesion] = useState<Sesion | null>(() => sessionStore.obtener());

  useEffect(() => {
    // `suscribir` emite el estado actual de inmediato y ante cada cambio.
    return sessionStore.suscribir(setSesion);
  }, []);

  return sesion;
}

export interface PerfilScreenProps {
  /** Callback tras cerrar sesión (p. ej. redirigir a login). */
  onCerrarSesion?: () => void;
}

/**
 * Pantalla mínima de perfil: muestra datos del usuario, permite editar nombre
 * y email, y cerrar sesión. Si no hay sesión vigente, muestra un aviso.
 */
export function PerfilScreen({ onCerrarSesion }: PerfilScreenProps): JSX.Element {
  const sesion = useSesion();
  const [nombre, setNombre] = useState<string>('');
  const [email, setEmail] = useState<string>('');
  const [guardado, setGuardado] = useState<boolean>(false);

  // Sincroniza el formulario cuando cambia el usuario en sesión.
  useEffect(() => {
    setNombre(sesion?.usuario.nombre ?? '');
    setEmail(sesion?.usuario.email ?? '');
    setGuardado(false);
  }, [sesion?.usuario.nombre, sesion?.usuario.email]);

  const handleGuardar = useCallback(
    (e: FormEvent<HTMLFormElement>): void => {
      e.preventDefault();
      const actualizado = sessionStore.actualizarPerfil({
        nombre: nombre.trim(),
        email: email.trim(),
      });
      setGuardado(actualizado !== null);
    },
    [nombre, email],
  );

  const handleCerrarSesion = useCallback((): void => {
    sessionStore.limpiar();
    onCerrarSesion?.();
  }, [onCerrarSesion]);

  if (sesion === null) {
    return (
      <section aria-labelledby="perfil-titulo">
        <h1 id="perfil-titulo">Perfil</h1>
        <p>No hay una sesión activa. Iniciá sesión para ver tu perfil.</p>
      </section>
    );
  }

  const { usuario } = sesion;
  const cambiosPendientes = nombre.trim() !== usuario.nombre || email.trim() !== usuario.email;

  return (
    <section aria-labelledby="perfil-titulo">
      <h1 id="perfil-titulo">Mi perfil</h1>

      <p>
        <strong>Rol:</strong> {ETIQUETA_ROL[usuario.rol]}
      </p>

      <form onSubmit={handleGuardar}>
        <div>
          <label htmlFor="perfil-nombre">Nombre</label>
          <input
            id="perfil-nombre"
            name="nombre"
            type="text"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            required
          />
        </div>

        <div>
          <label htmlFor="perfil-email">Email</label>
          <input
            id="perfil-email"
            name="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>

        <button type="submit" disabled={!cambiosPendientes}>
          Guardar cambios
        </button>
      </form>

      {guardado && !cambiosPendientes ? <p role="status">Perfil actualizado.</p> : null}

      <button type="button" onClick={handleCerrarSesion}>
        Cerrar sesión
      </button>
    </section>
  );
}
