/*
================================================================================
  PAGE OVERVIEW: Pricing.jsx (DocuMend Pricing & Plans Page)
================================================================================
  Purpose:
  - Displays subscription plans (Starter, Pro, Enterprise) with monthly/annual toggles.
  - Integrates the global WorkspaceChrome shell (Sidebar, Topbar, Drawers, Modals)
    for seamless navigation across DocuMend.
  - Highlights local-first privacy guarantees, testimonials, and trust badges.
================================================================================
*/

import { useEffect, useState } from "react";

// Lucide React Icons: UI elements, badges, navigation, and features
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  LockKeyhole,
  Clock,
  Sparkles,
  Zap,
} from "lucide-react";

// Workspace Shell Components: Shared across Dashboard, Version History, and Pricing
import {
  MobileDrawer,
  MobileTopbar,
  Sidebar,
  WorkspaceHeader,
  WorkspaceModal,
} from '../components/WorkspaceChrome';

// Navigation Helpers: Route mappings and custom client-side router
import { BrandMark } from '../components/BrandMark';
import { workspaceRoutes } from '../components/workspace-nav';
import { useTheme } from '../components/ThemeContext';
import { navigate, usePathname } from '../router';

// Custom CSS for pricing tier cards, illustrations, and dark mode overrides
import { useAuth } from '../components/AuthContext';
import { PLANS, limitsFor, meetsTier } from '../plans/plans';
import { documentAllowance } from '../plans/limits';

import "./pricing.css";

/* ==========================================================================
   2. SUB-COMPONENTS
   ========================================================================== */

// The local mark is gone; the logo comes from components/BrandMark.jsx.

function RepairIllustration() {
  return (
    <svg
      className="pricing-illustration"
      viewBox="0 0 470 185"
      role="img"
      aria-label="A document being gently repaired"
    >
      <path
        className="pricing-illustration-line"
        d="M12 151c44-28 57-97 113-108 57-12 79 48 134 49 58 1 72-49 144-30"
      />
      <g transform="translate(62 28) rotate(-6 80 65)">
        <rect className="pricing-paper" width="164" height="123" rx="11" />
        <path className="pricing-paper-fold" d="M131 0h22a11 11 0 0 1 11 11v20z" />
        <rect x="19" y="22" width="83" height="9" rx="4.5" fill="#e8992e" />
        <rect x="19" y="47" width="123" height="6" rx="3" fill="#c0d2c6" />
        <rect x="19" y="63" width="104" height="6" rx="3" fill="#c0d2c6" />
        <rect x="19" y="79" width="122" height="6" rx="3" fill="#c0d2c6" />
        <rect x="19" y="99" width="61" height="8" rx="4" fill="#de6a50" opacity=".85" />
      </g>
      <g transform="translate(287 28) rotate(8)">
        <rect width="122" height="92" rx="10" fill="#f0bd5c" />
        <rect x="16" y="18" width="63" height="7" rx="3.5" fill="#fff6de" />
        <rect x="16" y="38" width="88" height="5" rx="2.5" fill="#fff6de" opacity=".83" />
        <rect x="16" y="52" width="71" height="5" rx="2.5" fill="#fff6de" opacity=".83" />
        <circle cx="96" cy="73" r="11" fill="#21483e" />
        <path d="m90 73 4 5 9-10" fill="none" stroke="#f0bd5c" strokeWidth="2.6" />
      </g>
      <path className="pricing-pencil" d="m211 130 29-48 13 8-29 48-18 7z" />
      <path className="pricing-pencil-tip" d="m211 130 13 8-18 7z" />
      <circle className="pricing-sparkle sparkle-one" cx="392" cy="20" r="4" />
      <circle className="pricing-sparkle sparkle-two" cx="31" cy="62" r="3" />
      <path className="pricing-star" d="m438 132 3 8 8 3-8 3-3 8-3-8-8-3 8-3z" />
    </svg>
  );
}

function PlanIcon({ icon: Icon }) {
  return (
    <span className="pricing-plan-icon" aria-hidden="true">
      <Icon size={19} strokeWidth={2.1} />
    </span>
  );
}

/**
 * One plan. `yours` marks the plan the signed-in account is actually on, which
 * is the single most useful thing a pricing page can tell someone who already
 * has an account — and the thing this page never used to say.
 */
function PlanCard({ plan, isAnnual, yours, signedIn, onChoose }) {
  const Icon = plan.icon;
  const displayPrice = isAnnual ? plan.price.annual : plan.price.monthly;
  const savings =
    plan.price.monthly && isAnnual
      ? Math.round((1 - plan.price.annual / plan.price.monthly) * 100)
      : 0;

  return (
    <article className={`pricing-plan pricing-plan-${plan.tone} ${yours ? 'is-yours' : ''}`}>
      {yours ? (
        <div className="pricing-recommended pricing-yours">
          <CheckCircle2 size={13} />
          Your plan
        </div>
      ) : plan.recommended && (
        <div className="pricing-recommended">
          <Sparkles size={13} />
          Most room for a long document
        </div>
      )}

      <div className="pricing-plan-top">
        <div className="pricing-plan-heading">
          <PlanIcon icon={Icon} />
          <div>
            <p className="pricing-plan-eyebrow">{plan.eyebrow}</p>
            <h2>{plan.name}</h2>
          </div>
        </div>
        <p className="pricing-plan-description">{plan.description}</p>
        
        <div className="pricing-price-row">
          {displayPrice === null ? (
            <span className="pricing-custom-price">Let&apos;s talk</span>
          ) : (
            <>
              <span className="pricing-currency">$</span>
              <span className="pricing-price">{displayPrice}</span>
            </>
          )}
          <span className="pricing-price-suffix">{plan.suffix}</span>
        </div>

        {savings > 0 && (
          <span className="pricing-savings">
            Save {savings}% with annual billing
          </span>
        )}
      </div>

      <div className="pricing-plan-divider" />

      <div className="pricing-feature-heading">
        <span>Includes</span>
        <Icon size={14} />
      </div>
      {/* A line that is not built yet is shown greyed and labelled, never as
          though it already worked. */}
      <ul className="pricing-feature-list">
        {plan.features.map((feature) => (
          <li key={feature.label} className={feature.available ? '' : 'is-coming'}>
            {feature.available
              ? <Check size={15} strokeWidth={2.6} />
              : <Clock size={15} strokeWidth={2.2} />}
            <span>
              {feature.label}
              {!feature.available && <em className="pricing-coming-tag">not built yet</em>}
            </span>
          </li>
        ))}
      </ul>

      <button
        className="pricing-plan-button"
        type="button"
        disabled={yours}
        onClick={() => onChoose(plan)}
      >
        {yours
          ? 'This is your plan'
          : plan.price.monthly === null
            ? 'Talk to us'
            : !signedIn && plan.id === 'BASIC'
              // Nobody "moves to" the free plan from outside; they start on it.
              ? 'Start free'
              : `Move to ${plan.name}`}
        {!yours && <ArrowRight size={16} />}
      </button>
    </article>
  );
}

/* ==========================================================================
   3. MAIN PRICING COMPONENT
   ========================================================================== */
export default function Pricing() {
  const pathname = usePathname();
  const cameFromWorkspace = pathname === "/subscription";
  const backHref = cameFromWorkspace ? "/dashboard" : "/";
  const backLabel = cameFromWorkspace ? "Back to Dashboard" : "Back to DocuMend";

  // Global Shared Theme Context
  const { darkMode, toggleDarkMode } = useTheme();

  // Page Local State
  const [isAnnual, setIsAnnual] = useState(true);
  const [toast, setToast] = useState("");

  // The plan this account is actually on, and how much of it is used up.
  const { tier, isSignedIn } = useAuth();
  const currentPlan = PLANS.find((plan) => plan.id === tier) ?? PLANS[0];
  const [allowance, setAllowance] = useState(null);
  useEffect(() => {
    let alive = true;
    documentAllowance().then((report) => { if (alive) setAllowance(report); }).catch(() => {});
    return () => { alive = false; };
  }, [tier]);

  // Workspace Chrome Shell States
  const [activeNav, setActiveNav] = useState('Subscription');
  const [privacyMode, setPrivacyMode] = useState(true);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileSidebar, setMobileSidebar] = useState(false);
  const [modal, setModal] = useState(null);

  const notify = (message) => {
    setToast(message);
    window.setTimeout(() => setToast(""), 2800);
  };

  const selectNav = (label) => {
    const route = workspaceRoutes?.[label];
    if (route && label !== 'Subscription' && label !== 'Pricing') {
      navigate(route);
      return;
    }
    if (label === 'Dashboard') return navigate('/dashboard');
    if (label === 'Editor') return navigate('/editor');
    if (label === 'Version history') return navigate('/version');
    if (label === 'Features') return navigate('/features');
    if (label === 'Settings') return navigate('/settings');
    if (label === 'Help and Guide') return navigate('/help');
    if (label === 'Storage') return navigate('/storage');
    if (label === 'Share Document') return navigate('/share');

    setActiveNav(label);
    if (label !== 'Subscription' && label !== 'Pricing') notify(`${label} view selected`);
    setMobileSidebar(false);
  };

  const handleLogout = () => {
    setModal(null);
    navigate('/');
  };

  /**
   * There is no payment system in this build, so this button does not pretend
   * to take money. Saying which plan, which price, and what is still missing is
   * more use than a cheerful message that changes nothing.
   */
  const handleChoose = (plan) => {
    if (plan.id === 'BASIC') {
      if (!isSignedIn) return navigate('/signup');
      notify('Basic is the free plan. Nothing to pay, nothing to switch.');
      return;
    }
    if (plan.price.monthly === null) {
      notify('Enterprise is arranged by hand. There is no sign-up for it yet.');
      return;
    }
    const price = isAnnual ? `$${plan.price.annual}/month billed annually` : `$${plan.price.monthly}/month`;
    notify(`${plan.name} would be ${price}. Payments are not connected in this build, so plans cannot be changed here yet.`);
  };

  return (
    <div className={`dash-shell ${darkMode ? 'dash-dark' : ''}`}>
      <MobileTopbar
        onMenu={() => setMobileSidebar(true)}
        onThemeToggle={toggleDarkMode}
        darkMode={darkMode}
      />

      <Sidebar
        activeNav={activeNav}
        onNavigate={selectNav}
        privacyMode={privacyMode}
        onPrivacyToggle={() => {
          setPrivacyMode((prev) => !prev);
          notify(`Privacy mode ${privacyMode ? 'paused' : 'enabled'}`);
        }}
        darkMode={darkMode}
        onThemeToggle={toggleDarkMode}
        onLogout={() => setModal('logout')}
        collapsed={sidebarCollapsed}
        onToggleCollapse={() => setSidebarCollapsed((prev) => !prev)}
      />

      <MobileDrawer
        open={mobileSidebar}
        onClose={() => setMobileSidebar(false)}
        activeNav={activeNav}
        onNavigate={selectNav}
        onPrivacyToggle={() => setPrivacyMode((prev) => !prev)}
        onLogout={() => setModal('logout')}
      />

      <main className={`dash-main ${sidebarCollapsed ? 'is-wide' : ''}`}>
        <WorkspaceHeader onAnnounce={notify} />

        <div className="pricing-shell">
          <div className="pricing-orb pricing-orb-one" aria-hidden="true" />
          <div className="pricing-orb pricing-orb-two" aria-hidden="true" />

          {/* Top Return Header */}
          <header className="pricing-header">
            <button
              className="pricing-back"
              type="button"
              onClick={() => navigate(backHref)}
            >
              <ArrowLeft size={15} />
              {backLabel}
            </button>
            <BrandMark size={29} />
            <span className="pricing-header-note">
              <LockKeyhole size={13} />
              Private by default
            </span>
          </header>

          {/* Hero Section */}
          <section className="pricing-intro" aria-labelledby="pricing-title">
            <div className="pricing-kicker">
              <span className="pricing-kicker-rule" />
              Simple plans for serious words
              <span className="pricing-kicker-rule" />
            </div>
            <h1 id="pricing-title">
              Put the <em>good</em> back in your drafts.
            </h1>
            <p>
              DocuMend quietly repairs the structure, references, and small distractions
              that get between your thinking and the page.
            </p>
            <RepairIllustration />
          </section>

          {/* Billing Frequency Switcher */}
          <section className="pricing-controls" aria-label="Billing frequency">
            <div className="pricing-billing-copy">
              <span className="pricing-billing-label">Choose your pace</span>
              <span className="pricing-billing-detail">Change anytime. No vanishing footnotes.</span>
            </div>
            <div className="pricing-billing-toggle" role="group" aria-label="Choose monthly or annual billing">
              <button
                className={!isAnnual ? "pricing-billing-active" : ""}
                type="button"
                aria-pressed={!isAnnual}
                onClick={() => setIsAnnual(false)}
              >
                Monthly
              </button>
              <button
                className={isAnnual ? "pricing-billing-active" : ""}
                type="button"
                aria-pressed={isAnnual}
                onClick={() => setIsAnnual(true)}
              >
                Annual
                <span>Save 29%</span>
              </button>
            </div>
          </section>

          {/* Pricing Cards Grid */}
          <section className="pricing-plans" aria-label="DocuMend plans">
            {PLANS.map((plan) => (
              <PlanCard key={plan.id} plan={plan} isAnnual={isAnnual} yours={isSignedIn && plan.id === tier} signedIn={isSignedIn} onChoose={handleChoose} />
            ))}
          </section>

          {/* Baseline Features Included in All Plans */}
          <section className="pricing-every-plan" aria-label="Included with every plan">
            <div className="pricing-every-plan-title">
              <span className="pricing-mini-mark"><Zap size={14} /></span>
              <div>
                <p>Every plan includes</p>
                <strong>The calm parts are standard.</strong>
              </div>
            </div>
            <div className="pricing-every-plan-items">
              <span><CheckCircle2 size={15} /> The checks run on your own computer</span>
              <span><CheckCircle2 size={15} /> Your writing is never used to train anything</span>
              <span><CheckCircle2 size={15} /> Export to Word, PDF or plain text, any time</span>
            </div>
          </section>

          {/* Testimonial & Local-First Promise Grid */}
          <section className="pricing-lower-grid" aria-label="Why writers choose DocuMend">
            {/* What used to be here: a quotation from "Nadia Chen, PhD
                candidate", a claim of 12,400 users, and a 14-day free trial.
                None of the three existed. A page asking for money is the last
                place to invent evidence, so it now shows the one true thing
                this reader might want — where they stand on their own plan. */}
            <article className="pricing-reassurance">
              <span className="pricing-reassurance-label">Where you stand</span>
              {isSignedIn ? (
                <>
                  <h2 className="pricing-usage-title">
                    You are on the {currentPlan.name} plan.
                  </h2>
                  <p className="pricing-usage-line">
                    {allowance
                      ? allowance.allowed === Infinity
                        ? `${allowance.used} ${allowance.used === 1 ? 'document' : 'documents'} in this browser, with no limit on your plan.`
                        : `${allowance.used} of ${allowance.allowed} documents used.`
                      : 'Counting your documents…'}
                  </p>

                  {allowance && allowance.allowed !== Infinity && (
                    <div className="pricing-usage-meter">
                      <span style={{ width: `${Math.min(100, (allowance.used / allowance.allowed) * 100)}%` }} />
                    </div>
                  )}

                  <p className="pricing-usage-note">
                    Version history on this plan keeps the last{' '}
                    {limitsFor(tier).autoVersions} automatic saves of each document.
                    Versions you save by hand are never removed.
                  </p>

                  <div className="pricing-trust-bits">
                    <span><LockKeyhole size={14} /> Your documents stay in this browser</span>
                    <button type="button" onClick={() => navigate('/settings')}>
                      Manage your account <ArrowRight size={14} />
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <h2 className="pricing-usage-title">Basic is free, and it is the whole editor.</h2>
                  <p className="pricing-usage-line">
                    Ten documents, every writing check, import and export, version history.
                    No card, because there is nothing to pay.
                  </p>
                  <div className="pricing-trust-bits">
                    <span><LockKeyhole size={14} /> Your documents stay in your browser</span>
                    <button type="button" onClick={() => navigate('/signup')}>
                      Create an account <ArrowRight size={14} />
                    </button>
                  </div>
                </>
              )}
            </article>

            <aside className="pricing-promise-card" aria-label="DocuMend privacy promise">
              <div className="pricing-promise-orbit pricing-promise-orbit-one" aria-hidden="true" />
              <div className="pricing-promise-orbit pricing-promise-orbit-two" aria-hidden="true" />
              {/* A "DOCUMEND / 001 ✓ VERIFIED" certification stamp used to sit
                  here, and a "signed with care" signature block below. Nothing
                  verified or signed anything; they were the visual language of
                  an audit this project has never had. The promise underneath is
                  true on its own and does not need a badge to vouch for it. */}
              <div className="pricing-promise-icon"><LockKeyhole size={22} /></div>
              <p className="pricing-promise-kicker">The DocuMend promise</p>
              <h2>Your words stay <em>yours.</em></h2>
              <p className="pricing-promise-copy">
                Private by design, thoughtful by default. Your documents are never
                used to train a model.
              </p>
              <div className="pricing-promise-signature">
                <span />
                <strong>Local-first editing</strong>
                <small>the checks run in your browser</small>
              </div>
            </aside>
          </section>

          {/* Page Footer */}
          <footer className="pricing-footer">
            <span><span className="pricing-footer-dot" /> DocuMend · A more considered way to write.</span>
            {/* Honest, and useful: it says why no plan can be bought yet. */}
            <span className="pricing-footer-note">
              Payments are not connected in this build, so plans cannot be changed here yet.
            </span>
          </footer>
        </div>
      </main>

      <WorkspaceModal
        mode={modal}
        onClose={() => setModal(null)}
        onSubmit={() => setModal(null)}
        onLogout={handleLogout}
      />

      {toast && (
        <div className="pricing-toast" role="status" aria-live="polite">
          <span className="pricing-toast-icon"><Check size={14} /></span>
          {toast}
        </div>
      )}
    </div>
  );
}