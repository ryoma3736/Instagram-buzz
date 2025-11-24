// Instagram OAuth認証サービス
import * as fs from 'fs';
import { parseLocalJson, safeJsonParseOrNull, isHtmlContent } from '../utils/safeJsonParse.js';

const TOKEN_FILE = './.instagram_token.json';

interface InstagramToken {
  access_token: string;
  token_type: string;
  expires_in?: number;
  created_at: number;
}

export class InstagramAuthService {
  private clientId: string;
  private clientSecret: string;
  private redirectUri: string;

  constructor() {
    this.clientId = process.env.INSTAGRAM_CLIENT_ID || '';
    this.clientSecret = process.env.INSTAGRAM_CLIENT_SECRET || '';
    this.redirectUri = process.env.INSTAGRAM_REDIRECT_URI || 'https://localhost:3000/callback';
  }

  /**
   * OAuth認証URLを生成
   */
  getAuthUrl(): string {
    const scope = 'user_profile,user_media';
    return `https://api.instagram.com/oauth/authorize?client_id=${this.clientId}&redirect_uri=${encodeURIComponent(this.redirectUri)}&scope=${scope}&response_type=code`;
  }

  /**
   * 認証コードからアクセストークンを取得
   */
  async exchangeCodeForToken(code: string): Promise<InstagramToken | null> {
    try {
      const response = await fetch('https://api.instagram.com/oauth/access_token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: this.clientId,
          client_secret: this.clientSecret,
          grant_type: 'authorization_code',
          redirect_uri: this.redirectUri,
          code
        })
      });

      if (!response.ok) throw new Error(`Token exchange failed: ${response.status}`);

      // Get text first and check for HTML response
      const text = await response.text();
      if (isHtmlContent(text)) {
        throw new Error('HTML response received instead of token');
      }

      const data = safeJsonParseOrNull<any>(text, 'exchangeCodeForToken');
      if (!data) throw new Error('Failed to parse token response');

      const token: InstagramToken = {
        access_token: data.access_token,
        token_type: 'Bearer',
        created_at: Date.now()
      };

      // 長期トークンに交換
      const longLivedToken = await this.getLongLivedToken(token.access_token);
      if (longLivedToken) {
        token.access_token = longLivedToken.access_token;
        token.expires_in = longLivedToken.expires_in;
      }

      this.saveToken(token);
      return token;
    } catch (error) {
      console.error('Token exchange error:', error);
      return null;
    }
  }

  /**
   * 長期アクセストークンを取得
   */
  private async getLongLivedToken(shortLivedToken: string): Promise<{ access_token: string; expires_in: number } | null> {
    try {
      const url = `https://graph.instagram.com/access_token?grant_type=ig_exchange_token&client_secret=${this.clientSecret}&access_token=${shortLivedToken}`;
      const response = await fetch(url);
      if (!response.ok) return null;

      // Get text first and check for HTML response
      const text = await response.text();
      if (isHtmlContent(text)) {
        console.error('[InstagramAuthService] HTML response in getLongLivedToken');
        return null;
      }

      return safeJsonParseOrNull<any>(text, 'getLongLivedToken');
    } catch {
      return null;
    }
  }

  /**
   * トークンを保存
   */
  private saveToken(token: InstagramToken): void {
    fs.writeFileSync(TOKEN_FILE, JSON.stringify(token, null, 2));
    console.log('✅ Instagram token saved');
  }

  /**
   * 保存済みトークンを取得
   */
  getStoredToken(): string | null {
    try {
      if (!fs.existsSync(TOKEN_FILE)) return null;
      const data = parseLocalJson<InstagramToken>(fs.readFileSync(TOKEN_FILE, 'utf-8'), TOKEN_FILE);

      // 有効期限チェック (60日)
      if (data.expires_in && Date.now() - data.created_at > data.expires_in * 1000) {
        console.warn('Instagram token expired');
        return null;
      }
      return data.access_token;
    } catch {
      return null;
    }
  }

  /**
   * トークンをリフレッシュ
   */
  async refreshToken(): Promise<boolean> {
    const currentToken = this.getStoredToken();
    if (!currentToken) return false;

    try {
      const url = `https://graph.instagram.com/refresh_access_token?grant_type=ig_refresh_token&access_token=${currentToken}`;
      const response = await fetch(url);
      if (!response.ok) return false;

      // Get text first and check for HTML response
      const text = await response.text();
      if (isHtmlContent(text)) {
        console.error('[InstagramAuthService] HTML response in refreshToken');
        return false;
      }

      const data = safeJsonParseOrNull<any>(text, 'refreshToken');
      if (!data) return false;

      const token: InstagramToken = {
        access_token: data.access_token,
        token_type: 'Bearer',
        expires_in: data.expires_in,
        created_at: Date.now()
      };
      this.saveToken(token);
      return true;
    } catch {
      return false;
    }
  }
}

export const instagramAuthService = new InstagramAuthService();
