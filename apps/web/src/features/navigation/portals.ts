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

export interface NavigationItem {
  /** URL segment after the portal path, and translation key `navigation.<portal>.<section>`. */
  readonly section: string;
  readonly icon: LucideIcon;
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
    { section: 'dashboard', icon: LayoutDashboard },
    { section: 'tasks', icon: ListChecks },
    { section: 'issuances', icon: Landmark },
    { section: 'investors', icon: Users },
    { section: 'subscriptions', icon: ClipboardCheck },
    { section: 'registry', icon: ScrollText },
    { section: 'distributions', icon: Receipt },
    { section: 'documents', icon: FileText },
    { section: 'reports', icon: BarChart3 },
    { section: 'audit', icon: KeyRound },
    { section: 'settings', icon: Settings },
  ],
};

/** Investor portal menu (SPEC §14.2). */
const investor: Portal = {
  id: 'investor',
  path: '/portal',
  items: [
    { section: 'portfolio', icon: Wallet },
    { section: 'opportunities', icon: Sparkles },
    { section: 'subscriptions', icon: ClipboardCheck },
    { section: 'transactions', icon: ArrowLeftRight },
    { section: 'distributions', icon: PieChart },
    { section: 'documents', icon: FileText },
    { section: 'profile', icon: UserRound },
  ],
};

/** Platform Administrator console (SPEC §4.1). */
const platform: Portal = {
  id: 'platform',
  path: '/platform',
  items: [
    { section: 'tenants', icon: Building2 },
    { section: 'metrics', icon: Gauge },
    { section: 'templates', icon: Mail },
    { section: 'settings', icon: Settings },
    { section: 'break-glass', icon: KeyRound },
  ],
};

export const PORTALS = { issuer, investor, platform } as const;
export type PortalId = keyof typeof PORTALS;

export function findSection(portal: Portal, section: string): NavigationItem | undefined {
  return portal.items.find((item) => item.section === section);
}
