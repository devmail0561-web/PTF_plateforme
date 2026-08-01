'use client';
import { useMutation } from '@apollo/client';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/lib/auth/authStore';
import { LOGIN, REGISTER } from '@/lib/graphql/mutations';
import type { LoginResult, AuthResult, UserProfile } from '@/types/graphql';

export function useAuth() {
  const { token, user, encryptedKey, isHydrated, setAuth, setDeviceToken, clearAuth, updateUser } = useAuthStore();
  const router = useRouter();

  const [loginMutation, { loading: loginLoading }] = useMutation<{ login: LoginResult }>(LOGIN);
  const [registerMutation, { loading: registerLoading }] = useMutation<{ register: AuthResult }>(REGISTER);

  const isAuthenticated = !!token;
  const isFullyLinked = !!user?.githubLinked && !!user?.walletLinked;

  async function login(email: string, password: string, deviceName: string, deviceToken?: string) {
    const { data, errors } = await loginMutation({
      variables: { input: { email, password, deviceName, deviceToken } },
    });
    if (errors?.length) throw new Error(errors[0].message);
    const result = data?.login;
    if (!result) throw new Error('Login failed');

    if (result.requiresVerification && result.pendingSessionId) {
      return { requiresVerification: true, pendingSessionId: result.pendingSessionId };
    }
    if (result.token && result.user && result.encryptedKey) {
      setAuth(result.token, result.user as UserProfile, result.encryptedKey);
      return { requiresVerification: false };
    }
    throw new Error('Unexpected login response');
  }

  async function register(email: string, password: string, deviceName: string) {
    const { data, errors } = await registerMutation({
      variables: { input: { email, password, deviceName } },
    });
    if (errors?.length) throw new Error(errors[0].message);
    const result = data?.register;
    if (!result) throw new Error('Registration failed');
    setAuth(result.token, result.user, result.encryptedKey);
    if (result.deviceToken) setDeviceToken(result.deviceToken);
  }

  function logout() {
    clearAuth();
    router.replace('/login');
  }

  return {
    user,
    token,
    encryptedKey,
    isAuthenticated,
    isFullyLinked,
    isHydrated,
    isLoading: loginLoading || registerLoading,
    login,
    register,
    logout,
    setAuth,
    setDeviceToken,
    updateUser,
  };
}
