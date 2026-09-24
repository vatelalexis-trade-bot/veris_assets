import type { Metadata } from 'next';
import { PRODUCT_NAME } from '@virtus/shared';

export const metadata: Metadata = {
  title: PRODUCT_NAME,
  description: 'Digital private asset lifecycle management — demonstration environment.',
};

// Theme, fonts, logo and translations are added in phase 4.
export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="en-GB">
      <body>{children}</body>
    </html>
  );
}
