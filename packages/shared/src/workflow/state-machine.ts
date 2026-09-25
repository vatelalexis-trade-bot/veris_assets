import type { Permission } from '../permissions/permissions.js';

/**
 * Generic state machine (SPEC §7: "a single, tested state machine, never only in the interface").
 * Pure: it says whether a transition is allowed; the use case checks its business preconditions
 * (dates, amounts) and records the transition in `core.workflow_transition`.
 */
export interface TransitionRule<S extends string> {
  readonly from: readonly S[];
  readonly to: S;
  /** Permission the actor needs for this transition (null: system only, e.g. a daily job). */
  readonly permission: Permission | null;
  /** A comment is mandatory (e.g. sending an issuance back to draft). */
  readonly commentRequired?: boolean;
  /** Four-eyes rule (SPEC §4.8): the actor must differ from the initiator of the resource. */
  readonly distinctFromInitiator?: boolean;
}

export interface StateMachine<S extends string> {
  /** Stored in `workflow_transition.resource_type`, e.g. `ISSUANCE`. */
  readonly resourceType: string;
  readonly states: readonly S[];
  readonly transitions: readonly TransitionRule<S>[];
}

export interface TransitionActor {
  /** Null for the system (jobs). */
  readonly userId: string | null;
  readonly permissions: ReadonlySet<string> | ReadonlyMap<string, unknown>;
}

export interface TransitionRequest<S extends string> {
  readonly from: S;
  readonly to: S;
  readonly actor: TransitionActor;
  readonly comment?: string | null;
  /** User who initiated the resource, for the four-eyes rule. */
  readonly initiatorUserId?: string | null;
}

export type TransitionRefusal =
  'INVALID_STATE_TRANSITION' | 'PERMISSION_DENIED' | 'COMMENT_REQUIRED' | 'FOUR_EYES_VIOLATION';

/** Declares a machine and checks its consistency once, when the module is loaded. */
export function defineStateMachine<S extends string>(machine: StateMachine<S>): StateMachine<S> {
  const known = new Set<string>(machine.states);
  const seen = new Set<string>();
  for (const rule of machine.transitions) {
    for (const state of [...rule.from, rule.to]) {
      if (!known.has(state)) {
        throw new Error(`${machine.resourceType}: unknown state ${state} in a transition`);
      }
    }
    for (const from of rule.from) {
      if (from === rule.to)
        throw new Error(`${machine.resourceType}: ${from} → ${from} is not a transition`);
      const edge = `${from}→${rule.to}`;
      if (seen.has(edge))
        throw new Error(`${machine.resourceType}: transition ${edge} declared twice`);
      seen.add(edge);
    }
  }
  return machine;
}

function ruleFor<S extends string>(machine: StateMachine<S>, from: S, to: S) {
  return machine.transitions.find((rule) => rule.to === to && rule.from.includes(from));
}

/** Null when the transition is allowed, otherwise the reason of the refusal (an error code). */
export function checkTransition<S extends string>(
  machine: StateMachine<S>,
  request: TransitionRequest<S>,
): TransitionRefusal | null {
  const rule = ruleFor(machine, request.from, request.to);
  if (!rule) return 'INVALID_STATE_TRANSITION';
  const { actor } = request;
  if (actor.userId !== null) {
    // A user may only make transitions open to users, with the right permission.
    if (rule.permission === null || !actor.permissions.has(rule.permission))
      return 'PERMISSION_DENIED';
    if (
      rule.distinctFromInitiator &&
      request.initiatorUserId !== null &&
      request.initiatorUserId === actor.userId
    ) {
      return 'FOUR_EYES_VIOLATION';
    }
  }
  if (rule.commentRequired && !request.comment?.trim()) return 'COMMENT_REQUIRED';
  return null;
}

/** Target states the actor may reach from `from`: used by the interface to show only valid actions. */
export function availableTransitions<S extends string>(
  machine: StateMachine<S>,
  from: S,
  actor: TransitionActor,
): S[] {
  return machine.transitions
    .filter((rule) => rule.from.includes(from))
    .filter((rule) =>
      actor.userId === null
        ? true
        : rule.permission !== null && actor.permissions.has(rule.permission),
    )
    .map((rule) => rule.to);
}
