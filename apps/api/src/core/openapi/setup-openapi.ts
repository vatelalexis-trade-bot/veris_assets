import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule, type OpenAPIObject } from '@nestjs/swagger';
import { PRODUCT_NAME } from '@virtus/shared';

export const OPENAPI_PATH = 'api/v1/docs';

export function buildOpenApiDocument(app: INestApplication): OpenAPIObject {
  const config = new DocumentBuilder()
    .setTitle(`${PRODUCT_NAME} API`)
    .setDescription('Demonstration environment — fictitious data.')
    .setVersion('1')
    .build();
  return SwaggerModule.createDocument(app, config);
}

/** Serves the generated OpenAPI documentation on /api/v1/docs (development only, docs/API.md). */
export function setupOpenApi(app: INestApplication): void {
  SwaggerModule.setup(OPENAPI_PATH, app, buildOpenApiDocument(app), {
    jsonDocumentUrl: `${OPENAPI_PATH}/json`,
  });
}
