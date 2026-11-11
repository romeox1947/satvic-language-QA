export type ProductId = 'satvic-fluid' | 'founder-office';

export type ProductFeature = {
  id: string;
  label: string;
  icon: 'plus' | 'workflow' | 'projects' | 'review' | 'languages' | 'book' | 'settings' | 'home' | 'focus' | 'decisions' | 'notes' | 'roadmap';
  action?: 'create';
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
      { label: 'REVIEW', features: [
        { id: 'start-review', label: 'Start a review', icon: 'plus', action: 'create' },
        { id: 'qa-workflow', label: 'QA workflow', icon: 'workflow' },
        { id: 'recent-projects', label: 'Recent projects', icon: 'projects' },
        { id: 'review-queue', label: 'Review queue', icon: 'review' },
      ] },
      { label: 'LANGUAGE TOOLS', features: [
        { id: 'languages', label: 'Languages', icon: 'languages' },
        { id: 'term-library', label: 'Term library', icon: 'book' },
        { id: 'qa-settings', label: 'QA settings', icon: 'settings' },
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
