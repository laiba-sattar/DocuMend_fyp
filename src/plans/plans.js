/**
 * plans.js — the three plans, in one place.
 *
 * The Pricing page, the Settings page and the code that enforces the limits
 * all read from here, so a plan cannot promise on one screen what it refuses
 * on another. The names are the same three the database stores
 * (api/prisma/schema.prisma, `enum Tier`): BASIC, PREMIUM, ENTERPRISE. The
 * old page called them Starter / Pro / Enterprise, which matched nothing.
 *
 * `available: false` marks a line that describes work not yet built. It is
 * shown greyed and labelled, never as if it already worked — a pricing page
 * that lists unbuilt features is just a prettier version of the fake
 * dashboard this project has been clearing out.
 */
import { FileText, ShieldCheck, Sparkles } from 'lucide-react';

export const TIER_ORDER = ['BASIC', 'PREMIUM', 'ENTERPRISE'];

/** Is `tier` at least `minimum`? The same test the API guard makes. */
export function meetsTier(tier, minimum) {
  return TIER_ORDER.indexOf(tier ?? 'BASIC') >= TIER_ORDER.indexOf(minimum);
}

/**
 * What each plan actually allows. These numbers are enforced —
 * see plans/limits.js — not decoration.
 */
export const LIMITS = {
  BASIC: { documents: 10, autoVersions: 10 },
  PREMIUM: { documents: Infinity, autoVersions: 50 },
  ENTERPRISE: { documents: Infinity, autoVersions: 200 },
};

export const limitsFor = (tier) => LIMITS[tier] ?? LIMITS.BASIC;

export const PLANS = [
  {
    id: 'BASIC',
    name: 'Basic',
    eyebrow: 'For finding your rhythm',
    description: 'Everything DocuMend can do today, for one writer and a handful of documents.',
    price: { monthly: 0, annual: 0 },
    suffix: 'free, always',
    icon: FileText,
    tone: 'light',
    features: [
      { label: '10 documents', available: true },
      { label: 'The full editor: import, export, find and replace', available: true },
      { label: 'All eight writing checks, running on your own computer', available: true },
      { label: 'Version history, last 10 automatic saves per document', available: true },
      { label: 'Your document list on every device you sign in to', available: true },
    ],
  },
  {
    id: 'PREMIUM',
    name: 'Premium',
    eyebrow: 'For work worth polishing',
    description: 'For a thesis that runs to chapters, and the version history to prove it.',
    price: { monthly: 14, annual: 10 },
    suffix: 'per month',
    icon: Sparkles,
    tone: 'featured',
    recommended: true,
    features: [
      { label: 'Unlimited documents', available: true },
      { label: 'Version history, last 50 automatic saves per document', available: true },
      { label: 'Everything in Basic', available: true },
      { label: 'Reference checking against CrossRef and Semantic Scholar', available: false },
      { label: 'APA, MLA and IEEE citation repair', available: false },
      { label: 'Encrypted sync, so a whole document opens on another computer', available: false },
    ],
  },
  {
    id: 'ENTERPRISE',
    name: 'Enterprise',
    eyebrow: 'For careful teams',
    description: 'A shared standard for a department: one house style, one set of rules.',
    price: { monthly: null, annual: null },
    suffix: 'talk to us',
    icon: ShieldCheck,
    tone: 'dark',
    features: [
      { label: 'Everything in Premium', available: true },
      { label: 'Version history, last 200 automatic saves per document', available: true },
      { label: 'Shared templates across a department', available: false },
      { label: 'Sharing and comments between accounts', available: false },
      { label: 'Single sign-on', available: false },
    ],
  },
];

export const planFor = (tier) => PLANS.find((plan) => plan.id === tier) ?? PLANS[0];
