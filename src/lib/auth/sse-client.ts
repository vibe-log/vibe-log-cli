import { EventSourcePolyfill } from 'event-source-polyfill';
import { VibelogError } from '../../utils/errors';

export interface AuthEvent {
  status: 'success' | 'expired' | 'error' | 'timeout';
  token?: string;
  user?: {
    id: string;
    email?: string;
    name?: string;
  };
  message?: string;
}

export async function waitForAuthSSE(
  baseUrl: string,
  sessionId: string,
  token?: string
): Promise<AuthEvent> {
  return new Promise((resolve, reject) => {
    const url = `${baseUrl}/api/auth/cli/stream-simple/${sessionId}`;
    const headers: Record<string, string> = {};
    
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    
    const eventSource = new EventSourcePolyfill(url, {
      headers,
      withCredentials: false,
    });
    
    eventSource.onmessage = (event: any) => {
      try {
        const data = JSON.parse(event.data);
        eventSource.close();
        resolve(data);
      } catch (error) {
        console.error('Failed to parse SSE data:', error);
      }
    };
    
    eventSource.onerror = (_error: any) => {
      eventSource.close();
      // Fall back to long polling or regular polling
      reject(new VibelogError('SSE connection failed', 'SSE_FAILED'));
    };
    
    // Timeout after 5 minutes
    const timeout = setTimeout(() => {
      eventSource.close();
      resolve({ status: 'timeout' });
    }, 5 * 60 * 1000);
    
    // Clean up on success
    eventSource.addEventListener('message', () => {
      clearTimeout(timeout);
    });
  });
}

export async function waitForAuthLongPoll(
  baseUrl: string,
  sessionId: string,
  token?: string
): Promise<AuthEvent> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  
  const response = await fetch(`${baseUrl}/api/auth/cli/wait/${sessionId}`, {
    method: 'GET',
    headers,
  });
  
  if (!response.ok) {
    throw new VibelogError(`Long poll failed: ${response.statusText}`, 'LONGPOLL_FAILED');
  }
  
  const data = await response.json();
  return data as AuthEvent;
}