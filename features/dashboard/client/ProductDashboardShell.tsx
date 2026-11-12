'use client';

import { useCallback, useEffect, useRef, useState, type MouseEvent, type ReactNode } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Archive, ArrowRight, AudioLines, Bell, BookOpen, Brain, Building2, CalendarDays, Check, CheckCheck, ChevronDown,
  FileText, Globe2, LayoutDashboard, Lightbulb, ListChecks, LogOut, Menu, MessageSquare,
  PanelLeftClose,
  PanelLeftOpen, Plus, Settings, Settings2, X, type LucideIcon,
  Users,
} from 'lucide-react';
import { signOut } from '@/features/auth/server/actions';
import { getProduct, products, type ProductFeature, type ProductId } from '@/features/products/registry';
import { useFounderOfficePreference } from './useFounderOfficePreference';

const featureIcons: Record<ProductFeature['icon'], LucideIcon> = {
  plus: Plus,
  workflow: CheckCheck,
  projects: FileText,
  review: ListChecks,
  languages: Globe2,
  book: BookOpen,
  settings: Settings2,
  home: LayoutDashboard,
  focus: Check,
  decisions: CheckCheck,
  notes: FileText,
  roadmap: ListChecks,
  brain: Brain,
  voice: MessageSquare,
  meeting: CalendarDays,
  people: Users,
  idea: Lightbulb,
  memory: Archive,
};

type ProductDashboardShellProps = {
  productId: ProductId;
  accountEmail: string;
  onNotice: (message: string) => void;
  onFeatureSelect?: (featureId: string) => void;
  initialFeatureId?: string;
  hideFeatureNavigation?: boolean;
  children: ReactNode;
};

type DashboardNotification = { id: string; title: string; description: string; kind: string; createdAt: string; href: string };

export default function ProductDashboardShell({
  productId,
  accountEmail,
  onNotice,
  onFeatureSelect,
  initialFeatureId,
  hideFeatureNavigation = false,
  children,
}: ProductDashboardShellProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const product = getProduct(productId)!;
  const [navOpen, setNavOpen] = useState(false);
  const [productRailCollapsed, setProductRailCollapsed] = useState(false);
  const [featureRailCollapsed, setFeatureRailCollapsed] = useState(false);
  const [productMenuOpen, setProductMenuOpen] = useState(false);
  const productHoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [notificationOpen, setNotificationOpen] = useState(false);
  const [notifications, setNotifications] = useState<DashboardNotification[]>([]);
  const [notificationsLoading, setNotificationsLoading] = useState(false);
  const [notificationError, setNotificationError] = useState('');
  const [founderOfficeEnabled, setFounderOfficeEnabled] = useFounderOfficePreference(accountEmail);
  const [activeFeatureId, setActiveFeatureId] = useState(initialFeatureId ?? product.groups[0].features[1]?.id ?? product.groups[0].features[0].id);

  useEffect(() => {
    const requested = searchParams.get('feature') || (productId === 'satvic-fluid' && searchParams.has('qaRunId') ? 'start-review' : null);
    if (requested && product.groups.some(group => group.features.some(feature => feature.id === requested))) {
      setActiveFeatureId(requested);
      onFeatureSelect?.(requested);
    }
  }, [onFeatureSelect, product.groups, productId, searchParams]);

  useEffect(() => {
    if (!accountMenuOpen) return;
    const closeOnOutsideClick = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Element && !target.closest('.account-menu, .account-trigger, .rail-account, .rail-account-collapsed, .drawer-account')) setAccountMenuOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') setAccountMenuOpen(false); };
    document.addEventListener('pointerdown', closeOnOutsideClick);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsideClick);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [accountMenuOpen]);

  const chooseFeature = (feature: ProductFeature) => {
    setNotificationOpen(false);
    setActiveFeatureId(feature.id);
    onFeatureSelect?.(feature.id);
    setNavOpen(false);
  };

  const clearProductHoverTimer = () => {
    if (productHoverTimer.current) clearTimeout(productHoverTimer.current);
    productHoverTimer.current = null;
  };
  const openProductRail = (event: MouseEvent<HTMLElement>) => {
    if (event.target instanceof Element && event.target.closest('.rail-account, .rail-notifications')) return;
    clearProductHoverTimer();
    setProductMenuOpen(true);
  };
  const closeProductRail = () => {
    clearProductHoverTimer();
    productHoverTimer.current = setTimeout(() => setProductMenuOpen(false), 240);
  };

  useEffect(() => () => {
    if (productHoverTimer.current) clearTimeout(productHoverTimer.current);
  }, []);

  useEffect(() => {
    router.prefetch('/dashboard/satvic-fluid');
    products.forEach(item => router.prefetch(item.href));
  }, [router]);

  useEffect(() => {
    if (productId === 'founder-office' && !founderOfficeEnabled) router.replace('/dashboard/satvic-fluid');
  }, [founderOfficeEnabled, productId, router]);

  const navigateToProduct = (href: string) => {
    clearProductHoverTimer();
    setNotificationOpen(false);
    setProductMenuOpen(false);
    router.push(href);
  };

  const accountName = accountEmail
    ? accountEmail.split('@')[0].replace(/[._-]+/g, ' ').replace(/\b\w/g, letter => letter.toUpperCase())
    : 'Account';
  const workspaceName = accountName === 'Account' ? 'Satvic Studio Workspace' : `${accountName}'s Workspace`;
  const visibleProducts = products.filter(item => item.id !== 'founder-office' || founderOfficeEnabled);
  const visibleNotifications = notifications.filter(item => item.kind !== 'Founder Office' || founderOfficeEnabled);

  function toggleFounderOffice() {
    const nextEnabled = !founderOfficeEnabled;
    setFounderOfficeEnabled(nextEnabled);
    setAccountMenuOpen(false);
    if (!nextEnabled) {
      setNotifications(current => current.filter(item => item.kind !== 'Founder Office'));
      setNotificationOpen(false);
      if (productId === 'founder-office') router.replace('/dashboard/satvic-fluid');
    }
  }

  const loadNotifications = useCallback(async () => {
    setNotificationsLoading(true);
    try {
      const response = await fetch('/api/notifications', { cache: 'no-store' });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'Could not load notifications.');
      setNotifications(Array.isArray(body.notifications) ? body.notifications : []);
      setNotificationError('');
    } catch (error) {
      setNotificationError(error instanceof Error ? error.message : 'Could not load notifications.');
    } finally {
      setNotificationsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadNotifications();
    const timer = window.setInterval(() => { void loadNotifications(); }, 30_000);
    return () => window.clearInterval(timer);
  }, [loadNotifications]);

  async function followNotification(item: DashboardNotification) {
    setNotificationError('');
    try {
      const response = await fetch('/api/notifications', {
        method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: item.id }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || 'Could not remove this notification.');
      setNotifications(current => current.filter(notification => notification.id !== item.id));
      setNotificationOpen(false);
      router.push(item.href);
    } catch (error) {
      setNotificationError(error instanceof Error ? error.message : 'Could not remove this notification.');
    }
  }

  return (
    <main className={`app-shell product-${productId}${productRailCollapsed ? ' product-rail-collapsed' : ''}${featureRailCollapsed ? ' feature-rail-collapsed' : ''}${hideFeatureNavigation ? ' dashboard-home-shell' : ''}`}>
      <nav className={`product-rail${productMenuOpen ? ' product-rail-expanded' : ''}`} aria-label="Satvic products" onMouseEnter={openProductRail} onMouseLeave={closeProductRail} onFocusCapture={event => {
        if (event.target instanceof Element && event.target.closest('.rail-account, .rail-notifications')) {
          clearProductHoverTimer();
          setProductMenuOpen(false);
          return;
        }
        clearProductHoverTimer();
        setProductMenuOpen(true);
      }}>
        <div className="rail-workspace rail-workspace-static" aria-label="Satvic Studio workspace" title="Satvic Studio">
          <span className="rail-workspace-mark"><span className="brand-mark"><img className="satvic-org-mark" src="https://satvicmovement.org/images/favicon.png" alt="" aria-hidden="true" /></span></span>
        </div>
        <div className="rail-product-list" aria-label="Products">
          {visibleProducts.map(item => <button key={item.id} type="button" aria-current={!hideFeatureNavigation && item.id === productId ? 'page' : undefined} className={`rail-product${!hideFeatureNavigation && item.id === productId ? ' active' : ''}`} onClick={() => navigateToProduct(item.href)} title={item.name}>
            <span className="rail-product-icon">{item.id === 'satvic-fluid' ? <AudioLines size={19} /> : <Building2 size={19} />}</span>
          </button>)}
        </div>
        <div className="rail-spacer" />
        <button type="button" className="rail-notifications" aria-label={`Notifications, ${visibleNotifications.length} items`} aria-expanded={notificationOpen} title="Notifications" onMouseEnter={() => { clearProductHoverTimer(); setProductMenuOpen(false); }} onClick={() => { clearProductHoverTimer(); setProductMenuOpen(false); setAccountMenuOpen(false); setNotificationOpen(true); void loadNotifications(); }}>
          <Bell size={19}/>{visibleNotifications.length > 0 && <span>{visibleNotifications.length > 9 ? '9+' : visibleNotifications.length}</span>}
        </button>
        <button type="button" className="rail-account" aria-label="Open account menu" aria-haspopup="menu" aria-expanded={accountMenuOpen} onMouseEnter={() => { clearProductHoverTimer(); setProductMenuOpen(false); }} onClick={() => { clearProductHoverTimer(); setProductMenuOpen(false); setAccountMenuOpen(open => !open); }} title={accountName}>
          <span className="account-trigger-avatar">{(accountName.slice(0, 1) || 'U').toUpperCase()}</span>
        </button>
        <section className="product-drawer" aria-label="Satvic Studio and product switcher">
          <div className="drawer-workspace drawer-workspace-static">
            <span className="rail-workspace-mark"><span className="brand-mark"><img className="satvic-org-mark" src="https://satvicmovement.org/images/favicon.png" alt="" aria-hidden="true" /></span></span>
            <span><b>Satvic Studio</b><small>{workspaceName}</small></span>
          </div>
          <div className="drawer-product-list" aria-label="Products">
            {visibleProducts.map(item => <button key={item.id} type="button" aria-current={!hideFeatureNavigation && item.id === productId ? 'page' : undefined} className={`drawer-product${!hideFeatureNavigation && item.id === productId ? ' active' : ''}`} onClick={() => navigateToProduct(item.href)}>
              <span className="product-menu-icon">{item.id === 'satvic-fluid' ? <AudioLines size={19} /> : <Building2 size={19}/>}</span><span><b>{item.name}</b><small>{item.description}</small></span>
            </button>)}
          </div>
          <button type="button" className="drawer-account" aria-label="Open account menu" aria-haspopup="menu" aria-expanded={accountMenuOpen} onClick={() => setAccountMenuOpen(open => !open)}>
            <span className="account-trigger-avatar">{(accountName.slice(0, 1) || 'U').toUpperCase()}</span>
            <span>{accountName}</span>
            <ChevronDown size={16} />
          </button>
        </section>
      </nav>

      <aside className={`sidebar${navOpen ? ' sidebar-open' : ''}`}>
        {!hideFeatureNavigation && <><div className="workspace-heading"><div className="workspace-product">{product.name}</div><div className="workspace-heading-actions"><button className="sidebar-shrink icon-btn" onClick={() => {const collapse = !featureRailCollapsed;setFeatureRailCollapsed(collapse);setProductRailCollapsed(collapse);}} aria-label={featureRailCollapsed ? 'Expand navigation' : 'Collapse navigation'} title={featureRailCollapsed ? 'Expand navigation' : 'Collapse navigation'}>{featureRailCollapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}</button><button className="icon-btn mobile-close" onClick={() => setNavOpen(false)} aria-label="Close navigation"><X size={18} /></button></div></div>
        {product.groups.map(group => <div className="product-nav-group" key={group.label || product.id}>{group.label && <div className="nav-label nav-label-spaced">{group.label}</div>}<nav className="main-nav">{group.features.map(feature => {const Icon = featureIcons[feature.icon];return <button key={feature.id} title={feature.label} className={`nav-item${activeFeatureId === feature.id ? ' active' : ''}`} onClick={() => chooseFeature(feature)}><Icon size={18} /><span>{feature.label}</span></button>})}</nav></div>)}</>}
        <div className="sidebar-spacer" />
        {featureRailCollapsed && <button type="button" className="rail-account feature-rail-account" aria-label="Open account menu" aria-haspopup="menu" aria-expanded={accountMenuOpen} onClick={() => setAccountMenuOpen(open => !open)} title={accountName}><span className="account-trigger-avatar">{(accountName.slice(0, 1) || 'U').toUpperCase()}</span></button>}
      </aside>

      {accountMenuOpen && <div className="account-menu account-menu-rail" role="menu"><button role="menuitem" onClick={() => {setAccountMenuOpen(false);onNotice('Account settings are ready for this workspace.')}}><Settings size={18} /><span>Settings</span></button><button type="button" role="menuitemcheckbox" aria-checked={founderOfficeEnabled} className="account-product-toggle" onClick={toggleFounderOffice}><Building2 size={18} /><span>Founder Office</span><i className={`account-toggle-track${founderOfficeEnabled ? ' enabled' : ''}`} aria-hidden="true"><i /></i></button><form action={signOut}><button role="menuitem" type="submit" className="account-logout"><LogOut size={18} /><span>Logout</span></button></form></div>}

      <section className="main-area">
        <header className="topbar"><button className="icon-btn menu-trigger" onClick={() => setNavOpen(true)} aria-label="Open navigation"><Menu size={19} /></button></header>
        <div className="content-wrap">{notificationOpen ? <section className="notification-dashboard">
          <header className="notification-dashboard-header"><div><span className="section-kicker">SATVIC STUDIO</span><h1>Notifications</h1><p>Deadlines, completed reviews, and work that needs your attention.</p></div><button type="button" className="icon-btn" aria-label="Close notifications" onClick={() => setNotificationOpen(false)}><X size={18}/></button></header>
          {notificationError && <div className="notification-error"><span>{notificationError}</span><button type="button" onClick={() => void loadNotifications()}>Retry</button></div>}
          {notificationsLoading && visibleNotifications.length === 0 ? <div className="notification-empty">Loading notifications...</div> : visibleNotifications.length === 0 ? <div className="notification-empty"><Bell size={22}/><b>You are all caught up</b><span>New deadlines and completed video reviews will appear here.</span></div> : <div className="notification-list">{visibleNotifications.map(item => <article className="notification-card" key={item.id}>
            <div className="notification-card-copy"><div className="notification-card-meta"><span>{item.kind}</span><time>{new Date(item.createdAt).toLocaleString()}</time></div><h2>{item.title}</h2><p>{item.description}</p></div>
            <button type="button" className="notification-open" aria-label={`Open ${item.title}`} title="Open and remove notification" onClick={() => void followNotification(item)}><ArrowRight size={19}/></button>
          </article>)}</div>}
        </section> : children}</div>
      </section>
    </main>
  );
}
