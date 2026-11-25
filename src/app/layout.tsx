import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'NoteBase | Student Resource & Notes Portal',
  description: 'Instant access to verified handwritten notes, PYQs, and lectures on NoteBase.',
  icons: {
    icon: '/logo.png?v=2',
    shortcut: '/logo.png?v=2',
    apple: '/logo.png?v=2',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  userScalable: true,
  viewportFit: 'cover',
  themeColor: '#ffffff',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <link rel="icon" href="/logo.png?v=2" type="image/png" />
        <link rel="apple-touch-icon" href="/logo.png?v=2" />
      </head>
      <body className="min-h-screen bg-slate-50 text-slate-800 antialiased selection:bg-slate-200">
        {children}
      </body>
    </html>
  );
}
