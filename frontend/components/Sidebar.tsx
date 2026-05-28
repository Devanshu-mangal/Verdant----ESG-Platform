'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LayoutDashboard, Upload, AlertTriangle, ScrollText, FolderInput, Table2 } from 'lucide-react'

const nav = [
  { href: '/',              label: 'Dashboard',      icon: LayoutDashboard },
  { href: '/upload',        label: 'Upload data',    icon: Upload },
  { href: '/ingestions',    label: 'Ingestions',     icon: FolderInput },
  { href: '/activities',    label: 'Activities',     icon: Table2 },
  { href: '/review-queue',  label: 'Review queue',   icon: AlertTriangle },
  { href: '/audit',         label: 'Audit timeline', icon: ScrollText },
]

export default function Sidebar() {
  const path = usePathname()
  return (
    <aside className="w-56 bg-white border-r border-gray-200 flex flex-col">
      <div className="px-5 py-4 border-b border-gray-200">
        <span className="text-sm font-semibold text-gray-900 tracking-tight">Breathe ESG</span>
        <span className="ml-2 text-xs text-gray-400">Ingestion Console</span>
      </div>
      <nav className="flex-1 px-3 py-4 space-y-0.5">
        {nav.map(({ href, label, icon: Icon }) => {
          const active = path === href
          return (
            <Link key={href} href={href}
              className={`flex items-center gap-2.5 px-3 py-2 rounded text-sm transition-colors
                ${active
                  ? 'bg-gray-100 text-gray-900 font-medium'
                  : 'text-gray-500 hover:text-gray-900 hover:bg-gray-50'}`}>
              <Icon size={15} />
              {label}
            </Link>
          )
        })}
      </nav>
      <div className="px-5 py-3 border-t border-gray-200">
        <span className="text-xs text-gray-400">analyst@breatheesg.com</span>
      </div>
    </aside>
  )
}
