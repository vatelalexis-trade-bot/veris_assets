import { Global, Module } from '@nestjs/common';
import { ENV, type Env } from '../config/env.js';
import { DOCUMENT_STORAGE, S3DocumentStorage } from '../providers/document-storage.js';
import { FakeFileScanner, FILE_SCANNER } from '../providers/file-scanner.js';
import { FakeKycProvider, KYC_PROVIDER } from '../providers/kyc-provider.js';
import { DocumentsController } from './documents.controller.js';
import { DocumentsService } from './documents.service.js';
import { UploadInterceptor } from './upload.interceptor.js';

/**
 * Documents and the external providers (docs/ARCHITECTURE.md §4.10, §4.11). The providers are the
 * fictitious ones of the MVP, chosen by the PROVIDER_<NAME>_MODE settings.
 */
@Global()
@Module({
  providers: [
    {
      provide: DOCUMENT_STORAGE,
      inject: [ENV],
      useFactory: (env: Env) => new S3DocumentStorage(env),
    },
    {
      provide: FILE_SCANNER,
      inject: [ENV],
      useFactory: (env: Env) => new FakeFileScanner(env.PROVIDER_FILE_SCANNER_MODE),
    },
    {
      provide: KYC_PROVIDER,
      inject: [ENV],
      useFactory: (env: Env) => new FakeKycProvider(env.PROVIDER_KYC_MODE),
    },
    DocumentsService,
    UploadInterceptor,
  ],
  controllers: [DocumentsController],
  exports: [DocumentsService, KYC_PROVIDER],
})
export class DocumentsModule {}
