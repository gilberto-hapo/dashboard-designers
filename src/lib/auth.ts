import { create } from 'zustand';
import { setCachedGoalfyData, type GoalfyDataPayload } from '@/lib/goalfy';

export type UserRole = 'admin' | 'designer';

interface UserInfo {
  username?: string;
  email: string;
  name: string;
  role: UserRole;
  designerName?: string;
}

interface AuthState {
  isAuthenticated: boolean;
  isLoading: boolean;
  lastLoginAt: number;
  user: UserInfo | null;
  hydrate: () => Promise<void>;
  login: (identifier: string, password: string) => Promise<{ ok: boolean; error?: string }>;
  logout: () => Promise<void>;
}

async function fetchCurrentUser(): Promise<UserInfo | null> {
  const response = await fetch('/api/auth/me', {
    credentials: 'include',
  });

  if (response.status === 401) {
    return null;
  }

  if (!response.ok) {
    throw new Error(`Auth API error: ${response.status}`);
  }

  const data = await response.json();
  return data.user as UserInfo;
}

export const useAuth = create<AuthState>((set) => ({
  isAuthenticated: false,
  isLoading: true,
  lastLoginAt: 0,
  user: null,
  hydrate: async () => {
    set({ isLoading: true });
    try {
      const user = await fetchCurrentUser();
      set({
        isAuthenticated: Boolean(user),
        isLoading: false,
        user,
      });
    } catch {
      set({
        isAuthenticated: false,
        isLoading: false,
        user: null,
      });
    }
  },
  login: async (identifier: string, password: string) => {
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify({ identifier, password }),
    });

    if (!response.ok) {
      let error = 'Credenciais invalidas. Tente novamente.';

      try {
        const data = await response.json();
        if (data?.error) {
          error = String(data.error);
        }
      } catch {
        // Keep fallback message.
      }

      return { ok: false, error };
    }

    const data = await response.json();

    if (data?.dashboardData) {
      setCachedGoalfyData(
        data.dashboardData as GoalfyDataPayload,
        Number(data.dashboardUpdatedAt) || Date.now(),
      );
    }

    set({
      isAuthenticated: true,
      isLoading: false,
      lastLoginAt: Date.now(),
      user: data.user as UserInfo,
    });

    return { ok: true };
  },
  logout: async () => {
    await fetch('/api/auth/logout', {
      method: 'POST',
      credentials: 'include',
    });

    set({
      isAuthenticated: false,
      isLoading: false,
      lastLoginAt: 0,
      user: null,
    });
  },
}));
