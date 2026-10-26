import { useState, useEffect, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { NavLink, useNavigate, useLocation } from 'react-router-dom'
import {
  LayoutDashboard, Users, Send, Smartphone, History,
  DollarSign, Package, Megaphone, FileText, Settings,
  Webhook, Activity, Shield, X, LogOut, ChevronLeft, ChevronRight,
  ChevronDown, UserCheck, Flag, Menu, Palette, Wrench, GitBranch,
  CreditCard, ShieldCheck, Database, FolderGit2
} from 'lucide-react'
import { APP_VERSION } from '../../utils/constants'
import { useAuth } from '../../context/AuthContext'
import { BRAND } from '../../config/brand'
import logoAfIcon from '../../assets/brand/Logo-AF.jpeg'
import Can from '../common/Can'
import { staffPath } from '../../utils/portal'

const ICON_MAP = {
  LayoutDashboard,
  Users,
  Send,
  Smartphone,
  History,
  DollarSign,
  Package,
  Megaphone,
  FileText,
  Settings,
  Webhook,
  Activity,
  Shield,
  ShieldCheck,
  UserCheck,
  Flag,
  Menu,
  Palette,
  Wrench,
  GitBranch,
  CreditCard,
  Database,
  FolderGit2,
}

/**
 * AdminSidebar – Sidebar gelap (#0B1220) konsisten untuk panel Staf (Super Admin, Admin Finance, Developer).
 * Mengimplementasikan:
 * - Grup berlabel yang dapat di-collapse (accordions)
 * - Tampil sesuai izin lewat komponen <Can>
 * - Struktur menu Super Admin:
 *     1. Dasbor Admin
 *     2. Manajemen Target: Daftar Target, Kampanye Target, Kategori Target, Template Pesan, Aturan Profil
 *     3. Manajemen Pengguna: Pengguna, Persetujuan Akun Staf, Mesin Member, Tim AF Blast
 *     4. Keuangan & Monetisasi: Penarikan Saldo, Grup Pembayaran, Laporan Komisi, Paket & Langganan, Pengaturan Penarikan
 *     5. Sistem: Pengaturan Sistem, Backup / Restore, Monitor Trafik, Log Aktivitas, Integrasi API, Pengumuman Sistem, Profil Admin
 * - Brand AF Blast (Logo-AF.jpeg di permukaan navy)
 * - Footer: Avatar, nama, role, logout
 */
export default function AdminSidebar({
  isOpen,
  onClose,
  isCollapsed = false,
  onToggleCollapse,
}) {
  const { t, i18n } = useTranslation()
  const { user, role, token, hasPermission, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const isRTL = i18n.language === 'ar'

  const [pendingStaffCount, setPendingStaffCount] = useState(0)
  const [collapsedGroups, setCollapsedGroups] = useState({})

  const toggleGroup = (groupKey) => {
    setCollapsedGroups((prev) => ({
      ...prev,
      [groupKey]: !prev[groupKey],
    }))
  }

  // Ambil jumlah staf pending untuk badge sidebar Superadmin
  useEffect(() => {
    if (role !== 'superadmin' || !token) return

    async function fetchPendingCount() {
      try {
        const res = await fetch('/api/admin/staff?status=pending', {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (res.ok) {
          const data = await res.json()
          setPendingStaffCount(data.staff ? data.staff.length : 0)
        }
      } catch (err) {
        // silent error for badge
      }
    }

    fetchPendingCount()
    const timer = setInterval(fetchPendingCount, 60000)
    return () => clearInterval(timer)
  }, [role, token])

  // Tentukan path prefix berdasarkan role
  const basePath = useMemo(() => {
    if (role === 'superadmin') return staffPath('/superadmin')
    if (role === 'adminfinance') return staffPath('/finance')
    if (role === 'developer') return staffPath('/developer')
    return staffPath('/superadmin')
  }, [role])

  // Bangun struktur navigasi sesuai role
  const navGroups = useMemo(() => {
    // 1. ADMIN FINANCE: HANYA Dashboard Keuangan, Penarikan, Komisi, Paket (Lihat Saja)
    if (role === 'adminfinance') {
      return [
        {
          key: 'finance-main',
          groupTitle: 'Keuangan & Monetisasi',
          items: [
            {
              key: 'finance-dashboard',
              icon: 'DollarSign',
              path: `${basePath}`,
              label: 'Dashboard Keuangan',
              permission: 'dashboard.finance',
            },
            {
              key: 'finance-withdrawals',
              icon: 'CreditCard',
              path: `${basePath}/withdrawals`,
              label: 'Penarikan Saldo',
              permission: 'withdrawal.view',
            },
            {
              key: 'finance-payment-group',
              icon: 'Send',
              path: `${basePath}/payment-group`,
              label: 'Grup Pembayaran',
              permission: 'paymentGroup.view',
            },
            {
              key: 'finance-commissions',
              icon: 'DollarSign',
              path: `${basePath}/commissions`,
              label: 'Laporan Komisi',
              permission: 'commission.view',
            },
            {
              key: 'finance-packages',
              icon: 'Package',
              path: `${basePath}/packages`,
              label: 'Daftar Paket (Lihat)',
              permission: 'plan.view',
            },
            {
              key: 'finance-withdraw-settings',
              icon: 'Settings',
              path: `${basePath}/withdraw-settings`,
              label: 'Pengaturan Penarikan',
              permission: 'withdrawPreset.manage',
            },
          ],
        },
      ]
    }

    // 2. DEVELOPER: Modul Developer + Fitur Admin
    if (role === 'developer') {
      return [
        {
          key: 'dev-module',
          groupTitle: 'Modul Developer',
          items: [
            {
              key: 'dev-flags',
              icon: 'Flag',
              path: `${basePath}/flags`,
              label: 'Feature Flags',
              permission: 'dev.flags',
            },
            {
              key: 'dev-menu',
              icon: 'Menu',
              path: `${basePath}/menu`,
              label: 'Editor Menu',
              permission: 'dev.menu',
            },
            {
              key: 'dev-theme',
              icon: 'Palette',
              path: `${basePath}/theme`,
              label: 'Tema & Tampilan',
              permission: 'dev.theme',
            },
            {
              key: 'dev-maintenance',
              icon: 'Wrench',
              path: `${basePath}/maintenance`,
              label: 'Mode Maintenance',
              permission: 'dev.maintenance',
            },
            {
              key: 'dev-version',
              icon: 'GitBranch',
              path: `${basePath}/version`,
              label: 'Versi & Changelog',
              permission: 'dev.version',
            },
          ],
        },
        {
          key: 'dev-admin-core',
          groupTitle: 'Dasbor & Fitur Utama',
          items: [
            {
              key: 'dev-admin-dashboard',
              icon: 'LayoutDashboard',
              path: `${basePath}`,
              label: 'Dasbor Developer',
              permission: 'dashboard.view',
            },
            {
              key: 'dev-admin-users',
              icon: 'Users',
              path: `${basePath}/users`,
              label: 'Pengguna',
              permission: 'user.view',
            },
            {
              key: 'dev-admin-targets',
              icon: 'Users',
              path: `${basePath}/targets`,
              label: 'Daftar Target',
              permission: 'contactPool.manage',
            },
            {
              key: 'dev-admin-campaigns',
              icon: 'Send',
              path: `${basePath}/campaigns`,
              label: 'Kampanye Target',
              permission: 'blastCampaign.manage',
            },
            {
              key: 'dev-admin-categories',
              icon: 'FolderGit2',
              path: `${basePath}/categories`,
              label: 'Kategori Target',
              permission: 'campaign.view',
            },
            {
              key: 'dev-admin-templates',
              icon: 'FileText',
              path: `${basePath}/templates`,
              label: 'Template Pesan',
              permission: 'template.view',
            },
            {
              key: 'dev-admin-withdrawals',
              icon: 'CreditCard',
              path: `${basePath}/withdrawals`,
              label: 'Penarikan Saldo',
              permission: 'withdrawal.view',
            },
            {
              key: 'dev-admin-payment-group',
              icon: 'Send',
              path: `${basePath}/payment-group`,
              label: 'Grup Pembayaran',
              permission: 'paymentGroup.view',
            },
            {
              key: 'dev-admin-settings',
              icon: 'Settings',
              path: `${basePath}/settings`,
              label: 'Pengaturan Sistem',
              permission: 'setting.view',
            },
            {
              key: 'dev-admin-integration',
              icon: 'Webhook',
              path: `${basePath}/integration`,
              label: 'Integrasi API',
              permission: 'setting.view',
            },
            {
              key: 'dev-admin-logs',
              icon: 'Activity',
              path: `${basePath}/logs`,
              label: 'Log Aktivitas',
              permission: 'log.view',
            },
            {
              key: 'dev-admin-profile',
              icon: 'Shield',
              path: `${basePath}/profile`,
              label: 'Profil Pengembang',
              permission: 'dashboard.view',
            },
          ],
        },
      ]
    }

    // 3. SUPERADMIN: Struktur yang diminta:
    //    - Dasbor Admin
    //    - Manajemen Target: Daftar Target, Kampanye Target, Kategori Target, Template Pesan, Aturan Profil
    //    - Manajemen Pengguna: menu yang sudah ada (Pengguna, Persetujuan Akun Staf, Mesin Member, Tim AF Blast)
    //    - Keuangan & Monetisasi: Penarikan Saldo, Grup Pembayaran, Laporan Komisi, Paket & Langganan, Pengaturan Penarikan
    //    - Sistem: Pengaturan Sistem, Backup / Restore, Monitor Trafik, Log Aktivitas, Integrasi API, Pengumuman Sistem, Profil Admin
    return [
      {
        key: 'sa-main',
        groupTitle: 'Dasbor Utama',
        items: [
          {
            key: 'sa-dashboard',
            icon: 'LayoutDashboard',
            path: `${basePath}`,
            label: 'Dasbor Admin',
            permission: 'dashboard.view',
          },
        ],
      },
      {
        key: 'sa-target',
        groupTitle: 'Manajemen Target',
        items: [
          {
            key: 'sa-targets',
            icon: 'Users',
            path: `${basePath}/targets`,
            label: 'Daftar Target',
            permission: 'contactPool.manage',
          },
          {
            key: 'sa-campaigns',
            icon: 'Send',
            path: `${basePath}/campaigns`,
            label: 'Kampanye Target',
            permission: 'blastCampaign.manage',
          },
          {
            key: 'sa-categories',
            icon: 'FolderGit2',
            path: `${basePath}/categories`,
            label: 'Kategori Target',
            permission: 'campaign.view',
          },
          {
            key: 'sa-templates',
            icon: 'FileText',
            path: `${basePath}/templates`,
            label: 'Template Pesan',
            permission: 'template.view',
          },
          {
            key: 'sa-profile-rule',
            icon: 'ShieldCheck',
            path: `${basePath}/profile-rule`,
            label: 'Aturan Profil',
            permission: 'profileRule.manage',
          },
        ],
      },
      {
        key: 'sa-users-group',
        groupTitle: 'Manajemen Pengguna',
        items: [
          {
            key: 'sa-users',
            icon: 'Users',
            path: `${basePath}/users`,
            label: 'Pengguna',
            permission: 'user.view',
          },
          {
            key: 'sa-staff-approval',
            icon: 'UserCheck',
            path: `${basePath}/staff`,
            label: 'Persetujuan Akun Staf',
            permission: 'staff.approve',
            badge: pendingStaffCount > 0 ? pendingStaffCount : null,
          },
          {
            key: 'sa-devices',
            icon: 'Smartphone',
            path: `${basePath}/devices`,
            label: 'Mesin Member',
            permission: 'device.view',
          },
          {
            key: 'sa-team',
            icon: 'UserCheck',
            path: `${basePath}/team`,
            label: 'Tim AF Blast',
            permission: 'team.manage',
          },
        ],
      },
      {
        key: 'sa-finance',
        groupTitle: 'Keuangan & Monetisasi',
        items: [
          {
            key: 'sa-withdrawals',
            icon: 'CreditCard',
            path: `${basePath}/withdrawals`,
            label: 'Penarikan Saldo',
            permission: 'withdrawal.view',
          },
          {
            key: 'sa-payment-group',
            icon: 'Send',
            path: `${basePath}/payment-group`,
            label: 'Grup Pembayaran',
            permission: 'paymentGroup.view',
          },
          {
            key: 'sa-commissions',
            icon: 'DollarSign',
            path: `${basePath}/commissions`,
            label: 'Laporan Komisi',
            permission: 'commission.view',
          },
          {
            key: 'sa-packages',
            icon: 'Package',
            path: `${basePath}/packages`,
            label: 'Paket & Langganan',
            permission: 'plan.view',
          },
          {
            key: 'sa-withdraw-settings',
            icon: 'Settings',
            path: `${basePath}/withdraw-settings`,
            label: 'Pengaturan Penarikan',
            permission: 'withdrawPreset.manage',
          },
        ],
      },
      {
        key: 'sa-system',
        groupTitle: 'Sistem',
        items: [
          {
            key: 'sa-settings',
            icon: 'Settings',
            path: `${basePath}/settings`,
            label: 'Pengaturan Sistem',
            permission: 'setting.view',
          },
          {
            key: 'sa-backup',
            icon: 'Database',
            path: `${basePath}/backup`,
            label: 'Backup / Restore',
            permission: 'setting.view',
          },
          {
            key: 'sa-traffic',
            icon: 'Activity',
            path: `${basePath}/logs?filter=traffic`,
            label: 'Monitor Trafik',
            permission: 'log.view',
          },
          {
            key: 'sa-logs',
            icon: 'FileText',
            path: `${basePath}/logs`,
            label: 'Log Aktivitas',
            permission: 'log.view',
          },
          {
            key: 'sa-integration',
            icon: 'Webhook',
            path: `${basePath}/integration`,
            label: 'Integrasi API',
            permission: 'setting.view',
          },
          {
            key: 'sa-announcements',
            icon: 'Megaphone',
            path: `${basePath}/announcements`,
            label: 'Pengumuman Sistem',
            permission: 'announcement.view',
          },
          {
            key: 'sa-profile',
            icon: 'Shield',
            path: `${basePath}/profile`,
            label: 'Profil Admin',
            permission: 'dashboard.view',
          },
        ],
      },
    ]
  }, [role, basePath, pendingStaffCount])

  // Filter awal grup jika sama sekali tidak ada izin di dalamnya
  const visibleGroups = useMemo(() => {
    return navGroups
      .map((group) => {
        const allowedItems = group.items.filter(
          (item) => !item.permission || role === 'superadmin' || hasPermission(item.permission)
        )
        return {
          ...group,
          items: allowedItems,
        }
      })
      .filter((group) => group.items.length > 0)
  }, [navGroups, hasPermission, role])

  const handleLogout = () => {
    logout()
    onClose?.()
    navigate(staffPath('/login'))
  }

  const translateClass = isOpen
    ? 'translate-x-0'
    : isRTL
      ? 'translate-x-full'
      : '-translate-x-full'

  const positionClass = isRTL ? 'right-0' : 'left-0'
  const widthClass = isCollapsed ? 'lg:w-20' : 'lg:w-64'

  return (
    <>
      {/* Mobile Backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-slate-950/70 backdrop-blur-xs lg:hidden"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      {/* Sidebar Container */}
      <aside
        id="admin-sidebar"
        aria-label="Admin Navigation"
        className={[
          'fixed top-0 z-50 h-full w-64 flex flex-col',
          positionClass,
          widthClass,
          'bg-[#0B1220] text-[#E8EEFA] border-e border-[#1E293B]',
          'transition-all duration-300 ease-in-out',
          translateClass,
          'lg:translate-x-0',
          'lg:z-30 lg:shadow-none',
          'shadow-2xl lg:shadow-none',
        ].join(' ')}
      >
        {/* Header / Brand: Logo AF Blast di permukaan Navy */}
        <div className="flex items-center justify-between px-4 py-4 border-b border-[#1E293B] h-16 flex-shrink-0 bg-[#0B1220]">
          <div className="flex items-center gap-3 overflow-hidden">
            <img
              src={logoAfIcon}
              alt={BRAND.name}
              className="w-9 h-9 rounded-xl object-contain flex-shrink-0 border border-slate-700/60 shadow-md bg-[#0B1220]"
            />
            {!isCollapsed && (
              <div className="min-w-0 transition-opacity duration-200">
                <span className="text-base font-bold text-white tracking-tight block truncate uppercase">
                  {BRAND.name}
                </span>
                <span className="inline-block text-[10px] font-semibold text-[#60A5FA] uppercase tracking-widest truncate">
                  Portal Staf • {role === 'adminfinance' ? 'Finance' : role === 'developer' ? 'Developer' : 'Super Admin'}
                </span>
              </div>
            )}
          </div>

          {/* Close button on mobile */}
          <button
            type="button"
            className="lg:hidden p-1.5 rounded-lg text-slate-400 hover:bg-slate-800 hover:text-white transition-colors"
            onClick={onClose}
            aria-label={t('topbar.closeMenu')}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation Items (Grouped, Collapsible, Filtered by <Can>) */}
        <nav
          className="flex-1 overflow-y-auto overflow-x-hidden py-4 px-3 space-y-5 scrollbar-thin scrollbar-thumb-slate-800"
          aria-label="Admin Sidebar Navigation"
        >
          {visibleGroups.map((group) => {
            const isGroupCollapsed = !isCollapsed && !!collapsedGroups[group.key]

            return (
              <div key={group.key} className="space-y-1">
                {!isCollapsed ? (
                  <button
                    type="button"
                    onClick={() => toggleGroup(group.key)}
                    className="w-full flex items-center justify-between px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-400 hover:text-white transition-colors group select-none text-start"
                  >
                    <span>{group.groupTitle}</span>
                    <ChevronDown
                      className={`w-3.5 h-3.5 transition-transform duration-200 text-slate-500 group-hover:text-slate-300 ${
                        isGroupCollapsed ? '-rotate-90' : 'rotate-0'
                      }`}
                    />
                  </button>
                ) : (
                  <div className="border-t border-[#1E293B] my-2" />
                )}

                {/* Items List (Collapsible) */}
                {(!isGroupCollapsed || isCollapsed) && (
                  <ul className="space-y-1" role="list">
                    {group.items.map((item) => {
                      const IconComp = ICON_MAP[item.icon]
                      return (
                        <Can key={item.key} permission={item.permission}>
                          <li>
                            <NavLink
                              to={item.path}
                              end={item.path === basePath}
                              onClick={onClose}
                              title={isCollapsed ? item.label : undefined}
                              className={({ isActive }) => [
                                'flex items-center gap-3 px-3 py-2 rounded-xl text-xs sm:text-sm font-medium',
                                'transition-all duration-150 group min-h-[40px]',
                                isActive
                                  ? 'bg-primary/20 text-[#60A5FA] border border-primary/30 shadow-xs'
                                  : 'text-slate-400 hover:bg-slate-800/60 hover:text-white',
                                isCollapsed ? 'justify-center px-0' : '',
                              ].join(' ')}
                            >
                              {({ isActive }) => (
                                <>
                                  <span
                                    className={[
                                      'flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center transition-colors relative',
                                      isActive
                                        ? 'bg-primary text-white shadow-xs'
                                        : 'text-slate-400 group-hover:text-[#60A5FA] group-hover:bg-slate-800',
                                    ].join(' ')}
                                  >
                                    {IconComp && <IconComp className="w-4 h-4" />}
                                    {isCollapsed && item.badge && (
                                      <span className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-warning text-[9px] font-bold text-white flex items-center justify-center">
                                        {item.badge}
                                      </span>
                                    )}
                                  </span>

                                  {!isCollapsed && (
                                    <span className="flex-1 text-start truncate font-medium">
                                      {item.label}
                                    </span>
                                  )}

                                  {!isCollapsed && item.badge && (
                                    <span className="px-2 py-0.5 rounded-full bg-warning/20 text-warning border border-warning/30 text-[11px] font-bold">
                                      {item.badge}
                                    </span>
                                  )}

                                  {!isCollapsed && isActive && !item.badge && (
                                    <span
                                      className="w-1.5 h-1.5 rounded-full bg-[#60A5FA] flex-shrink-0 shadow-xs"
                                      aria-hidden="true"
                                    />
                                  )}
                                </>
                              )}
                            </NavLink>
                          </li>
                        </Can>
                      )
                    })}
                  </ul>
                )}
              </div>
            )
          })}
        </nav>

        {/* Desktop Collapse Toggle */}
        <div className="hidden lg:flex items-center justify-center py-2 px-3 border-t border-[#1E293B] bg-[#070D18]">
          <button
            type="button"
            onClick={onToggleCollapse}
            className="w-full flex items-center justify-center gap-2 py-1.5 rounded-lg text-xs text-slate-400 hover:text-white hover:bg-slate-800/80 transition-colors"
            title={isCollapsed ? t('adminTopbar.expandSidebar') : t('adminTopbar.collapseSidebar')}
          >
            {isCollapsed ? (
              <ChevronRight className="w-4 h-4" />
            ) : (
              <>
                <ChevronLeft className="w-4 h-4" />
                <span className="text-xs">{t('adminTopbar.collapseSidebar')}</span>
              </>
            )}
          </button>
        </div>

        {/* Footer with Staff Profile & Logout */}
        <div className="border-t border-[#1E293B] p-3 bg-[#070D18]">
          <div className={`flex items-center gap-3 ${isCollapsed ? 'justify-center' : ''} mb-2.5`}>
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-primary to-accent flex items-center justify-center flex-shrink-0 shadow-sm">
              <span className="text-white text-xs font-bold uppercase">
                {user?.name ? user.name.charAt(0) : 'S'}
              </span>
            </div>
            {!isCollapsed && (
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-white truncate">
                  {user?.name || 'Staff User'}
                </p>
                <p className="text-xs font-mono text-[#60A5FA] truncate uppercase">
                  {user?.role || 'Staff'}
                </p>
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={handleLogout}
            title={isCollapsed ? t('auth.logout') : undefined}
            className={[
              'w-full flex items-center justify-center gap-2 py-2 text-xs font-semibold',
              'text-red-400 bg-red-950/30 hover:bg-red-900/50 active:bg-red-900/70',
              'rounded-xl transition-colors border border-red-800/30',
              isCollapsed ? 'px-0' : 'px-3',
            ].join(' ')}
          >
            <LogOut className="w-3.5 h-3.5" />
            {!isCollapsed && <span>{t('auth.logout')}</span>}
          </button>

          {!isCollapsed && (
            <p className="mt-2 text-[10px] text-slate-500 text-center font-mono">
              {BRAND.name} Admin v{APP_VERSION}
            </p>
          )}
        </div>
      </aside>
    </>
  )
}
