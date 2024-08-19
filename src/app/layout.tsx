import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { cn } from '@/lib/utils';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Image ranking',
  metadataBase: new URL('https://www.andressrg.com'),
  alternates: {
    canonical: '/image-ranking',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="min-h-full flex flex-col flex-1">
      <body className={cn(inter.className, 'flex flex-col flex-1')}>
        {children}
      </body>
    </html>
  );
}
