'use client';

import { useEffect, useState, type ReactNode } from 'react';
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
  children: ReactNode;
};

export default function ProductDashboardShell({
  productId,
  accountEmail,
  onNotice,
  onFeatureSelect,
  initialFeatureId,
  children,
}: ProductDashboardShellProps) {
  const router = useRouter();
  const product = getProduct(productId)!;
  const [navOpen, setNavOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [productMenuOpen, setProductMenuOpen] = useState(false);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [activeFeatureId, setActiveFeatureId] = useState(initialFeatureId ?? product.groups[0].features[1]?.id ?? product.groups[0].features[0].id);

  useEffect(() => {
    if (!accountMenuOpen) return;
    const closeOnOutsideClick = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Element && !target.closest('.account-menu, .account-trigger, .rail-account-collapsed')) setAccountMenuOpen(false);
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

  return (
    <main className={`app-shell${sidebarCollapsed ? ' sidebar-collapsed' : ''}`}>
      <nav className="product-rail" aria-label="Satvic products">
        <div className="rail-brand" aria-label="Satvic"><div className="brand-mark"><span /><span /><span /></div></div>
        {sidebarCollapsed && <button className="rail-expand" onClick={() => setSidebarCollapsed(false)} aria-label="Expand product navigation" title="Expand navigation"><PanelLeftOpen size={18} /></button>}
        <div className="product-switcher" onMouseEnter={() => setProductMenuOpen(true)} onMouseLeave={() => setProductMenuOpen(false)}>
          <button className="rail-product active" aria-label="Open product switcher" aria-haspopup="menu" aria-expanded={productMenuOpen} onClick={() => setProductMenuOpen(true)} onFocus={() => setProductMenuOpen(true)} title={product.name}>
            {productId === 'satvic-fluid' ? <AudioLines size={19} /> : <Building2 size={19} />}
          </button>
          {productMenuOpen && <div className="product-menu" role="menu"><div className="product-menu-label">YOUR PRODUCTS</div>{products.map(item => <button key={item.id} role="menuitemradio" aria-checked={item.id === productId} className={`product-menu-item${item.id === productId ? ' active' : ''}`} onClick={() => {setProductMenuOpen(false);router.push(item.href)}}><span className="product-menu-icon">{item.id === 'satvic-fluid' ? <AudioLines size={17} /> : <Building2 size={17} />}</span><span><b>{item.name}</b><small>{item.description}</small></span>{item.id === productId && <Check size={16} />}</button>)}</div>}
        </div>
        <div className="rail-spacer" />
        {sidebarCollapsed && <button type="button" className="profile-avatar rail-account-collapsed" aria-label="Open account menu" aria-expanded={accountMenuOpen} onClick={() => setAccountMenuOpen(open => !open)} title={accountEmail || 'Account'}>{(accountEmail.slice(0, 1) || 'U').toUpperCase()}</button>}
      </nav>

      <aside className={`sidebar${navOpen ? ' sidebar-open' : ''}`}>
        <div className="workspace-heading"><div className="workspace-product">{product.name}</div><div className="workspace-heading-actions"><button className="sidebar-shrink icon-btn" onClick={() => setSidebarCollapsed(true)} aria-label="Collapse product navigation" title="Collapse navigation"><PanelLeftClose size={18} /></button><button className="icon-btn mobile-close" onClick={() => setNavOpen(false)} aria-label="Close navigation"><X size={18} /></button></div></div>
        {product.groups.map(group => <div className="product-nav-group" key={group.label || product.id}>{group.label && <div className="nav-label nav-label-spaced">{group.label}</div>}<nav className="main-nav">{group.features.map(feature => {const Icon = featureIcons[feature.icon];return <button key={feature.id} className={`nav-item${activeFeatureId === feature.id ? ' active' : ''}`} onClick={() => chooseFeature(feature)}><Icon size={18} /><span>{feature.label}</span></button>})}</nav></div>)}
        <div className="sidebar-spacer" />
        <button type="button" className="account-trigger" aria-label="Open account menu" aria-haspopup="menu" aria-expanded={accountMenuOpen} onClick={() => setAccountMenuOpen(open => !open)}><span className="account-trigger-avatar">{(accountEmail.slice(0, 1) || 'U').toUpperCase()}</span><span className="account-trigger-name">{accountEmail || 'Account'}</span><ChevronDown size={17} /></button>
      </aside>

      {accountMenuOpen && <div className={`account-menu${sidebarCollapsed ? ' account-menu-collapsed' : ''}`} role="menu"><button role="menuitem" onClick={() => {setAccountMenuOpen(false);onNotice('Account settings are ready for this workspace.')}}><Settings size={18} /><span>Settings</span></button><button role="menuitem" onClick={() => {setAccountMenuOpen(false);onNotice(`Support for ${product.name} is ready.`)}}><CircleHelp size={18} /><span>Support</span></button><form action={signOut}><button role="menuitem" type="submit" className="account-logout"><LogOut size={18} /><span>Logout</span></button></form></div>}

      <section className="main-area">
        <header className="topbar"><button className="icon-btn menu-trigger" onClick={() => setNavOpen(true)} aria-label="Open navigation"><Menu size={19} /></button></header>
        <div className="content-wrap">{children}</div>
      </section>
    </main>
  );
}
