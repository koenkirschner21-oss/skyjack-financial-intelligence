import React, { useId, useState } from 'react';
import { Eye, EyeOff, Loader2 } from 'lucide-react';
import { SkyjackLogo } from '../components/brand/SkyjackLogo';
import { useAuth } from '../context/AuthContext';

export const LoginPage: React.FC = () => {
  const { phase, notice, submitting, signIn } = useAuth();
  const emailId = useId();
  const passwordId = useId();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const unconfigured = phase === 'unconfigured';

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const result = await signIn(email, password);
    if (!result.ok) setError(result.message);
  }

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#0C0D0F] text-[#231F20] flex items-center justify-center px-4 py-10">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(229,60,46,0.16),transparent_46%),radial-gradient(ellipse_at_bottom,rgba(255,255,255,0.05),transparent_42%)]"
      />
      <div className="relative w-full max-w-[420px] bg-white border border-white/70 rounded-2xl shadow-[0_28px_70px_rgba(0,0,0,0.45)] p-7 sm:p-9">
        <div className="flex justify-center">
          <SkyjackLogo variant="light-surface" />
        </div>
        <h1 className="mt-5 text-center text-[1.35rem] font-semibold tracking-tight text-[#231F20]">
          SKYJACK Financial Intelligence
        </h1>

        <form className="mt-7 space-y-4" onSubmit={onSubmit} noValidate>
          <div className="space-y-1.5">
            <label htmlFor={emailId} className="text-xs font-medium text-[#231F20]">
              Email
            </label>
            <input
              id={emailId}
              name="email"
              type="email"
              autoComplete="username"
              required
              value={email}
              disabled={unconfigured || submitting}
              onChange={(event) => setEmail(event.target.value)}
              className="w-full h-11 px-3 text-sm rounded-lg border border-[#E2E5E8] bg-[#FAFBFC] focus:outline-none focus:border-[#231F20] focus:ring-2 focus:ring-[#231F20]/15"
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor={passwordId} className="text-xs font-medium text-[#231F20]">
              Password
            </label>
            <div className="relative">
              <input
                id={passwordId}
                name="password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                required
                value={password}
                disabled={unconfigured || submitting}
                onChange={(event) => setPassword(event.target.value)}
                aria-invalid={error ? true : undefined}
                className="w-full h-11 pl-3 pr-11 text-sm rounded-lg border border-[#E2E5E8] bg-[#FAFBFC] focus:outline-none focus:border-[#231F20] focus:ring-2 focus:ring-[#231F20]/15"
              />
              <button
                type="button"
                className="absolute inset-y-0 right-0 px-3 text-[#5F6368] hover:text-[#231F20]"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                aria-pressed={showPassword}
                onClick={() => setShowPassword((current) => !current)}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {(error || notice) && (
            <p role="alert" className="text-xs text-[#9B1C1C] bg-[#FDECEC] border border-[#F3C7C7] rounded-md px-3 py-2">
              {error ?? notice}
            </p>
          )}

          <button
            type="submit"
            disabled={unconfigured || submitting}
            aria-busy={submitting}
            className="w-full h-11 mt-1 rounded-lg bg-[#231F20] text-white text-sm font-medium shadow-sm hover:bg-[#3A3536] disabled:opacity-60 disabled:cursor-not-allowed inline-flex items-center justify-center gap-2"
          >
            {submitting && <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />}
            {submitting ? 'Signing in' : 'Sign in'}
          </button>
        </form>
      </div>
    </main>
  );
};

export const AuthLoadingScreen: React.FC = () => (
  <main className="min-h-screen bg-[#0C0D0F] text-white flex items-center justify-center" aria-busy="true">
    <p className="text-sm text-[#C8CACC]">Restoring your session…</p>
  </main>
);
