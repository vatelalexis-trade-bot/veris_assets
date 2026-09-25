// Lists every route of the running application with its access rule, from the controllers'
// metadata: the authorisation tests are generated from this list, so a new route is covered
// automatically.
import { RequestMethod, type INestApplication, type Type } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants.js';
import { ModulesContainer } from '@nestjs/core';
import type { Permission } from '@virtus/shared';
import {
  ALLOW_PENDING_MFA,
  IS_PUBLIC,
  REQUIRED_PERMISSION,
  SESSION_ONLY,
} from '../core/security/public.decorator.js';

export interface DiscoveredRoute {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  /** Full path with Express parameters, e.g. /api/v1/users/:id/roles. */
  path: string;
  permission?: Permission;
  isPublic: boolean;
  sessionOnly: boolean;
}

const UNPREFIXED = new Set(['health']);

function join(...parts: string[]): string {
  return `/${parts
    .map((part) => part.replace(/^\/+|\/+$/g, ''))
    .filter(Boolean)
    .join('/')}`;
}

export function discoverRoutes(app: INestApplication): DiscoveredRoute[] {
  const routes: DiscoveredRoute[] = [];
  for (const module of app.get(ModulesContainer).values()) {
    for (const wrapper of module.controllers.values()) {
      const controller = wrapper.metatype as Type | null;
      if (!controller) continue;
      const base = String(Reflect.getMetadata(PATH_METADATA, controller) ?? '');
      const prototype = controller.prototype as Record<string, unknown>;
      for (const name of Object.getOwnPropertyNames(prototype)) {
        const handler = prototype[name];
        if (typeof handler !== 'function' || name === 'constructor') continue;
        const path = Reflect.getMetadata(PATH_METADATA, handler) as string | undefined;
        if (path === undefined) continue;
        const read = (key: string): unknown =>
          Reflect.getMetadata(key, handler) ?? Reflect.getMetadata(key, controller);
        const method = RequestMethod[
          Reflect.getMetadata(METHOD_METADATA, handler) as number
        ] as DiscoveredRoute['method'];
        routes.push({
          method,
          path: UNPREFIXED.has(base) ? join(base, path) : join('api/v1', base, path),
          permission: read(REQUIRED_PERMISSION) as Permission | undefined,
          isPublic: read(IS_PUBLIC) === true,
          sessionOnly: read(SESSION_ONLY) === true || read(ALLOW_PENDING_MFA) === true,
        });
      }
    }
  }
  return routes;
}
