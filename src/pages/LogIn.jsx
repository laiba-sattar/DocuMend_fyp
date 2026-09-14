/*
================================================================================
  PAGE OVERVIEW: LogIn.jsx (DocuMend Login Page)
================================================================================
  Purpose:
  - This component renders the user login screen for the DocuMend application.
  
  Key Features:
  1. Left Section (Branding & Artwork):
     - Displays DocuMend branding, welcoming slogans, and a custom SVG graphic.
  2. Right Section (Form & Authentication):
     - Email and Password inputs with inline validation checks.
     - Password visibility toggle (Show/Hide with Eye icons).
     - "Remember me" checkbox state management.
     - "Forgot password?" action.
     - Social login buttons for Google and Facebook.
     - Redirection prompt for new users to create an account.
================================================================================
*/

import { useState } from "react";
import { useAuth } from "../components/AuthContext";
import { SocialSignIn } from "../components/SocialSignIn";
// Lucide icons used across the UI
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Eye,
  EyeOff,
  LockKeyhole,
  Sparkles,
} from "lucide-react";
// CSS styling specific to the Login page
import "./log-in.css";
import { BrandMark } from "../components/BrandMark";
import { navigate } from "../router";

/* -------------------------------------------------------------------------- */
/*                        SUB-COMPONENT: LOGIN ARTWORK                        */
/* -------------------------------------------------------------------------- */
// Renders the decorative SVG graphic shown on the left panel
function LoginArtwork() {
  return (
    <svg
      className="login-art"
      viewBox="0 0 410 190"
      role="img"
      aria-label="A document with a pencil and a friendly check mark"
    >
      {/* Background swoosh wave */}
      <path
        d="M8 153C45 119 55 40 119 38c62-3 76 52 133 58 53 5 72-38 143-18"
        fill="none"
        stroke="#477466"
        strokeWidth="18"
        strokeLinecap="round"
        opacity=".6"
      />
      {/* Document illustration */}
      <g transform="translate(52 26) rotate(-7 75 65)">
        <rect className="login-art-paper" width="153" height="118" rx="8" />
        <rect x="17" y="18" width="72" height="8" rx="4" fill="#e8992e" opacity=".8" />
        <rect x="17" y="40" width="118" height="5" rx="2.5" fill="#b7cec2" />
        <rect x="17" y="54" width="102" height="5" rx="2.5" fill="#b7cec2" />
        <rect x="17" y="68" width="87" height="5" rx="2.5" fill="#b7cec2" />
        <rect x="17" y="90" width="53" height="10" rx="5" fill="#de6a50" opacity=".78" />
      </g>
      {/* Success badge with checkmark */}
      <g transform="translate(252 33) rotate(10)">
        <rect width="108" height="82" rx="9" fill="#f2bd56" />
        <circle cx="54" cy="41" r="23" fill="#21483e" />
        <path
          d="m43 41 8 8 17-19"
          fill="none"
          stroke="#f2bd56"
          strokeWidth="5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </g>
      {/* Pencil illustration elements */}
      <path d="m202 126 29-42 11 8-29 42-17 5z" fill="#de6a50" />
      <path d="m231 84 7-10 11 8-7 10z" fill="#f2bd56" />
    </svg>
  );
}

/* -------------------------------------------------------------------------- */
/*                         SUB-COMPONENT: GOOGLE ICON                         */
/* -------------------------------------------------------------------------- */
// Official Google multi-color SVG icon
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

/* -------------------------------------------------------------------------- */
/*                        SUB-COMPONENT: FACEBOOK ICON                        */
/* -------------------------------------------------------------------------- */
// Official Facebook brand SVG icon
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

/* -------------------------------------------------------------------------- */
/*                           MAIN LOGIN COMPONENT                             */
/* -------------------------------------------------------------------------- */
export default function LogIn() {
  // Form input values (email and password)
  const [form, setForm] = useState({ email: "", password: "" });
  
  // Toggles password between plaintext and hidden password mask
  const [showPassword, setShowPassword] = useState(false);
  
  // Keeps track of the "Remember me" checkbox state
  const [rememberMe, setRememberMe] = useState(false);
  
  // Tracks whether the form has passed validation and been submitted
  const [submitted, setSubmitted] = useState(false);
  
  // Status or helper message shown to the user
  const [message, setMessage] = useState("");
  
  // Tracks which fields the user has focused and left (blurred)
  const [touched, setTouched] = useState({});

  // The real sign-in, from the API (S5).
  const { signIn } = useAuth();
  const [busy, setBusy] = useState(false);

  // Helper function to update input state and clear old status messages
  const updateField = (field, value) => {
    setForm((current) => ({ ...current, [field]: value }));
    setSubmitted(false);
    setMessage("");
  };

  // Inline validation checks for email format and password length
  const errors = {
    email:
      touched.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)
        ? "Try a valid email address."
        : "",
    password:
      touched.password && form.password.length < 8
        ? "Your password needs at least 8 characters."
        : "",
  };

  // Handles form submission: this now really signs in against the API.
  const handleSubmit = async (event) => {
    event.preventDefault();

    // Second press, once signed in: the button has become the way into the
    // app, so take them there instead of signing in again.
    if (submitted) {
      navigate("/dashboard");
      return;
    }

    // Mark both fields as touched when the user clicks submit
    setTouched({ email: true, password: true });

    const isValid =
      /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email) &&
      form.password.length >= 8;
    if (!isValid || busy) return;

    setBusy(true);
    setMessage("");
    try {
      const account = await signIn({ email: form.email.trim(), password: form.password });
      setSubmitted(true);
      setMessage(`Welcome back, ${account.name.split(" ")[0]}. Opening your workspace…`);
      window.setTimeout(() => navigate("/dashboard"), 600);
    } catch (error) {
      // The server's own words: wrong password, server unreachable, and so on.
      setMessage(error.message || "That did not work. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  // The emailed sign-in link is finished inside <SocialSignIn>, which is
  // where Firebase lives — see components/SocialSignIn.jsx.

  return (
    <main className="login-shell">
      <section className="login-card" aria-label="Log in to your DocuMend account">
        
        {/* ========================================================= */}
        {/* LEFT COLUMN: BRANDING, WELCOME TEXT & ARTWORK             */}
        {/* ========================================================= */}
        <div className="login-story">
          {/* Brand logo & icon */}
          <BrandMark size={30} className="login-brand" />

          {/* Heading and taglines */}
          <div className="login-story-copy">
            <div className="login-kicker">
              <Sparkles size={13} />
              Welcome back
            </div>
            <h1>
              Your best words are <em>waiting.</em>
            </h1>
            <p>
              Pick up right where you left off and make your next draft feel
              even more like you.
            </p>
          </div>

          {/* Decorative graphic */}
          <LoginArtwork />
        </div>

        {/* ========================================================= */}
        {/* RIGHT COLUMN: LOGIN FORM & SOCIAL AUTHENTICATION          */}
        {/* ========================================================= */}
        <div className="login-form-side">
          {/* Back button to return to the previous browser page */}
          <button
            className="login-back"
            type="button"
            onClick={() => window.history.back()}
          >
            <ArrowLeft size={15} />
            Back
          </button>

          {/* Form Header */}
          <div className="login-form-heading">
            <h2>Good to see you again.</h2>
            <p>Log in to keep your ideas moving.</p>
          </div>

          {/* Main Credentials Form */}
          <form className="login-form" onSubmit={handleSubmit} noValidate>
            
            {/* EMAIL INPUT FIELD */}
            <div>
              <label className="login-label" htmlFor="login-email">
                Email address
              </label>
              <input
                className={`login-input ${errors.email ? "login-input-invalid" : ""}`}
                id="login-email"
                name="email"
                type="email"
                autoComplete="email"
                placeholder="you@somewhere.com"
                value={form.email}
                aria-invalid={Boolean(errors.email)}
                onChange={(event) => updateField("email", event.target.value)}
                onBlur={() => setTouched((current) => ({ ...current, email: true }))}
              />
              {/* Show error message if email is invalid */}
              {errors.email && <p className="login-error">{errors.email}</p>}
            </div>

            {/* PASSWORD INPUT FIELD */}
            <div>
              <div className="login-password-label-row">
                <label className="login-label" htmlFor="login-password">
                  Password
                </label>
                {/* Forgot Password Trigger */}
                <button
                  className="login-forgot"
                  type="button"
                  onClick={() => navigate("/forgot-password")}
                >
                  Forgot password?
                </button>
              </div>

              {/* Password Input with Show/Hide Button */}
              <div className="login-input-wrap">
                <input
                  className={`login-input login-password-input ${
                    errors.password ? "login-input-invalid" : ""
                  }`}
                  id="login-password"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  placeholder="Your password"
                  value={form.password}
                  aria-invalid={Boolean(errors.password)}
                  onChange={(event) => updateField("password", event.target.value)}
                  onBlur={() =>
                    setTouched((current) => ({ ...current, password: true }))
                  }
                />
                {/* Eye toggle button */}
                <button
                  className="login-eye"
                  type="button"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  onClick={() => setShowPassword((visible) => !visible)}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>

              {/* Error message or reassuring hint */}
              {errors.password ? (
                <p className="login-error">{errors.password}</p>
              ) : (
                <p className="login-password-hint">
                  <LockKeyhole size={11} />
                  Your writing space is safe with us.
                </p>
              )}
            </div>

            {/* REMEMBER ME CHECKBOX */}
            <label className="login-remember">
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={(event) => setRememberMe(event.target.checked)}
              />
              <span className="login-custom-checkbox">
                {rememberMe && <Check size={12} />}
              </span>
              <span>Remember me on this device</span>
            </label>

            {/* SUCCESS BANNER (Shown after valid submission) */}
            {submitted && (
              <div className="login-success" role="status">
                <span className="login-success-icon">
                  <Check size={14} />
                </span>
                <span>{message}</span>
              </div>
            )}

            {/* SUBMIT BUTTON — keeps the arrow in the success state too, since
                the button then leads to the dashboard rather than sitting idle */}
            <button className="login-submit" type="submit">
              {submitted ? "You’re all set" : "Log in to DocuMend"}
              <ArrowRight size={16} />
            </button>
          </form>

          {/* DIVIDER */}
          <div className="login-divider">or continue with</div>

          {/* SOCIAL LOGIN BUTTONS */}
          {/* Google (no Firebase) and a one-time link by email — see
              components/SocialSignIn.jsx */}
          <SocialSignIn onMessage={setMessage} buttonClass="login-social" />

          {/* Dynamic feedback message (e.g. social login status) */}
          <p className="login-social-note" aria-live="polite">
            {message}
          </p>

          {/* SIGN UP REDIRECTION */}
          <p className="login-signup">
            New to DocuMend?{" "}
            <button type="button" onClick={() => navigate("/signup")}>
              Create an account
            </button>
          </p>
        </div>
      </section>
    </main>
  );
}