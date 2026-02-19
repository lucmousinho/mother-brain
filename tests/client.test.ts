import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MotherBrainClient, MotherBrainApiError } from '../src/client/client.js';

describe('MotherBrainClient', () => {
  let client: MotherBrainClient;

  beforeEach(() => {
    client = new MotherBrainClient({
      baseUrl: 'http://127.0.0.1:19999',
      token: 'test-token',
      timeoutMs: 500,
      onUnavailable: 'skip',
      contextId: 'ctx_test',
    });
  });

  describe('constructor', () => {
    it('should strip trailing slashes from baseUrl', () => {
      const c = new MotherBrainClient({ baseUrl: 'http://localhost:7337///' });
      expect((c as any).baseUrl).toBe('http://localhost:7337');
    });

    it('should use default values', () => {
      const c = new MotherBrainClient({ baseUrl: 'http://localhost:7337' });
      expect((c as any).timeoutMs).toBe(5000);
      expect((c as any).onUnavailable).toBe('skip');
    });
  });

  describe('isHealthy', () => {
    it('should return false when server is unreachable', async () => {
      const healthy = await client.isHealthy();
      expect(healthy).toBe(false);
    });

    it('should cache health result', async () => {
      await client.isHealthy();
      const result = await client.isHealthy();
      expect(result).toBe(false);
    });

    it('should allow invalidating cache', async () => {
      await client.isHealthy();
      client.invalidateHealthCache();
      expect((client as any).healthCache).toBeNull();
    });
  });

  describe('recall (unavailable)', () => {
    it('should return null with skip policy', async () => {
      const result = await client.recall({ query: 'test' });
      expect(result).toBeNull();
    });

    it('should log warning with warn policy', async () => {
      const warnClient = new MotherBrainClient({
        baseUrl: 'http://127.0.0.1:19999',
        timeoutMs: 500,
        onUnavailable: 'warn',
      });
      const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const result = await warnClient.recall({ query: 'test' });
      expect(result).toBeNull();
      expect(spy).toHaveBeenCalled();
      spy.mockRestore();
    });

    it('should throw with throw policy', async () => {
      const throwClient = new MotherBrainClient({
        baseUrl: 'http://127.0.0.1:19999',
        timeoutMs: 500,
        onUnavailable: 'throw',
      });
      await expect(throwClient.recall({ query: 'test' })).rejects.toThrow();
    });
  });

  describe('recordCheckpoint (unavailable)', () => {
    it('should return null with skip policy', async () => {
      const result = await client.recordCheckpoint({
        agent: { id: 'a1', name: 'Test' },
        intent: { goal: 'Test' },
        result: { status: 'success', summary: 'OK' },
      });
      expect(result).toBeNull();
    });
  });

  describe('policyCheck (unavailable)', () => {
    it('should return null with skip policy', async () => {
      const result = await client.policyCheck({ cmd: 'ls' });
      expect(result).toBeNull();
    });
  });

  describe('MotherBrainApiError', () => {
    it('should have status, body, and path', () => {
      const err = new MotherBrainApiError(404, 'Not found', '/test');
      expect(err.status).toBe(404);
      expect(err.body).toBe('Not found');
      expect(err.path).toBe('/test');
      expect(err.name).toBe('MotherBrainApiError');
    });
  });
});
