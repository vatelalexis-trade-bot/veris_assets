import { Controller, Get, Inject } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { asc } from 'drizzle-orm';
import { z } from 'zod';
import { DATABASE, type Database } from '../database/database.js';
import { country, currency } from '../database/schema.js';
import { toOpenApiSchema } from '../openapi/zod-openapi.js';
import { SessionOnly } from '../security/public.decorator.js';

const countryView = z.object({ code: z.string(), nameEn: z.string(), nameFr: z.string() });
const currencyView = z.object({ code: z.string(), minorUnits: z.int() });

/** Global reference data used by forms (countries, currencies), read-only. */
@ApiTags('reference')
@Controller('reference')
export class ReferenceController {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  @Get('countries')
  @SessionOnly()
  @ApiOkResponse({ schema: toOpenApiSchema(z.array(countryView)) })
  countries(): Promise<z.infer<typeof countryView>[]> {
    return this.db.select().from(country).orderBy(asc(country.nameEn));
  }

  @Get('currencies')
  @SessionOnly()
  @ApiOkResponse({ schema: toOpenApiSchema(z.array(currencyView)) })
  currencies(): Promise<z.infer<typeof currencyView>[]> {
    return this.db.select().from(currency).orderBy(asc(currency.code));
  }
}
