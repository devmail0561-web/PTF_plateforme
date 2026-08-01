'use client';
import { create } from 'zustand';
import type { UserProfile } from '@/types/graphql';

const COOKIE_MAX_AGE = 60 * 60 * 24 * 30; // 30 days

function setCookie(token: string) {
  const secure = typeof window !== 'undefined' && window.location.protocol === 'https:' ? '; Secure' : '';
  document.cookie = `ptf_auth_token=${token}; path=/; SameSite=Strict; Max-Age=${COOKIE_MAX_AGE}${secure}`;
}

function clearCookie() {
  document.cookie = 'ptf_auth_token=; path=/; Max-Age=0';
}

interface AuthState {
  token: string | null;
  user: UserProfile | null;
  encryptedKey: string | null;
  deviceToken: string | null;
  isLoading: boolean;
  isHydrated: boolean;
}

interface AuthActions {
  setAuth: (token: string, user: UserProfile, encryptedKey: string) => void;
  setDeviceToken: (deviceToken: string) => void;
  updateUser: (user: UserProfile) => void;
  clearAuth: () => void;
  hydrateFromStorage: () => void;
}

export const useAuthStore = create<AuthState & AuthActions>((set) => ({
  token: null,
  user: null,
  encryptedKey: null,
  deviceToken: null,
  isLoading: false,
  isHydrated: false,

  setAuth: (token, user, encryptedKey) => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('ptf_jwt', token);
      sessionStorage.setItem('ptf_encrypted_key', encryptedKey);
      setCookie(token);
    }
    set({ token, user, encryptedKey });
  },

  setDeviceToken: (deviceToken) => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('ptf_device_token', deviceToken);
    }
    set({ deviceToken });
  },

  updateUser: (user) => {
    set({ user });
  },

  clearAuth: () => {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('ptf_jwt');
      sessionStorage.removeItem('ptf_encrypted_key');
      clearCookie();
    }
    set({ token: null, user: null, encryptedKey: null });
  },

  hydrateFromStorage: () => {
    if (typeof window === 'undefined') {
      set({ isHydrated: true });
      return;
    }
    const token = localStorage.getItem('ptf_jwt');
    const encryptedKey = sessionStorage.getItem('ptf_encrypted_key');
    const deviceToken = localStorage.getItem('ptf_device_token');

    if (token) {
      try {
        const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
        const exp = payload.exp as number;
        if (exp && Date.now() / 1000 > exp) {
          localStorage.removeItem('ptf_jwt');
          clearCookie();
          set({ isHydrated: true });
          return;
        }
        // NOTE: This user object is derived from an unverified JWT payload (client-side decode only).
        // It is used for initial UI rendering only. The backend validates the JWT on every API call.
        // TODO: Add GET /api/auth/me route to properly validate session on hydration.
        const user: UserProfile = {
          id: payload.userId,
          email: null,
          ptfAddress: payload.ptfAddress,
          githubHandle: null,
          githubLinked: payload.githubLinked ?? false,
          walletLinked: payload.walletLinked ?? false,
          wallets: [],
          skills: payload.skills ?? [],
        };
        setCookie(token);
        set({ token, user, encryptedKey, deviceToken, isHydrated: true });
      } catch {
        localStorage.removeItem('ptf_jwt');
        clearCookie();
        set({ isHydrated: true });
      }
    } else {
      set({ isHydrated: true });
    }
  },
}));
