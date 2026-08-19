import { Module, Global } from '@nestjs/common';
import { MinioStorageService } from './minio-storage.service';
import { STORAGE_SERVICE } from './storage.interface';

/**
 * StorageModule — global module providing a StorageService implementation.
 *
 * Exposed as @Global() so any module can inject StorageService without
 * explicitly importing StorageModule.
 */
@Global()
@Module({
  providers: [
    {
      provide: STORAGE_SERVICE,
      useClass: MinioStorageService,
    },
    MinioStorageService,
  ],
  exports: [STORAGE_SERVICE],
})
export class StorageModule {}
