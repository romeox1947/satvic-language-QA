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
    name: 'Satvic Flute',
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
      { label: '', features: [
        { id: 'founder-mind', label: 'Founder Mind', icon: 'focus' },
        { id: 'ideas', label: 'Ideas & Opportunities', icon: 'plus' },
        { id: 'research', label: 'Research Intelligence', icon: 'book' },
        { id: 'projects', label: 'Projects & Execution', icon: 'projects' },
        { id: 'people', label: 'People & Resources', icon: 'home' },
        { id: 'meetings', label: 'Meetings & Decisions', icon: 'decisions' },
        { id: 'voice', label: 'Founder Voice', icon: 'notes' },
        { id: 'memory', label: 'Organisational Memory', icon: 'roadmap' },
      ] },
    ],
  },
];

export function getProduct(productId: string) {
  return products.find(product => product.id === productId);
}
