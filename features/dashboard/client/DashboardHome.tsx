'use client';

import { useState } from 'react';
import { ArrowRight, AudioLines, Building2, CheckCheck, Clock3 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import ProductDashboardShell from './ProductDashboardShell';
import { products } from '@/features/products/registry';

export default function DashboardHome({ accountEmail }: { accountEmail: string }) {
  const router = useRouter();
  const [notice, setNotice] = useState('');

  return <ProductDashboardShell productId="satvic-fluid" accountEmail={accountEmail} onNotice={setNotice} hideFeatureNavigation>
    <section className="dashboard-home">
      <div className="dashboard-home-intro"><div className="section-kicker">SATVIC WORKSPACE</div><h1>Choose a product</h1><p>Open a workspace to continue where your team works.</p></div>
      <div className="dashboard-product-grid">
        {products.map(product => <button key={product.id} className="dashboard-product-card" onClick={() => router.push(product.href)}>
          <span className="dashboard-product-card-icon">{product.id === 'satvic-fluid' ? <AudioLines size={22} /> : <Building2 size={22} />}</span>
          <span className="dashboard-product-card-copy"><b>{product.name}</b><small>{product.description}</small></span>
          <ArrowRight className="dashboard-product-arrow" size={18} />
          <span className="dashboard-product-card-detail">{product.id === 'satvic-fluid' ? <><CheckCheck size={15} /> Generate and review dubbed content</> : <><Clock3 size={15} /> Priorities, decisions, notes, and plans</>}</span>
        </button>)}
      </div>
      {notice && <div className="toast"><span>{notice}</span><button onClick={() => setNotice('')} aria-label="Dismiss">×</button></div>}
    </section>
  </ProductDashboardShell>;
}
