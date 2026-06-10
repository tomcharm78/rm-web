'use client';

// Login page client logic. Owns mode state + all three forms.
// Single page, three modes:
//   - bootstrap: when no super admin exists yet (one-time setup)
//   - login: email + password (default)
//   - forgot: password reset (manual or self-serve depending on role)

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Globe, Loader2, ShieldCheck } from 'lucide-react';
import { useAuth } from '@/providers/auth-provider';
import { useLanguage } from '@/providers/language-provider';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';

type Mode = 'bootstrap' | 'login' | 'forgot';

export function LoginPageClient({ hasSuperAdmin }: { hasSuperAdmin: boolean }) {
  const router = useRouter();
  const { language, isRTL, setLanguage, t } = useLanguage();
  const {
    user,
    loginWithCredentials,
    registerSuperAdmin,
    requestPasswordReset,
    loginError,
    registerError,
    resetError,
    isLoading,
  } = useAuth();

  const [mode, setMode] = useState<Mode>(hasSuperAdmin ? 'login' : 'bootstrap');

  useEffect(() => {
    if (user) router.replace('/');
  }, [user, router]);

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-slate-50 to-slate-100">
      <header className="flex justify-end p-6">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setLanguage(language === 'en' ? 'ar' : 'en')}
          className="gap-2"
        >
          <Globe className="h-4 w-4" />
          {language === 'en' ? 'العربية' : 'English'}
        </Button>
      </header>

      <main className="flex-1 flex items-center justify-center px-4 pb-12">
        <div className="w-full max-w-md space-y-6" dir={isRTL ? 'rtl' : 'ltr'}>
          <div className="text-center space-y-3">
            <div className="inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
              <ShieldCheck className="h-8 w-8 text-primary" />
            </div>
            <div>
              <h1 className="text-3xl font-bold tracking-tight">{t('app.name')}</h1>
              <p className="text-sm text-muted-foreground mt-1">{t('app.tagline')}</p>
            </div>
          </div>

          {mode === 'bootstrap' && <BootstrapForm onSwitch={(m) => setMode(m)} />}
          {mode === 'login' && (
            <LoginForm
              loginError={loginError}
              isLoading={isLoading}
              onSubmit={loginWithCredentials}
              onForgot={() => setMode('forgot')}
            />
          )}
          {mode === 'forgot' && (
            <ForgotForm
              resetError={resetError}
              isLoading={isLoading}
              onSubmit={requestPasswordReset}
              onBack={() => setMode('login')}
            />
          )}
        </div>
      </main>
    </div>
  );

  function BootstrapForm({ onSwitch: _onSwitch }: { onSwitch: (m: Mode) => void }) {
    const [name, setName] = useState('');
    const [nameAr, setNameAr] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [localError, setLocalError] = useState<string | null>(null);

    async function handleSubmit(e: React.FormEvent) {
      e.preventDefault();
      setLocalError(null);
      if (!name.trim()) return setLocalError('errNameRequired');
      if (!email.trim()) return setLocalError('errEmailRequired');
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return setLocalError('errEmailInvalid');
      if (!password) return setLocalError('errPasswordRequired');
      if (password.length < 8) return setLocalError('errPasswordTooShort');
      if (password !== confirmPassword) return setLocalError('errPasswordsDoNotMatch');
      try {
        await registerSuperAdmin({ name: name.trim(), nameAr: nameAr.trim() || name.trim(), email: email.trim(), password });
      } catch {}
    }

    const displayError = localError || registerError;

    return (
      <Card>
        <CardHeader>
          <CardTitle>{t('auth.bootstrapTitle')}</CardTitle>
          <CardDescription>{t('auth.bootstrapSubtitle')}</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">{t('auth.name')}</Label>
              <Input id="name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" disabled={isLoading} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="nameAr">{t('auth.nameAr')}</Label>
              <Input id="nameAr" value={nameAr} onChange={(e) => setNameAr(e.target.value)} dir="rtl" disabled={isLoading} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">{t('auth.email')}</Label>
              <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" disabled={isLoading} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">{t('auth.password')}</Label>
              <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" disabled={isLoading} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm">{t('auth.confirmPassword')}</Label>
              <Input id="confirm" type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} autoComplete="new-password" disabled={isLoading} />
            </div>
            {displayError && (<Alert variant="destructive"><AlertDescription>{t(`auth.${displayError}`)}</AlertDescription></Alert>)}
            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading ? (<><Loader2 className="me-2 h-4 w-4 animate-spin" />{t('auth.creating')}</>) : t('auth.createSuperAdmin')}
            </Button>
          </form>
        </CardContent>
      </Card>
    );
  }

  function LoginForm({ loginError, isLoading, onSubmit, onForgot }: { loginError: string | null; isLoading: boolean; onSubmit: (email: string, password: string) => Promise<void>; onForgot: () => void; }) {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [localError, setLocalError] = useState<string | null>(null);

    async function handleSubmit(e: React.FormEvent) {
      e.preventDefault();
      setLocalError(null);
      if (!email.trim()) return setLocalError('errEmailRequired');
      if (!password) return setLocalError('errPasswordRequired');
      try { await onSubmit(email, password); } catch {}
    }

    const displayError = localError || loginError;

    return (
      <Card>
        <CardHeader><CardTitle>{t('auth.signIn')}</CardTitle></CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">{t('auth.email')}</Label>
              <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" disabled={isLoading} autoFocus />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="password">{t('auth.password')}</Label>
                <button type="button" onClick={onForgot} className="text-xs text-primary hover:underline" disabled={isLoading}>{t('auth.forgotPassword')}</button>
              </div>
              <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" disabled={isLoading} />
            </div>
            {displayError && (<Alert variant="destructive"><AlertDescription>{t(`auth.${displayError}`)}</AlertDescription></Alert>)}
            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading ? (<><Loader2 className="me-2 h-4 w-4 animate-spin" />{t('auth.signingIn')}</>) : t('auth.signIn')}
            </Button>
          </form>
        </CardContent>
      </Card>
    );
  }

  function ForgotForm({ resetError, isLoading, onSubmit, onBack }: { resetError: string | null; isLoading: boolean; onSubmit: (email: string) => Promise<{ type: 'direct_reset'; email: string } | { type: 'request_sent' }>; onBack: () => void; }) {
    const [email, setEmail] = useState('');
    const [localError, setLocalError] = useState<string | null>(null);
    const [successMessage, setSuccessMessage] = useState<string | null>(null);

    async function handleSubmit(e: React.FormEvent) {
      e.preventDefault();
      setLocalError(null);
      setSuccessMessage(null);
      if (!email.trim()) return setLocalError('errEmailRequired');
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return setLocalError('errEmailInvalid');
      try {
        const result = await onSubmit(email);
        if (result.type === 'direct_reset') setSuccessMessage('resetEmailSent');
        else setSuccessMessage('resetRequestSent');
      } catch {}
    }

    const displayError = localError || resetError;

    return (
      <Card>
        <CardHeader>
          <button type="button" onClick={onBack} className="flex items-center text-sm text-muted-foreground hover:text-foreground mb-3 gap-1">
            <ArrowLeft className={isRTL ? 'h-4 w-4 rotate-180' : 'h-4 w-4'} />
            {t('auth.backToLogin')}
          </button>
          <CardTitle>{t('auth.forgotTitle')}</CardTitle>
          <CardDescription>{t('auth.forgotSubtitle')}</CardDescription>
        </CardHeader>
        <CardContent>
          {successMessage ? (
            <Alert><AlertDescription>{t(`auth.${successMessage}`)}</AlertDescription></Alert>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="reset-email">{t('auth.email')}</Label>
                <Input id="reset-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" disabled={isLoading} autoFocus />
              </div>
              {displayError && (<Alert variant="destructive"><AlertDescription>{t(`auth.${displayError}`)}</AlertDescription></Alert>)}
              <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading ? (<><Loader2 className="me-2 h-4 w-4 animate-spin" />{t('auth.sendingRequest')}</>) : t('auth.sendResetRequest')}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    );
  }
}