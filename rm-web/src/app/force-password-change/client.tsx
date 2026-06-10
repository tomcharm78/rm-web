'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { KeyRound, Loader2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/providers/auth-provider';
import { useLanguage } from '@/providers/language-provider';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';

export function ForcePasswordChangeClient() {
  const router = useRouter();
  const { t, isRTL } = useLanguage();
  const { refresh } = useAuth();
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!newPassword) return setError('errPasswordRequired');
    if (newPassword.length < 8) return setError('errPasswordTooShort');
    if (newPassword !== confirmPassword) return setError('errPasswordsDoNotMatch');

    setIsLoading(true);
    try {
      const supabase = createClient();

      // Step 1: Update the auth password
      const { error: authError } = await supabase.auth.updateUser({ password: newPassword });
      if (authError) {
        setError('errUnknown');
        return;
      }

      // Step 2: Flip the force_password_change flag in public.users
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!authUser) {
        setError('errUnknown');
        return;
      }
      const { error: flagError } = await supabase
        .from('users')
        .update({ force_password_change: false })
        .eq('id', authUser.id);
      if (flagError) {
        setError('errUnknown');
        return;
      }

      // Step 3: Refresh local user state and navigate to dashboard
      await refresh();
      router.replace('/');
    } catch {
      setError('errUnknown');
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-md" dir={isRTL ? 'rtl' : 'ltr'}>
        <Card>
          <CardHeader>
            <div className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-amber-100 mb-3">
              <KeyRound className="h-6 w-6 text-amber-600" />
            </div>
            <CardTitle>{t('auth.forceChangeTitle')}</CardTitle>
            <CardDescription>{t('auth.forceChangeSubtitle')}</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="new">{t('auth.newPassword')}</Label>
                <Input
                  id="new"
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  autoComplete="new-password"
                  disabled={isLoading}
                  autoFocus
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirm">{t('auth.confirmPassword')}</Label>
                <Input
                  id="confirm"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  autoComplete="new-password"
                  disabled={isLoading}
                />
              </div>

              {error && (
                <Alert variant="destructive">
                  <AlertDescription>{t(`auth.${error}`)}</AlertDescription>
                </Alert>
              )}

              <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading ? (
                  <>
                    <Loader2 className="me-2 h-4 w-4 animate-spin" />
                    {t('auth.creating')}
                  </>
                ) : (
                  t('auth.changePassword')
                )}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
