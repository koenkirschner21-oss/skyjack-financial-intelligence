import React, { useEffect, useRef, useState } from 'react';
import {
  BarChart3,
  Bell,
  ChevronsUpDown,
  Compass,
  FileCheck2,
  FileSpreadsheet,
  Globe2,
  History,
  LayoutDashboard,
  Lock,
  LogOut,
  MessageSquare,
  PanelLeftClose,
  PanelLeftOpen,
  Settings,
  ShieldAlert,
  Ship,
  Sliders,
  UploadCloud,
  X,
} from 'lucide-react';
import {
  PLANTS,
  REGIONS,
  REPORTING_PERIODS,
} from '../../data/caseSeed';
import { useAuth } from '../../context/AuthContext';
import { DEMO_CAD_TO_USD_RATE } from '../../domain/currencyService';
import { useApp } from '../../context/AppContext';
import { AppNotification, CurrencyCode, QuarterId, RegionId, RoutePath } from '../../types/domain';
import { SkyjackLogo } from '../brand/SkyjackLogo';
import { AskSkyjackModal } from '../intelligence/AskSkyjackModal';
import { Layer2HeaderContext } from './Layer2HeaderContext';
import { RecordDetailDrawer } from './RecordDetailDrawer';

type NavGroup = 'Workspace' | 'Operations' | 'Intelligence' | 'Governance';

interface NavItem {
  route: RoutePath;
  label: string;
  group: NavGroup;
  icon: React.ComponentType<{ className?: string }>;
}

const NAV_ITEMS: NavItem[] = [
  { route: '/overview', label: 'Overview', group: 'Workspace', icon: LayoutDashboard },
  { route: '/global-operations', label: 'Global Operations', group: 'Workspace', icon: Globe2 },
  { route: '/financials', label: 'Financial Intelligence', group: 'Operations', icon: BarChart3 },
  { route: '/trade', label: 'Shipments & Trade', group: 'Operations', icon: Ship },
  { route: '/simulator', label: 'Tariff Simulator', group: 'Operations', icon: Sliders },
  { route: '/investigations', label: 'Investigations', group: 'Intelligence', icon: ShieldAlert },
  { route: '/opportunities', label: 'Cost Opportunities', group: 'Intelligence', icon: Compass },
  { route: '/reports', label: 'Report Studio', group: 'Intelligence', icon: FileSpreadsheet },
  { route: '/data-gateway', label: 'Data Gateway', group: 'Governance', icon: UploadCloud },
  { route: '/approvals', label: 'Approvals', group: 'Governance', icon: FileCheck2 },
  { route: '/audit', label: 'Audit History', group: 'Governance', icon: History },
];

const NAV_GROUPS: NavGroup[] = ['Workspace', 'Operations', 'Intelligence', 'Governance'];

const ROUTE_TITLES: Record<RoutePath, string> = {
  '/overview': 'Overview',
  '/global-operations': 'Global Operations',
  '/financials': 'Financial Intelligence',
  '/trade': 'Shipments & Trade',
  '/simulator': 'Tariff Simulator',
  '/investigations': 'Investigations',
  '/opportunities': 'Cost Opportunities',
  '/reports': 'Report Studio',
  '/data-gateway': 'Data Gateway',
  '/approvals': 'Approvals',
  '/audit': 'Audit History',
  '/settings': 'Settings',
};

function cleanJobTitle(rawTitle: string): string {
  return rawTitle.replace(/\s*\(Demo\)$/i, '').trim();
}

function formatNotificationTime(iso: string): string {
  const ts = Date.parse(iso);
  if (Number.isNaN(ts)) return '';
  const diffSec = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (diffSec < 60) return 'Just now';
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
  return new Date(ts).toLocaleDateString('en-CA', { month: 'short', day: 'numeric' });
}

export const AppShell: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const {
    currentRoute,
    navigate,
    state,
    activeUser,
    setQuarterFilter,
    setRegionFilter,
    setPlantFilter,
    setCurrencyPreference,
    setSidebarCollapsed,
    visibleNotifications,
    unreadNotificationCount,
    markNotificationRead,
    markAllNotificationsRead,
    dismissNotification,
    clearAllNotifications,
    openRecordById,
    setAskModalOpen,
    canViewRoute,
    actionBanner,
    dismissBanner,
  } = useApp();

  const { signOut } = useAuth();
  const sidebarCollapsed = state.sidebarCollapsed;
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [currencyNoticeOpen, setCurrencyNoticeOpen] = useState(false);
  const [layer2HeaderNode, setLayer2HeaderNode] = useState<HTMLDivElement | null>(null);

  const notificationsRef = useRef<HTMLDivElement>(null);
  const currencyRef = useRef<HTMLDivElement>(null);
  const profileRef = useRef<HTMLDivElement>(null);

  const activeTitle = ROUTE_TITLES[currentRoute] ?? 'Overview';
  const activeTitleSub = cleanJobTitle(activeUser.title);

  useEffect(() => {
    const handleMouseDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (notificationsOpen && notificationsRef.current && !notificationsRef.current.contains(target)) {
        setNotificationsOpen(false);
      }
      if (currencyNoticeOpen && currencyRef.current && !currencyRef.current.contains(target)) {
        setCurrencyNoticeOpen(false);
      }
      if (profileMenuOpen && profileRef.current && !profileRef.current.contains(target)) {
        setProfileMenuOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setNotificationsOpen(false);
        setCurrencyNoticeOpen(false);
        setProfileMenuOpen(false);
        setMobileNavOpen(false);
      }
    };

    document.addEventListener('mousedown', handleMouseDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleMouseDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [notificationsOpen, currencyNoticeOpen, profileMenuOpen]);

  const handleNotificationClick = (notif: AppNotification) => {
    markNotificationRead(notif.id);
    setNotificationsOpen(false);
    if (notif.route) {
      navigate(notif.route);
    }
    if (notif.targetRecordId) {
      openRecordById(notif.targetRecordId);
    }
  };

  const showLayer2Filters =
    currentRoute !== '/overview' &&
    currentRoute !== '/reports' &&
    currentRoute !== '/data-gateway' &&
    currentRoute !== '/approvals' &&
    currentRoute !== '/audit' &&
    currentRoute !== '/settings';

  return (
    <Layer2HeaderContext.Provider value={layer2HeaderNode}>
      <div className="min-h-screen flex bg-[#F5F6F7] text-[#231F20]">
        {/* Mobile Sidebar Backdrop */}
        {mobileNavOpen && (
          <div
            className="fixed inset-0 z-40 bg-[#231F20]/45 lg:hidden"
            onClick={() => setMobileNavOpen(false)}
          />
        )}

        {/* Sticky Enterprise Sidebar (#231F20) */}
        <aside
          className={`fixed inset-y-0 left-0 z-40 lg:sticky lg:top-0 lg:h-screen flex flex-col bg-[#231F20] text-white border-r border-white/[0.08] transition-[width,transform] duration-200 shrink-0 print:hidden ${
            sidebarCollapsed ? 'lg:w-[70px]' : 'lg:w-[244px]'
          } ${mobileNavOpen ? 'translate-x-0 w-[244px]' : '-translate-x-full lg:translate-x-0'}`}
        >
          {/* Top-Left SKYJACK Branding */}
          <div
            className={`border-b border-white/[0.08] shrink-0 flex items-center ${
              sidebarCollapsed ? 'flex-col justify-center gap-2 py-3 px-2' : 'h-[72px] px-5 justify-between'
            }`}
          >
            <button
              type="button"
              onClick={() => navigate('/overview')}
              className="text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E53C2E] rounded cursor-pointer"
              aria-label="SKYJACK Overview"
            >
              <SkyjackLogo variant="dark-sidebar" collapsed={sidebarCollapsed} />
            </button>

            <button
              type="button"
              onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
              className="hidden lg:inline-flex p-1.5 text-[#9EA1A4] hover:text-white rounded-md hover:bg-white/[0.06] transition-colors cursor-pointer"
              aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            >
              {sidebarCollapsed ? <PanelLeftOpen className="w-4 h-4" /> : <PanelLeftClose className="w-4 h-4" />}
            </button>

            <button
              type="button"
              onClick={() => setMobileNavOpen(false)}
              className="lg:hidden p-1.5 text-[#9EA1A4] hover:text-white rounded-md cursor-pointer"
              aria-label="Close navigation"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Grouped Navigation */}
          <nav className="flex-1 overflow-y-auto py-3 px-2.5 space-y-4" aria-label="Main navigation">
            {NAV_GROUPS.map((group) => {
              const items = NAV_ITEMS.filter((item) => item.group === group);
              return (
                <div key={group}>
                  {!sidebarCollapsed && (
                    <div className="px-2.5 mb-1 text-[11px] font-medium tracking-[0.02em] text-[#8E9195]">
                      {group}
                    </div>
                  )}
                  <div className="space-y-0.5">
                    {items.map((item) => {
                      const Icon = item.icon;
                      const isActive = currentRoute === item.route;
                      const allowed = canViewRoute(item.route);

                      return (
                        <button
                          key={item.route}
                          type="button"
                          onClick={() => {
                            navigate(item.route);
                            setMobileNavOpen(false);
                          }}
                          title={
                            sidebarCollapsed
                              ? allowed
                                ? item.label
                                : `${item.label} (Restricted for ${activeTitleSub})`
                              : !allowed
                                ? `Restricted for ${activeTitleSub}`
                                : undefined
                          }
                          aria-current={isActive ? 'page' : undefined}
                          className={`group w-full flex items-center ${
                            sidebarCollapsed ? 'justify-center px-2' : 'justify-between px-2.5'
                          } gap-2 py-1.5 rounded-md text-[13px] transition-colors duration-150 cursor-pointer whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E53C2E] ${
                            isActive
                              ? 'bg-white/[0.10] text-white font-medium ring-1 ring-white/[0.08]'
                              : allowed
                                ? 'text-[#C8CACD] hover:text-white hover:bg-white/[0.05]'
                                : 'text-[#7E8082] hover:text-[#A8AAAC] hover:bg-white/[0.04]'
                          }`}
                        >
                          <span className="flex items-center gap-2.5 min-w-0">
                            <Icon
                              className={`w-4 h-4 shrink-0 transition-colors ${
                                isActive
                                  ? 'text-[#E53C2E]'
                                  : allowed
                                    ? 'text-[#8E9195] group-hover:text-white'
                                    : 'text-[#6A6C6F]'
                              }`}
                            />
                            {!sidebarCollapsed && <span className="truncate">{item.label}</span>}
                          </span>
                          {!sidebarCollapsed && !allowed && (
                            <Lock className="w-3 h-3 text-[#6A6C6F] shrink-0" aria-hidden="true" />
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </nav>

          {/* Anchored Bottom-Left User Profile & Settings Icon */}
          <div ref={profileRef} className="relative border-t border-white/[0.08] p-2.5 shrink-0">
            <div
              className={`flex ${
                sidebarCollapsed ? 'flex-col items-center gap-1.5' : 'items-center gap-1'
              }`}
            >
              <button
                type="button"
                onClick={() => {
                  setProfileMenuOpen((v) => !v);
                  setNotificationsOpen(false);
                  setCurrencyNoticeOpen(false);
                }}
                aria-expanded={profileMenuOpen}
                aria-label={`Account menu for ${activeUser.name}`}
                title={sidebarCollapsed ? `${activeUser.name} · ${activeTitleSub}` : undefined}
                className={`${
                  sidebarCollapsed
                    ? 'w-9 h-9 justify-center p-1 order-2'
                    : 'flex-1 min-w-0 justify-between gap-2 px-2 py-1.5'
                } flex items-center rounded-md hover:bg-white/[0.06] transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E53C2E]`}
              >
                <span className="flex items-center gap-2.5 min-w-0">
                  <span className="w-7 h-7 rounded-md bg-[#343031] border border-white/[0.14] text-white text-[11px] font-semibold flex items-center justify-center shrink-0">
                    {activeUser.initials}
                  </span>
                  {!sidebarCollapsed && (
                    <span className="flex flex-col text-left min-w-0 leading-tight">
                      <span className="text-[13px] font-medium text-white truncate">{activeUser.name}</span>
                      <span className="text-[11px] text-[#9EA1A4] truncate">{activeTitleSub}</span>
                    </span>
                  )}
                </span>
                {!sidebarCollapsed && <ChevronsUpDown className="w-3.5 h-3.5 text-[#8E9195] shrink-0" />}
              </button>

              <button
                type="button"
                onClick={() => {
                  setProfileMenuOpen(false);
                  setMobileNavOpen(false);
                  navigate('/settings');
                }}
                aria-label="Settings"
                title="Settings"
                aria-current={currentRoute === '/settings' ? 'page' : undefined}
                className={`${
                  sidebarCollapsed ? 'w-9 h-9 order-1' : 'p-2'
                } inline-flex items-center justify-center rounded-md transition-colors cursor-pointer shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E53C2E] ${
                  currentRoute === '/settings'
                    ? 'bg-white/[0.12] text-[#E53C2E] ring-1 ring-white/[0.08]'
                    : 'text-[#9EA1A4] hover:text-white hover:bg-white/[0.06]'
                }`}
              >
                <Settings className="w-4 h-4" />
              </button>
            </div>

            {profileMenuOpen && (
              <div
                className={`absolute z-50 bg-white text-[#231F20] border border-[#E2E5E8] rounded-lg shadow-xl overflow-hidden ${
                  sidebarCollapsed
                    ? 'left-full bottom-2 ml-2 w-72'
                    : 'bottom-full left-2.5 right-2.5 mb-2'
                }`}
              >
                {/* Current Account Summary */}
                <div className="px-3.5 py-3 border-b border-[#E2E5E8] bg-[#F8F9FA]">
                  <div className="flex items-center gap-2.5">
                    <span className="w-8 h-8 rounded-md bg-[#231F20] text-white text-xs font-semibold flex items-center justify-center shrink-0">
                      {activeUser.initials}
                    </span>
                    <div className="min-w-0">
                      <div className="text-xs font-semibold text-[#231F20] truncate">{activeUser.name}</div>
                      <div className="text-[11px] text-[#5F6368] truncate">{activeTitleSub}</div>
                      <div className="text-[11px] text-[#7E8082] truncate">{activeUser.department}</div>
                    </div>
                  </div>
                </div>

                {/* Settings Link */}
                <div className="p-1.5 border-b border-[#E2E5E8]">
                  <button
                    type="button"
                    onClick={() => {
                      setProfileMenuOpen(false);
                      navigate('/settings');
                    }}
                    className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md text-xs font-medium text-[#231F20] hover:bg-[#F5F6F7] transition-colors cursor-pointer"
                  >
                    <Settings className="w-3.5 h-3.5 text-[#5F6368]" />
                    <span>Settings &amp; Preferences</span>
                  </button>
                </div>

                <div className="p-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      setProfileMenuOpen(false);
                      void signOut();
                    }}
                    className="w-full flex items-center gap-2 px-2.5 py-2 rounded-md text-xs font-medium text-[#231F20] hover:bg-[#F5F6F7] transition-colors cursor-pointer"
                  >
                    <LogOut className="w-3.5 h-3.5 text-[#5F6368]" />
                    <span>Sign out</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </aside>

        {/* Main Workspace Column */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Layer 1: Compact Global Utility Row */}
          <header className="sticky top-0 z-30 h-12 px-4 lg:px-6 bg-white/95 backdrop-blur-sm border-b border-[#E2E5E8] flex items-center justify-between gap-4 print:hidden">
            <div className="flex items-center gap-2.5 min-w-0">
              <button
                type="button"
                onClick={() => setMobileNavOpen(true)}
                className="lg:hidden p-1.5 text-[#5F6368] hover:text-[#231F20] rounded-md border border-[#E2E5E8] cursor-pointer"
                aria-label="Open navigation"
              >
                <PanelLeftOpen className="w-4 h-4" />
              </button>
              <span className="lg:hidden text-xs font-semibold text-[#231F20] truncate">
                {activeTitle}
              </span>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <div ref={currencyRef} className="relative">
                <button
                  type="button"
                  onClick={() => {
                    setCurrencyNoticeOpen((v) => !v);
                    setNotificationsOpen(false);
                    setProfileMenuOpen(false);
                  }}
                  className="px-2.5 py-1.5 text-xs font-mono font-medium tabular-nums text-[#231F20] bg-[#F5F6F7] hover:bg-[#ECEEF0] border border-[#E2E5E8] rounded-md transition-colors whitespace-nowrap cursor-pointer"
                  title={`Reporting currency (${state.currency})`}
                  aria-expanded={currencyNoticeOpen}
                >
                  {state.currency}
                </button>
                {currencyNoticeOpen && (
                  <div className="absolute right-0 mt-1.5 w-72 bg-white border border-[#E2E5E8] rounded-lg shadow-lg p-3.5 z-50 text-xs space-y-2.5">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-[#231F20]">Reporting Currency</span>
                      <button
                        type="button"
                        onClick={() => setCurrencyNoticeOpen(false)}
                        className="text-[#5F6368] hover:text-[#231F20] cursor-pointer"
                        aria-label="Close currency menu"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <div className="flex gap-1.5">
                      {(['CAD', 'USD'] as CurrencyCode[]).map((curr) => (
                        <button
                          key={curr}
                          type="button"
                          onClick={() => setCurrencyPreference(curr)}
                          className={`flex-1 py-1.5 rounded-md border text-xs font-medium cursor-pointer transition-colors ${
                            state.currency === curr
                              ? 'bg-[#231F20] text-white border-[#231F20]'
                              : 'bg-white text-[#5F6368] border-[#E2E5E8] hover:bg-[#F5F6F7]'
                          }`}
                        >
                          {curr}
                        </button>
                      ))}
                    </div>
                    <p className="text-[11px] text-[#5F6368] leading-relaxed">
                      Fixed reference rate for display conversion.
                    </p>
                    <div className="pt-1.5 border-t border-[#E2E5E8] flex items-center justify-between text-[11px] text-[#5F6368] tabular-nums">
                      <span>Reference FX rate</span>
                      <span className="font-mono text-[#231F20]">1 CAD = {DEMO_CAD_TO_USD_RATE.toFixed(2)} USD</span>
                    </div>
                  </div>
                )}
              </div>

              {/* Event-Driven Notification Centre */}
              <div ref={notificationsRef} className="relative">
                <button
                  type="button"
                  onClick={() => {
                    setNotificationsOpen((v) => !v);
                    setCurrencyNoticeOpen(false);
                    setProfileMenuOpen(false);
                  }}
                  className="relative p-1.5 text-[#5F6368] hover:text-[#231F20] bg-[#F5F6F7] hover:bg-[#ECEEF0] border border-[#E2E5E8] rounded-md transition-colors cursor-pointer"
                  aria-label={
                    unreadNotificationCount > 0
                      ? `Notifications (${unreadNotificationCount} unread)`
                      : 'Notifications'
                  }
                  title="Notifications"
                  aria-expanded={notificationsOpen}
                >
                  <Bell className="w-4 h-4" />
                  {unreadNotificationCount > 0 && (
                    <span className="absolute -top-1.5 -right-1.5 min-w-[16px] h-4 px-1 rounded-full bg-[#E53C2E] text-white text-[10px] font-mono tabular-nums flex items-center justify-center">
                      {unreadNotificationCount > 99 ? '99+' : unreadNotificationCount}
                    </span>
                  )}
                </button>

                {notificationsOpen && (
                  <div className="absolute right-0 mt-1.5 w-80 sm:w-96 bg-white border border-[#E2E5E8] rounded-lg shadow-lg z-50 overflow-hidden">
                    <div className="px-4 py-2.5 border-b border-[#E2E5E8] flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-[#231F20]">
                        Notifications
                        {unreadNotificationCount > 0 && (
                          <span className="ml-1.5 text-[11px] font-normal text-[#5F6368] tabular-nums">
                            ({unreadNotificationCount} unread)
                          </span>
                        )}
                      </span>
                      <div className="flex items-center gap-2.5 text-[11px]">
                        {unreadNotificationCount > 0 && (
                          <button
                            type="button"
                            onClick={markAllNotificationsRead}
                            className="text-[#231F20] font-medium hover:underline cursor-pointer"
                          >
                            Mark all read
                          </button>
                        )}
                        {visibleNotifications.length > 0 && (
                          <button
                            type="button"
                            onClick={clearAllNotifications}
                            className="text-[#5F6368] hover:text-[#231F20] cursor-pointer"
                          >
                            Clear
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="max-h-80 overflow-y-auto divide-y divide-[#E2E5E8]">
                      {visibleNotifications.length > 0 ? (
                        visibleNotifications.map((notif) => (
                          <div
                            key={notif.id}
                            className={`flex items-start gap-2.5 px-4 py-2.5 transition-colors ${
                              notif.read ? 'bg-white hover:bg-[#F8F9FA]' : 'bg-[#FFF9F8] hover:bg-[#F8F9FA]'
                            }`}
                          >
                            <button
                              type="button"
                              onClick={() => handleNotificationClick(notif)}
                              className="flex-1 min-w-0 text-left cursor-pointer"
                            >
                              <div className="flex items-center justify-between gap-2">
                                <span className="flex items-center gap-1.5 min-w-0">
                                  {!notif.read && (
                                    <span className="w-1.5 h-1.5 rounded-full bg-[#E53C2E] shrink-0" aria-hidden="true" />
                                  )}
                                  <span
                                    className={`text-xs truncate ${
                                      notif.read ? 'font-medium text-[#231F20]' : 'font-semibold text-[#231F20]'
                                    }`}
                                  >
                                    {notif.title}
                                  </span>
                                </span>
                                <span className="text-[11px] text-[#7E8082] whitespace-nowrap shrink-0 tabular-nums">
                                  {formatNotificationTime(notif.timestampIso)}
                                </span>
                              </div>
                              <div className="text-[11px] text-[#5F6368] mt-0.5 line-clamp-2">
                                {notif.description}
                              </div>
                            </button>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                dismissNotification(notif.id);
                              }}
                              aria-label={`Dismiss ${notif.title}`}
                              title="Dismiss notification"
                              className="p-1 text-[#9AA0A6] hover:text-[#231F20] rounded cursor-pointer shrink-0"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ))
                      ) : (
                        <div className="p-6 text-center space-y-1">
                          <p className="text-xs font-medium text-[#231F20]">No notifications</p>
                          <p className="text-[11px] text-[#5F6368] leading-relaxed">
                            Activity alerts appear here when files are imported, approvals change, investigations update, or reports are exported.
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
              <button
                type="button"
                onClick={() => {
                  setAskModalOpen(true);
                  setNotificationsOpen(false);
                  setCurrencyNoticeOpen(false);
                  setProfileMenuOpen(false);
                }}
                className="inline-flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-[#231F20] bg-[#F5F6F7] hover:bg-[#ECEEF0] border border-[#E2E5E8] rounded-md transition-colors whitespace-nowrap cursor-pointer"
              >
                <MessageSquare className="w-3.5 h-3.5 text-[#E53C2E]" />
                <span className="hidden sm:inline">Ask SKYJACK</span>
              </button>
            </div>
          </header>

          {/* Layer 2: Contextual Page Header & Functional Reporting Filters */}
          <div className="bg-white border-b border-[#E2E5E8] print:hidden">
            <div className="max-w-[1440px] w-full mx-auto px-4 lg:px-6 py-3 space-y-2.5">
              <div ref={setLayer2HeaderNode} className="empty:hidden" />

              {showLayer2Filters && (
                <div className="pt-2.5 border-t border-[#F0F1F3] flex flex-wrap items-center gap-2 text-xs">
                  <label className="inline-flex items-center gap-2 bg-[#F8F9FA] border border-[#E2E5E8] rounded-md px-2.5 py-1 text-[#5F6368] hover:border-[#C8CACD] focus-within:border-[#231F20] transition-colors">
                    <span className="text-[11px] font-medium text-[#5F6368]">Period</span>
                    <select
                      aria-label="Reporting period filter"
                      value={state.selectedQuarterId}
                      onChange={(e) => setQuarterFilter(e.target.value as QuarterId)}
                      className="bg-transparent text-xs font-semibold text-[#231F20] focus:outline-none cursor-pointer pr-0.5"
                    >
                      {REPORTING_PERIODS.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.label}
                        </option>
                      ))}
                    </select>
                  </label>

                  {currentRoute !== '/financials' && currentRoute !== '/simulator' && (
                    <label className="inline-flex items-center gap-2 bg-[#F8F9FA] border border-[#E2E5E8] rounded-md px-2.5 py-1 text-[#5F6368] hover:border-[#C8CACD] focus-within:border-[#231F20] transition-colors">
                      <span className="text-[11px] font-medium text-[#5F6368]">Region</span>
                      <select
                        aria-label="Region filter"
                        value={state.selectedRegionId}
                        onChange={(e) => setRegionFilter(e.target.value as RegionId)}
                        className="bg-transparent text-xs font-semibold text-[#231F20] focus:outline-none cursor-pointer pr-0.5"
                      >
                        <option value="all">All Regions</option>
                        {REGIONS.map((r) => (
                          <option key={r.id} value={r.id}>
                            {r.name}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}

                  {currentRoute !== '/financials' &&
                    currentRoute !== '/trade' &&
                    currentRoute !== '/simulator' &&
                    currentRoute !== '/investigations' && (
                    <label className="inline-flex items-center gap-2 bg-[#F8F9FA] border border-[#E2E5E8] rounded-md px-2.5 py-1 text-[#5F6368] hover:border-[#C8CACD] focus-within:border-[#231F20] transition-colors">
                      <span className="text-[11px] font-medium text-[#5F6368]">Plant</span>
                      <select
                        aria-label="Plant filter"
                        value={state.selectedPlantId}
                        onChange={(e) => setPlantFilter(e.target.value)}
                        className="bg-transparent text-xs font-semibold text-[#231F20] focus:outline-none cursor-pointer pr-0.5"
                      >
                        <option value="all">All Plants</option>
                        {PLANTS.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.code} · {p.name}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                </div>
              )}
            </div>
          </div>

          {actionBanner && (
            <div className="max-w-[1440px] w-full mx-auto px-4 lg:px-6 pt-3 print:hidden">
              <div className="bg-white border border-[#E2E5E8] rounded-md px-4 py-2 flex items-center justify-between gap-3 text-xs">
                <span className="text-[#231F20]">{actionBanner.message}</span>
                <button
                  type="button"
                  onClick={dismissBanner}
                  className="text-[#5F6368] hover:text-[#231F20] cursor-pointer"
                  aria-label="Dismiss notification"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}

          <main className="flex-1 px-4 lg:px-6 py-5 max-w-[1440px] w-full mx-auto">
            {children}
          </main>
        </div>

        <AskSkyjackModal />
        <RecordDetailDrawer />
      </div>
    </Layer2HeaderContext.Provider>
  );
};
