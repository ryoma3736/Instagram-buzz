/**
 * TOTP Code Generator for Instagram 2FA
 * @module services/instagram/totpGenerator
 */

import { authenticator } from 'otplib';

/**
 * Configuration for TOTP generation
 */
export interface TOTPConfig {
  /** TOTP secret key (base32 encoded) */
  secret: string;
  /** Time step in seconds (default: 30) */
  step?: number;
  /** Number of digits (default: 6) */
  digits?: number;
}

/**
 * TOTP generation result
 */
export interface TOTPResult {
  /** Generated TOTP code */
  code: string;
  /** Time remaining until code expires (seconds) */
  remainingSeconds: number;
  /** Timestamp when code was generated */
  generatedAt: number;
}

/**
 * Validation result for TOTP secret
 */
export interface SecretValidation {
  isValid: boolean;
  error?: string;
}

/**
 * TOTP Generator class for Instagram 2FA
 */
export class TOTPGenerator {
  private secret: string;
  private step: number;
  private digits: number;

  constructor(config: TOTPConfig) {
    this.secret = config.secret;
    this.step = config.step ?? 30;
    this.digits = config.digits ?? 6;

    // Configure otplib
    authenticator.options = {
      step: this.step,
      digits: this.digits,
    };
  }

  /**
   * Create TOTPGenerator from environment variable
   */
  static fromEnv(): TOTPGenerator | null {
    const secret = process.env.INSTAGRAM_TOTP_SECRET;
    if (!secret) {
      return null;
    }
    return new TOTPGenerator({ secret });
  }

  /**
   * Validate TOTP secret format
   */
  static validateSecret(secret: string): SecretValidation {
    if (!secret || secret.trim() === '') {
      return { isValid: false, error: 'Secret is empty' };
    }

    // Base32 validation (A-Z, 2-7)
    const base32Regex = /^[A-Z2-7]+=*$/i;
    const cleanSecret = secret.replace(/\s/g, '').toUpperCase();

    if (!base32Regex.test(cleanSecret)) {
      return { isValid: false, error: 'Invalid base32 format' };
    }

    if (cleanSecret.length < 16) {
      return { isValid: false, error: 'Secret too short (minimum 16 characters)' };
    }

    return { isValid: true };
  }

  /**
   * Generate current TOTP code
   */
  generate(): TOTPResult {
    const code = authenticator.generate(this.secret);
    const remainingSeconds = this.getRemainingSeconds();

    return {
      code,
      remainingSeconds,
      generatedAt: Date.now(),
    };
  }

  /**
   * Get remaining seconds until current code expires
   */
  getRemainingSeconds(): number {
    const now = Math.floor(Date.now() / 1000);
    return this.step - (now % this.step);
  }

  /**
   * Verify a TOTP code
   */
  verify(token: string): boolean {
    return authenticator.verify({ token, secret: this.secret });
  }

  /**
   * Wait for a fresh code (useful when remaining time is low)
   * @param minRemainingSeconds Minimum seconds required (default: 5)
   */
  async waitForFreshCode(minRemainingSeconds: number = 5): Promise<TOTPResult> {
    const remaining = this.getRemainingSeconds();

    if (remaining < minRemainingSeconds) {
      // Wait until new code period
      const waitTime = (remaining + 1) * 1000;
      await this.sleep(waitTime);
    }

    return this.generate();
  }

  /**
   * Get time until next code
   */
  getNextCodeTime(): Date {
    const remaining = this.getRemainingSeconds();
    return new Date(Date.now() + remaining * 1000);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * Generate a single TOTP code from secret
 */
export function generateTOTP(secret: string): string {
  return authenticator.generate(secret);
}

/**
 * Verify a TOTP code against secret
 */
export function verifyTOTP(token: string, secret: string): boolean {
  return authenticator.verify({ token, secret });
}

export const totpGenerator = TOTPGenerator.fromEnv();
