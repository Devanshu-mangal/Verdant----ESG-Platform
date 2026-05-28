import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import Sidebar from '@/components/Sidebar'
import Providers from '@/components/Providers'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'Breathe ESG — Ingestion Console',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <Providers>
          <div className="flex h-screen bg-gray-50 overflow-hidden">
            <Sidebar />
            <main className="flex-1 overflow-auto">
              {children}
            </main>
          </div>
        </Providers>
      </body>
    </html>
  )
}
