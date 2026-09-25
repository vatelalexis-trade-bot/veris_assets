'use client';

import { Menu, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { PORTALS, visibleItems, type PortalId } from '@/features/navigation/portals';
import { Link, usePathname } from '@/i18n/navigation';
import { cn } from '@/lib/utils';

/** Portal menu: always visible on large screens, behind a toggle button on small ones. */
export function PortalNavigation({
  portalId,
  permissions,
}: {
  portalId: PortalId;
  permissions: string[];
}) {
  const t = useTranslations();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const portal = PORTALS[portalId];

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        className="md:hidden"
        aria-expanded={open}
        aria-controls="portal-navigation"
        aria-label={open ? t('common.closeMenu') : t('common.openMenu')}
        onClick={() => setOpen((value) => !value)}
      >
        {open ? <X /> : <Menu />}
      </Button>
      <nav
        id="portal-navigation"
        aria-label={t('common.mainNavigation')}
        className={cn('w-full md:block', open ? 'block' : 'hidden')}
      >
        <ul className="flex flex-col gap-0.5 p-3">
          {visibleItems(portal, permissions).map(({ section, icon: Icon }) => {
            const href = `${portal.path}/${section}`;
            const active = pathname === href || pathname.startsWith(`${href}/`);
            return (
              <li key={section}>
                <Link
                  href={href}
                  onClick={() => setOpen(false)}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'flex items-center gap-3 rounded-lg px-3 py-2 text-sm',
                    active
                      ? 'bg-surface-raised font-medium text-foreground'
                      : 'text-muted hover:bg-surface-raised hover:text-foreground',
                  )}
                >
                  <Icon aria-hidden="true" className={cn('size-4', active && 'text-accent')} />
                  {t(`navigation.${portal.id}.${section}`)}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </>
  );
}
