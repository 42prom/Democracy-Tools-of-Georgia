import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse, AxiosError } from 'axios';
import http from 'http';
import https from 'https';
import { AppConfig } from '../config/app';

/**
 * Circuit Breaker States
 */
enum CircuitState {
  CLOSED = 'CLOSED',     // Normal operation
  OPEN = 'OPEN',         // Failing, reject immediately
  HALF_OPEN = 'HALF_OPEN' // Testing if service recovered
}

/**
 * Circuit Breaker for a single service
 */
class CircuitBreaker {
  private state: CircuitState = CircuitState.CLOSED;
  private failureCount = 0;
  private successCount = 0;
  private nextAttempt = Date.now();
  
  constructor(
    private readonly threshold: number = 5,
    private readonly timeout: number = 30000, // 30s cooldown
    private readonly halfOpenSuccesses: number = 2
  ) {}

  public async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === CircuitState.OPEN) {
      if (Date.now() < this.nextAttempt) {
        throw new Error('Circuit breaker is OPEN');
      }
      this.state = CircuitState.HALF_OPEN;
      this.successCount = 0;
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private onSuccess(): void {
    this.failureCount = 0;
    
    if (this.state === CircuitState.HALF_OPEN) {
      this.successCount++;
      if (this.successCount >= this.halfOpenSuccesses) {
        this.state = CircuitState.CLOSED;
        console.log('[CircuitBreaker] Transitioned to CLOSED');
      }
    }
  }

  private onFailure(): void {
    this.failureCount++;
    this.successCount = 0;

    if (this.failureCount >= this.threshold) {
      this.state = CircuitState.OPEN;
      this.nextAttempt = Date.now() + this.timeout;
      console.error(`[CircuitBreaker] OPEN - Too many failures (${this.failureCount}). Retry after: ${new Date(this.nextAttempt).toISOString()}`);
    }
  }

  public getState(): CircuitState {
    return this.state;
  }
}

/**
 * Service configuration
 */
interface ServiceConfig {
  baseURL: string;
  timeout: number;
  maxRetries: number;
  retryDelay: number;
  maxBodyLength?: number;
  maxContentLength?: number;
}

/**
 * Resilient HTTP Client with retry, circuit breaker, and keep-alive
 */
export class ResilientHttpClient {
  private client: AxiosInstance;
  private circuitBreaker: CircuitBreaker;
  private config: ServiceConfig;

  constructor(config: ServiceConfig) {
    this.config = config;
    this.circuitBreaker = new CircuitBreaker();

    // Create HTTP agent with keep-alive
    const httpAgent = new http.Agent({
      keepAlive: true,
      keepAliveMsecs: 30000,
      maxSockets: 50,
      maxFreeSockets: 10,
      timeout: config.timeout,
    });

    const httpsAgent = new https.Agent({
      keepAlive: true,
      keepAliveMsecs: 30000,
      maxSockets: 50,
      maxFreeSockets: 10,
      timeout: config.timeout,
    });

    this.client = axios.create({
      baseURL: config.baseURL,
      timeout: config.timeout,
      httpAgent,
      httpsAgent,
      maxBodyLength: config.maxBodyLength || 50 * 1024 * 1024, // 50MB default
      maxContentLength: config.maxContentLength || 50 * 1024 * 1024,
    });
  }

  /**
   * Determine if error is retryable
   */
  private isRetryableError(error: AxiosError): boolean {
    // Network errors
    if (error.code === 'ECONNRESET' || 
        error.code === 'ETIMEDOUT' || 
        error.code === 'ENOTFOUND' ||
        error.code === 'EAI_AGAIN' ||
        error.code === 'ECONNREFUSED') {
      return true;
    }

    // HTTP status codes
    if (error.response) {
      const status = error.response.status;
      return status === 429 || status >= 500;
    }

    return false;
  }

  /**
   * Sleep with jitter for backoff
   */
  private async sleep(baseMs: number, attempt: number): Promise<void> {
    const exponentialDelay = baseMs * Math.pow(2, attempt);
    const jitter = Math.random() * 0.3 * exponentialDelay; // ±30% jitter
    const delay = exponentialDelay + jitter;
    await new Promise(resolve => setTimeout(resolve, delay));
  }

  /**
   * Execute request with retry logic
   */
  private async executeWithRetry<T>(
    requestFn: () => Promise<AxiosResponse<T>>,
    requestId?: string
  ): Promise<AxiosResponse<T>> {
    let lastError: AxiosError | Error | undefined;

    for (let attempt = 0; attempt <= this.config.maxRetries; attempt++) {
      try {
        if (attempt > 0) {
          await this.sleep(this.config.retryDelay, attempt - 1);
          console.log(`[HttpClient] Retry attempt ${attempt}/${this.config.maxRetries}`, { requestId });
        }

        return await requestFn();
      } catch (error: any) {
        lastError = error;

        // Don't retry on non-retryable errors
        if (!this.isRetryableError(error)) {
          throw error;
        }

        // Don't retry if we've exhausted attempts
        if (attempt === this.config.maxRetries) {
          console.error(`[HttpClient] Max retries exceeded`, { 
            requestId,
            error: error.message,
            code: error.code,
            status: error.response?.status 
          });
          throw error;
        }

        console.warn(`[HttpClient] Retryable error on attempt ${attempt + 1}`, {
          requestId,
          error: error.message,
          code: error.code,
          status: error.response?.status
        });
      }
    }

    throw lastError;
  }

  /**
   * POST request with circuit breaker and retry
   */
  public async post<T = any, R = AxiosResponse<T>>(
    url: string,
    data?: any,
    config?: AxiosRequestConfig & { requestId?: string }
  ): Promise<R> {
    const requestId = config?.requestId;

    // Propagate request ID to downstream service
    const headers = {
      ...config?.headers,
      ...(requestId && { 'X-Request-ID': requestId }),
    };

    return this.circuitBreaker.execute(async () => {
      return this.executeWithRetry(
        () => this.client.post<T>(url, data, { ...config, headers }),
        requestId
      ) as Promise<R>;
    });
  }

  /**
   * GET request with circuit breaker and retry
   */
  public async get<T = any, R = AxiosResponse<T>>(
    url: string,
    config?: AxiosRequestConfig & { requestId?: string }
  ): Promise<R> {
    const requestId = config?.requestId;

    // Propagate request ID to downstream service
    const headers = {
      ...config?.headers,
      ...(requestId && { 'X-Request-ID': requestId }),
    };

    return this.circuitBreaker.execute(async () => {
      return this.executeWithRetry(
        () => this.client.get<T>(url, { ...config, headers }),
        requestId
      ) as Promise<R>;
    });
  }

  /**
   * Get circuit breaker state
   */
  public getCircuitState(): CircuitState {
    return this.circuitBreaker.getState();
  }
}

/**
 * Factory for creating service-specific HTTP clients
 */
export class HttpClientFactory {
  private static clients = new Map<string, ResilientHttpClient>();

  /**
   * Get or create HTTP client for biometric service verification (longer timeout)
   */
  public static getBiometricClient(): ResilientHttpClient {
    if (!this.clients.has('biometric')) {
      const config: ServiceConfig = {
        baseURL: AppConfig.BIOMETRIC.URL,
        // Verification timeout: 10s (8-12s recommended for face matching)
        timeout: AppConfig.BIOMETRIC.TIMEOUT_MS,
        // Retries: 1 max for verification (idempotent but slow)
        maxRetries: AppConfig.BIOMETRIC.MAX_RETRIES,
        retryDelay: 250,
        // Payload limit: 20MB to prevent base64 bloat
        maxBodyLength: 20 * 1024 * 1024,
        maxContentLength: 20 * 1024 * 1024,
      };

      this.clients.set('biometric', new ResilientHttpClient(config));
    }

    return this.clients.get('biometric')!;
  }

  /**
   * Get or create HTTP client for biometric service health checks (short timeout)
   */
  public static getBiometricHealthClient(): ResilientHttpClient {
    if (!this.clients.has('biometric-health')) {
      const config: ServiceConfig = {
        baseURL: process.env.BIOMETRIC_SERVICE_URL || 'http://localhost:8000',
        // Health check timeout: 3s (fast fail)
        timeout: 3000,
        // Health check retries: 2 (quick probes)
        maxRetries: 2,
        retryDelay: 100,
        maxBodyLength: 1024,
        maxContentLength: 1024,
      };

      this.clients.set('biometric-health', new ResilientHttpClient(config));
    }

    return this.clients.get('biometric-health')!;
  }

  /**
   * Create a custom HTTP client
   */
  public static createClient(name: string, config: ServiceConfig): ResilientHttpClient {
    const client = new ResilientHttpClient(config);
    this.clients.set(name, client);
    return client;
  }

  /**
   * Get all clients (for health checks)
   */
  public static getAllClients(): Map<string, ResilientHttpClient> {
    return this.clients;
  }
}
