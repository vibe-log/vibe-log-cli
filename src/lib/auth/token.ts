import { getToken } from '../config';
import { apiClient } from '../api-client';

export async function isAuthenticated(): Promise<boolean> {
  const token = await getToken();
  if (!token) return false;

  try {
    const { valid } = await apiClient.verifyToken();
    return valid;
  } catch (error) {
    return false;
  }
}

export async function requireAuth(): Promise<void> {
  const authenticated = await isAuthenticated();
  if (!authenticated) {
    throw new Error('Authentication required. Please run: npx vibe-log');
  }
}

export { getToken, clearToken, storeToken } from '../config';