import type { Metadata, Viewport } from 'next';
import { Libre_Baskerville, Montserrat, Schibsted_Grotesk } from 'next/font/google';
import { AuthProvider } from '@/components/auth';
import './globals.css';

const display = Libre_Baskerville({ weight: '700', subsets: ['latin'], variable: '--font-display' });
const label = Montserrat({ weight: ['500', '600'], subsets: ['latin'], variable: '--font-label' });
const body = Schibsted_Grotesk({ subsets: ['latin'], variable: '--font-body' });

export const metadata: Metadata = {
  title: 'PCM Alumni Network',
  description: 'Where Plintus Capital Management alumni and current members connect.',
  appleWebApp: { capable: true, title: 'PCM Alumni', statusBarStyle: 'default' },
};

export const viewport: Viewport = {
  themeColor: '#F7F4EC',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${label.variable} ${body.variable}`}>
      <body>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
