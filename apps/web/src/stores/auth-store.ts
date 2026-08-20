'use client';

import { create } from 'zustand';
import { api, setTokens, clearTokens, getAccessToken } from '@/lib/api-client';

export interface AuthUser {
  sub: string;
  organizationId: string;
  email: string;
  roles: string[];
  mfaEnabled: boolean;
  firstName?: string;
  lastName?: string;
  displayName?: string;
}

interface AuthState {
  user: AuthUser | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string, mfaCode?: string) => Promise<{ requiresMfa: boolean }>;
  verifyMfa: (email: string, mfaCode: string) => Promise<void>;
  register: (input: {
    email: string; password: string; firstName: string; lastName: string;
    organizationName: string; organizationNameEn?: string; slug: string;
  }) => Promise<void>;
  logout: () => Promise<void>;
  fetchUser: () => Promise<void>;
  initialize: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null, isLoading: false, isAuthenticated: false,

  initialize: async () => {
    const token = getAccessToken();
    if (!token) { set({ isAuthenticated: false }); return; }
    await get().fetchUser();
  },

  fetchUser: async () => {
    try {
      const user = await api.get<AuthUser>('/auth/me');
      set({ user, isAuthenticated: true, isLoading: false });
    } catch {
      clearTokens();
      set({ user: null, isAuthenticated: false, isLoading: false });
    }
  },

  login: async (email, password, mfaCode) => {
    set({ isLoading: true });
    try {
      const result = await api.post<{ requiresMfa: boolean; accessToken?: string; refreshToken?: string }>(
        '/auth/login', { email, password, mfaCode },
      );
      if (result.requiresMfa) { set({ isLoading: false }); return { requiresMfa: true }; }
      if (result.accessToken && result.refreshToken) {
        setTokens(result.accessToken, result.refreshToken);
        await get().fetchUser();
      }
      set({ isLoading: false });
      return { requiresMfa: false };
    } catch (err) { set({ isLoading: false }); throw err; }
  },

  verifyMfa: async (email, mfaCode) => {
    set({ isLoading: true });
    try {
      const result = await api.post<{ accessToken: string; refreshToken: string }>(
        '/auth/login', { email, mfaCode },
      );
      if (result.accessToken && result.refreshToken) {
        setTokens(result.accessToken, result.refreshToken);
        await get().fetchUser();
      }
      set({ isLoading: false });
    } catch (err) { set({ isLoading: false }); throw err; }
  },

  register: async (input) => {
    set({ isLoading: true });
    try {
      const result = await api.post<{ accessToken: string; refreshToken: string }>('/auth/register', input);
      if (result.accessToken && result.refreshToken) {
        setTokens(result.accessToken, result.refreshToken);
        await get().fetchUser();
      }
      set({ isLoading: false });
    } catch (err) { set({ isLoading: false }); throw err; }
  },

  logout: async () => {
    try {
      const refreshToken = localStorage.getItem('glo_refresh_token');
      if (refreshToken) await api.post('/auth/logout', { refreshToken });
    } catch { /* ignore */ }
    clearTokens();
    set({ user: null, isAuthenticated: false });
  },
}));
