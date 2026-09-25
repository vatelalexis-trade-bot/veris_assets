import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Put,
} from '@nestjs/common';
import { ApiBody, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { ROLE_PERMISSIONS } from '@virtus/shared';
import { z } from 'zod';
import { toOpenApiSchema } from '../../../core/openapi/zod-openapi.js';
import { Idempotent } from '../../../core/idempotency/idempotent.decorator.js';
import { RequirePermission } from '../../../core/security/public.decorator.js';
import { ZodValidationPipe } from '../../../core/validation/zod-validation.pipe.js';
import { ROLE_CODES, type RoleCode } from '../domain/roles.js';
import { UserManagementService } from '../application/user-management.service.js';
import {
  idParam,
  invitationCreated,
  invitationView,
  roleView,
  rolesBody,
  staffInvitationBody,
  userUpdateBody,
  userView,
} from './management.dto.js';
import { toUserView } from './views.js';

const id = new ZodValidationPipe(idParam);
type UserView = z.infer<typeof userView>;

/** Users of the signed-in administrator's organisation (docs/API.md §2.4). */
@ApiTags('users')
@Controller('users')
export class UsersController {
  constructor(private readonly users: UserManagementService) {}

  // Declared before ':id' so that "invitations" is never read as a user identifier.
  @Get('invitations')
  @RequirePermission('user:read')
  @ApiOkResponse({ schema: toOpenApiSchema(z.array(invitationView)) })
  async invitations(): Promise<z.infer<typeof invitationView>[]> {
    const rows = await this.users.pendingInvitations();
    return rows.map((row) => ({
      ...row,
      roleCode: row.roleCode as RoleCode,
      expiresAt: row.expiresAt.toISOString(),
      createdAt: row.createdAt.toISOString(),
    }));
  }

  @Post('invitations')
  @Idempotent()
  @RequirePermission('user:manage')
  @ApiBody({ schema: toOpenApiSchema(staffInvitationBody) })
  @ApiOkResponse({ schema: toOpenApiSchema(invitationCreated) })
  async invite(
    @Body(new ZodValidationPipe(staffInvitationBody)) body: z.infer<typeof staffInvitationBody>,
  ): Promise<z.infer<typeof invitationCreated>> {
    const created = await this.users.invite(body);
    return { id: created.id, expiresAt: created.expiresAt.toISOString() };
  }

  @Get()
  @RequirePermission('user:read')
  @ApiOkResponse({ schema: toOpenApiSchema(z.array(userView)) })
  async list(): Promise<UserView[]> {
    return (await this.users.list()).map(toUserView);
  }

  @Get(':id')
  @RequirePermission('user:read')
  @ApiOkResponse({ schema: toOpenApiSchema(userView) })
  async get(@Param('id', id) userId: string): Promise<UserView> {
    return toUserView(await this.users.get(userId));
  }

  @Patch(':id')
  @RequirePermission('user:manage')
  @ApiBody({ schema: toOpenApiSchema(userUpdateBody) })
  @ApiOkResponse({ schema: toOpenApiSchema(userView) })
  async update(
    @Param('id', id) userId: string,
    @Body(new ZodValidationPipe(userUpdateBody)) body: z.infer<typeof userUpdateBody>,
  ): Promise<UserView> {
    return toUserView(await this.users.update(userId, body));
  }

  @Post(':id/deactivate')
  @Idempotent()
  @HttpCode(HttpStatus.OK)
  @RequirePermission('user:manage')
  @ApiOkResponse({ schema: toOpenApiSchema(userView) })
  async deactivate(@Param('id', id) userId: string): Promise<UserView> {
    return toUserView(await this.users.setStatus(userId, 'INACTIVE'));
  }

  @Post(':id/reactivate')
  @Idempotent()
  @HttpCode(HttpStatus.OK)
  @RequirePermission('user:manage')
  @ApiOkResponse({ schema: toOpenApiSchema(userView) })
  async reactivate(@Param('id', id) userId: string): Promise<UserView> {
    return toUserView(await this.users.setStatus(userId, 'ACTIVE'));
  }

  @Put(':id/roles')
  @Idempotent()
  @RequirePermission('role:assign')
  @ApiBody({ schema: toOpenApiSchema(rolesBody) })
  @ApiOkResponse({ schema: toOpenApiSchema(userView) })
  async setRoles(
    @Param('id', id) userId: string,
    @Body(new ZodValidationPipe(rolesBody)) body: z.infer<typeof rolesBody>,
  ): Promise<UserView> {
    return toUserView(await this.users.setRoles(userId, body.roles));
  }
}

/** Roles and their permissions, from the single matrix (SPEC §4.7). */
@ApiTags('users')
@Controller('roles')
export class RolesController {
  @Get()
  @RequirePermission('user:read')
  @ApiOkResponse({ schema: toOpenApiSchema(z.array(roleView)) })
  list(): z.infer<typeof roleView>[] {
    return ROLE_CODES.map((code) => ({
      code,
      permissions: Object.entries(ROLE_PERMISSIONS[code]).map(([permission, scope]) => ({
        code: permission,
        scope,
      })),
    }));
  }
}
