import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { PRODUCT_NAME } from '@virtus/shared';

export const OPENAPI_PATH = 'api/v1/docs';

/** Serves the generated OpenAPI documentation on /api/v1/docs (development only, docs/API.md). */
export function setupOpenApi(app: INestApplication): void {
  const config = new DocumentBuilder()
    .setTitle(`${PRODUCT_NAME} API`)
    .setDescription('Demonstration environment — fictitious data.')
    .setVersion('1')
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup(OPENAPI_PATH, app, document, { jsonDocumentUrl: `${OPENAPI_PATH}/json` });
}
