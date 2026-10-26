// Daftar menu navigasi sidebar Pengguna (/app/*)
// Label diambil dari i18n key
export const NAV_MENU = [
  {
    key: 'dashboard',
    icon: 'LayoutDashboard',
    path: '/app',
    labelKey: 'nav.dashboard',
  },
  {
    key: 'whatsapp',
    icon: 'Smartphone',
    path: '/app/whatsapp',
    labelKey: 'nav.whatsapp',
  },
  {
    key: 'earnings',
    icon: 'DollarSign',
    path: '/app/earnings',
    labelKey: 'nav.earnings',
  },
  {
    key: 'team',
    icon: 'Users',
    path: '/app/team',
    labelKey: 'nav.team',
  },
]

// Daftar menu navigasi sidebar Administrator (/admin/*) dikelompokkan dengan grup
export const ADMIN_NAV_GROUPS = [
  {
    groupKey: 'adminNav.groupSummary',
    items: [
      {
        key: 'admin-dashboard',
        icon: 'LayoutDashboard',
        path: '/admin',
        labelKey: 'adminNav.dashboard',
      },
    ],
  },
  {
    groupKey: 'adminNav.groupManagement',
    items: [
      {
        key: 'admin-users',
        icon: 'Users',
        path: '/admin/users',
        labelKey: 'adminNav.users',
      },
      {
        key: 'admin-campaigns',
        icon: 'Send',
        path: '/admin/campaigns',
        labelKey: 'adminNav.campaigns',
      },
      {
        key: 'admin-devices',
        icon: 'Smartphone',
        path: '/admin/devices',
        labelKey: 'adminNav.devices',
      },
    ],
  },
  {
    groupKey: 'adminNav.groupFinance',
    items: [
      {
        key: 'admin-withdrawals',
        icon: 'History',
        path: '/admin/withdrawals',
        labelKey: 'adminNav.withdrawals',
      },
      {
        key: 'admin-commissions',
        icon: 'DollarSign',
        path: '/admin/commissions',
        labelKey: 'adminNav.commissions',
      },
      {
        key: 'admin-packages',
        icon: 'Package',
        path: '/admin/packages',
        labelKey: 'adminNav.packages',
      },
    ],
  },
  {
    groupKey: 'adminNav.groupContent',
    items: [
      {
        key: 'admin-announcements',
        icon: 'Megaphone',
        path: '/admin/announcements',
        labelKey: 'adminNav.announcements',
      },
      {
        key: 'admin-templates',
        icon: 'FileText',
        path: '/admin/templates',
        labelKey: 'adminNav.templates',
      },
    ],
  },
  {
    groupKey: 'adminNav.groupSystem',
    items: [
      {
        key: 'admin-settings',
        icon: 'Settings',
        path: '/admin/settings',
        labelKey: 'adminNav.settings',
      },
      {
        key: 'admin-integration',
        icon: 'Webhook',
        path: '/admin/integration',
        labelKey: 'adminNav.integration',
      },
      {
        key: 'admin-logs',
        icon: 'Activity',
        path: '/admin/logs',
        labelKey: 'adminNav.logs',
      },
      {
        key: 'admin-profile',
        icon: 'Shield',
        path: '/admin/profile',
        labelKey: 'adminNav.profile',
      },
    ],
  },
]

// Versi flattened untuk kompatibilitas
export const ADMIN_NAV_MENU = ADMIN_NAV_GROUPS.flatMap(g => g.items)

// Daftar bahasa yang didukung
export const SUPPORTED_LANGUAGES = [
  { code: 'id', label: 'Indonesia', dir: 'ltr' },
  { code: 'en', label: 'English', dir: 'ltr' },
  { code: 'zh', label: '中文', dir: 'ltr' },
  { code: 'ar', label: 'العربية', dir: 'rtl' },
  { code: 'th', label: 'ไทย', dir: 'ltr' },
  { code: 'fil', label: 'Filipino', dir: 'ltr' },
]

// Pengumuman dummy – setiap item punya id, tipe, dan teks per bahasa (kunci i18n)
// Tipe: 'info' | 'warning' | 'success'
export const ANNOUNCEMENTS = [
  {
    id: 'ann-1',
    type: 'warning',
    i18nKey: 'announcements.maintenance',
  },
  {
    id: 'ann-2',
    type: 'success',
    i18nKey: 'announcements.newFeature',
  },
  {
    id: 'ann-3',
    type: 'info',
    i18nKey: 'announcements.tipBanned',
  },
  {
    id: 'ann-4',
    type: 'success',
    i18nKey: 'announcements.promo',
  },
  {
    id: 'ann-5',
    type: 'info',
    i18nKey: 'announcements.reminder',
  },
]

// Versi aplikasi
export const APP_VERSION = '1.0.0'

// LocalStorage keys
export const LS_LANG_KEY = 'afblast.lang'
export const LS_TZ_KEY = 'afblast.timezone'
export const LS_AUTH_KEY = 'afblast.auth'

// Fallback daftar timezone manual jika Intl.supportedValuesOf tidak tersedia
export const FALLBACK_TIMEZONES = [
  'Pacific/Midway',
  'America/Anchorage',
  'America/Los_Angeles',
  'America/Denver',
  'America/Chicago',
  'America/New_York',
  'America/Sao_Paulo',
  'Europe/London',
  'Europe/Paris',
  'Europe/Moscow',
  'Asia/Dubai',
  'Asia/Karachi',
  'Asia/Kolkata',
  'Asia/Dhaka',
  'Asia/Bangkok',
  'Asia/Jakarta',
  'Asia/Singapore',
  'Asia/Tokyo',
  'Asia/Seoul',
  'Australia/Sydney',
  'Pacific/Auckland',
]

// Data dummy kampanye untuk dashboard
export const DUMMY_CAMPAIGNS = [
  { id: 1, nameKey: 'dashboard.campaigns.promo', status: 'active', progress: 72 },
  { id: 2, nameKey: 'dashboard.campaigns.onboarding', status: 'completed', progress: 100 },
  { id: 3, nameKey: 'dashboard.campaigns.reminder', status: 'paused', progress: 45 },
  { id: 4, nameKey: 'dashboard.campaigns.flash', status: 'active', progress: 89 },
]
