'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import {
  AudioLines, BookOpen, Building2, Check, CheckCheck, ChevronDown, CircleHelp,
  FileText, Globe2, LayoutDashboard, ListChecks, LogOut, Menu, PanelLeftClose,
  PanelLeftOpen, Plus, Settings, Settings2, X, type LucideIcon,
} from 'lucide-react';
import { signOut } from '@/features/auth/server/actions';
import { getProduct, products, type ProductFeature, type ProductId } from '@/features/products/registry';

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
  const product = getProduct(productId)!;
  const [navOpen, setNavOpen] = useState(false);
  const [productRailCollapsed, setProductRailCollapsed] = useState(false);
  const [productMenuOpen, setProductMenuOpen] = useState(false);
  const productHoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [activeFeatureId, setActiveFeatureId] = useState(initialFeatureId ?? product.groups[0].features[1]?.id ?? product.groups[0].features[0].id);

  useEffect(() => {
    if (!accountMenuOpen) return;
    const closeOnOutsideClick = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Element && !target.closest('.account-menu, .account-trigger, .rail-account, .rail-account-collapsed')) setAccountMenuOpen(false);
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
    setActiveFeatureId(feature.id);
    onFeatureSelect?.(feature.id);
    setNavOpen(false);
  };

  const clearProductHoverTimer = () => {
    if (productHoverTimer.current) clearTimeout(productHoverTimer.current);
    productHoverTimer.current = null;
  };
  const openProductRail = () => {
    clearProductHoverTimer();
    try {
      const closedUntil = Number(sessionStorage.getItem('satvic-product-rail-closed-until') || 0);
      if (Date.now() < closedUntil) return;
      sessionStorage.removeItem('satvic-product-rail-closed-until');
    } catch { /* Storage may be unavailable; hover still works normally. */ }
    productHoverTimer.current = setTimeout(() => setProductMenuOpen(true), 100);
  };
  const closeProductRail = () => {
    clearProductHoverTimer();
    productHoverTimer.current = setTimeout(() => setProductMenuOpen(false), 180);
  };

  useEffect(() => () => {
    if (productHoverTimer.current) clearTimeout(productHoverTimer.current);
  }, []);

  const navigateToProduct = (href: string) => {
    clearProductHoverTimer();
    setProductMenuOpen(false);
    try { sessionStorage.setItem('satvic-product-rail-closed-until', String(Date.now() + 700)); } catch { /* Storage may be unavailable. */ }
    productHoverTimer.current = setTimeout(() => router.push(href), 240);
  };

  const accountName = accountEmail
    ? accountEmail.split('@')[0].replace(/[._-]+/g, ' ').replace(/\b\w/g, letter => letter.toUpperCase())
    : 'Account';
  const workspaceName = accountName === 'Account' ? 'Satvic Workspace' : `${accountName}'s Workspace`;

  return (
    <main className={`app-shell${productRailCollapsed ? ' product-rail-collapsed' : ''}${hideFeatureNavigation ? ' dashboard-home-shell' : ''}`}>
      <nav className={`product-rail${productMenuOpen ? ' product-rail-expanded' : ''}`} aria-label="Satvic products" onMouseEnter={openProductRail} onMouseLeave={closeProductRail} onFocusCapture={() => { clearProductHoverTimer(); setProductMenuOpen(true); }}>
        <button type="button" className="rail-workspace" aria-label="Satvic Organization workspace" onClick={() => navigateToProduct('/dashboard')}>
          <span className="rail-workspace-mark"><span className="brand-mark"><span /><span /><span /></span></span>
          <span className="rail-workspace-copy"><b>Satvic Organization</b><small>{workspaceName}</small></span>
          <ChevronDown size={15} />
        </button>
        <div className="rail-product-list" aria-label="Products">
          {products.map(item => <button key={item.id} type="button" aria-current={item.id === productId ? 'page' : undefined} className={`rail-product${item.id === productId ? ' active' : ''}`} onClick={() => navigateToProduct(item.href)} title={item.name}>
            <span className="rail-product-icon">{item.id === 'satvic-fluid' ? <AudioLines size={19} /> : <Building2 size={19} />}</span>
            <span className="rail-product-copy"><b>{item.name}</b><small>{item.description}</small></span>
          </button>)}
        </div>
        <div className="rail-spacer" />
        <button type="button" className="rail-account" aria-label="Open account menu" aria-haspopup="menu" aria-expanded={accountMenuOpen} onClick={() => setAccountMenuOpen(open => !open)} title={accountName}>
          <span className="account-trigger-avatar">{(accountName.slice(0, 1) || 'U').toUpperCase()}</span><span className="rail-account-copy">{accountName}</span><ChevronDown size={16} />
        </button>
      </nav>

      <aside className={`sidebar${navOpen ? ' sidebar-open' : ''}`}>
        {!hideFeatureNavigation && <><div className="workspace-heading"><div className="workspace-product">{product.name}</div><div className="workspace-heading-actions"><button className="sidebar-shrink icon-btn" onClick={() => setProductRailCollapsed(collapsed => !collapsed)} aria-label={productRailCollapsed ? 'Show product navigation' : 'Hide product navigation'} title={productRailCollapsed ? 'Show product navigation' : 'Hide product navigation'}>{productRailCollapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}</button><button className="icon-btn mobile-close" onClick={() => setNavOpen(false)} aria-label="Close navigation"><X size={18} /></button></div></div>
        {product.groups.map(group => <div className="product-nav-group" key={group.label || product.id}>{group.label && <div className="nav-label nav-label-spaced">{group.label}</div>}<nav className="main-nav">{group.features.map(feature => {const Icon = featureIcons[feature.icon];return <button key={feature.id} className={`nav-item${activeFeatureId === feature.id ? ' active' : ''}`} onClick={() => chooseFeature(feature)}><Icon size={18} /><span>{feature.label}</span></button>})}</nav></div>)}</>}
        <div className="sidebar-spacer" />
      </aside>

      {accountMenuOpen && <div className="account-menu account-menu-rail" role="menu"><button role="menuitem" onClick={() => {setAccountMenuOpen(false);onNotice('Account settings are ready for this workspace.')}}><Settings size={18} /><span>Settings</span></button><button role="menuitem" onClick={() => {setAccountMenuOpen(false);onNotice(`Support for ${product.name} is ready.`)}}><CircleHelp size={18} /><span>Support</span></button><form action={signOut}><button role="menuitem" type="submit" className="account-logout"><LogOut size={18} /><span>Logout</span></button></form></div>}

      <section className="main-area">
        <header className="topbar"><button className="icon-btn menu-trigger" onClick={() => setNavOpen(true)} aria-label="Open navigation"><Menu size={19} /></button></header>
        <div className="content-wrap">{children}</div>
      </section>
    </main>
  );
}
