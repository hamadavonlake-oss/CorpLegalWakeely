/**
 * Storage abstraction — interface for binary file storage (S3/MinIO).
 *
 * Per ADR-004: metadata in PostgreSQL, binaries in S3/MinIO, signed URLs
 * for download. The interface allows swapping MinIO for AWS S3 in
 * production without changing consumers.
 *
 * Per Rule 16: never send sensitive documents to external services by
 * default. The storage backend is always tenant-owned infrastructure
 * (MinIO on-prem or customer's own S3 bucket).
 */

export interface UploadResult {
  storageKey: string;
  sizeBytes: number;
  contentHash: string;
  mimeType: string;
}

export interface StorageObject {
  storageKey: string;
  sizeBytes: number;
  contentHash: string;
  mimeType: string;
}

export interface StorageService {
  /**
   * Upload a binary file to the storage backend.
   *
   * @param key The S3 object key (e.g., "documents/<orgId>/<docId>/v1.docx")
   * @param buffer The binary content
   * @param mimeType The MIME type
   * @returns Upload result with size, hash, and key
   */
  upload(
    key: string,
    buffer: Buffer,
    mimeType: string,
  ): Promise<UploadResult>;

  /**
   * Download a binary file from the storage backend.
   *
   * @param key The S3 object key
   * @returns The binary content as a Buffer, or null if not found
   */
  download(key: string): Promise<Buffer | null>;

  /**
   * Generate a pre-signed URL for downloading a file.
   * The URL expires after `expiresInSeconds` seconds (default: 1 hour).
   *
   * @param key The S3 object key
   * @param expiresInSeconds URL TTL in seconds (max 7 days for S3)
   * @returns A signed URL string
   */
  getSignedDownloadUrl(
    key: string,
    expiresInSeconds?: number,
  ): Promise<string>;

  /**
   * Generate a pre-signed URL for uploading a file directly from the client.
   * Useful for large files that shouldn't be buffered through the API.
   *
   * @param key The S3 object key
   * @param mimeType The expected MIME type
   * @param expiresInSeconds URL TTL in seconds
   * @returns A signed URL string for HTTP PUT
   */
  getSignedUploadUrl(
    key: string,
    mimeType: string,
    expiresInSeconds?: number,
  ): Promise<string>;

  /**
   * Delete a binary file from storage.
   * NOTE: This should only be called for documents NOT under Legal Hold
   * (Rule 10) and whose retention period has elapsed.
   *
   * @param key The S3 object key
   * @returns true if deleted, false if not found
   */
  delete(key: string): Promise<boolean>;

  /**
   * Check if a storage object exists.
   *
   * @param key The S3 object key
   * @returns true if the object exists
   */
  exists(key: string): Promise<boolean>;

  /**
   * Storage backend health check.
   */
  healthCheck(): Promise<{ up: boolean; latencyMs?: number; error?: string }>;
}

/**
 * Token for dependency injection.
 */
export const STORAGE_SERVICE = Symbol('STORAGE_SERVICE');
