import { Controller, Get, HttpStatus, Inject, Logger, Res } from '@nestjs/common';
import { ApiOkResponse, ApiServiceUnavailableResponse, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { z } from 'zod';
import { toOpenApiSchema } from '../openapi/zod-openapi.js';
import {
  READINESS_CHECKS,
  runReadinessChecks,
  type ReadinessCheck,
  type ReadinessReport,
} from './readiness-check.js';

const livenessSchema = z.object({ status: z.literal('ok') });
const readinessSchema = z.object({
  status: z.enum(['ok', 'unavailable']),
  checks: z.record(z.string(), z.enum(['up', 'down'])),
});

/** Health probes, outside the /api/v1 prefix (docs/API.md §2.1). */
@ApiTags('health')
@Controller('health')
export class HealthController {
  private readonly logger = new Logger(HealthController.name);

  constructor(@Inject(READINESS_CHECKS) private readonly checks: readonly ReadinessCheck[]) {}

  @Get()
  @ApiOkResponse({
    description: 'The API process is running.',
    schema: toOpenApiSchema(livenessSchema),
  })
  liveness(): z.infer<typeof livenessSchema> {
    return { status: 'ok' };
  }

  @Get('ready')
  @ApiOkResponse({
    description: 'All dependencies answer.',
    schema: toOpenApiSchema(readinessSchema),
  })
  @ApiServiceUnavailableResponse({
    description: 'At least one dependency does not answer.',
    schema: toOpenApiSchema(readinessSchema),
  })
  async readiness(@Res({ passthrough: true }) res: Response): Promise<ReadinessReport> {
    const report = await runReadinessChecks(this.checks, undefined, (name, error) =>
      this.logger.warn({ check: name, err: error }, `Readiness check "${name}" failed`),
    );
    res.status(report.status === 'ok' ? HttpStatus.OK : HttpStatus.SERVICE_UNAVAILABLE);
    return report;
  }
}
