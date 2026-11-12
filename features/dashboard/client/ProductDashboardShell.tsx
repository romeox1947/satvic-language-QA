'use client';

import { useEffect, useRef, useState, type MouseEvent, type ReactNode } from 'react';
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
  const [featureRailCollapsed, setFeatureRailCollapsed] = useState(false);
  const [productMenuOpen, setProductMenuOpen] = useState(false);
  const productHoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [activeFeatureId, setActiveFeatureId] = useState(initialFeatureId ?? product.groups[0].features[1]?.id ?? product.groups[0].features[0].id);

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
    setActiveFeatureId(feature.id);
    onFeatureSelect?.(feature.id);
    setNavOpen(false);
  };

  const clearProductHoverTimer = () => {
    if (productHoverTimer.current) clearTimeout(productHoverTimer.current);
    productHoverTimer.current = null;
  };
  const openProductRail = (event: MouseEvent<HTMLElement>) => {
    if (event.target instanceof Element && event.target.closest('.rail-account')) return;
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
    router.prefetch('/dashboard');
    products.forEach(item => router.prefetch(item.href));
  }, [router]);

  const navigateToProduct = (href: string) => {
    clearProductHoverTimer();
    setProductMenuOpen(false);
    router.push(href);
  };

  const accountName = accountEmail
    ? accountEmail.split('@')[0].replace(/[._-]+/g, ' ').replace(/\b\w/g, letter => letter.toUpperCase())
    : 'Account';
  const workspaceName = accountName === 'Account' ? 'Satvic Workspace' : `${accountName}'s Workspace`;

  return (
    <main className={`app-shell${productRailCollapsed ? ' product-rail-collapsed' : ''}${featureRailCollapsed ? ' feature-rail-collapsed' : ''}${hideFeatureNavigation ? ' dashboard-home-shell' : ''}`}>
      <nav className={`product-rail${productMenuOpen ? ' product-rail-expanded' : ''}`} aria-label="Satvic products" onMouseEnter={openProductRail} onMouseLeave={closeProductRail} onFocusCapture={event => {
        if (event.target instanceof Element && event.target.closest('.rail-account')) {
          clearProductHoverTimer();
          setProductMenuOpen(false);
          return;
        }
        clearProductHoverTimer();
        setProductMenuOpen(true);
      }}>
        <button type="button" className={`rail-workspace${hideFeatureNavigation ? ' active' : ''}`} aria-label="Satvic Organisation workspace" onClick={() => navigateToProduct('/dashboard')} title="Satvic Organisation">
          <span className="rail-workspace-mark"><span className="brand-mark"><img className="satvic-org-mark" src="https://satvicmovement.org/images/favicon.png" alt="" aria-hidden="true" /></span></span>
        </button>
        <div className="rail-product-list" aria-label="Products">
          {products.map(item => <button key={item.id} type="button" aria-current={!hideFeatureNavigation && item.id === productId ? 'page' : undefined} className={`rail-product${!hideFeatureNavigation && item.id === productId ? ' active' : ''}`} onClick={() => navigateToProduct(item.href)} title={item.name}>
            <span className="rail-product-icon">{item.id === 'satvic-fluid' ? <AudioLines size={19} /> : <Building2 size={19} />}</span>
          </button>)}
        </div>
        <div className="rail-spacer" />
        <button type="button" className="rail-account" aria-label="Open account menu" aria-haspopup="menu" aria-expanded={accountMenuOpen} onMouseEnter={() => { clearProductHoverTimer(); setProductMenuOpen(false); }} onClick={() => { clearProductHoverTimer(); setProductMenuOpen(false); setAccountMenuOpen(open => !open); }} title={accountName}>
          <span className="account-trigger-avatar">{(accountName.slice(0, 1) || 'U').toUpperCase()}</span>
        </button>
        <section className="product-drawer" aria-label="Organisation and product switcher">
          <button type="button" className={`drawer-workspace${hideFeatureNavigation ? ' active' : ''}`} onClick={() => navigateToProduct('/dashboard')}>
            <span className="rail-workspace-mark"><span className="brand-mark"><img className="satvic-org-mark" src="https://satvicmovement.org/images/favicon.png" alt="" aria-hidden="true" /></span></span>
            <span><b>Satvic Organisation</b><small>{workspaceName}</small></span><ChevronDown size={15}/>
          </button>
          <div className="drawer-product-list" aria-label="Products">
            {products.map(item => <button key={item.id} type="button" aria-current={!hideFeatureNavigation && item.id === productId ? 'page' : undefined} className={`drawer-product${!hideFeatureNavigation && item.id === productId ? ' active' : ''}`} onClick={() => navigateToProduct(item.href)}>
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

      {accountMenuOpen && <div className="account-menu account-menu-rail" role="menu"><button role="menuitem" onClick={() => {setAccountMenuOpen(false);onNotice('Account settings are ready for this workspace.')}}><Settings size={18} /><span>Settings</span></button><button role="menuitem" onClick={() => {setAccountMenuOpen(false);onNotice(`Support for ${product.name} is ready.`)}}><CircleHelp size={18} /><span>Support</span></button><form action={signOut}><button role="menuitem" type="submit" className="account-logout"><LogOut size={18} /><span>Logout</span></button></form></div>}

      <section className="main-area">
        <header className="topbar"><button className="icon-btn menu-trigger" onClick={() => setNavOpen(true)} aria-label="Open navigation"><Menu size={19} /></button></header>
        <div className="content-wrap">{children}</div>
      </section>
    </main>
  );
}
