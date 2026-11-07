import {
  FileText,
  Clock,
  Sparkles,
  Shield,
  HelpCircle,
  HardDrive,
  Share2,
  Cpu,
  Sliders,
} from 'lucide-react';

export const navPrimary = [
  { label: 'Dashboard', icon: FileText },
  { label: 'My documents', icon: FileText },
  { label: 'Editor', icon: FileText },
  // This carried `badge: '1'` — the literal string, on every page, for every
  // user, reading exactly like an unread count. There is nothing here to
  // count: the sidebar has no document in hand, so it cannot know how many
  // versions the one you are looking at has. A number that cannot be right is
  // worse than no number.
  { label: 'Version history', icon: Clock },
  { label: 'Subscription', icon: Sparkles },
];

export const navWorkspace = [
  { label: 'Features', icon: Cpu },
  { label: 'Privacy mode', icon: Shield },
  { label: 'Settings', icon: Sliders },
  { label: 'Help and Guide', icon: HelpCircle },
  { label: 'Storage', icon: HardDrive },
  { label: 'Share Document', icon: Share2 },
];

export const workspaceRoutes = {
  Dashboard: '/dashboard',
  'My documents': '/documents',
  Editor: '/editor',
  'Version history': '/version',
  Subscription: '/subscription',
  Pricing: '/pricing',
  Features: '/features',
  Settings: '/settings',
  'Help and Guide': '/help',
  Storage: '/storage',
  'Share Document': '/share', // <-- Add this line
};