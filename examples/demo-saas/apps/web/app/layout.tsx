import './globals.css';
import type { Metadata } from 'next';
import { PostHogProvider } from './providers';

export const metadata: Metadata = {
  title: 'Cal.com — Helix Demo',
  description: 'Helix demo: Cal.com fork with 4 cart-conversion variants behind a multivariate flag',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">
        <PostHogProvider>{children}</PostHogProvider>
      </body>
    </html>
  );
}
