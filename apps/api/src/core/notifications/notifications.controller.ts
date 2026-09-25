import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiBody, ApiOkResponse, ApiQuery, ApiTags } from '@nestjs/swagger';
import {
  NOTIFICATION_CATEGORIES,
  NOTIFICATION_TYPE_CODES,
  type NotificationType,
} from '@virtus/shared';
import { z } from 'zod';
import { currentUser } from '../context/request-context.js';
import { ApiPageQuery, pageSchema, paginationQuery } from '../http/pagination.js';
import { toOpenApiSchema } from '../openapi/zod-openapi.js';
import { RequirePermission } from '../security/public.decorator.js';
import { ZodValidationPipe } from '../validation/zod-validation.pipe.js';
import { NotificationService, type NotificationRow } from './notification.service.js';

const category = z.enum(NOTIFICATION_CATEGORIES);

const notificationView = z.object({
  id: z.uuid(),
  category,
  /** Notification type of the catalogue of @virtus/shared, which holds its texts. */
  type: z.enum(NOTIFICATION_TYPE_CODES as [NotificationType, ...NotificationType[]]),
  params: z.record(z.string(), z.string()),
  resourceType: z.string().nullable(),
  resourceId: z.uuid().nullable(),
  readAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
});

const listQuery = paginationQuery.extend({
  unreadOnly: z
    .enum(['true', 'false'])
    .optional()
    .transform((value) => value === 'true'),
});

const unreadCount = z.object({ count: z.int() });

const preference = z.object({
  category,
  inApp: z.boolean(),
  email: z.boolean(),
  mandatory: z.boolean(),
});

const preferencesBody = z.strictObject({
  preferences: z
    .array(z.strictObject({ category, inApp: z.boolean(), email: z.boolean() }))
    .min(1)
    .max(NOTIFICATION_CATEGORIES.length),
});

const id = new ZodValidationPipe(z.uuid());

function toView(row: NotificationRow): z.infer<typeof notificationView> {
  return {
    id: row.id,
    category: row.category as z.infer<typeof category>,
    type: row.titleKey as NotificationType,
    params: row.params as Record<string, string>,
    resourceType: row.resourceType,
    resourceId: row.resourceId,
    readAt: row.readAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

/** Notifications of the signed-in user (docs/API.md §2.12). */
@ApiTags('notifications')
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationService) {}

  @Get()
  @RequirePermission('notification:read')
  @ApiPageQuery()
  @ApiQuery({ name: 'unreadOnly', required: false, schema: { type: 'boolean' } })
  @ApiOkResponse({ schema: toOpenApiSchema(pageSchema(notificationView)) })
  async list(@Query(new ZodValidationPipe(listQuery)) query: z.infer<typeof listQuery>) {
    const page = await this.notifications.list(currentUser(), query);
    return { data: page.data.map(toView), meta: page.meta };
  }

  @Get('unread-count')
  @RequirePermission('notification:read')
  @ApiOkResponse({ schema: toOpenApiSchema(unreadCount) })
  async unreadCount(): Promise<z.infer<typeof unreadCount>> {
    return { count: await this.notifications.unreadCount(currentUser()) };
  }

  @Post('read-all')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission('notification:read')
  async markAllRead(): Promise<void> {
    await this.notifications.markAllRead(currentUser());
  }

  @Get('preferences')
  @RequirePermission('notification:read')
  @ApiOkResponse({ schema: toOpenApiSchema(z.array(preference)) })
  async preferences(): Promise<z.infer<typeof preference>[]> {
    return this.notifications.preferences(currentUser());
  }

  @Put('preferences')
  @RequirePermission('notification:read')
  @ApiBody({ schema: toOpenApiSchema(preferencesBody) })
  @ApiOkResponse({ schema: toOpenApiSchema(z.array(preference)) })
  async updatePreferences(
    @Body(new ZodValidationPipe(preferencesBody)) body: z.infer<typeof preferencesBody>,
  ): Promise<z.infer<typeof preference>[]> {
    return this.notifications.updatePreferences(currentUser(), body.preferences);
  }

  // Declared after the fixed paths so that "read-all" or "preferences" is never read as an id.
  @Post(':id/read')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission('notification:read')
  async markRead(@Param('id', id) notificationId: string): Promise<void> {
    await this.notifications.markRead(currentUser(), notificationId);
  }
}
