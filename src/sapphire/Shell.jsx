// Page frame for the Sapphire service pages. Reuses the portal's existing layout styles
// (sidebar, top bar, panels) so these pages look like the rest of the bank.
import { useState } from 'react';
import { Alert, Button, Chip, TextField } from '@mui/material';
import { ArrowLeftRight, FileText, Landmark, LogOut, ShieldCheck, UserPlus } from 'lucide-react';
import { loadSession, saveSession, signIn } from './api';
import '../sapphire.css';

const LINKS = [
  ['#/', 'Accounts and transfers', ArrowLeftRight],
  ['#/register', 'Open an account', UserPlus],
  ['#/services', 'My loans and portfolio', FileText],
  ['#/admin', 'Bank admin', ShieldCheck],
];

export function useBackendSession() {
  const [session, setSession] = useState(loadSession);
  const signOut = () => { saveSession(null); setSession(null); };
  return [session, setSession, signOut];
}

export function Shell({ bank, active, title, subtitle, session, onSignOut, children }) {
  return <div className="layout">
    <aside className="sidebar">
      <a className="brand sapphire-brand" href="#/"><span className="brand-icon"><Landmark size={23} /></span>
        <span><strong>{bank.wordmark || bank.name}</strong><small>BANKING PORTAL</small></span></a>
      <nav aria-label="Sapphire Bank pages">
        {LINKS.map(([href, label, Icon]) => <a key={href} href={href}
          className={'sapphire-nav' + (active === href ? ' active' : '')} aria-current={active === href ? 'page' : undefined}>
          <Icon size={17} /> {label}</a>)}
        {session && <button type="button" onClick={onSignOut}><LogOut size={17} /> Sign out</button>}
      </nav>
    </aside>
    <div className="main">
      <header className="topbar"><strong>{bank.name} · {bank.id}</strong>
        {session ? <Chip label={session.email} size="small" className="demo" /> : <Chip label="Sapphire services" size="small" className="demo" />}
      </header>
      <main className="content sapphire-content">
        <div className="page-head"><div><h1>{title}</h1>{subtitle && <p className="sapphire-subtitle">{subtitle}</p>}</div></div>
        {children}
      </main>
    </div>
  </div>;
}

export function SignInPanel({ bank, onSignedIn, note }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setError('');
    if (!email.trim() || !password) { setError('Enter your email and password.'); return; }
    setBusy(true);
    try { onSignedIn(await signIn(email, password)); setPassword(''); }
    catch (failure) { setError(failure.message); }
    finally { setBusy(false); }
  }

  return <section className="panel sapphire-narrow"><header className="panel-head"><div>
    <h2>Sign in to {bank.name}</h2><p>{note || 'Use your Sapphire Bank email and password.'}</p></div></header>
    <form className="transfer-form" onSubmit={submit} noValidate>
      <TextField label="Email" type="email" autoComplete="email" required value={email} onChange={e => setEmail(e.target.value)} disabled={busy} />
      <TextField label="Password" type="password" autoComplete="current-password" required value={password} onChange={e => setPassword(e.target.value)} disabled={busy} />
      {error && <Alert severity="error">{error}</Alert>}
      <div><Button type="submit" variant="contained" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</Button></div>
    </form>
  </section>;
}
