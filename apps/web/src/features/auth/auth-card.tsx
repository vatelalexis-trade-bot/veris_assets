import type { ReactNode } from 'react';
import { DemoBanner } from '@/components/app/demo-banner';
import { LanguageSwitcher } from '@/components/app/language-switcher';
import { Logo } from '@/components/app/logo';
import { Link } from '@/i18n/navigation';

/** Frame of the sign-in, second-factor, password and invitation pages. */
export function AuthCard({
  title,
  children,
  wide = false,
}: {
  title: string;
  children: ReactNode;
  /** Wider card, for the sign-in page with the demonstration accounts beside the form. */
  wide?: boolean;
}) {
  return (
    <div className="flex min-h-dvh flex-col">
      <DemoBanner />
      <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-8 px-6 py-8">
        <header className="flex items-center justify-between">
          <Link href="/" aria-label="Veris Assets">
            <Logo />
          </Link>
          <LanguageSwitcher />
        </header>
        <main>
          <section
            className={`flex w-full flex-col gap-5 rounded-xl border border-border bg-surface p-6 ${wide ? '' : 'max-w-md'}`}
          >
            <h1 className="text-xl font-semibold">{title}</h1>
            {children}
          </section>
        </main>
      </div>
    </div>
  );
}
