import type { User } from '@supabase/supabase-js';
import { create } from 'zustand';
import { forceClearLocalSession, getDriverProfile, getProfile, getStudentProfile, supabase } from '@/lib/supabase';
import type { DriverProfile, Profile, StudentProfile } from '@/types';

interface AuthState {
  user: User | null;
  profile: Profile | null;
  driverProfile: DriverProfile | null;
  studentProfile: StudentProfile | null;
  isLoading: boolean;
  isInitialized: boolean;
  initialize: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  setUser: (user: User | null) => void;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  profile: null,
  driverProfile: null,
  studentProfile: null,
  isLoading: false,
  isInitialized: false,

  setUser: (user) => set({ user }),

  refreshProfile: async () => {
    const user = get().user;
    if (!user) {
      set({ profile: null, driverProfile: null, studentProfile: null });
      return;
    }

    const profile = await getProfile(user.id);
    const driverProfile = profile?.role === 'driver' ? await getDriverProfile(user.id) : null;
    const studentProfile = profile?.role === 'student' ? await getStudentProfile(user.id) : null;

    set({ profile, driverProfile, studentProfile });
  },

  initialize: async () => {
    if (get().isInitialized) return;

    set({ isLoading: true });
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      get().setUser(session?.user ?? null);
      await get().refreshProfile();

      supabase.auth.onAuthStateChange((_event, session) => {
        get().setUser(session?.user ?? null);
        if (session?.user) {
          get().refreshProfile();
        } else {
          set({ profile: null, driverProfile: null, studentProfile: null });
        }
      });
    } finally {
      set({ isLoading: false, isInitialized: true });
    }
  },

  signIn: async (email, password) => {
    set({ isLoading: true });
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        return { error: error.message };
      }
      get().setUser(data.user);
      await get().refreshProfile();
      return { error: null };
    } finally {
      set({ isLoading: false });
    }
  },

  signOut: async () => {
    // supabase.auth.signOut() must load/refresh the session before it can
    // clear it, so a stalled network call can leave it hanging forever with
    // no error (observed directly: a token-refresh request stuck for 4+
    // minutes). Race it against a timeout and force-clear locally either way,
    // so a bad connection can never leave the user stuck on a logged-in screen.
    const SIGN_OUT_TIMEOUT_MS = 4000;
    const timedOut = await Promise.race([
      supabase.auth.signOut().then(() => false),
      new Promise<boolean>((resolve) => setTimeout(() => resolve(true), SIGN_OUT_TIMEOUT_MS)),
    ]);
    if (timedOut) {
      await forceClearLocalSession();
    }
    set({ user: null, profile: null, driverProfile: null, studentProfile: null });
  },
}));
