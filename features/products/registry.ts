export type ProductId = 'satvic-fluid' | 'founder-office';

export type ProductFeature = {
  id: string;
  label: string;
  icon: 'plus' | 'workflow' | 'projects' | 'review' | 'languages' | 'book' | 'settings' | 'home' | 'focus' | 'decisions' | 'notes' | 'roadmap' | 'brain' | 'voice' | 'meeting' | 'people' | 'idea' | 'memory';
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
        { id: 'overview', label: 'Overview', icon: 'home' },
        { id: 'founder-mind', label: 'Founder Mind', icon: 'brain' },
        { id: 'voice', label: 'Founder Voice', icon: 'voice' },
        { id: 'meetings', label: 'Meetings & Discussions', icon: 'meeting' },
        { id: 'people', label: 'People & Resources', icon: 'people' },
        { id: 'ideas', label: 'Ideas & Opportunities', icon: 'idea' },
        { id: 'projects', label: 'Project Execution', icon: 'workflow' },
        { id: 'memory', label: 'Organisational Memory', icon: 'memory' },
      ] },
    ],
  },
];

export function getProduct(productId: string) {
  return products.find(product => product.id === productId);
}
