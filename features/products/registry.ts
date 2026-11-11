export type ProductId = 'satvic-fluid' | 'founder-office';

export type ProductFeature = {
  id: string;
  label: string;
  icon: 'plus' | 'workflow' | 'projects' | 'review' | 'languages' | 'book' | 'settings' | 'home' | 'focus' | 'decisions' | 'notes' | 'roadmap';
};

export type ProductDefinition = {
  id: ProductId;
  name: string;
  description: string;
  href: string;
  groups: { label: string; features: ProductFeature[] }[];
};

export const products: ProductDefinition[] = [
  {
    id: 'satvic-fluid',
    name: 'Satvic Fluid',
    description: 'Language QA',
    href: '/dashboard/satvic-fluid',
    groups: [
      { label: '', features: [
        { id: 'generate-sarvam', label: 'Generate with Sarvam', icon: 'plus' },
        { id: 'start-review', label: 'Start a review', icon: 'workflow' },
      ] },
    ],
  },
  {
    id: 'founder-office',
    name: 'Founder Office',
    description: 'Founder workspace',
    href: '/dashboard/founder-office',
    groups: [
      { label: 'OFFICE', features: [
        { id: 'founder-overview', label: 'Office overview', icon: 'home' },
        { id: 'priorities', label: 'Priorities', icon: 'focus' },
        { id: 'decisions', label: 'Decisions', icon: 'decisions' },
        { id: 'meeting-notes', label: 'Meeting notes', icon: 'notes' },
      ] },
      { label: 'PLANNING', features: [
        { id: 'roadmap', label: 'Roadmap', icon: 'roadmap' },
      ] },
    ],
  },
];

export function getProduct(productId: string) {
  return products.find(product => product.id === productId);
}
