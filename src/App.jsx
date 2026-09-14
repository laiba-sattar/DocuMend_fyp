/**
 * App.jsx
 * -----------------------------------------------------------------------------
 * Root Application Entrypoint & Client-Side Routing Table.
 * 
 * Features:
 * - ErrorBoundary for catching rendering runtime errors.
 * - Global ThemeProvider wrapper enabling synchronized dark/light switching across all pages.
 * - Normalized pathname router supporting both lowercase and capitalized URLs.
 * -----------------------------------------------------------------------------
 */

import { ErrorBoundary } from './components/ErrorBoundary';
import { ThemeProvider } from './components/ThemeContext'; // <-- Global theme provider
import { AuthProvider } from './components/AuthContext';    // <-- Who is signed in (S5)
import { RequireAccount } from './components/RequireAccount';

// Page Components
import Dashboard from './pages/Dashboard';
import Editor from './pages/Editor';
import ForgotPassword from './pages/ForgotPassword';
import LandingPage from './pages/LandingPage';
import LogIn from './pages/LogIn';
import FinishSignIn from './pages/FinishSignIn';
import SetPassword from './pages/SetPassword';
import MyDocuments from './pages/MyDocuments';
import NotFound from './pages/NotFound';
import Pricing from './pages/Pricing';
import SignUp from './pages/SignUp';
import UploadDocument from './pages/UploadDocument';
import VersionHistory from './pages/Version';
import Features from './pages/Features';
import Settings from './pages/Settings';
import Help from './pages/Help';
import Storage from './pages/Storage';
import Share from './pages/Share';
import CreateDocument from './pages/CreateDocument'; // <-- Import karein
import CreateFolder from './pages/CreateFolder';
import Edit from './pages/Edit';

// Custom lightweight router hook
import { usePathname } from './router';

function Router() {
  const rawPathname = usePathname();

  // Normalize pathname: convert to lowercase and strip trailing slashes to prevent 404s
  const pathname = rawPathname ? rawPathname.toLowerCase().replace(/\/$/, '') || '/' : '/';

  // Public & Auth Routes
  if (pathname === '/' || pathname === '') return <LandingPage />;
  if (pathname === '/signup') return <SignUp />;
  if (pathname === '/login') return <LogIn />;
  if (pathname === '/forgot-password' || pathname === '/reset-password') return <ForgotPassword />;
  // Where the emailed sign-in link lands. It signs the reader in and moves on
  // to /dashboard, so the login form is never shown to someone who just
  // clicked their own link.
  if (pathname === '/finish-sign-in' || pathname === '/finish-signin') return <FinishSignIn />;

  // Pages anyone may read, account or not.
  if (pathname === '/features') return <Features />;
  if (pathname === '/pricing' || pathname === '/subscription') return <Pricing />;
  if (pathname === '/help' || pathname === '/help-and-guide') return <Help />;

  // Everything below is the workspace: it needs an account.
  return <RequireAccount>{workspaceRoute(pathname)}</RequireAccount>;
}

/** The pages behind the sign-in wall. */
function workspaceRoute(pathname) {

  // Workspace Protected Routes
  if (pathname === '/dashboard') return <Dashboard />;
  // The end of "Forgot password?": the emailed link signs them in, then sends
  // them here to choose a new one.
  if (pathname === '/set-password') return <SetPassword />;
  if (pathname === '/documents' || pathname === '/my-documents') return <MyDocuments />;
  if (pathname === '/editor') return <Editor />;
  if (pathname === '/version' || pathname === '/version-history') return <VersionHistory />;
  if (pathname === '/create-document' || pathname === '/createdocument') return <CreateDocument />; // <-- Add route
  if (pathname === '/create-folder' || pathname === '/createfolder') return <CreateFolder />;
  if (pathname === '/settings') return <Settings />;
  if (pathname === '/storage') return <Storage />;
  if (pathname === '/upload' || pathname === '/upload-document') return <UploadDocument />;
  if (pathname === '/share' || pathname === '/share-document') return <Share />;
  if (pathname === '/edit' || pathname === '/select-document') return <Edit />;

  // Fallback 404
  return <NotFound />;
}

function App() {
  return (
    <ErrorBoundary>
      {/* ThemeProvider supplies the global dark/light state to all routed pages */}
      <ThemeProvider>
        <AuthProvider>
          <Router />
        </AuthProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;