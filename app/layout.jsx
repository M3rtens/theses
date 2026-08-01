import './globals.css'
import { connection } from 'next/server'

const deploymentHost = process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL
const metadataOrigin = process.env.NEXT_PUBLIC_SITE_URL
  || (deploymentHost ? `https://${deploymentHost}` : 'http://localhost:3000')

export const metadata = {
  metadataBase: new URL(metadataOrigin),
  title: {
    default: 'Theses',
    template: '%s · Theses',
  },
  description: 'Publish investment theses with sealed entry prices and track what happens.',
  openGraph: {
    siteName: 'Theses',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
  },
  icons: {
    icon: '/favicon.svg',
  },
}

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
}

export default async function RootLayout({ children }) {
  // Nonce-based CSP is request-specific, so every document must be rendered
  // with access to the incoming request rather than emitted as a static shell.
  await connection()
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,300;9..144,400;9..144,500;9..144,600;9..144,700&family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap"
          rel="stylesheet"
        />
        <link
          href="https://cdn.jsdelivr.net/npm/lucide-static@0.544.0/font/lucide.css"
          rel="stylesheet"
        />
      </head>
      <body className="relative" suppressHydrationWarning>{children}</body>
    </html>
  )
}
