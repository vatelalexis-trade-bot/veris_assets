import { Injectable } from '@nestjs/common';
import { checkTransition, type StateMachine } from '@veris/shared';
import { getRequestContext } from '../context/request-context.js';
import type { Transaction } from '../database/database.js';
import { workflowTransition } from '../database/schema.js';
import { AppError } from '../errors/app-error.js';

export interface TransitionInput<S extends string> {
  tenantId: string;
  resourceId: string;
  from: S;
  to: S;
  comment?: string | null;
  /** User who initiated the resource, for the four-eyes rule. */
  initiatorUserId?: string | null;
}

/**
 * Applies the state machines (SPEC §7): checks a transition for the signed-in user (or the
 * system, in a job) and records it in `core.workflow_transition`, in the business transaction.
 * Refusals are errors with the code of the refusal (INVALID_STATE_TRANSITION, COMMENT_REQUIRED…).
 */
@Injectable()
export class Workflow {
  async transition<S extends string>(
    tx: Transaction,
    machine: StateMachine<S>,
    input: TransitionInput<S>,
  ): Promise<void> {
    const context = getRequestContext();
    const user = context?.user;
    const refusal = checkTransition(machine, {
      from: input.from,
      to: input.to,
      actor: user
        ? { userId: user.userId, permissions: user.permissions }
        : { userId: null, permissions: new Set() },
      comment: input.comment,
      initiatorUserId: input.initiatorUserId,
    });
    if (refusal) throw new AppError(refusal);
    await tx.insert(workflowTransition).values({
      tenantId: input.tenantId,
      resourceType: machine.resourceType,
      resourceId: input.resourceId,
      fromStatus: input.from,
      toStatus: input.to,
      actorUserId: user?.userId ?? null,
      actorRole: user ? user.roles.join(',') || null : null,
      comment: input.comment?.trim() || null,
      correlationId: context?.correlationId ?? null,
    });
  }

  /** Records the first status of a new resource (no check: creating it is the use case's job). */
  async start<S extends string>(
    tx: Transaction,
    machine: StateMachine<S>,
    input: { tenantId: string; resourceId: string; to: S },
  ): Promise<void> {
    const context = getRequestContext();
    const user = context?.user;
    await tx.insert(workflowTransition).values({
      tenantId: input.tenantId,
      resourceType: machine.resourceType,
      resourceId: input.resourceId,
      fromStatus: null,
      toStatus: input.to,
      actorUserId: user?.userId ?? null,
      actorRole: user ? user.roles.join(',') || null : null,
      correlationId: context?.correlationId ?? null,
    });
  }
}
