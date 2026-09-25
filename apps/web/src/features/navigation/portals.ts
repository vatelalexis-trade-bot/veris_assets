import {
  ArrowLeftRight,
  BarChart3,
  Building2,
  ClipboardCheck,
  FileText,
  Gauge,
  KeyRound,
  Landmark,
  LayoutDashboard,
  ListChecks,
  Mail,
  PieChart,
  Receipt,
  ScrollText,
  Settings,
  Sparkles,
  UserRound,
  Users,
  Wallet,
  type LucideIcon,
} from 'lucide-react';
import type { Permission } from '@virtus/shared';

export interface NavigationItem {
  /** URL segment after the portal path, and translation key `navigation.<portal>.<section>`. */
  readonly section: string;
  readonly icon: LucideIcon;
  /** Permission needed to see the entry (the API checks it again on every call). */
  readonly permission: Permission;
}

export interface Portal {
  readonly id: 'issuer' | 'investor' | 'platform';
  /** URL path of the portal, after the language prefix. */
  readonly path: string;
  readonly items: readonly NavigationItem[];
}

/** Issuer portal menu (SPEC §13.2) plus the "To do" queue (SPEC §13.5). */
const issuer: Portal = {
  id: 'issuer',
  path: '/issuer',
  items: [
    { section: 'dashboard', icon: LayoutDashboard, permission: 'report:read' },
    { section: 'tasks', icon: ListChecks, permission: 'task:read' },
    { section: 'issuances', icon: Landmark, permission: 'issuance:read' },
    { section: 'investors', icon: Users, permission: 'investor:read' },
    { section: 'subscriptions', icon: ClipboardCheck, permission: 'subscription:read' },
    { section: 'registry', icon: ScrollText, permission: 'registry:read' },
    { section: 'distributions', icon: Receipt, permission: 'distribution:read' },
    { section: 'documents', icon: FileText, permission: 'document:read' },
    { section: 'reports', icon: BarChart3, permission: 'report:read' },
    { section: 'audit', icon: KeyRound, permission: 'audit:read' },
    { section: 'settings', icon: Settings, permission: 'user:read' },
  ],
};

/** Investor portal menu (SPEC §14.2). */
const investor: Portal = {
  id: 'investor',
  path: '/portal',
  items: [
    { section: 'portfolio', icon: Wallet, permission: 'registry:read' },
    { section: 'opportunities', icon: Sparkles, permission: 'issuance:read' },
    { section: 'subscriptions', icon: ClipboardCheck, permission: 'subscription:read' },
    { section: 'transactions', icon: ArrowLeftRight, permission: 'registry:read' },
    { section: 'distributions', icon: PieChart, permission: 'distribution:read' },
    { section: 'documents', icon: FileText, permission: 'document:read' },
    { section: 'profile', icon: UserRound, permission: 'profile:manage' },
  ],
};

/** Platform Administrator console (SPEC §4.1). */
const platform: Portal = {
  id: 'platform',
  path: '/platform',
  items: [
    { section: 'tenants', icon: Building2, permission: 'tenant:read' },
    { section: 'metrics', icon: Gauge, permission: 'platform-metrics:read' },
    { section: 'templates', icon: Mail, permission: 'notification-template:manage' },
    { section: 'settings', icon: Settings, permission: 'platform-settings:manage' },
    { section: 'break-glass', icon: KeyRound, permission: 'break-glass:request' },
  ],
};

export const PORTALS = { issuer, investor, platform } as const;
export type PortalId = keyof typeof PORTALS;

export function findSection(portal: Portal, section: string): NavigationItem | undefined {
  return portal.items.find((item) => item.section === section);
}

/** Menu entries the user may see, from the permissions returned by /auth/me. */
export function visibleItems(portal: Portal, permissions: readonly string[]): NavigationItem[] {
  return portal.items.filter((item) => permissions.includes(item.permission));
}
