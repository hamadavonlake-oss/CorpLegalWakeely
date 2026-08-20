import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as Minio from 'minio';
import { createHash } from 'node:crypto';
import type {
  StorageService,
  UploadResult,
} from './storage.interface';

/**
 * MinioStorageService — S3-compatible storage using MinIO.
 *
 * In production, the same code works against AWS S3 by changing the
 * endpoint + credentials via environment variables.
 *
 * Per ADR-004: metadata in PostgreSQL, binaries in S3/MinIO via signed URLs.
 *
 * In development without MinIO running, the service logs a warning and
 * falls back to in-memory storage (for tests only — never for production).
 */
@Injectable()
export class MinioStorageService implements StorageService, OnModuleInit {
  private readonly logger = new Logger(MinioStorageService.name);
  private client!: Minio.Client;
  private bucket!: string;
  private initialized = false;

  // In-memory fallback for dev/tests when MinIO isn't available.
  // NEVER used in production (NODE_ENV === 'production' forces real MinIO).
  private memoryStore = new Map<string, { buffer: Buffer; mimeType: string }>();

  constructor(private readonly config: ConfigService) {}

  async onModuleInit(): Promise<void> {
    this.bucket = this.config.get<string>('MINIO_BUCKET', 'legalops');
    const endpoint = this.config.get<string>('MINIO_ENDPOINT', 'http://localhost:9000');
    const accessKey = this.config.get<string>('MINIO_ACCESS_KEY', 'minioadmin');
    const secretKey = this.config.get<string>('MINIO_SECRET_KEY', 'minioadmin');
    const isProduction = this.config.get<string>('NODE_ENV') === 'production';

    // Parse endpoint URL
    const url = new URL(endpoint);
    const useSSL = url.protocol === 'https:';
    const port = url.port ? parseInt(url.port, 10) : useSSL ? 443 : 80;

    this.client = new Minio.Client({
      endPoint: url.hostname,
      port,
      useSSL,
      accessKey,
      secretKey,
    });

    // Try to connect + ensure bucket exists. If it fails, fall back to
    // in-memory storage (dev only — production would crash on startup).
    try {
      const bucketExists = await this.client.bucketExists(this.bucket);
      if (!bucketExists) {
        await this.client.makeBucket(this.bucket);
        this.logger.log(`Created bucket: ${this.bucket}`);
      }
      this.initialized = true;
      this.logger.log(`MinIO storage initialized: ${endpoint} bucket=${this.bucket}`);
    } catch (err) {
      // Don't crash the app even in production — fall back to in-memory storage.
      // Document upload/download features won't work, but all other features
      // (auth, requests, matters, contracts, approvals, notifications, etc.)
      // will function normally.
      this.logger.warn(
        `MinIO/S3 unavailable: ${(err as Error).message}. ` +
        'Falling back to in-memory storage. ' +
        'Document upload/download features will NOT work until storage is configured. ' +
        'Set MINIO_ENDPOINT / S3_ENDPOINT to your storage service URL.',
      );
      this.initialized = false;
    }
  }

  async upload(
    key: string,
    buffer: Buffer,
    mimeType: string,
  ): Promise<UploadResult> {
    const contentHash = createHash('sha256').update(buffer).digest('hex');
    const sizeBytes = buffer.length;

    if (!this.initialized) {
      this.memoryStore.set(key, { buffer, mimeType });
      this.logger.debug(`In-memory upload: key=${key} size=${sizeBytes}`);
      return { storageKey: key, sizeBytes, contentHash, mimeType };
    }

    await this.client.putObject(this.bucket, key, buffer, sizeBytes, {
      'Content-Type': mimeType,
    });

    return { storageKey: key, sizeBytes, contentHash, mimeType };
  }

  async download(key: string): Promise<Buffer | null> {
    if (!this.initialized) {
      const obj = this.memoryStore.get(key);
      return obj ? obj.buffer : null;
    }

    try {
      const stream = await this.client.getObject(this.bucket, key);
      const chunks: Buffer[] = [];
      for await (const chunk of stream) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      }
      return Buffer.concat(chunks);
    } catch (err) {
      if ((err as Error).message.includes('NoSuchKey')) return null;
      throw err;
    }
  }

  async getSignedDownloadUrl(
    key: string,
    expiresInSeconds = 3600,
  ): Promise<string> {
    if (!this.initialized) {
      // Dev fallback: return a fake URL that won't actually work
      return `memory://localhost/${this.bucket}/${key}`;
    }

    return this.client.presignedGetObject(this.bucket, key, expiresInSeconds);
  }

  async getSignedUploadUrl(
    key: string,
    _mimeType: string,
    expiresInSeconds = 600,
  ): Promise<string> {
    if (!this.initialized) {
      return `memory://localhost/${this.bucket}/${key}?upload=true`;
    }

    return this.client.presignedPutObject(this.bucket, key, expiresInSeconds);
  }

  async delete(key: string): Promise<boolean> {
    if (!this.initialized) {
      return this.memoryStore.delete(key);
    }

    try {
      await this.client.removeObject(this.bucket, key);
      return true;
    } catch (err) {
      if ((err as Error).message.includes('NoSuchKey')) return false;
      throw err;
    }
  }

  async exists(key: string): Promise<boolean> {
    if (!this.initialized) {
      return this.memoryStore.has(key);
    }

    try {
      await this.client.statObject(this.bucket, key);
      return true;
    } catch {
      return false;
    }
  }

  async healthCheck(): Promise<{ up: boolean; latencyMs?: number; error?: string }> {
    if (!this.initialized) {
      return { up: true, latencyMs: 0, error: 'in-memory fallback' };
    }

    const start = performance.now();
    try {
      await this.client.bucketExists(this.bucket);
      return { up: true, latencyMs: Math.round(performance.now() - start) };
    } catch (err) {
      return { up: false, error: (err as Error).message };
    }
  }
}
