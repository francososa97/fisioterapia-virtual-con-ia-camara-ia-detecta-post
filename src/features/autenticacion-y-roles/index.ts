// Punto de entrada público del feature de autenticación y roles.
// Reexporta la API estable para consumidores (rutas HTTP, tests, otros features).

export {
  AuthService,
  InMemoryUserRepository,
  type AuthServiceConfig,
  type UserRepository,
} from './service.js';

export {
  AuthError,
  isRole,
  ROLES,
  type AuthErrorCode,
  type AuthResult,
  type LoginInput,
  type PublicUser,
  type RegisterInput,
  type Role,
  type SessionPayload,
  type StoredUser,
} from './types.js';
