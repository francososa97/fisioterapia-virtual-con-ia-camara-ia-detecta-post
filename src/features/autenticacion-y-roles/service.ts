// Servicio de autenticación con roles (paciente / fisioterapeuta).
// Sin dependencias externas: usa el módulo `crypto` de Node para hashing
// de contraseñas (scrypt) y firma de tokens de sesión (HMAC-SHA256).

import {
  randomBytes,
  randomUUID,
  scryptSync,
  timingSafeEqual,
  createHmac,
} from 'node:crypto';
import {
  AuthError,
  isRole,
  type AuthResult,
  type LoginInput,
  type PublicUser,
  type RegisterInput,
  type Role,
  type SessionPayload,
  type StoredUser,
} from './types.js';

/** Abstracción de persistencia: permite inyectar DB real o repositorio en memoria. */
export interface UserRepository {
  findByEmail(email: string): Promise<StoredUser | null>;
  create(user: StoredUser): Promise<StoredUser>;
}

/** Configuración del servicio. */
export interface AuthServiceConfig {
  /** Secreto para firmar tokens de sesión. Debe provenir de una variable de entorno. */
  readonly tokenSecret: string;
  /** Duración del token en segundos (por defecto 24h). */
  readonly tokenTtlSeconds?: number;
}

const SCRYPT_KEYLEN = 64;
const DEFAULT_TTL_SECONDS = 60 * 60 * 24;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Repositorio en memoria de referencia (útil para tests y demos). */
export class InMemoryUserRepository implements UserRepository {
  private readonly byEmail = new Map<string, StoredUser>();

  async findByEmail(email: string): Promise<StoredUser | null> {
    return this.byEmail.get(email.toLowerCase()) ?? null;
  }

  async create(user: StoredUser): Promise<StoredUser> {
    this.byEmail.set(user.email.toLowerCase(), user);
    return user;
  }
}

/** Normaliza y valida el input de registro, lanzando `AuthError` si es inválido. */
function validateRegisterInput(input: RegisterInput): RegisterInput {
  const email = input.email?.trim().toLowerCase();
  const nombre = input.nombre?.trim();

  if (!email || !EMAIL_REGEX.test(email)) {
    throw new AuthError('DATOS_INVALIDOS', 'El email no tiene un formato válido.');
  }
  if (!nombre || nombre.length < 2) {
    throw new AuthError('DATOS_INVALIDOS', 'El nombre debe tener al menos 2 caracteres.');
  }
  if (!input.password || input.password.length < 8) {
    throw new AuthError('DATOS_INVALIDOS', 'La contraseña debe tener al menos 8 caracteres.');
  }
  if (!isRole(input.role)) {
    throw new AuthError('DATOS_INVALIDOS', 'El rol debe ser "paciente" o "fisioterapeuta".');
  }
  return { email, nombre, password: input.password, role: input.role };
}

/** Deriva un hash scrypt en formato `salt:hash` (hex). */
function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const derived = scryptSync(password, salt, SCRYPT_KEYLEN);
  return `${salt.toString('hex')}:${derived.toString('hex')}`;
}

/** Verifica una contraseña contra un hash almacenado en tiempo constante. */
function verifyPassword(password: string, stored: string): boolean {
  const [saltHex, hashHex] = stored.split(':');
  if (!saltHex || !hashHex) {
    return false;
  }
  const expected = Buffer.from(hashHex, 'hex');
  const derived = scryptSync(password, Buffer.from(saltHex, 'hex'), expected.length);
  return expected.length === derived.length && timingSafeEqual(expected, derived);
}

/** Codificación base64url sin padding. */
function base64url(data: Buffer | string): string {
  return Buffer.from(data)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/** Elimina el hash de contraseña antes de exponer un usuario. */
function toPublicUser(user: StoredUser): PublicUser {
  const { passwordHash: _passwordHash, ...publicUser } = user;
  return publicUser;
}

/**
 * Servicio de autenticación. Encapsula registro, login, emisión y verificación
 * de tokens de sesión, y control de acceso basado en rol.
 */
export class AuthService {
  private readonly repo: UserRepository;
  private readonly secret: string;
  private readonly ttlSeconds: number;

  constructor(repo: UserRepository, config: AuthServiceConfig) {
    if (!config.tokenSecret) {
      throw new AuthError('DATOS_INVALIDOS', 'tokenSecret es requerido.');
    }
    this.repo = repo;
    this.secret = config.tokenSecret;
    this.ttlSeconds = config.tokenTtlSeconds ?? DEFAULT_TTL_SECONDS;
  }

  /** Registra un nuevo usuario y devuelve su vista pública + token de sesión. */
  async register(rawInput: RegisterInput): Promise<AuthResult> {
    const input = validateRegisterInput(rawInput);

    const existing = await this.repo.findByEmail(input.email);
    if (existing) {
      throw new AuthError('EMAIL_YA_REGISTRADO', 'Ya existe una cuenta con ese email.');
    }

    const now = new Date();
    const user: StoredUser = {
      id: randomUUID(),
      email: input.email,
      nombre: input.nombre,
      role: input.role,
      passwordHash: hashPassword(input.password),
      createdAt: now.toISOString(),
    };
    await this.repo.create(user);

    return { user: toPublicUser(user), token: this.issueToken(user) };
  }

  /** Autentica por email + contraseña. Mensaje genérico para evitar enumeración. */
  async login(rawInput: LoginInput): Promise<AuthResult> {
    const email = rawInput.email?.trim().toLowerCase();
    if (!email || !rawInput.password) {
      throw new AuthError('CREDENCIALES_INVALIDAS', 'Email o contraseña incorrectos.');
    }

    const user = await this.repo.findByEmail(email);
    if (!user || !verifyPassword(rawInput.password, user.passwordHash)) {
      throw new AuthError('CREDENCIALES_INVALIDAS', 'Email o contraseña incorrectos.');
    }

    return { user: toPublicUser(user), token: this.issueToken(user) };
  }

  /** Emite un token de sesión firmado (formato compacto tipo JWT, HMAC-SHA256). */
  issueToken(user: StoredUser): string {
    const iat = Math.floor(Date.now() / 1000);
    const payload: SessionPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      iat,
      exp: iat + this.ttlSeconds,
    };
    const header = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
    const body = base64url(JSON.stringify(payload));
    const signature = this.sign(`${header}.${body}`);
    return `${header}.${body}.${signature}`;
  }

  /** Verifica firma y expiración de un token y devuelve su payload. */
  verifyToken(token: string): SessionPayload {
    const parts = token.split('.');
    if (parts.length !== 3) {
      throw new AuthError('TOKEN_INVALIDO', 'Token malformado.');
    }
    const [header, body, signature] = parts;

    const expectedSig = this.sign(`${header}.${body}`);
    const a = Buffer.from(signature);
    const b = Buffer.from(expectedSig);
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      throw new AuthError('TOKEN_INVALIDO', 'Firma de token inválida.');
    }

    let payload: SessionPayload;
    try {
      const json = Buffer.from(body.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
      payload = JSON.parse(json) as SessionPayload;
    } catch {
      throw new AuthError('TOKEN_INVALIDO', 'Payload de token ilegible.');
    }

    if (!isRole(payload.role) || typeof payload.exp !== 'number') {
      throw new AuthError('TOKEN_INVALIDO', 'Payload de token inválido.');
    }
    if (Math.floor(Date.now() / 1000) >= payload.exp) {
      throw new AuthError('TOKEN_EXPIRADO', 'La sesión ha expirado.');
    }
    return payload;
  }

  /**
   * Control de acceso basado en rol. Verifica el token y valida que el rol del
   * usuario esté entre los permitidos; lanza `ACCESO_DENEGADO` en caso contrario.
   */
  authorize(token: string, allowedRoles: readonly Role[]): SessionPayload {
    const payload = this.verifyToken(token);
    if (!allowedRoles.includes(payload.role)) {
      throw new AuthError('ACCESO_DENEGADO', 'No tienes permisos para este recurso.');
    }
    return payload;
  }

  private sign(data: string): string {
    return createHmac('sha256', this.secret).update(data).digest('base64url');
  }
}
