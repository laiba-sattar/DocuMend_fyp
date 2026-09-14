/**
 * SignUp — the account creation page, served at the `/signup` route.
 *
 * Reached from the "Get started" buttons on the landing page (see
 * `navigate('/signup')` in LandingPage.jsx). The "Back" button below uses
 * `history.back()`, which returns the visitor to wherever they came from.
 *
 * This is a front-end-only form: it validates input and shows a success
 * message, but nothing is sent anywhere yet. Wire `handleSubmit` and
 * `continueWith` to a real API / OAuth provider when the backend exists.
 */
import { useState } from "react";
import { useAuth } from "../components/AuthContext";
import { SocialSignIn } from "../components/SocialSignIn";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Eye,
  EyeOff,
  LockKeyhole,
  Sparkles,
} from "lucide-react";
import "./sign-up.css";
import { BrandMark } from "../components/BrandMark";
import { navigate } from "../router";

// Blank starting values. Every input below is controlled, so each field needs
// a defined string here -- `undefined` would make React treat them as
// uncontrolled and warn once the user starts typing.
const initialForm = {
  firstName: "",
  lastName: "",
  email: "",
  password: "",
};

/**
 * Decorative illustration on the left panel: a document, a sticky note and a
 * pencil. Drawn as inline SVG rather than an image file so it ships with the
 * component, scales without blurring, and needs no network request.
 */
function DocumentArtwork() {
  return (
    <svg
      className="signup-art"
      viewBox="0 0 410 190"
      role="img"
      aria-label="A friendly document with a pencil and colorful editing notes"
    >
      {/* Sweeping background stroke that the documents sit on top of. */}
      <path
        d="M8 153C45 119 55 40 119 38c62-3 76 52 133 58 53 5 72-38 143-18"
        fill="none"
        stroke="#477466"
        strokeWidth="18"
        strokeLinecap="round"
        opacity=".6"
      />
      {/* Main paper sheet, tilted left. The inner rects are the "text" lines. */}
      <g transform="translate(46 24) rotate(-7 75 65)">
        <rect className="art-paper" width="150" height="117" rx="8" />
        <rect x="16" y="18" width="74" height="8" rx="4" fill="#e8992e" opacity=".8" />
        <rect x="16" y="39" width="116" height="5" rx="2.5" fill="#b7cec2" />
        <rect x="16" y="53" width="101" height="5" rx="2.5" fill="#b7cec2" />
        <rect x="16" y="67" width="116" height="5" rx="2.5" fill="#b7cec2" />
        <rect x="16" y="89" width="51" height="10" rx="5" fill="#de6a50" opacity=".78" />
      </g>
      {/* Yellow note tilted the other way, with a checkmark badge. */}
      <g transform="translate(240 34) rotate(10)">
        <rect width="126" height="92" rx="8" fill="#f2bd56" />
        <rect x="15" y="16" width="55" height="6" rx="3" fill="#fff7dc" />
        <rect x="15" y="34" width="91" height="5" rx="2.5" fill="#fff7dc" opacity=".8" />
        <rect x="15" y="48" width="71" height="5" rx="2.5" fill="#fff7dc" opacity=".8" />
        <circle cx="100" cy="73" r="10" fill="#21483e" />
        <path d="m95 73 4 4 7-8" fill="none" stroke="#f2bd56" strokeWidth="2" />
      </g>
      {/* Pencil: coral body plus a yellow tip. */}
      <path d="m202 126 29-42 11 8-29 42-17 5z" fill="#de6a50" />
      <path d="m231 84 7-10 11 8-7 10z" fill="#f2bd56" />
    </svg>
  );
}

// Brand logos for the social buttons. Both are `aria-hidden` because the
// button's own text ("Google" / "Facebook") already names it for screen
// readers -- announcing the logo too would just repeat it.
function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M21.8 12.2c0-.7-.1-1.4-.2-2H12v3.8h5.5a4.7 4.7 0 0 1-2 3.1v2.6h3.2c1.9-1.7 3.1-4.3 3.1-7.5z"
      />
      <path
        fill="#34A853"
        d="M12 22c2.7 0 5-.9 6.7-2.3l-3.2-2.6c-.9.6-2.1.9-3.5.9-2.7 0-5-1.8-5.8-4.3H2.9v2.7A10.1 10.1 0 0 0 12 22z"
      />
      <path
        fill="#FBBC05"
        d="M6.2 13.7a6 6 0 0 1 0-3.4V7.6H2.9a10.1 10.1 0 0 0 0 8.8l3.3-2.7z"
      />
      <path
        fill="#EA4335"
        d="M12 6c1.5 0 2.8.5 3.8 1.5l2.9-2.9C17 2.9 14.7 2 12 2a10.1 10.1 0 0 0-9.1 5.6l3.3 2.7C7 7.8 9.3 6 12 6z"
      />
    </svg>
  );
}

function FacebookIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#1877F2"
        d="M22 12a10 10 0 1 0-11.6 9.9v-7H7.9V12h2.5V9.8c0-2.5 1.5-3.9 3.8-3.9 1.1 0 2.2.2 2.2.2v2.4h-1.2c-1.2 0-1.6.7-1.6 1.5V12h2.7l-.4 2.9h-2.3v7A10 10 0 0 0 22 12z"
      />
    </svg>
  );
}

export default function SignUp() {
  const [form, setForm] = useState(initialForm);           // current field values
  const [showPassword, setShowPassword] = useState(false); // password shown as plain text?
  const [submitted, setSubmitted] = useState(false);       // show the success banner?
  const [socialMessage, setSocialMessage] = useState("");  // status line under the social buttons
  // Which fields the user has interacted with. Errors are only shown for
  // touched fields, so the form doesn't greet a first-time visitor with a
  // wall of red before they have typed anything.
  const [touched, setTouched] = useState({});

  // The real "create account", from the API (S5).
  const { signUp } = useAuth();
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState("");

  // Every keystroke clears the previous outcome, so a stale "Account created"
  // banner can't linger while the user is editing their details.
  const updateField = (field, value) => {
    setForm((current) => ({ ...current, [field]: value }));
    setSubmitted(false);
    setSocialMessage("");
    setProblem("");
  };

  // Validation is derived from state rather than stored in it -- it is
  // recalculated on every render, so it can never drift out of sync with
  // `form`. An empty string means "no error".
  const errors = {
    firstName:
      touched.firstName && !form.firstName.trim()
        ? "What should we call you?"
        : "",
    lastName:
      touched.lastName && !form.lastName.trim()
        ? "Please add your last name."
        : "",
    email:
      touched.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)
        ? "Try a valid email address."
        : "",
    password:
      touched.password && form.password.length < 8
        ? "Use at least 8 characters."
        : "",
  };

  // Called on blur: the user has now visited this field, so it is fair to
  // start showing its error message.
  const markTouched = (field) => {
    setTouched((current) => ({ ...current, [field]: true }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault(); // keep the browser from doing a full page reload

    // Second press, once the account exists: the button has become the way
    // into the app, so take them there instead of re-validating the form.
    if (submitted) {
      navigate('/dashboard');
      return;
    }

    // Mark everything touched so that submitting an empty form reveals all
    // the errors at once, including for fields never focused.
    const nextTouched = {
      firstName: true,
      lastName: true,
      email: true,
      password: true,
    };

    setTouched(nextTouched);

    // Repeats the rules above without the `touched` guard, since on submit
    // every field must be checked regardless of whether it was visited.
    const isValid =
      Boolean(form.firstName.trim()) &&
      Boolean(form.lastName.trim()) &&
      /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email) &&
      form.password.length >= 8;

    if (!isValid || busy) return;

    setBusy(true);
    setProblem("");
    try {
      await signUp({
        email: form.email.trim(),
        name: `${form.firstName.trim()} ${form.lastName.trim()}`.trim(),
        password: form.password,
      });
      setSubmitted(true);
      window.setTimeout(() => navigate('/dashboard'), 700);
    } catch (error) {
      // "An account with this email already exists", and the like.
      setProblem(error.message || 'The account could not be created.');
    } finally {
      setBusy(false);
    }
  };



  return (
    <main className="signup-shell">
      {/* Two-column card: the story panel on the left, the form on the right.
          Below 760px the CSS stacks them vertically. */}
      <section className="signup-card" aria-label="Create your DocuMend account">

        {/* ---------- Left: branding, headline and illustration ---------- */}
        <div className="signup-story">
          <BrandMark size={30} className="signup-brand" />

          <div className="signup-story-copy">
            <div className="signup-kicker">
              <Sparkles size={13} />
              A better way to begin
            </div>
            <h1>
              Make your words feel <em>like you.</em>
            </h1>
            <p>
              Clearer thinking, kinder edits, and a little more confidence every
              time you open a blank page.
            </p>
          </div>

          <DocumentArtwork />
        </div>

        {/* ---------- Right: the actual sign-up form ---------- */}
        <div className="signup-form-side">
          {/* Returns to the previous page (normally the landing page). */}
          <button
            className="signup-back"
            type="button"
            onClick={() => window.history.back()}
          >
            <ArrowLeft size={15} />
            Back
          </button>

          <div className="signup-form-heading">
            <h2>Let&apos;s get you set up.</h2>
            <p>Your best drafts are closer than you think.</p>
          </div>

          {/* `noValidate` turns off the browser's own bubbles so the custom
              messages defined in `errors` are the only ones shown. */}
          <form className="signup-form" onSubmit={handleSubmit} noValidate>

            {/* First and last name, side by side (stacked under 390px). */}
            <div className="signup-name-row">
              <div>
                <label className="signup-label" htmlFor="first-name">
                  First name
                </label>
                <input
                  className={`signup-input ${errors.firstName ? "signup-input-invalid" : ""}`}
                  id="first-name"
                  name="firstName"
                  autoComplete="given-name"
                  placeholder="Avery"
                  value={form.firstName}
                  aria-invalid={Boolean(errors.firstName)}
                  onChange={(event) => updateField("firstName", event.target.value)}
                  onBlur={() => markTouched("firstName")}
                />
              </div>
              <div>
                <label className="signup-label" htmlFor="last-name">
                  Last name
                </label>
                <input
                  className={`signup-input ${errors.lastName ? "signup-input-invalid" : ""}`}
                  id="last-name"
                  name="lastName"
                  autoComplete="family-name"
                  placeholder="Morgan"
                  value={form.lastName}
                  aria-invalid={Boolean(errors.lastName)}
                  onChange={(event) => updateField("lastName", event.target.value)}
                  onBlur={() => markTouched("lastName")}
                />
              </div>
            </div>

            {/* One shared message for the name row, so two side-by-side errors
                can't push the columns out of alignment. */}
            {(errors.firstName || errors.lastName) && (
              <p className="signup-error">{errors.firstName || errors.lastName}</p>
            )}

            <div>
              <label className="signup-label" htmlFor="email">
                Email address
              </label>
              <input
                className={`signup-input ${errors.email ? "signup-input-invalid" : ""}`}
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                placeholder="you@somewhere.com"
                value={form.email}
                aria-invalid={Boolean(errors.email)}
                onChange={(event) => updateField("email", event.target.value)}
                onBlur={() => markTouched("email")}
              />
              {errors.email && <p className="signup-error">{errors.email}</p>}
            </div>

            <div>
              <label className="signup-label" htmlFor="password">
                Create a password
              </label>
              {/* The wrapper is the positioning context for the eye button. */}
              <div className="signup-input-wrap">
                <input
                  className={`signup-input signup-password-input ${
                    errors.password ? "signup-input-invalid" : ""
                  }`}
                  id="password"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="new-password"
                  placeholder="8 characters or more"
                  value={form.password}
                  aria-invalid={Boolean(errors.password)}
                  onChange={(event) => updateField("password", event.target.value)}
                  onBlur={() => markTouched("password")}
                />
                <button
                  className="signup-eye"
                  type="button"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  onClick={() => setShowPassword((visible) => !visible)}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              {/* The hint occupies the same slot as the error, so the layout
                  doesn't shift when one replaces the other. */}
              {errors.password ? (
                <p className="signup-error">{errors.password}</p>
              ) : (
                <p className="signup-password-hint">
                  <LockKeyhole size={11} />
                  Keep it private, keep it memorable.
                </p>
              )}
            </div>

            {/* `role="status"` makes screen readers announce this the moment
                it appears, without stealing focus from the form. */}
            {submitted && (
              <div className="signup-success" role="status">
                <span className="signup-success-icon">
                  <Check size={14} />
                </span>
                <span>
                  Account created. Welcome to a clearer way of writing,{" "}
                  {form.firstName}.
                </span>
              </div>
            )}

            {/* Keeps the arrow in the success state too: the button is no
                longer a passive "done" label, it now leads to the dashboard. */}
            {problem && (
              <p className="signup-problem" role="alert">{problem}</p>
            )}

            <button className="signup-submit" type="submit" disabled={busy}>
              {submitted ? "You're all set" : busy ? "Creating your account…" : "Create my account"}
              <ArrowRight size={16} />
            </button>
          </form>

          {/* ---------- Social sign-up options ---------- */}
          <div className="signup-divider">or continue with</div>

          {/* Google (no Firebase) and a one-time link by email — see
              components/SocialSignIn.jsx */}
          <SocialSignIn onMessage={setSocialMessage} buttonClass="signup-social" />

          {/* `aria-live` announces the status text whenever it changes. It
              stays in the DOM even when empty so the region is registered. */}
          <p className="signup-social-note" aria-live="polite">
            {socialMessage}
          </p>

          <p className="signup-login">
            Already have an account?{" "}
            <button type="button" onClick={() => navigate("/login")}>
              Log in
            </button>
          </p>
        </div>
      </section>
    </main>
  );
}
