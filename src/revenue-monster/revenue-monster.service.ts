import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import * as fs from 'fs';
import {
  RMTokenResponse,
  RMRequestHeaders,
} from './interfaces/rm-response.interface';

// Revenue Monster URLs by environment
const RM_URLS = {
  sandbox: {
    oauth: 'https://sb-oauth.revenuemonster.my',
    api: 'https://sb-open.revenuemonster.my',
  },
  production: {
    oauth: 'https://oauth.revenuemonster.my',
    api: 'https://open.revenuemonster.my',
  },
};

@Injectable()
export class RevenueMonsterService implements OnModuleInit {
  private readonly logger = new Logger(RevenueMonsterService.name);

  private clientId: string;
  private clientSecret: string;
  private privateKey: string;
  private oauthUrl: string;
  private apiUrl: string;
  private storeId: string;
  private environment: string;

  // Token cache
  private accessToken: string | null = null;
  private refreshToken: string | null = null;
  private tokenExpiresAt: number = 0;

  constructor(private readonly configService: ConfigService) {}

  onModuleInit() {
    this.clientId = this.configService.getOrThrow('RM_CLIENT_ID');
    this.clientSecret = this.configService.getOrThrow('RM_CLIENT_SECRET');
    this.storeId = this.configService.getOrThrow('RM_STORE_ID');

    // Load private key from file path
    const privateKeyPath = this.configService.getOrThrow('RM_PRIVATE_KEY_PATH');
    this.privateKey = fs.readFileSync(privateKeyPath, 'utf8');

    // Auto-switch URLs based on NODE_ENV
    this.environment =
      process.env.NODE_ENV === 'production' ? 'production' : 'sandbox';
    this.oauthUrl = RM_URLS[this.environment].oauth;
    this.apiUrl = RM_URLS[this.environment].api;

    this.logger.log(
      `Revenue Monster initialized [${this.environment.toUpperCase()}]`,
    );
    this.logger.log(`  OAuth: ${this.oauthUrl}`);
    this.logger.log(`  API:   ${this.apiUrl}`);
  }

  // ============================================================
  // PUBLIC METHODS
  // ============================================================

  getStoreId(): string {
    return this.storeId;
  }

  getEnvironment(): string {
    return this.environment;
  }

  /**
   * Make an authenticated GET request to Revenue Monster API
   */
  async get<T>(path: string): Promise<T> {
    const url = `${this.apiUrl}${path}`;
    const headers = await this.buildHeaders('get', url);

    const res = await fetch(url, { method: 'GET', headers });
    const data = await res.json();

    if (!res.ok) {
      this.logger.error(`RM GET ${path} failed: ${JSON.stringify(data)}`);
      throw new Error(
        `Revenue Monster API error: ${data?.error?.message || res.statusText}`,
      );
    }

    return data as T;
  }

  /**
   * Make an authenticated POST request to Revenue Monster API
   */
  async post<T>(path: string, body: object): Promise<T> {
    const url = `${this.apiUrl}${path}`;
    const sortedBody = this.sortObjectKeys(body);
    const headers = await this.buildHeaders('post', url, sortedBody);

    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(sortedBody),
    });
    const data = await res.json();

    if (!res.ok) {
      this.logger.error(`RM POST ${path} failed: ${JSON.stringify(data)}`);
      throw new Error(
        `Revenue Monster API error: ${data?.error?.message || res.statusText}`,
      );
    }

    return data as T;
  }

  // ============================================================
  // TOKEN MANAGEMENT
  // ============================================================

  /**
   * Get a valid access token, refreshing if needed
   */
  private async getValidToken(): Promise<string> {
    const now = Math.floor(Date.now() / 1000);
    const bufferSeconds = 300; // refresh 5 min before expiry

    if (this.accessToken && now < this.tokenExpiresAt - bufferSeconds) {
      return this.accessToken;
    }

    // Try refresh token first, fallback to client credentials
    if (this.refreshToken) {
      try {
        await this.refreshAccessToken();
        return this.accessToken;
      } catch (error) {
        this.logger.warn(
          'Refresh token failed, falling back to client credentials',
        );
      }
    }

    await this.fetchAccessToken();
    return this.accessToken;
  }

  /**
   * Fetch new access token using client credentials
   */
  private async fetchAccessToken(): Promise<void> {
    const auth = Buffer.from(
      `${this.clientId}:${this.clientSecret}`,
    ).toString('base64');

    const res = await fetch(`${this.oauthUrl}/v1/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Basic ${auth}`,
      },
      body: JSON.stringify({ grantType: 'client_credentials' }),
    });

    const data = (await res.json()) as any;

    if (!res.ok || !data.accessToken) {
      this.logger.error(`Failed to get access token: ${JSON.stringify(data)}`);
      throw new Error('Failed to obtain Revenue Monster access token');
    }

    this.accessToken = data.accessToken;
    this.refreshToken = data.refreshToken;
    this.tokenExpiresAt = Math.floor(Date.now() / 1000) + data.expiresIn;

    this.logger.log('Access token obtained successfully');
  }

  /**
   * Refresh the access token using refresh token
   */
  private async refreshAccessToken(): Promise<void> {
    const auth = Buffer.from(
      `${this.clientId}:${this.clientSecret}`,
    ).toString('base64');

    const res = await fetch(`${this.oauthUrl}/v1/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Basic ${auth}`,
      },
      body: JSON.stringify({
        grantType: 'refresh_token',
        refreshToken: this.refreshToken,
      }),
    });

    const data = (await res.json()) as any;

    if (!res.ok || !data.accessToken) {
      throw new Error('Refresh token expired');
    }

    this.accessToken = data.accessToken;
    this.refreshToken = data.refreshToken;
    this.tokenExpiresAt = Math.floor(Date.now() / 1000) + data.expiresIn;

    this.logger.log('Access token refreshed successfully');
  }

  // ============================================================
  // SIGNATURE GENERATION
  // ============================================================

  /**
   * Build authenticated headers (token + signature)
   */
  private async buildHeaders(
    method: string,
    url: string,
    body?: object,
  ): Promise<Record<string, string>> {
    const accessToken = await this.getValidToken();
    const nonceStr = crypto.randomBytes(16).toString('hex');
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const signature = this.generateSignature(
      method,
      url,
      nonceStr,
      timestamp,
      body,
    );

    return {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
      'X-Nonce-Str': nonceStr,
      'X-Signature': signature,
      'X-Timestamp': timestamp,
    };
  }

  /**
   * Generate RSA-SHA256 signature for RM API requests
   */
  private generateSignature(
    method: string,
    url: string,
    nonceStr: string,
    timestamp: string,
    body?: object,
  ): string {
    let signString: string;

    if (body && method.toLowerCase() === 'post') {
      const encoded = Buffer.from(JSON.stringify(body)).toString('base64');
      signString = `data=${encoded}&method=post&nonceStr=${nonceStr}&requestUrl=${url}&signType=sha256&timestamp=${timestamp}`;
    } else {
      signString = `method=${method.toLowerCase()}&nonceStr=${nonceStr}&requestUrl=${url}&signType=sha256&timestamp=${timestamp}`;
    }

    const sign = crypto.createSign('SHA256');
    sign.update(signString);
    const signature = sign.sign(this.privateKey, 'base64');

    return `sha256 ${signature}`;
  }

  // ============================================================
  // UTILITY
  // ============================================================

  /**
   * Sort object keys alphabetically (including nested objects)
   * Required by Revenue Monster's signature verification
   */
  private sortObjectKeys(obj: any): any {
    if (Array.isArray(obj)) {
      return obj.map((item) => this.sortObjectKeys(item));
    }
    if (obj !== null && typeof obj === 'object') {
      return Object.keys(obj)
        .sort()
        .reduce((acc: any, key: string) => {
          acc[key] = this.sortObjectKeys(obj[key]);
          return acc;
        }, {});
    }
    return obj;
  }
}
