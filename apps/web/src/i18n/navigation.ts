import { createNavigation } from 'next-intl/navigation';
import { routing } from './routing';

/** Language-aware replacements of Next.js navigation helpers: always use these in the app. */
export const { Link, redirect, usePathname, useRouter, getPathname } = createNavigation(routing);
