'use client';

// Dashboard shell — sidebar + topbar wrapping all authenticated pages.
//
// Owns:
//   - Sidebar collapse/expand state (desktop)
//   - Mobile drawer open/close state
//   - Active route highlight
//   - Language toggle (EN/AR with RTL flip)
//   - User chip + logout
//
// The shell is BILINGUAL and supports RTL via dir="rtl" on the root.
// When language is Arabic, the sidebar slides in from the right; otherwise
// from the left. lucide-react icons are mirror-safe so we don't have to flip
// them manually.
//
// The disabled nav items are visually present but non-functional. They show
// "Coming soon" on hover. This communicates the product roadmap to pilot
// users without breaking when they click.

import { useQuery } from '@tanstack/react-query';
import { getMyModulesControl } from '@/lib/modules/queries';
import { useState, useMemo } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Building2,
  BookUser,         // Investors
  LayoutDashboard,   // Home
  ClipboardList,     // Tasks
  Trophy,            // Challenges
  CalendarClock,     // Sessions
  PlaneTakeoff,      // Vacations
  CheckCircle2,      // Approvals
  BarChart3,         // Reports
  Target,            // KPIs
  Users,             // Users (admin)
  Settings,          // Settings
  Menu,
  Mail,
  X,
  ChevronLeft,
  ChevronRight,
  Globe,
  LogOut,
  type LucideIcon,
} from 'lucide-react';
import { useAuth } from '@/providers/auth-provider';
import { useLanguage } from '@/providers/language-provider';
import { NotificationBell } from '@/components/notifications/notification-bell';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { User, UserRole } from '@/types';

type NavItem = {
  id: string;
  href: string;
  icon: LucideIcon;
  labelEn: string;
  labelAr: string;
  enabled: boolean;
  roles?: UserRole[]; // if set, only these roles see the item
  module?: string;    // if set, only shown when this premium module is enabled
};

// One source of truth for the navigation. Add new modules here as they ship.
const NAV_ITEMS: NavItem[] = [
  { id: 'home', href: '/', icon: LayoutDashboard, labelEn: 'Dashboard', labelAr: 'الرئيسية', enabled: true },
  { id: 'investors', href: '/investors', icon: Building2, labelEn: 'Investors', labelAr: 'المستثمرون', enabled: true },
  { id: 'contacts', href: '/contacts', icon: BookUser, labelEn: 'Contacts', labelAr: 'جهات الاتصال', enabled: true },
  { id: 'tasks', href: '/tasks', icon: ClipboardList, labelEn: 'Tasks', labelAr: 'المهام', enabled: true },
  { id: 'challenges', href: '/challenges', icon: Trophy, labelEn: 'Challenges', labelAr: 'التحديات', enabled: true },
  { id: 'sessions', href: '/sessions', icon: CalendarClock, labelEn: 'Sessions', labelAr: 'الجلسات', enabled: true },
  { id: 'email', href: '/email', icon: Mail, labelEn: 'Email', labelAr: 'البريد', enabled: true, module: 'emails' },
  { id: 'surveys', href: '/surveys', icon: ClipboardList, labelEn: 'Surveys', labelAr: 'الاستبيانات', enabled: true, module: 'survey' },
  { id: 'vacations', href: '/vacations', icon: PlaneTakeoff, labelEn: 'Vacations', labelAr: 'الإجازات', enabled: true, module: 'vacations' },
  { id: 'approvals', href: '/approvals', icon: CheckCircle2, labelEn: 'Approvals', labelAr: 'الموافقات', enabled: true, module: 'approvals' },
  { id: 'reports', href: '/reports', icon: BarChart3, labelEn: 'Reports', labelAr: 'التقارير', enabled: false },
  { id: 'kpis', href: '/kpis', icon: Target, labelEn: 'KPIs', labelAr: 'مؤشرات الأداء', enabled: true, module: 'kpis', roles: ['admin', 'super_admin', 'pmo', 'pm'] },
  { id: 'users', href: '/users', icon: Users, labelEn: 'Users', labelAr: 'المستخدمون', enabled: true, roles: ['admin', 'super_admin', 'pmo'] },
  { id: 'settings', href: '/settings', icon: Settings, labelEn: 'Settings', labelAr: 'الإعدادات', enabled: false },
];

export function DashboardShell({
  user,
  children,
}: {
  user: User;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { logout } = useAuth();
  const { language, isRTL, setLanguage } = useLanguage();

  // Sidebar UI state. Desktop collapses inline; mobile uses a drawer overlay.
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  // Filter nav items by current user's role.
  const modulesCtl = useQuery({ queryKey: ['my-modules-control'], queryFn: getMyModulesControl });
  const moduleSettings = modulesCtl.data?.settings ?? {};
  const visibleNav = useMemo(
    () => NAV_ITEMS.filter((item) =>
      (!item.roles || item.roles.includes(user.role)) &&
      (!item.module || moduleSettings[item.module] === true)
    ),
    [user.role, moduleSettings]
  );

  // Which route is "active"? Exact match for /, prefix match for everything else.
  const isActive = (href: string) => {
    if (href === '/') return pathname === '/';
    return pathname === href || pathname.startsWith(href + '/');
  };

  async function handleLogout() {
    await logout();
    router.replace('/login?signedOut=1');
  }

  // The page title shown in the topbar — first matching enabled nav label.
  const currentLabel = useMemo(() => {
    const match = visibleNav.find((item) => isActive(item.href));
    return match ? (language === 'ar' ? match.labelAr : match.labelEn) : '';
  }, [visibleNav, pathname, language]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="min-h-screen bg-slate-50" dir={isRTL ? 'rtl' : 'ltr'}>
      {/* Mobile drawer overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/40 lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          'fixed top-0 z-40 flex h-screen flex-col bg-white border-slate-200 transition-all duration-200',
          isRTL ? 'right-0 border-l' : 'left-0 border-r',
          // Width: collapsed desktop = 4rem; expanded = 16rem; mobile uses 16rem when open
          collapsed ? 'w-16' : 'w-64',
          // Mobile: hide off-screen unless mobileOpen is true
          mobileOpen
            ? 'translate-x-0'
            : isRTL
            ? 'translate-x-full lg:translate-x-0'
            : '-translate-x-full lg:translate-x-0'
        )}
      >
        {/* Sidebar header — brand + collapse toggle */}
        <div className="flex h-16 items-center justify-between px-3 border-b border-slate-200">
          {!collapsed && (
            <div className="flex flex-col px-2 overflow-hidden">
              <span className="text-base font-semibold truncate">
                {language === 'ar' ? 'منصة RM' : 'RM Platform'}
              </span>
              <span className="text-xs text-slate-500 truncate">
                {language === 'ar' ? 'إدارة العلاقات' : 'Relationship Mgmt'}
              </span>
            </div>
          )}
          <button
            type="button"
            onClick={() => setCollapsed((c) => !c)}
            className="hidden lg:flex h-8 w-8 items-center justify-center rounded-md hover:bg-slate-100"
            aria-label="Toggle sidebar"
          >
            {collapsed
              ? (isRTL ? <ChevronLeft className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />)
              : (isRTL ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />)}
          </button>
        </div>

        {/* Nav items */}
        <nav className="flex-1 overflow-y-auto p-2">
          <ul className="space-y-1">
            {visibleNav.map((item) => {
              const Icon = item.icon;
              const active = isActive(item.href);
              const label = language === 'ar' ? item.labelAr : item.labelEn;

              if (!item.enabled) {
                return (
                  <li key={item.id}>
                    <div
                      title={language === 'ar' ? 'قريباً' : 'Coming soon'}
                      className={cn(
                        'flex items-center gap-3 rounded-md px-3 py-2 text-sm text-slate-400 cursor-not-allowed',
                        collapsed && 'justify-center'
                      )}
                    >
                      <Icon className="h-5 w-5 flex-shrink-0" />
                      {!collapsed && (
                        <>
                          <span className="flex-1 truncate">{label}</span>
                          <span className="text-[10px] uppercase rounded bg-slate-100 px-1.5 py-0.5">
                            {language === 'ar' ? 'قريباً' : 'Soon'}
                          </span>
                        </>
                      )}
                    </div>
                  </li>
                );
              }

              return (
                <li key={item.id}>
                  <Link
                    href={item.href}
                    onClick={() => setMobileOpen(false)}
                    className={cn(
                      'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                      collapsed && 'justify-center',
                      active
                        ? 'bg-slate-900 text-white hover:bg-slate-800'
                        : 'text-slate-700 hover:bg-slate-100'
                    )}
                  >
                    <Icon className="h-5 w-5 flex-shrink-0" />
                    {!collapsed && <span className="flex-1 truncate">{label}</span>}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        {/* User chip at the bottom */}
        <div className="border-t border-slate-200 p-3">
          {!collapsed ? (
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-slate-200 text-sm font-semibold text-slate-700">
                {user.name.charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">
                  {language === 'ar' ? user.nameAr || user.name : user.name}
                </div>
                <div className="text-xs text-slate-500 truncate">{user.role}</div>
              </div>
              <button
                type="button"
                onClick={handleLogout}
                className="flex h-8 w-8 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-700"
                aria-label="Logout"
                title={language === 'ar' ? 'تسجيل الخروج' : 'Logout'}
              >
                <LogOut className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={handleLogout}
              className="flex h-9 w-full items-center justify-center rounded-full bg-slate-200 text-sm font-semibold text-slate-700 hover:bg-slate-300"
              aria-label="Logout"
              title={user.name}
            >
              {user.name.charAt(0).toUpperCase()}
            </button>
          )}
        </div>
      </aside>

      {/* Main column */}
      <div
        className={cn(
          'flex min-h-screen flex-col transition-all duration-200',
          // Desktop: leave room for sidebar
          collapsed ? 'lg:ms-16' : 'lg:ms-64'
        )}
      >
        {/* Top bar — NOT sticky (per Q2) */}
        <header className="bg-white border-b border-slate-200">
          <div className="flex h-16 items-center justify-between px-4 lg:px-6">
            <div className="flex items-center gap-3">
              {/* Hamburger — mobile only */}
              <button
                type="button"
                className="lg:hidden flex h-9 w-9 items-center justify-center rounded-md hover:bg-slate-100"
                onClick={() => setMobileOpen(true)}
                aria-label="Open menu"
              >
                <Menu className="h-5 w-5" />
              </button>
              <h1 className="text-lg font-semibold text-slate-900">{currentLabel}</h1>
            </div>
            <div className="flex items-center gap-2">
              <NotificationBell />
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setLanguage(language === 'en' ? 'ar' : 'en')}
                className="gap-2"
              >
                <Globe className="h-4 w-4" />
                <span className="hidden sm:inline">{language === 'en' ? 'العربية' : 'English'}</span>
              </Button>
            </div>
          </div>
        </header>

        {/* Mobile drawer close button — visible while drawer is open */}
        {mobileOpen && (
          <button
            type="button"
            onClick={() => setMobileOpen(false)}
            className={cn(
              'fixed top-4 z-50 flex h-8 w-8 items-center justify-center rounded-md bg-white shadow lg:hidden',
              isRTL ? 'right-[14rem]' : 'left-[14rem]'
            )}
            aria-label="Close menu"
          >
            <X className="h-4 w-4" />
          </button>
        )}

        {/* Page content */}
        <main className="flex-1">
          {children}
        </main>
      </div>
    </div>
  );
}
