import { describe, it, expect, beforeEach, vi } from 'vitest'
import { waitForAuthSSE, waitForAuthLongPoll } from '../sse-client'
import { EventSourcePolyfill } from 'event-source-polyfill'
import { VibelogError } from '../../../utils/errors'

// Mock dependencies
vi.mock('event-source-polyfill')
global.fetch = vi.fn()

describe('SSE Client', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })
  
  describe('waitForAuthSSE', () => {
    it('should resolve with success data when authentication completes', async () => {
      const mockEventSource = {
        onmessage: null as any,
        onerror: null as any,
        close: vi.fn(),
        addEventListener: vi.fn(),
      }
      
      ;(EventSourcePolyfill as any).mockImplementation(() => mockEventSource)
      
      const promise = waitForAuthSSE('http://localhost:3000', 'session-123', 'token-123')
      
      // Simulate success message
      setTimeout(() => {
        mockEventSource.onmessage({
          data: JSON.stringify({
            status: 'success',
            token: 'api-token-123',
            user: { id: 'user-123', email: 'test@example.com' },
          }),
        })
      }, 100)
      
      const result = await promise
      
      expect(result).toEqual({
        status: 'success',
        token: 'api-token-123',
        user: { id: 'user-123', email: 'test@example.com' },
      })
      expect(mockEventSource.close).toHaveBeenCalled()
    })
    
    it('should handle expired sessions', async () => {
      const mockEventSource = {
        onmessage: null as any,
        onerror: null as any,
        close: vi.fn(),
        addEventListener: vi.fn(),
      }
      
      ;(EventSourcePolyfill as any).mockImplementation(() => mockEventSource)
      
      const promise = waitForAuthSSE('http://localhost:3000', 'session-123')
      
      setTimeout(() => {
        mockEventSource.onmessage({
          data: JSON.stringify({ status: 'expired' }),
        })
      }, 100)
      
      const result = await promise
      
      expect(result).toEqual({ status: 'expired' })
      expect(mockEventSource.close).toHaveBeenCalled()
    })
    
    it('should handle SSE connection errors', async () => {
      const mockEventSource = {
        onmessage: null as any,
        onerror: null as any,
        close: vi.fn(),
        addEventListener: vi.fn(),
      }
      
      ;(EventSourcePolyfill as any).mockImplementation(() => mockEventSource)
      
      const promise = waitForAuthSSE('http://localhost:3000', 'session-123')
      
      setTimeout(() => {
        mockEventSource.onerror(new Error('Connection failed'))
      }, 100)
      
      await expect(promise).rejects.toThrow(VibelogError)
      await expect(promise).rejects.toThrow('SSE connection failed')
      expect(mockEventSource.close).toHaveBeenCalled()
    })
    
    it('should timeout after 5 minutes', async () => {
      vi.useFakeTimers()
      
      const mockEventSource = {
        onmessage: null as any,
        onerror: null as any,
        close: vi.fn(),
        addEventListener: vi.fn((event, handler) => {
          if (event === 'message') {
            // Store the handler to clear timeout
            mockEventSource._messageHandler = handler
          }
        }),
      }
      
      ;(EventSourcePolyfill as any).mockImplementation(() => mockEventSource)
      
      const promise = waitForAuthSSE('http://localhost:3000', 'session-123')
      
      // Advance time to just before timeout
      vi.advanceTimersByTime(4 * 60 * 1000)
      
      // No result yet
      let resolved = false
      promise.then(() => { resolved = true })
      await Promise.resolve()
      expect(resolved).toBe(false)
      
      // Advance past timeout
      vi.advanceTimersByTime(2 * 60 * 1000)
      
      const result = await promise
      
      expect(result).toEqual({ status: 'timeout' })
      expect(mockEventSource.close).toHaveBeenCalled()
      
      vi.useRealTimers()
    })
    
    it('should include authorization header when token provided', () => {
      const mockEventSource = {
        onmessage: null as any,
        onerror: null as any,
        close: vi.fn(),
        addEventListener: vi.fn(),
      }
      
      ;(EventSourcePolyfill as any).mockImplementation(() => mockEventSource)
      
      waitForAuthSSE('http://localhost:3000', 'session-123', 'auth-token')
      
      expect(EventSourcePolyfill).toHaveBeenCalledWith(
        'http://localhost:3000/api/auth/cli/stream-simple/session-123',
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer auth-token',
          }),
        })
      )
    })
  })
  
  describe('waitForAuthLongPoll', () => {
    it('should resolve with success data', async () => {
      (global.fetch as any).mockResolvedValue({
        ok: true,
        json: async () => ({
          status: 'success',
          token: 'api-token-123',
          user: { id: 'user-123', email: 'test@example.com' },
        }),
      })
      
      const result = await waitForAuthLongPoll('http://localhost:3000', 'session-123')
      
      expect(result).toEqual({
        status: 'success',
        token: 'api-token-123',
        user: { id: 'user-123', email: 'test@example.com' },
      })
      
      expect(global.fetch).toHaveBeenCalledWith(
        'http://localhost:3000/api/auth/cli/wait/session-123',
        expect.objectContaining({
          method: 'GET',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
          }),
        })
      )
    })
    
    it('should handle expired sessions', async () => {
      (global.fetch as any).mockResolvedValue({
        ok: true,
        json: async () => ({ status: 'expired' }),
      })
      
      const result = await waitForAuthLongPoll('http://localhost:3000', 'session-123')
      
      expect(result).toEqual({ status: 'expired' })
    })
    
    it('should throw on HTTP errors', async () => {
      (global.fetch as any).mockResolvedValue({
        ok: false,
        statusText: 'Internal Server Error',
      })
      
      await expect(
        waitForAuthLongPoll('http://localhost:3000', 'session-123')
      ).rejects.toThrow(VibelogError)
      
      await expect(
        waitForAuthLongPoll('http://localhost:3000', 'session-123')
      ).rejects.toThrow('Long poll failed: Internal Server Error')
    })
    
    it('should include authorization header when token provided', async () => {
      (global.fetch as any).mockResolvedValue({
        ok: true,
        json: async () => ({ status: 'waiting' }),
      })
      
      await waitForAuthLongPoll('http://localhost:3000', 'session-123', 'auth-token')
      
      expect(global.fetch).toHaveBeenCalledWith(
        'http://localhost:3000/api/auth/cli/wait/session-123',
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer auth-token',
          }),
        })
      )
    })
    
    it('should handle network errors', async () => {
      (global.fetch as any).mockRejectedValue(new Error('Network error'))
      
      await expect(
        waitForAuthLongPoll('http://localhost:3000', 'session-123')
      ).rejects.toThrow('Network error')
    })
  })
})