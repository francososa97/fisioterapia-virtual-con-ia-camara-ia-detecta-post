// Tipos de dominio para autenticación y control de acceso basado en roles.
// TypeScript strict: sin `any`, todos los tipos explícitos.

/** Roles disponibles en la plataforma de fisioterapia virtual. */
export type Role = 'paciente' | 'fisioterapeuta';

/** Lista inmutable de roles válidos, útil para validación en runtime. */
export const ROLES: readonly Role[] = ['paciente', 'fisioterapeuta'] as const;

/** Type guard que valida si un string arbitrario es un `Role` conocido. */
export function isRole(value: unknown): value is Role {
  return typeof value === 'string' && (ROLES as readonly string[]).includes(value);
}

/** Usuario tal como se persiste (incluye el hash de contraseña, nunca el plano). */
export interface StoredUser {
  readonly id: string;
  readonly email: string;
  readonly nombre: string;
  readonly role: Role;
  /** Hash derivado con scrypt en formato `salt:hash` (hex). */
  readonly passwordHash: string;
  readonly createdAt: string;
}

/** Vista pública de un usuario: nunca expone el hash de contraseña. */
export type PublicUser = Omit<StoredUser, 'passwordHash'>;

/** Payload de registro recibido desde la capa de transporte. */
export interface RegisterInput {
  readonly email: string;
  readonly nombre: string;
  readonly password: string;
  readonly role: Role;
}

/** Payload de inicio de sesión. */
export interface LoginInput {
  readonly email: string;
  readonly password: string;
}

/** Contenido decodificado de un token de sesión emitido tras el login. */
export interface SessionPayload {
  readonly sub: string;
  readonly email: string;
  readonly role: Role;
  /** Emitido en (epoch segundos). */
  readonly iat: number;
  /** Expira en (epoch segundos). */
  readonly exp: number;
}

/** Resultado de una autenticación exitosa. */
export interface AuthResult {
  readonly user: PublicUser;
  readonly token: string;
}

/** Códigos de error de dominio para diferenciar fallos sin leaks de información. */
export type AuthErrorCode =
  | 'EMAIL_YA_REGISTRADO'
  | 'CREDENCIALES_INVALIDAS'
  | 'DATOS_INVALIDOS'
  | 'TOKEN_INVALIDO'
  | 'TOKEN_EXPIRADO'
  | 'ACCESO_DENEGADO';

/** Error tipado de la capa de autenticación. */
export class AuthError extends Error {
  public readonly code: AuthErrorCode;

  constructor(code: AuthErrorCode, message: string) {
    super(message);
    this.name = 'AuthError';
    this.code = code;
    // Mantiene la cadena de prototipos correcta al compilar a ES5/ES2015.
    Object.setPrototypeOf(this, AuthError.prototype);
  }
}
