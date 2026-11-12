import type { Metadata, Viewport } from 'next';
import './globals.css';
export const metadata: Metadata = {
  title: 'ABMIL Pose — Planning & Pointage',
  description: 'Planification des chantiers, pointage individuel et relevés d’heures par chantier',
  robots: { index: false, follow: false },
  applicationName: 'ABMIL Pose',
  manifest: '/manifest.webmanifest',
  icons: { icon: '/icon.svg' },
  appleWebApp: { capable: true, title: 'ABMIL Pose', statusBarStyle: 'default' },
};
export const viewport: Viewport = { themeColor: '#122035', width: 'device-width', initialScale: 1 };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="fr"><body>{children}</body></html>;
}
