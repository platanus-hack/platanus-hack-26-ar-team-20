import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Helix",
  description: "Self-driving feature flags & experiments",
  openGraph: {
    title: "Helix",
    description: "Self-driving feature flags & experiments",
    images: ["/helix-brand-assets/png/og-image.png"],
  },
  twitter: {
    card: "summary_large_image",
    title: "Helix",
    description: "Self-driving feature flags & experiments",
    images: ["/helix-brand-assets/png/og-image.png"],
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fcfcfc" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0b" },
  ],
};

/*
  Apply theme before paint to prevent FOUC. Reads from localStorage,
  falls back to OS preference. Runs synchronously in <head>.
*/
const applyThemeScript = `
(function() {
  try {
    var ls = localStorage.getItem('helix-theme');
    var dark = ls === 'dark' || (!ls && window.matchMedia('(prefers-color-scheme: dark)').matches);
    if (dark) document.documentElement.classList.add('dark');
  } catch (_) {}
})();
`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: applyThemeScript }} />
      </head>
      <body className="min-h-full bg-background text-foreground font-sans flex flex-col selection:bg-accent-soft-strong">
        {children}
      </body>
    </html>
  );
}
