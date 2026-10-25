'use client';
import Link from 'next/link';
import { useRef, useState, useSyncExternalStore } from 'react';

const subscribeHash = (notify: () => void) => { window.addEventListener('hashchange', notify); return () => window.removeEventListener('hashchange', notify); };
const readHash = () => window.location.hash;

export default function ResetPassword({ tokenHash, authenticated, dashboardUrl }: {
  tokenHash: string; authenticated: boolean; dashboardUrl: string;
}) {
  const [ready, setReady] = useState(authenticated), [busy, setBusy] = useState(false);
  const [error, setError] = useState(''), [saved, setSaved] = useState(false), [revoked, setRevoked] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const fragment = useSyncExternalStore(subscribeHash, readHash, () => '');
  const link = new URLSearchParams(fragment.slice(1));
  const implicitLink = link.get('type') === 'recovery' && Boolean(link.get('access_token') && link.get('refresh_token'));
  const linkError = Boolean(link.get('error') || link.get('error_code'));
  const passwordField = useRef<HTMLInputElement>(null), confirmField = useRef<HTMLInputElement>(null);
  const cleanUrl = () => window.history.replaceState(null, '', '/admin/library/reset-password');
  return <div className="az-library"><a className="skip" href="#library-main">Skip to password reset</a>
    <header className="masthead"><div className="masthead-inner"><Link href="/library" className="identity">Library</Link></div></header>
    <main id="library-main" tabIndex={-1}><section className="login-panel"><h1>Reset your library password</h1>
      {saved ? <><p role="status">Your password has been changed. Sign in with your new password.</p>
        {!revoked && <p role="alert">Other sessions could not be signed out. Review your sessions in Supabase.</p>}
        <Link className="primary" href="/admin/library">Back to sign in</Link></>
      : ready ? <><p>Choose a new password for your library account. Use at least 12 characters.</p>
        <form onSubmit={async e => {
          e.preventDefault(); const form = e.currentTarget; setError('');
          const password = passwordField.current?.value ?? '';
          if (password !== confirmField.current?.value) { setError('The passwords do not match. Enter the same password in both fields.'); confirmField.current?.focus(); return; }
          setBusy(true);
          try {
            const response = await fetch('/api/library/auth/recovery', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password }) });
            const result = await response.json();
            if (!response.ok) throw new Error(result.error);
            form.reset(); cleanUrl(); setRevoked(result.sessionsRevoked); setSaved(true);
          } catch (err) { setError(err instanceof Error ? err.message : 'The password could not be changed. Try again.'); }
          finally { setBusy(false); }
        }}>
          <label className="form-field">New password<input ref={passwordField} type={showPassword ? 'text' : 'password'} name="password" autoComplete="new-password" minLength={12} maxLength={1000} required aria-describedby="reset-help reset-error" /></label>
          <label className="form-field">Confirm new password<input ref={confirmField} type={showPassword ? 'text' : 'password'} name="confirm-password" autoComplete="new-password" minLength={12} maxLength={1000} required aria-describedby="reset-error" aria-invalid={Boolean(error)} /></label>
          <button type="button" className="text-button" onClick={() => setShowPassword(v => !v)} aria-pressed={showPassword}>{showPassword ? 'Hide passwords' : 'Show passwords'}</button>
          <p id="reset-help">A long passphrase or a password from your password manager works well.</p>
          <p id="reset-error" role={error ? 'alert' : undefined}>{error}</p>
          <button className="primary" disabled={busy}>{busy ? 'Saving password…' : 'Save new password'}</button>
        </form></>
      : tokenHash || implicitLink ? <><p>Continue to verify your email link, then choose a new password.</p>
        <button className="primary" disabled={busy} onClick={async () => {
          setBusy(true); setError('');
          try {
            const credentials = tokenHash ? { tokenHash } : { accessToken: link.get('access_token'), refreshToken: link.get('refresh_token') };
            cleanUrl();
            const response = await fetch('/api/library/auth/recovery', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(credentials) });
            const result = await response.json(); if (!response.ok) throw new Error(result.error);
            cleanUrl(); setReady(true);
          } catch (err) { setError(err instanceof Error ? err.message : 'The reset link could not be verified. Try again.'); }
          finally { setBusy(false); }
        }}>{busy ? 'Verifying link…' : 'Continue to reset password'}</button>
        {error && <p role="alert">{error}</p>}</>
      : <>{linkError && <p role="alert">This reset link is invalid or has expired. Request a new recovery email.</p>}<p>Request a recovery email from your Supabase dashboard. Your library account is separate from your Supabase dashboard login.</p>
        <ol className="recovery-steps"><li>Open Authentication → Users and select your library account.</li><li>Click Send password recovery.</li><li>Open the email link on this computer to choose a new password.</li></ol>
        <a className="primary" href={dashboardUrl} target="_blank" rel="noreferrer">Open Supabase users</a>{error && <p role="alert">{error}</p>}</>}
      {!saved && <p><Link className="text-button" href="/admin/library">Back to sign in</Link></p>}
    </section></main></div>;
}
