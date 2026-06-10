'use client';

// Auth provider. Wraps Supabase Auth + the public.users table lookup.
// Provides useAuth() — the central hook used by every protected screen.
//
// Lifecycle:
//   1. On mount, query the current session.
//   2. If session present, fetch the application user row (joins auth.users → public.users).
//   3. Subscribe to onAuthStateChange so login/logout in another tab syncs here.
//   4. Provide login / logout / register / reset mutations.
//
// The shape of useAuth() matches the parity matrix A4. Any consumer screen
// that worked with the Expo `useAuth()` should work with this too.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import { dbUserToUser, type User } from '@/types';
import type { UserRole, UserPermission } from '@/types';

type AuthContextValue = {
  user: User | null;
  isInitialized: boolean;
  isLoading: boolean;
  loginError: string | null;
  registerError: string | null;
  resetError: string | null;

  loginWithCredentials: (email: string, password: string) => Promise<void>;
  registerSuperAdmin: (data: {
    name: string;
    nameAr: string;
    email: string;
    password: string;
  }) => Promise<void>;
  requestPasswordReset: (email: string) => Promise<
    | { type: 'direct_reset'; email: string }
    | { type: 'request_sent' }
  >;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

const ALL_PERMISSIONS: UserPermission[] = [
  'approvals',
  'generate_reports',
  'ai_insights',
  'manage_users',
  'manage_investors',
  'create_tasks',
  'create_challenges',
  'create_sessions',
  'export_data',
  'export_vacations',
];

export function AuthProvider({
  children,
  initialUser = null,
}: {
  children: ReactNode;
  initialUser?: User | null;
}) {
  const supabase = useMemo(() => createClient(), []);
  const queryClient = useQueryClient();

  const [user, setUser] = useState<User | null>(initialUser);
  const [isInitialized, setIsInitialized] = useState(initialUser !== null);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [registerError, setRegisterError] = useState<string | null>(null);
  const [resetError, setResetError] = useState<string | null>(null);

  // Fetch and cache the app user row for a given auth user id.
  const fetchAppUser = useCallback(
    async (authUserId: string): Promise<User | null> => {
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('id', authUserId)
        .single();
      if (error || !data) return null;
      return dbUserToUser(data);
    },
    [supabase]
  );

  // Refresh: re-fetch from Supabase. Used after sign-in or external state change.
  const refresh = useCallback(async () => {
    const {
      data: { user: authUser },
    } = await supabase.auth.getUser();
    if (!authUser) {
      setUser(null);
      setIsInitialized(true);
      return;
    }
    const appUser = await fetchAppUser(authUser.id);
    setUser(appUser);
    setIsInitialized(true);
  }, [supabase, fetchAppUser]);

  // On mount: hydrate from Supabase if we don't have initialUser, then subscribe.
  useEffect(() => {
    if (!isInitialized) {
      refresh();
    }

    const { data: subscription } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        // SIGNED_OUT covers logout from any tab.
        if (event === 'SIGNED_OUT' || !session) {
          setUser(null);
          queryClient.clear();
          return;
        }
        // SIGNED_IN, TOKEN_REFRESHED, USER_UPDATED: re-sync app user.
        const appUser = await fetchAppUser(session.user.id);
        setUser(appUser);
      }
    );

    return () => {
      subscription.subscription.unsubscribe();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---------------------------------------------------------------------------
  // Mutations
  // ---------------------------------------------------------------------------

  const loginMutation = useMutation({
    mutationFn: async ({ email, password }: { email: string; password: string }) => {
      setLoginError(null);

      // Step 1: Supabase auth
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (error || !data.user) {
        // Generic error — don't leak whether the user exists (parity decision A1.15)
        throw new Error('errInvalidCredentials');
      }

      // Step 2: Application user check (active? not investor?)
      const appUser = await fetchAppUser(data.user.id);
      if (!appUser) {
        await supabase.auth.signOut();
        throw new Error('errUnknown');
      }
      if (!appUser.isActive) {
        await supabase.auth.signOut();
        throw new Error('errInactiveAccount');
      }
      if (appUser.role === 'investor') {
        await supabase.auth.signOut();
        throw new Error('errInvestorNoAccess');
      }

      // Step 3: Update last_login_at (best-effort; failure shouldn't block login)
      await supabase
        .from('users')
        .update({ last_login_at: new Date().toISOString() })
        .eq('id', appUser.id);

      return appUser;
    },
    onSuccess: (appUser) => {
      setUser(appUser);
    },
    onError: (err: Error) => {
      setLoginError(err.message);
    },
  });

  const registerSuperAdminMutation = useMutation({
    mutationFn: async (input: {
      name: string;
      nameAr: string;
      email: string;
      password: string;
    }) => {
      setRegisterError(null);

      // Step 1: Verify no super admin exists yet (race-safe check happens at insert too)
      const { data: existing, error: existingErr } = await supabase
        .from('users')
        .select('id')
        .eq('role', 'super_admin')
        .is('deleted_at', null)
        .limit(1);
      if (existingErr) throw new Error('errUnknown');
      if (existing && existing.length > 0) throw new Error('errSuperAdminExists');

      // Step 2: Sign up via Supabase Auth (creates auth.users row)
      const { data, error } = await supabase.auth.signUp({
        email: input.email.trim(),
        password: input.password,
        options: {
          data: { name: input.name, name_ar: input.nameAr },
        },
      });
      if (error || !data.user) {
        if (error?.message.toLowerCase().includes('already registered')) {
          throw new Error('errEmailAlreadyRegistered');
        }
        throw new Error('errUnknown');
      }

      // Step 3: Create the public.users row
      const { error: insertError } = await supabase.from('users').insert({
        id: data.user.id,
        name: input.name,
        name_ar: input.nameAr,
        email: input.email.trim(),
        role: 'super_admin',
        is_active: true,
        force_password_change: false,
        permissions: ALL_PERMISSIONS,
        admin_id: null,
      });
      if (insertError) {
        // Best effort cleanup — the auth.users row exists but the app row failed.
        // This case is rare (RLS or unique violation) and recoverable manually.
        throw new Error('errUnknown');
      }

      return data.user.id;
    },
    onSuccess: () => {
      // After signup, Supabase auto-signs the user in. Refresh the local user state.
      refresh();
    },
    onError: (err: Error) => {
      setRegisterError(err.message);
    },
  });

  const requestPasswordResetMutation = useMutation({
    mutationFn: async (
      email: string
    ): Promise<{ type: 'direct_reset'; email: string } | { type: 'request_sent' }> => {
      setResetError(null);

      // Step 1: Find user (we DO leak existence here per parity decision A1.21 + Decision 4)
      const { data: foundUser, error: lookupErr } = await supabase
        .from('users')
        .select('id, email, role')
        .eq('email', email.trim().toLowerCase())
        .is('deleted_at', null)
        .single();

      if (lookupErr || !foundUser) {
        throw new Error('errAccountNotFound');
      }

      // Step 2: Super admin → direct Supabase reset email
      if (foundUser.role === 'super_admin') {
        const { error } = await supabase.auth.resetPasswordForEmail(foundUser.email, {
          redirectTo: `${window.location.origin}/auth/callback?next=/force-password-change`,
        });
        if (error) throw new Error('errUnknown');
        return { type: 'direct_reset', email: foundUser.email };
      }

      // Step 3: Non-super → check no pending request, then insert one
      const { data: pending } = await supabase
        .from('password_reset_requests')
        .select('id')
        .eq('user_id', foundUser.id)
        .eq('status', 'pending')
        .limit(1);
      if (pending && pending.length > 0) {
        throw new Error('errResetAlreadyPending');
      }

      const { error: insertErr } = await supabase.from('password_reset_requests').insert({
        user_id: foundUser.id,
      });
      if (insertErr) throw new Error('errUnknown');

      return { type: 'request_sent' };
    },
    onError: (err: Error) => {
      setResetError(err.message);
    },
  });

  const logoutMutation = useMutation({
    mutationFn: async () => {
      await supabase.auth.signOut();
    },
    onSuccess: () => {
      setUser(null);
      queryClient.clear();
    },
  });

  // ---------------------------------------------------------------------------
  // Action wrappers
  // ---------------------------------------------------------------------------

  const loginWithCredentials = useCallback(
    async (email: string, password: string) => {
      await loginMutation.mutateAsync({ email, password });
    },
    [loginMutation]
  );

  const registerSuperAdmin = useCallback(
    async (input: { name: string; nameAr: string; email: string; password: string }) => {
      await registerSuperAdminMutation.mutateAsync(input);
    },
    [registerSuperAdminMutation]
  );

  const requestPasswordReset = useCallback(
    async (email: string) => {
      return await requestPasswordResetMutation.mutateAsync(email);
    },
    [requestPasswordResetMutation]
  );

  const logout = useCallback(async () => {
    await logoutMutation.mutateAsync();
  }, [logoutMutation]);

  const value: AuthContextValue = {
    user,
    isInitialized,
    isLoading:
      loginMutation.isPending ||
      logoutMutation.isPending ||
      registerSuperAdminMutation.isPending,
    loginError,
    registerError,
    resetError,
    loginWithCredentials,
    registerSuperAdmin,
    requestPasswordReset,
    logout,
    refresh,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used inside <AuthProvider>');
  }
  return ctx;
}

// Re-export role/permission helpers from types
export type { UserRole, UserPermission };
