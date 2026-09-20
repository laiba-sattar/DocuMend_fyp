/**
 * LandingPage — the marketing site at `/`, rendered as one long scrolling page.
 *
 * Layout of this file, top to bottom:
 *   1. Content data      — the testimonial and FAQ copy, kept out of the JSX.
 *   2. Scroll hooks      — useReveal (fade-in on scroll) and useParallax.
 *   3. Visual components — the mock "screenshots" that illustrate each feature.
 *   4. LandingPage       — the page itself: header, sections, footer.
 *
 * A note on the visuals: none of them render real data or images. Each one is
 * an abstract impression of the product built out of plain divs — coloured
 * bars stand in for text, blocks for panels. That keeps the page fast and
 * dependency-free, but it does mean the markup is deliberately meaningless.
 *
 * Styling comes from three places: utility classes in styles-utilities.css,
 * the hand-written component classes in landing-page.css, and Tailwind-style
 * arbitrary values inline (e.g. `bg-[#172d26]`).
 */
import { useEffect, useState } from 'react';
import './landing-page.css';
import { BrandMark as SharedBrandMark } from '../components/BrandMark';
import { navigate } from '../router';
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  CircleAlert,
  CircleHelp,
  FilePlus2,
  FileUp,
  FolderPlus,
  Instagram,
  LockKeyhole,
  Mail,
  Menu,
  MousePointer2,
  PanelRight,
  Phone,
  ScanSearch,
  ShieldCheck,
  Sparkles,
  Star,
  PencilLine,
  Wand2,
  X,
  Zap,
} from 'lucide-react';

/* ==========================================================================
   Content data
   ========================================================================== */

// NOTE: currently unused — nothing in the JSX below reads `featureData`. It is
// left over from an earlier three-column feature grid. Safe to delete, or to
// wire back up if that section returns.
const featureData = [
  {
    number: '01',
    icon: LockKeyhole,
    title: 'Private by default',
    description: 'Your words stay on your device. No training data, no hidden copies, no quiet trip to the cloud.',
    tag: 'local-first',
  },
  {
    number: '02',
    icon: ScanSearch,
    title: 'Logic, not just grammar',
    description: 'DocuMend reads for missing bridges, circular arguments, and paragraphs that arrived too early.',
    tag: 'deep reading',
  },
  {
    number: '03',
    icon: Wand2,
    title: 'A lighter edit',
    description: 'Cut repetition and filler without sanding off the voice that made the draft worth reading.',
    tag: 'less noise',
  },
];

// Rendered as the three quote cards in the "What writers say" section. The
// avatar circle uses the first letter of `name`, so no image is needed.
const testimonials = [
  {
    quote: 'DocuMend gave me back control of my research. No more wondering where my data goes.',
    name: 'Sarah Chen',
    role: 'Academic Researcher',
  },
  {
    quote: 'The offline mode saved my thesis when my internet went down. Everything was still there, encrypted and safe.',
    name: 'Marcus Webb',
    role: 'Final Year Student',
  },
  {
    quote: 'Finally, a writing tool that respects my privacy. No tracking, no selling my words to AI companies.',
    name: 'Elena Rodriguez',
    role: 'Private Advocate',
  },
];

// The FAQ accordion. Order matters: the list is laid out in two columns, and
// landing-page.css strips the bottom border from the last item of each column.
const faqs = [
  {
    question: 'Where does my data live?',
    answer: 'All of your documents stay on your device. No servers. No cloud. No copies elsewhere.',
  },
  {
    question: 'How secure is the encryption?',
    answer: 'DocuMend runs a WebAssembly cryptographic engine that handles all encryption on your machine',
  },
  {
    question: 'What file formats does it support?',
    answer: 'Import and edit .docx, .txt and .md files. DocuMend handles the conversion and keeps everything encrypted locally. Export back to your preferred format anytime.',
  },
  {
    question: 'Can I work offline?',
    answer: 'Yes. Toggle offline mode on and write without internet. Your work saves locally and syncs when you go online. The choice is always yours.',
  },
];

/* ==========================================================================
   Scroll behaviour
   ========================================================================== */

/**
 * Fades elements in as they scroll into view.
 *
 * Anything with `className="reveal"` starts invisible (see landing-page.css)
 * and gets `is-visible` added once it enters the viewport, which triggers the
 * animation. Pair it with `reveal-delay-1..4` to stagger a group.
 *
 * Each element is unobserved after its first reveal, so the animation plays
 * once rather than replaying every time it scrolls past. The effect runs on
 * mount only — elements added later won't be observed.
 */
function useReveal() {
  useEffect(() => {
    const nodes = Array.from(document.querySelectorAll('.reveal'));
    // Without IntersectionObserver, show everything at once rather than
    // leaving the whole page stuck at opacity 0.
    if (!('IntersectionObserver' in window)) {
      nodes.forEach((node) => node.classList.add('is-visible'));
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-visible');
            observer.unobserve(entry.target);
          }
        });
      },
      // Fire once 12% of the element is showing, and pull the bottom edge up
      // 50px so things animate just after they appear rather than right on it.
      { threshold: 0.12, rootMargin: '0px 0px -50px' },
    );
    nodes.forEach((node) => observer.observe(node));
    return () => observer.disconnect();
  }, []);
}

/**
 * Drifts the hero's decorative orb as the page scrolls.
 *
 * Publishes the scroll offset as a `--parallax-y` custom property on <html>;
 * `.hero-orb` in landing-page.css consumes it. Driving it through CSS this
 * way means no React re-render happens on scroll.
 *
 * `frame` throttles updates to one per animation frame — scroll events fire
 * far more often than the screen refreshes, and the guard drops the excess.
 */
function useParallax() {
  useEffect(() => {
    let frame = 0;
    const onScroll = () => {
      if (frame) return; // an update is already queued for this frame
      frame = window.requestAnimationFrame(() => {
        document.documentElement.style.setProperty('--parallax-y', `${window.scrollY * 0.1}px`);
        frame = 0;
      });
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, []);
}

/* ==========================================================================
   Visual components

   Mock product screenshots, drawn with divs rather than images. Each is paired
   with one feature section below. The nested spans are purely decorative — the
   colours and widths are chosen to read as "text" at a glance.
   ========================================================================== */

// The DocuMend logo: a square outline, a rotated diamond, and a dot. Used in
// the header and again in the footer.
// The geometric square-and-diamond that used to live here was the odd one out
// across the project; the logo now comes from components/BrandMark.jsx.
function BrandMark() {
  return <SharedBrandMark size={34} />;
}

/**
 * A fake editor window — the one visual on this page you can actually click.
 *
 * Two independent toggles drive it: `checked` swaps the inline hint for a
 * "problem found" warning, and `fixed` flips the sidebar button to a confirmed
 * state. Neither does anything real; they exist so the mockup responds when a
 * visitor pokes it.
 *
 * @param compact - hides the footer bar (and with it the "Run clarity check"
 *   toggle) and caps the width, for use beside body copy.
 */
function EditorWindow({ compact = false }) {
  const [checked, setChecked] = useState(false);
  const [fixed, setFixed] = useState(false);
  return (
    <div className={`editor-window relative overflow-hidden rounded-[4px] text-[#e7ebdf] ${compact ? 'max-w-[500px]' : ''}`}>
      <div className="flex h-11 items-center justify-between border-b border-[#d8e0d6]/10 px-4">
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-[#c86f52]" />
          <span className="h-2 w-2 rounded-full bg-[#d8a53c]" />
          <span className="h-2 w-2 rounded-full bg-[#7caa91]" />
        </div>
        <span className="font-mono text-[10px] tracking-wide text-[#aab9ad]">research_notes / chapter-02.md</span>
        <div className="flex items-center gap-2 text-[#aab9ad]">
          <span aria-hidden="true" className="rounded p-1"><PanelRight size={14} /></span>
          <span className="hidden text-[10px] sm:inline">saved locally</span>
        </div>
      </div>
      <div className="editor-body">
        <div className="relative px-5 py-6 sm:px-8">
          <div className="mb-7 flex items-center gap-3 text-[10px] text-[#8ea497]">
            <span className="font-mono text-[#d8a53c]">02</span>
            <span>argument / the quiet middle</span>
          </div>
          <h3 className="mb-5 max-w-[430px] font-display text-[27px] leading-[1.05] text-[#f2f0e4] sm:text-[34px]">
            The part where the idea earns its place.
          </h3>
          <div className="doc-lines max-w-[440px]">
            <span className="w-[94%]" /><span className="w-[88%]" /><span className="w-[97%]" />
            <span className="w-[74%]" /><span className="w-[92%]" /><span className="w-[84%]" />
            <span className="w-[95%]" /><span className="w-[62%]" />
          </div>
          <div className={`mt-7 rounded-[3px] border px-3 py-2.5 text-xs transition-colors duration-300 ${checked ? 'border-[#d8a53c]/70 bg-[#d8a53c]/10 text-[#f5d98e]' : 'border-[#d8e0d6]/15 text-[#9caea1]'}`}>
            <div className="flex items-start gap-2">
              {checked ? <CircleAlert size={14} className="mt-0.5 shrink-0 text-[#d8a53c]" /> : <Sparkles size={14} className="mt-0.5 shrink-0 text-[#d8a53c]" />}
              <span>{checked ? 'This paragraph makes a claim before the evidence arrives. Consider moving the next section up.' : 'Select a passage to inspect its logic, clarity, and rhythm.'}</span>
            </div>
          </div>
          <div className="editor-scan" />
        </div>
        <aside className="editor-insights border-l border-[#d8e0d6]/10 bg-[#10251f] px-4 py-5">
          <div className="mb-5 flex items-center justify-between">
            <span className="font-mono text-[9px] uppercase tracking-[.14em] text-[#91a89a]">readout</span>
            <span className="flex items-center gap-1 text-[10px] text-[#d8a53c]"><span className="h-1.5 w-1.5 rounded-full bg-[#d8a53c]" /> live</span>
          </div>
          <div className="space-y-4">
            <div>
              <div className="mb-1 flex justify-between text-[10px] text-[#9caea1]"><span>clarity</span><strong className="font-mono font-normal text-[#e7ebdf]">84</strong></div>
              <div className="h-1 bg-[#d8e0d6]/10"><div className="h-1 w-[84%] bg-[#7caa91]" /></div>
            </div>
            <div>
              <div className="mb-1 flex justify-between text-[10px] text-[#9caea1]"><span>flow</span><strong className="font-mono font-normal text-[#e7ebdf]">71</strong></div>
              <div className="h-1 bg-[#d8e0d6]/10"><div className="h-1 w-[71%] bg-[#d8a53c]" /></div>
            </div>
            <div>
              <div className="mb-1 flex justify-between text-[10px] text-[#9caea1]"><span>density</span><strong className="font-mono font-normal text-[#e7ebdf]">low</strong></div>
              <div className="h-1 bg-[#d8e0d6]/10"><div className="h-1 w-[42%] bg-[#c86f52]" /></div>
            </div>
          </div>
          <div className="mt-8 border-t border-[#d8e0d6]/10 pt-4">
            <p className="mb-3 text-[10px] uppercase tracking-[.12em] text-[#91a89a]">one good nudge</p>
            <p className="text-xs leading-relaxed text-[#e7ebdf]">Your opening is strong. The bridge into evidence needs one sentence.</p>
            <button type="button" onClick={() => setFixed(!fixed)} className="mt-4 flex w-full items-center justify-center gap-2 rounded-[2px] bg-[#d8a53c] px-3 py-2 text-[11px] font-semibold text-[#172d26] transition-transform hover:-translate-y-0.5">
              {fixed ? <Check size={13} /> : <Wand2 size={13} />} {fixed ? 'Bridge added' : 'Show suggestion'}
            </button>
          </div>
        </aside>
      </div>
      {!compact && (
        <div className="flex items-center justify-between border-t border-[#d8e0d6]/10 bg-[#10251f] px-4 py-3">
          <span className="font-mono text-[10px] text-[#91a89a]">1,284 words · local analysis</span>
          <button type="button" onClick={() => setChecked(!checked)} className="flex items-center gap-2 text-[11px] font-semibold text-[#d8a53c] hover:text-[#f5d98e]">
            <MousePointer2 size={13} /> {checked ? 'Reading complete' : 'Run clarity check'} <ArrowUpRight size={12} />
          </button>
        </div>
      )}
    </div>
  );
}

// Illustrates "Every citation. Always accurate." — a light paper draft on the
// left, a source map on the right, joined by a dashed connector.
function CitationDocumentVisual() {
  return (
    <div className="citation-visual border border-[#718478]/70 bg-[#dce3d9] p-3 shadow-[0_12px_22px_rgba(23,45,38,.11)] sm:p-5">
      <div className="paper-grid border border-[#aab9aa] bg-[#f7f3ea] p-4 sm:p-6">
        <div className="flex items-center justify-between border-b border-[#b5c0b3] pb-3 font-mono text-[8px] uppercase tracking-[.1em] text-[#718478] sm:text-[9px]">
          <span>research draft / 04</span>
          <span className="text-[#b67d18]">citation scan</span>
        </div>
        <div className="mt-5 grid gap-5 sm:grid-cols-[1.05fr_.95fr] sm:gap-7">
          <div>
            <p className="font-display text-xl leading-[.95] text-[#172d26] sm:text-3xl">The claim, the source, the bridge.</p>
            <div className="mt-5 space-y-3">
              <div className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full bg-[#c86f52]" />
                <span className="h-1.5 flex-1 bg-[#718478]/30" />
              </div>
              <div className="ml-5 h-1.5 w-[78%] bg-[#d8a53c]/60" />
              <div className="ml-5 h-1.5 w-[91%] bg-[#718478]/30" />
              <div className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full bg-[#7caa91]" />
                <span className="h-1.5 flex-1 bg-[#718478]/30" />
              </div>
              <div className="ml-5 h-1.5 w-[67%] bg-[#718478]/30" />
            </div>
          </div>
          <div className="border-l border-[#b5c0b3] pl-4 sm:pl-6">
            <p className="font-mono text-[8px] uppercase tracking-[.1em] text-[#b67d18]">source map</p>
            <div className="relative mt-5 space-y-4">
              <div className="flex items-center gap-2">
                <span className="h-5 w-5 shrink-0 border border-[#b67d18] bg-[#d8a53c]/20" />
                <span className="h-1.5 w-[72%] bg-[#718478]/35" />
              </div>
              <div className="ml-2 h-4 border-l border-dashed border-[#b67d18]/60" />
              <div className="flex items-center gap-2">
                <span className="h-5 w-5 shrink-0 border border-[#7caa91] bg-[#7caa91]/20" />
                <span className="h-1.5 w-[84%] bg-[#718478]/35" />
              </div>
              <div className="border border-[#b67d18]/45 bg-[#d8a53c]/10 p-2 text-[8px] leading-relaxed text-[#53675c]">
                Clearer bridge found between claim and evidence.
              </div>
            </div>
          </div>
        </div>
        <div className="mt-6 flex items-center justify-between border-t border-[#b5c0b3] pt-3 font-mono text-[8px] text-[#718478]">
          <span>3 sources checked</span>
          <span className="text-[#b67d18]">ready to repair</span>
        </div>
      </div>
    </div>
  );
}

// Illustrates "No more conflicting claims" — two pages either side of a
// glowing diamond, the line between them standing for the detected conflict.
function ContradictionVisual() {
  return (
    <div className="contradiction-visual relative overflow-hidden border border-[#718478]/70 bg-[#172d26] p-3 shadow-[0_16px_30px_rgba(23,45,38,.14)] sm:p-5">
      <div className="relative grid min-h-[235px] grid-cols-[.9fr_1.15fr_.9fr] items-center gap-2 border border-[#d8e0d6]/10 bg-[#10251f] p-3 sm:min-h-[285px] sm:gap-4 sm:p-5">
        <div className="contradiction-page contradiction-page-left border border-[#d8e0d6]/20 bg-[#dce3d9] p-3 sm:p-4">
          <div className="mb-4 h-2 w-2/5 bg-[#718478]/45" />
          <div className="space-y-2">
            <span className="block h-1.5 w-full bg-[#172d26]/25" />
            <span className="block h-1.5 w-[78%] bg-[#172d26]/20" />
            <span className="block h-1.5 w-[90%] bg-[#d8a53c]/75" />
            <span className="block h-1.5 w-[64%] bg-[#172d26]/20" />
            <span className="block h-1.5 w-[84%] bg-[#172d26]/25" />
          </div>
          <div className="mt-5 h-12 border border-[#c86f52]/60 bg-[#c86f52]/15" />
        </div>
        <div className="relative flex items-center justify-center">
          <div className="absolute left-0 right-0 h-px bg-[#d8a53c]/60" />
          <div className="relative flex h-16 w-16 items-center justify-center rounded-full border border-[#d8a53c] bg-[#d8a53c]/15 shadow-[0_0_24px_rgba(216,165,60,.2)] sm:h-20 sm:w-20">
            <span className="h-7 w-7 rotate-45 border-2 border-[#d8a53c] sm:h-9 sm:w-9" />
            <span className="absolute h-2 w-2 rounded-full bg-[#d8a53c]" />
          </div>
        </div>
        <div className="contradiction-page contradiction-page-right border border-[#d8e0d6]/20 bg-[#dce3d9] p-3 sm:p-4">
          <div className="mb-4 h-2 w-1/2 bg-[#718478]/45" />
          <div className="space-y-2">
            <span className="block h-1.5 w-[88%] bg-[#172d26]/25" />
            <span className="block h-1.5 w-full bg-[#172d26]/20" />
            <span className="block h-1.5 w-[72%] bg-[#d8a53c]/75" />
            <span className="block h-1.5 w-[92%] bg-[#172d26]/20" />
            <span className="block h-1.5 w-[68%] bg-[#172d26]/25" />
          </div>
          <div className="mt-5 h-12 border border-[#7caa91]/60 bg-[#7caa91]/15" />
        </div>
        <div className="absolute bottom-3 left-1/2 h-2 w-2 -translate-x-1/2 rounded-full bg-[#d8a53c] shadow-[0_0_12px_rgba(216,165,60,.75)] sm:bottom-5" />
      </div>
    </div>
  );
}

// Illustrates "Words that actually make sense." — a document with two
// highlighted lines (`.semantic-highlight` animates them) and a findings panel.
function SemanticVisual() {
  return (
    <div className="semantic-visual editor-window relative overflow-hidden rounded-[4px] border-[#718478]/60 shadow-[0_16px_30px_rgba(23,45,38,.18)]">
      <div className="flex h-9 items-center justify-between border-b border-[#d8e0d6]/10 px-3 sm:h-11 sm:px-4">
        <div className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-[#c86f52]" />
          <span className="h-2 w-2 rounded-full bg-[#d8a53c]" />
          <span className="h-2 w-2 rounded-full bg-[#7caa91]" />
        </div>
        <div className="h-1.5 w-24 bg-[#d8e0d6]/20 sm:w-36" />
        <div className="h-2 w-2 rounded-full bg-[#d8a53c]" />
      </div>
      <div className="grid min-h-[230px] grid-cols-[1fr_112px] gap-3 bg-[#10251f] p-3 sm:min-h-[285px] sm:grid-cols-[1fr_170px] sm:gap-5 sm:p-5">
        <div className="border border-[#d8e0d6]/10 bg-[#172d26] p-3 sm:p-5">
          <div className="mb-5 h-2 w-2/5 bg-[#d8a53c]/65" />
          <div className="space-y-3">
            <span className="block h-2 w-[92%] bg-[#d8e0d6]/25" />
            <span className="block h-2 w-[80%] bg-[#d8e0d6]/20" />
            <span className="semantic-highlight block h-2 w-[67%] bg-[#d8a53c]/65" />
            <span className="block h-2 w-[88%] bg-[#d8e0d6]/20" />
            <span className="block h-2 w-[72%] bg-[#d8e0d6]/25" />
            <span className="semantic-highlight block h-2 w-[84%] bg-[#d8a53c]/65" />
            <span className="block h-2 w-[58%] bg-[#d8e0d6]/20" />
          </div>
          <div className="mt-7 border-t border-[#d8e0d6]/10 pt-4">
            <div className="h-1.5 w-[74%] bg-[#7caa91]/60" />
            <div className="mt-2 h-1.5 w-[52%] bg-[#d8e0d6]/20" />
          </div>
        </div>
        <div className="border border-[#d8a53c]/35 bg-[#d8a53c]/[.07] p-3 sm:p-4">
          <div className="mb-5 h-2 w-2/3 bg-[#d8a53c]/65" />
          <div className="space-y-4">
            <div><span className="block h-1.5 w-full bg-[#d8e0d6]/25" /><span className="mt-2 block h-1.5 w-[74%] bg-[#c86f52]/65" /></div>
            <div><span className="block h-1.5 w-[86%] bg-[#d8e0d6]/25" /><span className="mt-2 block h-1.5 w-[60%] bg-[#7caa91]/65" /></div>
            <div><span className="block h-1.5 w-[92%] bg-[#d8e0d6]/25" /><span className="mt-2 block h-1.5 w-[68%] bg-[#d8a53c]/65" /></div>
          </div>
          <div className="mt-6 h-8 border border-[#7caa91]/45 bg-[#7caa91]/10" />
        </div>
      </div>
    </div>
  );
}

// Illustrates "Ideas that flow, arguments that land." — bullet-and-line rows
// standing for a reasoning chain, with a colour-coded summary beside them.
function FlowVisual() {
  return (
    <div className="flow-visual relative overflow-hidden border border-[#718478]/70 bg-[#172d26] p-3 shadow-[0_16px_30px_rgba(23,45,38,.14)] sm:p-5">
      <div className="relative min-h-[235px] border border-[#d8e0d6]/10 bg-[#10251f] p-3 sm:min-h-[285px] sm:p-5">
        <div className="grid gap-4 sm:grid-cols-[1fr_150px] sm:gap-6">
          <div className="border border-[#d8e0d6]/10 bg-[#172d26] p-4 sm:p-5">
            <div className="mb-5 h-2 w-2/5 bg-[#d8a53c]/65" />
            <div className="space-y-3">
              <div className="flex items-center gap-3"><span className="h-2 w-2 rounded-full bg-[#7caa91]" /><span className="h-1.5 w-[78%] bg-[#d8e0d6]/30" /></div>
              <div className="ml-5 h-1.5 w-[66%] bg-[#d8e0d6]/20" />
              <div className="flex items-center gap-3"><span className="h-2 w-2 rounded-full bg-[#d8a53c]" /><span className="h-1.5 w-[88%] bg-[#d8e0d6]/30" /></div>
              <div className="ml-5 h-1.5 w-[72%] bg-[#d8a53c]/70" />
              <div className="flex items-center gap-3"><span className="h-2 w-2 rounded-full bg-[#7caa91]" /><span className="h-1.5 w-[65%] bg-[#d8e0d6]/30" /></div>
              <div className="ml-5 h-1.5 w-[82%] bg-[#d8e0d6]/20" />
            </div>
            <div className="mt-7 border-t border-[#d8e0d6]/10 pt-4">
              <div className="h-1.5 w-[90%] bg-[#d8e0d6]/20" />
              <div className="mt-2 h-1.5 w-[54%] bg-[#d8e0d6]/20" />
            </div>
          </div>
          <div className="border border-[#d8a53c]/35 bg-[#d8a53c]/[.07] p-4 sm:p-5">
            <div className="mb-5 h-2 w-3/5 bg-[#d8a53c]/65" />
            <div className="space-y-4">
              <div className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-[#7caa91]" /><span className="h-1.5 flex-1 bg-[#7caa91]/60" /></div>
              <div className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-[#d8a53c]" /><span className="h-1.5 flex-1 bg-[#d8a53c]/70" /></div>
              <div className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-[#c86f52]" /><span className="h-1.5 flex-1 bg-[#c86f52]/65" /></div>
            </div>
            <div className="mt-7 h-8 border border-[#d8a53c]/45 bg-[#d8a53c]/10" />
          </div>
        </div>
        <div className="absolute bottom-4 left-1/2 h-1.5 w-[72%] -translate-x-1/2 bg-[#d8a53c]/45 shadow-[0_0_10px_rgba(216,165,60,.35)]" />
      </div>
    </div>
  );
}

// Illustrates "Say it once. Say it well." — the absolutely-positioned spans
// overlay each line to mark the repeated phrases inside it.
function ClutterVisual() {
  return (
    <div className="clutter-visual editor-window relative overflow-hidden rounded-[4px] border-[#718478]/60 shadow-[0_16px_30px_rgba(23,45,38,.18)]">
      <div className="flex h-9 items-center justify-between border-b border-[#d8e0d6]/10 px-3 sm:h-11 sm:px-4">
        <div className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-[#c86f52]" />
          <span className="h-2 w-2 rounded-full bg-[#d8a53c]" />
          <span className="h-2 w-2 rounded-full bg-[#7caa91]" />
        </div>
        <div className="h-1.5 w-24 bg-[#d8e0d6]/20 sm:w-36" />
        <div className="h-2 w-2 rounded-full bg-[#7caa91]" />
      </div>
      <div className="grid min-h-[230px] grid-cols-[1fr_112px] gap-3 bg-[#10251f] p-3 sm:min-h-[285px] sm:grid-cols-[1fr_170px] sm:gap-5 sm:p-5">
        <div className="border border-[#d8e0d6]/10 bg-[#172d26] p-3 sm:p-5">
          <div className="mb-5 h-2 w-1/3 bg-[#7caa91]/65" />
          <div className="space-y-3">
            <div className="relative"><span className="block h-2 w-[92%] bg-[#d8e0d6]/28" /><span className="absolute left-[36%] top-0 h-2 w-[28%] bg-[#d8a53c]/65" /></div>
            <div className="relative"><span className="block h-2 w-[84%] bg-[#d8e0d6]/22" /><span className="absolute left-[18%] top-0 h-2 w-[35%] bg-[#d8a53c]/65" /></div>
            <div className="relative"><span className="block h-2 w-[74%] bg-[#d8e0d6]/28" /><span className="absolute left-[48%] top-0 h-2 w-[26%] bg-[#c86f52]/65" /></div>
            <span className="block h-2 w-[89%] bg-[#d8e0d6]/22" />
            <span className="block h-2 w-[66%] bg-[#d8e0d6]/28" />
          </div>
          <div className="mt-8 space-y-2 border-t border-[#d8e0d6]/10 pt-4">
            <span className="block h-1.5 w-[72%] bg-[#d8e0d6]/20" />
            <span className="block h-1.5 w-[52%] bg-[#d8e0d6]/20" />
          </div>
        </div>
        <div className="border border-[#7caa91]/35 bg-[#7caa91]/[.07] p-3 sm:p-4">
          <div className="mb-5 h-2 w-2/3 bg-[#7caa91]/65" />
          <div className="space-y-4">
            <div><span className="block h-1.5 w-full bg-[#d8e0d6]/24" /><span className="mt-2 block h-1.5 w-[58%] bg-[#d8a53c]/65" /></div>
            <div><span className="block h-1.5 w-[88%] bg-[#d8e0d6]/24" /><span className="mt-2 block h-1.5 w-[72%] bg-[#7caa91]/65" /></div>
            <div><span className="block h-1.5 w-[78%] bg-[#d8e0d6]/24" /><span className="mt-2 block h-1.5 w-[48%] bg-[#7caa91]/65" /></div>
          </div>
          <div className="mt-6 h-8 border border-[#d8a53c]/40 bg-[#d8a53c]/10" />
        </div>
      </div>
    </div>
  );
}

// Illustrates "Share confidently, always." — sender and recipient panels with
// a padlock between them, drawn from a rounded shackle div plus a body div.
function SecureShareVisual() {
  return (
    <div className="secure-share-visual editor-window relative overflow-hidden rounded-[4px] border-[#718478]/60 shadow-[0_16px_30px_rgba(23,45,38,.18)]">
      <div className="flex h-9 items-center justify-between border-b border-[#d8e0d6]/10 px-3 sm:h-11 sm:px-4">
        <div className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-[#c86f52]" />
          <span className="h-2 w-2 rounded-full bg-[#d8a53c]" />
          <span className="h-2 w-2 rounded-full bg-[#7caa91]" />
        </div>
        <div className="h-1.5 w-24 bg-[#d8e0d6]/20 sm:w-36" />
        <div className="h-2 w-2 rounded-full bg-[#d8a53c]" />
      </div>
      <div className="relative grid min-h-[230px] grid-cols-[.85fr_1.05fr_.85fr] items-center gap-2 bg-[#10251f] p-3 sm:min-h-[285px] sm:gap-5 sm:p-5">
        <div className="secure-document border border-[#d8e0d6]/10 bg-[#172d26] p-3 sm:p-4">
          <div className="mb-4 h-2 w-1/2 bg-[#7caa91]/65" />
          <div className="space-y-2.5">
            <span className="block h-1.5 w-full bg-[#d8e0d6]/30" />
            <span className="block h-1.5 w-[76%] bg-[#d8e0d6]/22" />
            <span className="block h-1.5 w-[88%] bg-[#d8e0d6]/30" />
            <span className="block h-1.5 w-[65%] bg-[#d8a53c]/65" />
            <span className="block h-1.5 w-[92%] bg-[#d8e0d6]/22" />
            <span className="block h-1.5 w-[72%] bg-[#d8e0d6]/30" />
            <span className="block h-1.5 w-[84%] bg-[#d8e0d6]/22" />
          </div>
          <div className="mt-5 h-6 border border-[#7caa91]/40 bg-[#7caa91]/10" />
        </div>
        <div className="relative flex items-center justify-center">
          <span className="absolute left-0 right-0 h-px border-t border-dashed border-[#d8a53c]/70" />
          <div className="relative flex h-16 w-16 items-center justify-center rounded-[10px] border border-[#d8a53c] bg-[#d8a53c]/10 shadow-[0_0_24px_rgba(216,165,60,.18)] sm:h-20 sm:w-20">
            <div className="h-8 w-7 rounded-t-[12px] border-2 border-b-0 border-[#d8a53c] sm:h-10 sm:w-9" />
            <div className="absolute bottom-[calc(50%-18px)] h-7 w-9 rounded-[3px] border-2 border-[#d8a53c] bg-[#172d26] sm:bottom-[calc(50%-23px)] sm:h-9 sm:w-11">
              <span className="absolute left-1/2 top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#d8a53c]" />
            </div>
          </div>
          <span className="absolute left-1/2 top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#d8a53c]" />
        </div>
        <div className="secure-recipient border border-[#d8a53c]/35 bg-[#d8a53c]/[.07] p-3 sm:p-4">
          <div className="mb-4 h-2 w-3/5 bg-[#d8a53c]/65" />
          <div className="space-y-3">
            <span className="block h-1.5 w-full bg-[#d8e0d6]/25" />
            <span className="block h-1.5 w-[78%] bg-[#d8e0d6]/20" />
            <span className="block h-1.5 w-[90%] bg-[#d8e0d6]/25" />
            <span className="block h-1.5 w-[62%] bg-[#d8a53c]/65" />
          </div>
          <div className="mt-6 h-6 border border-[#c86f52]/45 bg-[#c86f52]/10" />
        </div>
      </div>
    </div>
  );
}

// Illustrates "No missing pieces. No loose ends." — a vertical timeline whose
// dots are colour-coded by state: green fine, amber weak, coral missing.
function GapsVisual() {
  return (
    <div className="gaps-visual editor-window relative overflow-hidden rounded-[4px] border-[#718478]/60 shadow-[0_16px_30px_rgba(23,45,38,.18)]">
      <div className="flex h-9 items-center justify-between border-b border-[#d8e0d6]/10 px-3 sm:h-11 sm:px-4">
        <div className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-[#c86f52]" />
          <span className="h-2 w-2 rounded-full bg-[#d8a53c]" />
          <span className="h-2 w-2 rounded-full bg-[#7caa91]" />
        </div>
        <div className="h-1.5 w-24 bg-[#d8e0d6]/20 sm:w-36" />
        <div className="h-2 w-2 rounded-full bg-[#7caa91]" />
      </div>
      <div className="grid min-h-[230px] grid-cols-[1fr_112px] gap-3 bg-[#10251f] p-3 sm:min-h-[285px] sm:grid-cols-[1fr_170px] sm:gap-5 sm:p-5">
        <div className="border border-[#d8e0d6]/10 bg-[#172d26] p-3 sm:p-5">
          <div className="mb-5 h-2 w-1/3 bg-[#7caa91]/65" />
          <div className="relative space-y-3 pl-5">
            <span className="absolute bottom-1 left-1 top-1 w-px bg-[#7caa91]/45" />
            <div className="relative flex items-center gap-3"><span className="absolute -left-[22px] h-3 w-3 rounded-full border border-[#7caa91] bg-[#172d26]" /><span className="h-2 w-[78%] bg-[#d8e0d6]/28" /></div>
            <div className="relative flex items-center gap-3"><span className="absolute -left-[22px] h-3 w-3 rounded-full border border-[#7caa91] bg-[#7caa91]/40" /><span className="h-2 w-[88%] bg-[#d8e0d6]/24" /></div>
            <div className="relative flex items-center gap-3"><span className="absolute -left-[22px] h-3 w-3 rounded-full border border-[#c86f52] bg-[#c86f52]/40" /><span className="h-2 w-[70%] bg-[#c86f52]/65" /></div>
            <div className="relative flex items-center gap-3"><span className="absolute -left-[22px] h-3 w-3 rounded-full border border-[#d8a53c] bg-[#d8a53c]/40" /><span className="h-2 w-[84%] bg-[#d8a53c]/65" /></div>
            <div className="relative flex items-center gap-3"><span className="absolute -left-[22px] h-3 w-3 rounded-full border border-[#7caa91] bg-[#7caa91]/40" /><span className="h-2 w-[66%] bg-[#d8e0d6]/24" /></div>
            <div className="relative flex items-center gap-3"><span className="absolute -left-[22px] h-3 w-3 rounded-full border border-[#7caa91] bg-[#172d26]" /><span className="h-2 w-[76%] bg-[#d8e0d6]/28" /></div>
          </div>
          <div className="mt-7 border-t border-[#d8e0d6]/10 pt-4">
            <span className="block h-1.5 w-[72%] bg-[#d8e0d6]/20" />
            <span className="mt-2 block h-1.5 w-[54%] bg-[#d8e0d6]/20" />
          </div>
        </div>
        <div className="border border-[#7caa91]/35 bg-[#7caa91]/[.07] p-3 sm:p-4">
          <div className="mb-5 h-2 w-2/3 bg-[#7caa91]/65" />
          <div className="space-y-4">
            <div><span className="block h-1.5 w-full bg-[#7caa91]/60" /><span className="mt-2 block h-1.5 w-[72%] bg-[#d8e0d6]/22" /></div>
            <div><span className="block h-1.5 w-[86%] bg-[#d8a53c]/65" /><span className="mt-2 block h-1.5 w-[56%] bg-[#d8e0d6]/22" /></div>
            <div><span className="block h-1.5 w-[72%] bg-[#c86f52]/65" /><span className="mt-2 block h-1.5 w-[82%] bg-[#d8e0d6]/22" /></div>
          </div>
          <div className="mt-6 h-8 border border-[#d8a53c]/40 bg-[#d8a53c]/10" />
        </div>
      </div>
    </div>
  );
}

// The analytics dashboard in the "Real numbers that matter" section: three
// stat tiles, a bar chart, and a donut. The bars are divs sized by percentage;
// the donut is a single `conic-gradient` with a filled circle punching out
// the middle. All figures are hard-coded marketing copy, not live data.
function MetricsVisual() {
  return (
    <div className="metrics-visual editor-window relative overflow-hidden rounded-[4px] border-[#718478]/60 shadow-[0_18px_34px_rgba(23,45,38,.2)]">
      <div className="flex h-9 items-center justify-between border-b border-[#d8e0d6]/10 px-3 sm:h-11 sm:px-4">
        <div className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-[#c86f52]" />
          <span className="h-2 w-2 rounded-full bg-[#d8a53c]" />
          <span className="h-2 w-2 rounded-full bg-[#7caa91]" />
        </div>
        <div className="h-1.5 w-28 bg-[#d8e0d6]/20 sm:w-40" />
        <div className="h-2 w-2 rounded-full bg-[#7caa91]" />
      </div>
      <div className="space-y-3 bg-[#10251f] p-3 sm:space-y-4 sm:p-5">
        <div className="grid grid-cols-3 gap-2 sm:gap-4">
          <div className="rounded-[5px] border border-[#d8e0d6]/10 bg-[#172d26] p-3 sm:p-4">
            <p className="font-mono text-[8px] text-[#91a89a] sm:text-[9px]">Documents edited</p>
            <strong className="mt-3 block font-sans text-2xl font-semibold leading-none tracking-[-.05em] text-[#d8a53c] sm:text-4xl">50K</strong>
            <p className="mt-2 font-mono text-[7px] text-[#91a89a] sm:text-[8px]">+12% this month</p>
          </div>
          <div className="rounded-[5px] border border-[#d8e0d6]/10 bg-[#172d26] p-3 sm:p-4">
            <p className="font-mono text-[8px] text-[#91a89a] sm:text-[9px]">Encryption rate</p>
            <strong className="mt-3 block font-sans text-2xl font-semibold leading-none tracking-[-.05em] text-[#7caa91] sm:text-4xl">99.8%</strong>
            <p className="mt-2 font-mono text-[7px] text-[#91a89a] sm:text-[8px]">AES-256 on every doc</p>
          </div>
          <div className="rounded-[5px] border border-[#d8e0d6]/10 bg-[#172d26] p-3 sm:p-4">
            <p className="font-mono text-[8px] text-[#91a89a] sm:text-[9px]">vs cloud speed</p>
            <strong className="mt-3 block font-sans text-2xl font-semibold leading-none tracking-[-.05em] text-[#d8a53c] sm:text-4xl">2.3x</strong>
            <p className="mt-2 font-mono text-[7px] text-[#91a89a] sm:text-[8px]">Faster than Grammarly</p>
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-[1.45fr_.75fr] sm:gap-4">
          <div className="rounded-[5px] border border-[#d8e0d6]/10 bg-[#172d26] p-3 sm:p-5">
            <p className="font-mono text-[8px] text-[#91a89a] sm:text-[9px]">weekly analysis runs</p>
            <div className="mt-6 flex h-32 items-end gap-2 border-b border-l border-[#d8e0d6]/10 px-2 pb-2 sm:h-44 sm:gap-3 sm:px-4">
              {[34, 47, 58, 69, 78, 88, 96, 82].map((height, index) => (
                <span key={`${height}-${index}`} className={`flex-1 ${index > 6 ? 'bg-[#7caa91]/80' : 'bg-[#d8a53c]/75'}`} style={{ height: `${height}%` }} />
              ))}
            </div>
            <div className="mt-2 grid grid-cols-8 text-center font-mono text-[7px] text-[#718478] sm:text-[8px]">
              {['W1', 'W2', 'W3', 'W4', 'W5', 'W6', 'W7', 'W8'].map((week) => <span key={week}>{week}</span>)}
            </div>
            <div className="mt-3 flex justify-between font-mono text-[7px] text-[#91a89a] sm:text-[8px]">
              <span>↑ Growth trend</span>
              <span>last 8 weeks</span>
            </div>
          </div>
          <div className="rounded-[5px] border border-[#d8e0d6]/10 bg-[#172d26] p-3 sm:p-5">
            <p className="font-mono text-[8px] text-[#91a89a] sm:text-[9px]">Error types caught</p>
            <div className="mx-auto mt-7 flex h-24 w-24 items-center justify-center rounded-full sm:mt-9 sm:h-32 sm:w-32" style={{ background: 'conic-gradient(#d8a53c 0 46%, #7caa91 46% 77%, #c86f52 77% 100%)' }}>
              <span className="flex h-12 w-12 flex-col items-center justify-center rounded-full bg-[#172d26] sm:h-16 sm:w-16">
                <strong className="font-sans text-sm leading-none text-[#e7ebdf] sm:text-base">8.4K</strong>
                <span className="mt-1 font-mono text-[6px] text-[#91a89a] sm:text-[7px]">Total</span>
              </span>
            </div>
            <div className="mt-6 space-y-2 font-mono text-[7px] text-[#91a89a] sm:text-[8px]">
              <div className="flex items-center gap-2"><span className="h-2 w-2 bg-[#d8a53c]" /><span>Semantic 47%</span></div>
              <div className="flex items-center gap-2"><span className="h-2 w-2 bg-[#7caa91]" /><span>Flow 29%</span></div>
              <div className="flex items-center gap-2"><span className="h-2 w-2 bg-[#c86f52]" /><span>Gaps 24%</span></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// Abstract artwork beside the contact details — overlapping circles and a
// dashed line meeting at a lit point, suggesting two parties connecting.
function ContactVisual() {
  return (
    <div className="contact-visual relative min-h-[300px] overflow-hidden rounded-[10px] border border-[#718478]/60 bg-[#b8cbc5] p-4 shadow-[0_18px_34px_rgba(23,45,38,.14)] sm:min-h-[390px] sm:p-6">
      <div className="absolute -right-20 -top-24 h-72 w-72 rounded-full border border-[#d8a53c]/50 bg-[#d8a53c]/10 sm:h-96 sm:w-96" />
      <div className="absolute -bottom-32 -left-20 h-72 w-72 rounded-full border border-[#7caa91]/50 bg-[#7caa91]/10 sm:h-96 sm:w-96" />
      <div className="relative flex min-h-[268px] items-center justify-center overflow-hidden rounded-[7px] border border-[#718478]/70 bg-[#172d26] sm:min-h-[338px]">
        <div className="absolute left-[19%] top-[27%] h-24 w-24 rounded-full border border-[#7caa91]/60 bg-[#7caa91]/20 sm:h-32 sm:w-32" />
        <div className="absolute right-[18%] top-[21%] h-28 w-28 rounded-full border border-[#d8a53c]/60 bg-[#d8a53c]/15 sm:h-36 sm:w-36" />
        <div className="absolute left-[26%] top-[47%] h-16 w-16 rounded-[45%] border border-[#7caa91]/60 bg-[#7caa91]/15 sm:h-20 sm:w-20" />
        <div className="absolute right-[26%] top-[45%] h-20 w-20 rounded-[45%] border border-[#d8a53c]/60 bg-[#d8a53c]/15 sm:h-24 sm:w-24" />
        <div className="relative h-px w-[45%] border-t border-dashed border-[#d8a53c] shadow-[0_0_12px_rgba(216,165,60,.7)]" />
        <div className="absolute left-1/2 top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#d8a53c] shadow-[0_0_16px_rgba(216,165,60,.85)]" />
        <div className="absolute bottom-[18%] left-1/2 h-8 w-24 -translate-x-1/2 rounded-full border border-[#d8e0d6]/15 bg-[#d8e0d6]/[.04] sm:w-36" />
      </div>
    </div>
  );
}

/**
 * The "request an invite" dialog — an email capture with a success state.
 *
 * Opened by most of the page's call-to-action buttons. (The "Get started"
 * buttons in the nav are the exception: those route to /signup instead.)
 *
 * Front-end only — the address is never sent anywhere. Swap the `onSubmit`
 * body for a real request when there is somewhere to send it.
 *
 * Returning null while closed means the state above resets on every open, so
 * a reopened dialog always starts on a blank form rather than the thank-you.
 */
function AppModal({ open, onClose }) {
  const [submitted, setSubmitted] = useState(false);
  const [email, setEmail] = useState('');
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#10251f]/75 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="invite-title">
      <div className="relative w-full max-w-[470px] border border-[#d8a53c]/50 bg-[#f3eee3] p-7 shadow-2xl sm:p-10">
        <button type="button" onClick={onClose} aria-label="Close dialog" className="absolute right-4 top-4 p-2 text-[#53675c] hover:text-[#172d26]"><X size={18} /></button>
        {!submitted ? (
          <>
            <span className="eyebrow">early access</span>
            <h2 id="invite-title" className="mt-5 font-display text-5xl leading-[.92] text-[#172d26]">A clearer draft is closer than you think.</h2>
            <p className="mt-5 text-sm leading-relaxed text-[#53675c]">DocuMend is opening its first private studio to a small group of writers. Leave your email and we will send the first invitation when the editor is ready.</p>
            <form onSubmit={(event) => { event.preventDefault(); if (email.trim()) setSubmitted(true); }} className="mt-7 flex flex-col gap-2 sm:flex-row">
              <label htmlFor="invite-email" className="sr-only">Email address</label>
              <input id="invite-email" required type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@somewhere.com" className="min-h-11 flex-1 border border-[#b4c0b3] bg-[#e9e4d9] px-3 text-sm text-[#172d26] outline-none placeholder:text-[#7e8d81] focus:border-[#b67d18]" />
              <button type="submit" className="btn-primary min-h-11 bg-[#d8a53c] px-5 text-sm font-semibold text-[#172d26]">Request an invite</button>
            </form>
            <p className="mt-4 font-mono text-[10px] text-[#7e8d81]">No newsletter. No tracking pixel. Just the door code.</p>
          </>
        ) : (
          <div className="py-8 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full border border-[#d8a53c] text-[#b67d18]"><Check size={25} /></div>
            <h2 className="mt-6 font-display text-5xl text-[#172d26]">You are on the list.</h2>
            <p className="mx-auto mt-4 max-w-[300px] text-sm leading-relaxed text-[#53675c]">We will keep the signal useful and the inbox quiet. See you inside.</p>
            <button type="button" onClick={onClose} className="btn-ghost mt-7 border border-[#172d26] px-5 py-2.5 text-sm font-semibold text-[#172d26]">Close</button>
          </div>
        )}
      </div>
    </div>
  );
}

/* ==========================================================================
   The page

   Section order, matching the anchors the nav links to:
     hero -> #instrument -> #principles -> #capabilities -> #metrics
     -> #voices -> #faq -> #contact
   ========================================================================== */
function LandingPage() {
  const [menuOpen, setMenuOpen] = useState(false);   // mobile nav open?
  const [modalOpen, setModalOpen] = useState(false); // invite dialog open?
  // Indices of the expanded FAQ entries. A Set allows several open at once;
  // seeding it with every index means they all start expanded.
  const [openFaqs, setOpenFaqs] = useState(() => new Set(faqs.map((_, index) => index)));
  useReveal();
  useParallax();

  const closeMenu = () => setMenuOpen(false);

  return (
    // `grain` overlays a noise texture; `site-shell` sets the page background.
    <div className="site-shell grain">
      {/* Header floats over the hero (absolute, not fixed) so it scrolls away.
          The desktop nav and the hamburger swap at the 800px breakpoint via
          the `desktop-nav` / `mobile-only` classes in landing-page.css. */}
      <header className="absolute left-0 right-0 top-0 z-20 text-[#172d26]">
        <div className="container-wide flex h-[82px] items-center justify-between">
          <a href="#top" onClick={closeMenu} className="text-[#172d26]"><BrandMark /></a>
          <nav className="desktop-nav flex items-center gap-8" aria-label="Main navigation">
            <a href="#top" className="nav-link text-xs text-[#53675c] transition-colors hover:text-[#b67d18]">Dashboard</a>
            <a href="#instrument" className="nav-link text-xs text-[#53675c] transition-colors hover:text-[#b67d18]">Editor</a>
            <a href="#principles" className="nav-link text-xs text-[#53675c] transition-colors hover:text-[#b67d18]">Features</a>
            <button type="button" onClick={() => navigate('/login')} className="nav-link ml-1 text-xs text-[#53675c] transition-colors hover:text-[#b67d18]">Sign in</button>
            <button type="button" onClick={() => navigate('/signup')} className="btn-primary ml-1 border border-[#d8a53c] bg-[#d8a53c] px-4 py-2 text-xs font-semibold text-[#172d26]">Get started</button>
          </nav>
          <button type="button" aria-label={menuOpen ? 'Close menu' : 'Open menu'} onClick={() => setMenuOpen(!menuOpen)} className="mobile-only text-[#172d26]"><Menu size={22} /></button>
        </div>
        {/* The dropdown. Deliberately no `md:hidden` on the <nav>: that would
            hide the menu from 768px up, while the hamburger that opens it
            shows from 800px down -- leaving a 768-800px band where the button
            appears but does nothing. The `mobile-only` / `desktop-nav` pair
            already handles the switch, at a single consistent breakpoint. */}
        {menuOpen && (
          <nav className="mx-4 flex flex-col gap-4 border border-[#718478]/30 bg-[#172d26] p-5" aria-label="Mobile navigation">
            <a href="#top" onClick={closeMenu} className="text-sm text-[#e7ebdf]">Dashboard</a>
            <a href="#instrument" onClick={closeMenu} className="text-sm text-[#e7ebdf]">Editor</a>
            <a href="#principles" onClick={closeMenu} className="text-sm text-[#e7ebdf]">Features</a>
            <button type="button" onClick={() => { closeMenu(); setModalOpen(true); }} className="text-left text-sm text-[#e7ebdf]">Sign in</button>
            <button type="button" onClick={() => { closeMenu(); navigate('/signup'); }} className="mt-2 self-start bg-[#d8a53c] px-4 py-2 text-xs font-semibold text-[#172d26]">Get started</button>
          </nav>
        )}
      </header>

      {/* id="top" is the target of the "Dashboard" nav link and the logo. */}
      <main id="top">
        {/* HERO — dark panel on a light ground. `pt-[82px]` clears the header,
            which is absolutely positioned and so takes up no layout space. */}
        <section className="relative min-h-[700px] overflow-hidden bg-[#f3eee3] pt-[82px] text-[#172d26] sm:min-h-[780px]">
          <div className="hero-orb hero-orb-light" />
          <div className="container-wide relative z-10 flex min-h-[618px] items-center justify-center pb-12 pt-10 sm:min-h-[680px] sm:pb-16">
            <div className="hero-panel reveal w-full max-w-[1050px] rounded-[14px] bg-[#172d26] px-6 py-20 text-center shadow-[0_22px_50px_rgba(23,45,38,.16)] sm:px-12 sm:py-24 md:px-20">
              <div className="absolute inset-x-10 top-7 hidden items-center justify-between font-mono text-[9px] uppercase tracking-[.16em] text-[#91a89a] sm:flex">
                <span>documend / 01</span>
                <span>private studio</span>
              </div>
              <div className="reveal eyebrow justify-center text-[#9fb1a3]">an intelligent self-healing document editor</div>
              <h1 className="reveal reveal-delay-1 mx-auto mt-7 max-w-[760px] font-display text-[clamp(3.45rem,7vw,6.8rem)] leading-[.86] tracking-[-.045em] text-[#f3eee3]">
                Write with complete <em className="text-[#d8a53c]">control</em> and privacy.
              </h1>
              <p className="reveal reveal-delay-2 mx-auto mt-7 max-w-[570px] text-[14px] leading-[1.75] text-[#bdc8bc] sm:text-[15px]">
                DocuMend keeps your documents on your machine. No cloud send, no training data, just your draft getting clearer.
              </p>
              <div className="reveal reveal-delay-3 mt-8 flex flex-wrap items-center justify-center gap-3">
                <button type="button" onClick={() => navigate('/signup')} className="btn-primary flex items-center gap-3 bg-[#d8a53c] px-5 py-3 text-sm font-semibold text-[#172d26]">Start writing <ArrowRight size={16} /></button>
                <a href="#instrument" className="btn-ghost flex items-center gap-2 border border-[#91a89a]/50 px-5 py-3 text-sm text-[#e0e6db] hover:border-[#d8a53c] hover:text-[#d8a53c]">Learn more <ArrowUpRight size={15} /></a>
              </div>
              <div className="reveal reveal-delay-4 mx-auto mt-12 flex max-w-[540px] flex-wrap items-center justify-center gap-x-6 gap-y-3 border-t border-[#d8e0d6]/15 pt-4 font-mono text-[10px] text-[#91a89a]">
                <span className="flex items-center gap-2"><LockKeyhole size={13} className="text-[#d8a53c]" /> local-first</span>
                <span className="flex items-center gap-2"><Zap size={13} className="text-[#d8a53c]" /> works offline</span>
                <span className="flex items-center gap-2"><ShieldCheck size={13} className="text-[#d8a53c]" /> your draft stays yours</span>
              </div>
            </div>
          </div>
        </section>

        {/* EDITOR — a sample document sheet with four action tiles overlapping
            its lower edge (the negative margin on `.feature-tile-row`). */}
        <section id="instrument" className="relative overflow-hidden bg-[#f3eee3] py-20 sm:py-28">
          <div className="container-wide">
            <div className="reveal text-center">
              <div className="font-display text-5xl leading-none tracking-[-.04em] text-[#172d26] sm:text-6xl">DocuMend</div>
              <p className="mt-2 text-xs text-[#53675c] sm:text-sm">an intelligent self-healing document editor</p>
            </div>
            <div className="feature-stage reveal reveal-delay-1 relative mx-auto mt-10 max-w-[1010px] rounded-[7px] bg-[#b5c2bd] px-4 pb-8 pt-8 shadow-[0_16px_30px_rgba(23,45,38,.08)] sm:mt-12 sm:px-14 sm:pb-14 sm:pt-14">
              <div className="document-sheet paper-grid mx-auto max-w-[560px] border border-[#aab9aa] bg-[#f7f3ea] p-4 shadow-[0_10px_20px_rgba(23,45,38,.12)] sm:p-7">
                <div className="flex items-center justify-between border-b border-[#b5c0b3] pb-3 font-mono text-[8px] uppercase tracking-[.12em] text-[#718478] sm:text-[9px]">
                  <span>sample document page</span>
                  <span>01 / 04</span>
                </div>
                <div className="mt-5 grid gap-4 sm:grid-cols-[1.15fr_.85fr] sm:gap-8">
                  <div>
                    <p className="font-display text-xl leading-[.95] text-[#172d26] sm:text-3xl">The part where the idea finds its shape.</p>
                    <div className="mt-5 space-y-2">
                      <span className="doc-sheet-line w-[92%]" />
                      <span className="doc-sheet-line w-[98%]" />
                      <span className="doc-sheet-line highlight w-[76%]" />
                      <span className="doc-sheet-line w-[88%]" />
                      <span className="doc-sheet-line w-[66%]" />
                    </div>
                  </div>
                  <div className="border-l border-[#b5c0b3] pl-4 sm:pl-6">
                    <p className="font-mono text-[8px] uppercase tracking-[.12em] text-[#b67d18]">self-healing notes</p>
                    <div className="mt-4 space-y-3">
                      <div className="h-2 w-[80%] bg-[#d8a53c]/45" />
                      <div className="h-2 w-[92%] bg-[#718478]/35" />
                      <div className="h-2 w-[68%] bg-[#718478]/35" />
                      <div className="mt-5 border border-[#b67d18]/45 bg-[#d8a53c]/10 p-2 text-[8px] leading-relaxed text-[#53675c]">Clearer bridge found between your claim and evidence.</div>
                    </div>
                  </div>
                </div>
              </div>
              <div className="feature-tile-row relative z-10 -mt-5 grid grid-cols-2 gap-2 sm:-mt-12 sm:grid-cols-4 sm:gap-3">
                {[
                  { Icon: FilePlus2, label: 'Create Document' },
                  { Icon: FileUp, label: 'Upload Document' },
                  { Icon: FolderPlus, label: 'Create Folder' },
                  { Icon: PencilLine, label: 'Edit Document' },
                ].map(({ Icon, label }) => (
                  <div key={label} className="feature-tile flex min-h-[92px] flex-col items-center justify-center gap-3 rounded-[5px] border border-[#718478]/60 bg-[#172d26] px-3 py-4 text-center text-[#e7ebdf] shadow-[0_8px_16px_rgba(23,45,38,.14)] transition-transform duration-300 hover:-translate-y-1 sm:min-h-[112px]">
                    <Icon size={17} strokeWidth={1.6} className="text-[#d8a53c]" />
                    <span className="text-[10px] font-medium sm:text-xs">{label}</span>
                  </div>
                ))}
              </div>
            </div>
            <p className="reveal reveal-delay-2 mx-auto mt-5 max-w-[520px] text-center text-xs leading-relaxed text-[#718478] sm:text-sm">One place to shape, sharpen, and finish the document before it finds its reader.</p>
          </div>
        </section>

        {/* FEATURES — two large story bands. The `order-1` / `order-2` classes
            flip art and copy between columns, then stack art-first on mobile. */}
        <section id="principles" className="bg-[#f3eee3] py-20 sm:py-28">
          <div className="container-wide space-y-10 sm:space-y-16">
            <article className="story-band reveal grid items-center gap-8 rounded-[9px] bg-[#c8d1cb] p-5 sm:p-8 lg:grid-cols-[1.08fr_.92fr] lg:gap-14">
              <div className="story-art order-2 lg:order-1">
                <CitationDocumentVisual />
              </div>
              <div className="order-1 lg:order-2">
                <span className="eyebrow text-[#53675c]">02 / consistent clarity</span>
                <h2 className="mt-5 max-w-[450px] font-display text-[clamp(2.8rem,5.5vw,5.4rem)] leading-[.86] tracking-[-.04em] text-[#172d26]">Every citation. Always accurate.</h2>
                <p className="mt-6 max-w-[410px] text-sm leading-[1.75] text-[#53675c]">DocuMend scans your references, flags broken links, missing sources, and incorrect formats then fixes them in one click. It even suggests relevant citations based on your content, so you never miss a source.</p>
                <button type="button" onClick={() => setModalOpen(true)} className="btn-primary mt-7 flex items-center gap-3 bg-[#d8a53c] px-4 py-2.5 text-sm font-semibold text-[#172d26]">Fix My Citation <ArrowRight size={15} /></button>
              </div>
            </article>

            <article className="story-band grid items-center gap-8 rounded-[9px] bg-[#c8d1cb] p-5 sm:p-8 lg:grid-cols-[.92fr_1.08fr] lg:gap-14">
              <div className="reveal order-1">
                <span className="eyebrow text-[#53675c]">01 / intelligent editing</span>
                <h2 className="mt-5 max-w-[450px] font-display text-[clamp(2.8rem,5.5vw,5.4rem)] leading-[.86] tracking-[-.04em] text-[#172d26]">Edit documents intelligently, offline</h2>
                <p className="mt-6 max-w-[410px] text-sm leading-[1.75] text-[#53675c]">Your thesis. Your legal brief. Your confidential report. DocuMend detects contradictions, fixes structural gaps, and repairs broken citations without sending a single byte to the cloud. It is offline-first and blazing fast, with under 50ms of blocking time.</p>
                <button type="button" onClick={() => setModalOpen(true)} className="btn-primary mt-7 flex items-center gap-3 bg-[#d8a53c] px-4 py-2.5 text-sm font-semibold text-[#172d26]">Start Editing Securely <ArrowRight size={15} /></button>
              </div>
              <div className="story-art reveal reveal-delay-1 order-2 flex justify-end">
                <EditorWindow compact />
              </div>
            </article>
          </div>
        </section>

        {/* CAPABILITIES — six alternating feature blocks, one per visual
            component above. They alternate both side (art left/right) and
            background (#c8d1cb / #f3eee3) to keep the long run readable. */}
        <section id="capabilities" className="bg-[#dce3d9] py-20 sm:py-28">
          <div className="container-wide space-y-8 sm:space-y-12">
            <article className="feature-story grid items-center gap-8 rounded-[9px] bg-[#c8d1cb] p-5 sm:p-8 lg:grid-cols-[1.08fr_.92fr] lg:gap-14">
              <div className="reveal order-2 lg:order-1">
                <ContradictionVisual />
              </div>
              <div className="reveal reveal-delay-1 order-1 lg:order-2">
                <h2 className="max-w-[500px] font-sans text-[clamp(2rem,3.4vw,3.4rem)] font-semibold leading-[1.02] tracking-[-.045em] text-[#172d26]">No more conflicting claims</h2>
                <p className="mt-6 max-w-[500px] text-[15px] leading-[1.7] text-[#53675c]">DocuMend reads your entire document and instantly flags statements that contradict each other across sections, paragraphs, even pages apart. Fix inconsistencies before your supervisor does.</p>
                <button type="button" onClick={() => setModalOpen(true)} className="btn-primary mt-7 flex items-center gap-3 rounded-full bg-[#d8a53c] px-4 py-2.5 text-sm font-medium text-[#172d26] shadow-[0_3px_0_#b67d18]">Catch Contradictions <ArrowRight size={15} /></button>
              </div>
            </article>

            <article className="feature-story grid items-center gap-8 rounded-[9px] bg-[#f3eee3] p-5 sm:p-8 lg:grid-cols-[.92fr_1.08fr] lg:gap-14">
              <div className="reveal order-1">
                <h2 className="max-w-[500px] font-sans text-[clamp(2rem,3.4vw,3.4rem)] font-semibold leading-[1.02] tracking-[-.045em] text-[#172d26]">Words that actually make sense.</h2>
                <p className="mt-6 max-w-[500px] text-[15px] leading-[1.7] text-[#53675c]">DocuMend goes beyond basic grammar, it understands the meaning behind your sentences, catching semantic errors, misused terms, and contextually incorrect phrasing that spell-checkers miss.</p>
                <button type="button" onClick={() => setModalOpen(true)} className="btn-primary mt-7 flex items-center gap-3 rounded-full bg-[#d8a53c] px-4 py-2.5 text-sm font-medium text-[#172d26] shadow-[0_3px_0_#b67d18]">Check my Document <ArrowRight size={15} /></button>
              </div>
              <div className="reveal reveal-delay-1 order-2">
                <SemanticVisual />
              </div>
            </article>

            <article className="feature-story grid items-center gap-8 rounded-[9px] bg-[#c8d1cb] p-5 sm:p-8 lg:grid-cols-[1.08fr_.92fr] lg:gap-14">
              <div className="reveal order-2 lg:order-1">
                <FlowVisual />
              </div>
              <div className="reveal reveal-delay-1 order-1 lg:order-2">
                <h2 className="max-w-[500px] font-sans text-[clamp(2rem,3.4vw,3.4rem)] font-semibold leading-[1.02] tracking-[-.045em] text-[#172d26]">Ideas that flow, arguments that land.</h2>
                <p className="mt-6 max-w-[500px] text-[15px] leading-[1.7] text-[#53675c]">DocuMend analyzes the logical sequence of your document and flags where your reasoning breaks down, jumps ahead, or loses thread so your reader always follows your argument from start to finish.</p>
                <button type="button" onClick={() => setModalOpen(true)} className="btn-primary mt-7 flex items-center gap-3 rounded-full bg-[#d8a53c] px-4 py-2.5 text-sm font-medium text-[#172d26] shadow-[0_3px_0_#b67d18]">Fix my Flow <ArrowRight size={15} /></button>
              </div>
            </article>

            <article className="feature-story grid items-center gap-8 rounded-[9px] bg-[#f3eee3] p-5 sm:p-8 lg:grid-cols-[.92fr_1.08fr] lg:gap-14">
              <div className="reveal order-1">
                <h2 className="max-w-[500px] font-sans text-[clamp(2rem,3.4vw,3.4rem)] font-semibold leading-[1.02] tracking-[-.045em] text-[#172d26]">Say it once. Say it well.</h2>
                <p className="mt-6 max-w-[500px] text-[15px] leading-[1.7] text-[#53675c]">DocuMend identifies repeated ideas, duplicate sentences, and redundant phrases scattered across your document then suggests cleaner, tighter alternatives so every word earns its place.</p>
                <button type="button" onClick={() => setModalOpen(true)} className="btn-primary mt-7 flex items-center gap-3 rounded-full bg-[#d8a53c] px-4 py-2.5 text-sm font-medium text-[#172d26] shadow-[0_3px_0_#b67d18]">Cut the Clutter <ArrowRight size={15} /></button>
              </div>
              <div className="reveal reveal-delay-1 order-2">
                <ClutterVisual />
              </div>
            </article>

            <article className="feature-story grid items-center gap-8 rounded-[9px] bg-[#c8d1cb] p-5 sm:p-8 lg:grid-cols-[1.08fr_.92fr] lg:gap-14">
              <div className="reveal order-2 lg:order-1">
                <SecureShareVisual />
              </div>
              <div className="reveal reveal-delay-1 order-1 lg:order-2">
                <h2 className="max-w-[500px] font-sans text-[clamp(2rem,3.4vw,3.4rem)] font-semibold leading-[1.02] tracking-[-.045em] text-[#172d26]">Share confidently, always.</h2>
                <p className="mt-6 max-w-[500px] text-[15px] leading-[1.7] text-[#53675c]">DocuMend encrypts your document with AES-256 before sharing so only your intended recipient can read it. No third-party servers, no exposed drafts, no compromised confidentiality.</p>
                <button type="button" onClick={() => setModalOpen(true)} className="btn-primary mt-7 flex items-center gap-3 rounded-full bg-[#d8a53c] px-4 py-2.5 text-sm font-medium text-[#172d26] shadow-[0_3px_0_#b67d18]">Share Securely <ArrowRight size={15} /></button>
              </div>
            </article>

            <article className="feature-story grid items-center gap-8 rounded-[9px] bg-[#f3eee3] p-5 sm:p-8 lg:grid-cols-[.92fr_1.08fr] lg:gap-14">
              <div className="reveal order-1">
                <h2 className="max-w-[500px] font-sans text-[clamp(2rem,3.4vw,3.4rem)] font-semibold leading-[1.02] tracking-[-.045em] text-[#172d26]">No missing pieces. No loose ends.</h2>
                <p className="mt-6 max-w-[500px] text-[15px] leading-[1.7] text-[#53675c]">DocuMend analyzes your document's structure and flags missing transitions, incomplete sections, and arguments left without conclusions — so your work reads as a complete, coherent whole.</p>
                <button type="button" onClick={() => setModalOpen(true)} className="btn-primary mt-7 flex items-center gap-3 rounded-full bg-[#d8a53c] px-4 py-2.5 text-sm font-medium text-[#172d26] shadow-[0_3px_0_#b67d18]">Fill the Gaps <ArrowRight size={15} /></button>
              </div>
              <div className="reveal reveal-delay-1 order-2">
                <GapsVisual />
              </div>
            </article>
          </div>
        </section>

        {/* METRICS — the dashboard mockup, with the same three headline
            figures repeated as large text beside it. Update both if they change. */}
        <section id="metrics" className="bg-[#f3eee3] py-24 sm:py-32">
          <div className="container-wide">
            <div className="reveal text-center">
              <h2 className="font-sans text-[clamp(2.4rem,5vw,4.8rem)] font-semibold leading-[.98] tracking-[-.055em] text-[#172d26]">Real numbers that matter</h2>
              <p className="mt-4 text-base text-[#53675c] sm:text-lg">DocuMend users write faster and safer every day</p>
            </div>
            <div className="mt-12 grid items-center gap-10 lg:grid-cols-[1.45fr_.65fr] lg:gap-16">
              <div className="reveal">
                <MetricsVisual />
              </div>
              <div className="reveal reveal-delay-1 space-y-8">
                <div className="border-b border-[#b5c0b3] pb-7">
                  <strong className="block font-sans text-5xl font-semibold leading-none tracking-[-.055em] text-[#172d26] sm:text-6xl">50K</strong>
                  <span className="mt-2 block text-base font-semibold text-[#53675c]">Documents edited locally</span>
                </div>
                <div className="border-b border-[#b5c0b3] pb-7">
                  <strong className="block font-sans text-5xl font-semibold leading-none tracking-[-.055em] text-[#172d26] sm:text-6xl">99.8%</strong>
                  <span className="mt-2 block text-base font-semibold text-[#53675c]">Encryption success rate</span>
                </div>
                <div>
                  <strong className="block font-sans text-5xl font-semibold leading-none tracking-[-.055em] text-[#172d26] sm:text-6xl">2.3x</strong>
                  <span className="mt-2 block text-base font-semibold text-[#53675c]">Faster than Cloud alternatives</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* TESTIMONIALS — rendered from the `testimonials` array above. */}
        <section id="voices" className="bg-[#f3eee3] py-24 sm:py-32">
          <div className="container-wide">
            <div className="reveal text-center">
              <h2 className="font-sans text-[clamp(2.5rem,5vw,4.8rem)] font-semibold leading-[.98] tracking-[-.055em] text-[#172d26]">What writers say</h2>
              <p className="mx-auto mt-5 max-w-[760px] text-base font-semibold leading-relaxed text-[#53675c] sm:text-lg">Privacy-focused writers and academics trust DocuMend with their work</p>
            </div>
            <div className="mt-12 grid gap-4 lg:grid-cols-3">
              {testimonials.map(({ quote, name, role }, index) => (
                <figure key={name} className={`reveal reveal-delay-${index + 1} flex min-h-[260px] flex-col rounded-[8px] bg-[#3b554d] p-6 text-[#f3eee3] shadow-[0_14px_28px_rgba(23,45,38,.1)] sm:p-7`}>
                  <div className="flex gap-1 text-[#d8a53c]" aria-label="5 out of 5 stars">
                    {Array.from({ length: 5 }).map((_, starIndex) => <Star key={starIndex} size={18} fill="currentColor" strokeWidth={1.4} />)}
                  </div>
                  <blockquote className="mt-6 text-sm leading-[1.65]">"{quote}"</blockquote>
                  <figcaption className="mt-auto flex items-end gap-3 border-t border-[#d8e0d6]/15 pt-5">
                    <span className="flex h-10 w-10 items-center justify-center rounded-full border border-[#d8a53c]/70 bg-[#d8a53c]/10 font-display text-2xl text-[#d8a53c]">{name.charAt(0)}</span>
                    <span><strong className="block text-sm font-semibold">{name}</strong><span className="mt-1 block text-xs text-[#b9c8bd]">{role}</span></span>
                  </figcaption>
                </figure>
              ))}
            </div>
          </div>
        </section>

        {/* FAQ — the one dark section, breaking up the run of light ones.
            Each row toggles its own index in the `openFaqs` set. */}
        <section id="faq" className="bg-[#172d26] py-24 text-[#f3eee3] sm:py-32">
          <div className="container-wide">
            <div className="reveal">
              <h2 className="font-sans text-[clamp(3.4rem,7vw,6.6rem)] font-semibold leading-[.88] tracking-[-.06em]">FAQs</h2>
              <p className="mt-5 max-w-[700px] text-base text-[#bdc8bc] sm:text-lg">Answers to the questions writers ask most about DocuMend</p>
            </div>
            <div className="mt-12 grid gap-x-12 gap-y-3 border-y border-[#d8e0d6]/15 py-2 md:grid-cols-2">
              {faqs.map(({ question, answer }, index) => {
                const isOpen = openFaqs.has(index);
                return (
                  <div key={question} className="faq-item reveal border-b border-[#d8e0d6]/15 last:border-b-0">
                    {/* Copies the Set before mutating it — editing `current`
                        in place would keep the same reference and React would
                        skip the re-render. */}
                    <button type="button" onClick={() => setOpenFaqs((current) => { const next = new Set(current); if (next.has(index)) next.delete(index); else next.add(index); return next; })} className="flex w-full items-start gap-3 py-6 text-left" aria-expanded={isOpen}>
                      <CircleHelp size={20} className="mt-0.5 shrink-0 text-[#d8a53c]" />
                      <span className="flex-1 text-base font-semibold text-[#f3eee3] sm:text-lg">{question}</span>
                      <span className="font-mono text-lg text-[#d8a53c]">{isOpen ? '−' : '+'}</span>
                    </button>
                    {isOpen && <p className="pb-6 pl-8 text-sm leading-[1.7] text-[#bdc8bc] sm:text-base">{answer}</p>}
                  </div>
                );
              })}
            </div>
            <div className="reveal mt-14">
              <h3 className="font-sans text-3xl font-semibold tracking-[-.04em] text-[#f3eee3] sm:text-4xl">Need more help?</h3>
              <p className="mt-2 text-sm text-[#bdc8bc] sm:text-base">Reach out to our support team with questions or features requests</p>
              <button type="button" onClick={() => setModalOpen(true)} className="btn-primary mt-6 flex items-center gap-3 rounded-[3px] bg-[#d8a53c] px-6 py-3 text-sm font-semibold text-[#172d26] shadow-[0_3px_0_#b67d18]">Contact <ArrowRight size={16} /></button>
            </div>
          </div>
        </section>

        {/* CONTACT — real mailto:/tel: links, so these details are live. */}
        <section id="contact" className="bg-[#f3eee3] py-24 sm:py-32">
          <div className="container-wide">
            <div className="reveal">
              <h2 className="font-sans text-[clamp(2.8rem,5vw,5rem)] font-semibold leading-[.95] tracking-[-.055em] text-[#172d26]">Get in touch</h2>
              <p className="mt-4 text-base text-[#53675c] sm:text-lg">Questions about DocuMend or need help getting started?</p>
            </div>
            <div className="mt-12 grid items-center gap-12 lg:grid-cols-[.7fr_1.3fr] lg:gap-16">
              <div className="reveal space-y-8">
                <div className="flex items-start gap-4"><Mail size={22} className="mt-1 text-[#172d26]" /><div><h3 className="text-base font-semibold text-[#172d26]">Email</h3><p className="mt-1 text-sm text-[#53675c]">Send us a message</p><a href="mailto:documend@gmail.com" className="mt-1 block text-sm font-semibold text-[#172d26] hover:text-[#b67d18]">documend@gmail.com</a></div></div>
                <div className="flex items-start gap-4"><Phone size={22} className="mt-1 text-[#172d26]" /><div><h3 className="text-base font-semibold text-[#172d26]">Phone</h3><p className="mt-1 text-sm text-[#53675c]">Call our team</p><a href="tel:03001234567" className="mt-1 block text-sm font-semibold text-[#172d26] hover:text-[#b67d18]">0300-1234567</a></div></div>
                <div className="flex items-start gap-4"><Instagram size={22} className="mt-1 text-[#172d26]" /><div><h3 className="text-base font-semibold text-[#172d26]">Instagram</h3><p className="mt-1 text-sm text-[#53675c]">DM us directly</p><a href="https://instagram.com/documend.support" className="mt-1 block text-sm font-semibold text-[#172d26] hover:text-[#b67d18]">@documend.support</a></div></div>
              </div>
              <div className="reveal reveal-delay-1">
                <ContactVisual />
              </div>
            </div>
          </div>
        </section>

      </main>

      {/* Footer. The subscribe form doesn't collect anything itself — it just
          opens the invite dialog, which asks for the address properly. */}
      <footer className="border-t border-[#718478]/30 bg-[#10251f] py-9 text-[#d8e0d6]">
        <div className="container-wide flex flex-col justify-between gap-8 sm:flex-row sm:items-end">
          <div><a href="#top" className="text-[#f3eee3]"><BrandMark /></a><p className="mt-4 max-w-[270px] text-xs leading-relaxed text-[#91a89a]">An intelligent self-healing document editor for people who still believe the sentence matters.</p></div>
          <div className="flex flex-col items-start gap-5 sm:items-end">
            <div className="flex flex-wrap gap-5 text-xs text-[#91a89a]"><a href="#instrument" className="hover:text-[#d8a53c]">About us</a><a href="#contact" className="hover:text-[#d8a53c]">Contact us</a><a href="#faq" className="hover:text-[#d8a53c]">Support</a><a href="#metrics" className="hover:text-[#d8a53c]">Plans</a></div>
            <form onSubmit={(event) => { event.preventDefault(); setModalOpen(true); }} className="flex items-center gap-3">
              <label htmlFor="subscribe-email" className="text-sm font-semibold text-[#f3eee3]">Subscribe</label>
              <input id="subscribe-email" type="email" required placeholder="Enter Email" className="h-10 w-[180px] border border-[#d8e0d6]/20 bg-[#f3eee3] px-3 text-sm text-[#172d26] outline-none placeholder:text-[#718478] focus:border-[#d8a53c]" />
              <button type="submit" className="text-sm font-semibold text-[#f3eee3] hover:text-[#d8a53c]">Join</button>
            </form>
          </div>
        </div>
      </footer>
      <AppModal open={modalOpen} onClose={() => setModalOpen(false)} />
    </div>
  );
}

export default LandingPage;
