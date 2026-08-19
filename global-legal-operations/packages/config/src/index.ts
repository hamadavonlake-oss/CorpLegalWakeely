import { z } from 'zod';

// ─── Environment Validation ───
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),

  // Database
  DATABASE_URL: z.string().url(),

  // Redis
  REDIS_URL: z.string().default('redis://redis:6379'),

  // Storage
  S3_ENDPOINT: z.string().url(),
  S3_BUCKET: z.string().default('legalops'),
  S3_ACCESS_KEY: z.string().min(1),
  S3_SECRET_KEY: z.string().min(1),
  S3_REGION: z.string().default('us-east-1'),
  S3_FORCE_PATH_STYLE: z
    .string()
    .default('true')
    .transform((v) => v === 'true'),

  // JWT
  JWT_ACCESS_TTL: z.string().default('15m'),
  JWT_REFRESH_TTL: z.string().default('30d'),
  JWT_PRIVATE_KEY_PATH: z.string().optional(),
  JWT_PUBLIC_KEY_PATH: z.string().optional(),

  // MFA
  MFA_ISSUER: z.string().default('GlobalLegalOperations'),

  // Gotenberg
  GOTENBERG_URL: z.string().url().default('http://gotenberg:3000'),

  // App
  APP_BASE_URL: z.string().url().default('http://localhost:3000'),
  API_BASE_URL: z.string().url().default('http://localhost:3001'),
  PORT: z.coerce.number().default(3001),

  // Defaults
  DEFAULT_LOCALE: z.string().default('ar-JO'),
  DEFAULT_TIMEZONE: z.string().default('Asia/Amman'),
  DEFAULT_CURRENCY: z.string().default('JOD'),

  // Upload
  MAX_UPLOAD_BYTES: z.coerce.number().default(104857600),

  // SSE
  SSE_ENABLED: z
    .string()
    .default('true')
    .transform((v) => v === 'true'),
});

export type EnvConfig = z.infer<typeof envSchema>;

export function validateEnv(config: Record<string, unknown>): EnvConfig {
  return envSchema.parse(config);
}

export { envSchema };
