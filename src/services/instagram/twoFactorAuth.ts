/**
 * Two-Factor Authentication Handler for Instagram
 * @module services/instagram/twoFactorAuth
 */

import { TOTPGenerator, TOTPResult } from './totpGenerator.js';
import { SMSHandler, SMSHandlerConfig } from './smsHandler.js';

/**
 * 2FA method types supported by Instagram
 */
export type TwoFactorMethod = 'totp' | 'sms' | 'backup_code';

/**
 * 2FA challenge information
 */
export interface TwoFactorChallenge {
  /** Type of 2FA required */
  method: TwoFactorMethod;
  /** Phone number hint (for SMS) */
  phoneNumberHint?: string;
  /** Whether backup codes are available */
  backupCodesAvailable?: boolean;
  /** User identifier for the challenge */
  userId?: string;
  /** Challenge nonce/identifier */
  nonce?: string;
}

/**
 * 2FA configuration
 */
export interface TwoFactorConfig {
  /** TOTP secret for Google Authenticator etc. */
  totpSecret?: string;
  /** Preferred 2FA method */
  preferredMethod?: TwoFactorMethod;
  /** SMS handler configuration */
  smsConfig?: SMSHandlerConfig;
  /** Backup codes for emergency use */
  backupCodes?: string[];
  /** Auto-retry on failure */
  autoRetry?: boolean;
  /** Max retry attempts */
  maxRetries?: number;
}

/**
 * 2FA verification result
 */
export interface TwoFactorResult {
  success: boolean;
  method: TwoFactorMethod;
  code?: string;
  error?: string;
  attempts: number;
}

/**
 * 2FA detection patterns for Instagram web
 */
export const TWO_FACTOR_PATTERNS = {
  /** URL patterns indicating 2FA page */
  urlPatterns: [
    '/accounts/login/two_factor',
    '/challenge/',
    'two_factor_auth',
  ],
  /** DOM selectors for 2FA elements */
  selectors: {
    /** TOTP input field */
    totpInput: 'input[name="verificationCode"]',
    /** SMS code input field */
    smsInput: 'input[name="security_code"]',
    /** Verification code input (generic) */
    codeInput: 'input[aria-label*="code"]',
    /** Submit button */
    submitButton: 'button[type="submit"]',
    /** Error message */
    errorMessage: '[data-testid="login-error-message"]',
    /** Phone hint text */
    phoneHint: 'span[class*="phone"]',
  },
  /** Text patterns indicating 2FA */
  textPatterns: {
    totp: ['authenticator', 'authentication app', 'google authenticator'],
    sms: ['text message', 'sms', 'phone number', 'we sent'],
    backupCode: ['backup code', 'recovery code'],
  },
} as const;

/**
 * Two-Factor Authentication Handler
 */
export class TwoFactorAuth {
  private totpGenerator: TOTPGenerator | null = null;
  private smsHandler: SMSHandler;
  private backupCodes: string[];
  private preferredMethod: TwoFactorMethod;
  private autoRetry: boolean;
  private maxRetries: number;

  constructor(config: TwoFactorConfig = {}) {
    // Initialize TOTP if secret provided
    if (config.totpSecret) {
      this.totpGenerator = new TOTPGenerator({ secret: config.totpSecret });
    } else {
      this.totpGenerator = TOTPGenerator.fromEnv();
    }

    this.smsHandler = new SMSHandler(config.smsConfig);
    this.backupCodes = config.backupCodes ?? [];
    this.preferredMethod = config.preferredMethod ?? 'totp';
    this.autoRetry = config.autoRetry ?? true;
    this.maxRetries = config.maxRetries ?? 3;
  }

  /**
   * Create TwoFactorAuth from environment variables
   */
  static fromEnv(): TwoFactorAuth {
    return new TwoFactorAuth({
      totpSecret: process.env.INSTAGRAM_TOTP_SECRET,
      preferredMethod: (process.env.INSTAGRAM_2FA_METHOD as TwoFactorMethod) ?? 'totp',
    });
  }

  /**
   * Check if TOTP is configured
   */
  hasTOTP(): boolean {
    return this.totpGenerator !== null;
  }

  /**
   * Check if backup codes are available
   */
  hasBackupCodes(): boolean {
    return this.backupCodes.length > 0;
  }

  /**
   * Detect 2FA challenge type from page content
   */
  detectChallengeType(pageContent: string, pageUrl: string): TwoFactorChallenge | null {
    // Check URL patterns
    const is2FAPage = TWO_FACTOR_PATTERNS.urlPatterns.some(pattern =>
      pageUrl.includes(pattern)
    );

    if (!is2FAPage) {
      return null;
    }

    const contentLower = pageContent.toLowerCase();

    // Detect method from content
    let method: TwoFactorMethod = 'sms'; // Default

    for (const pattern of TWO_FACTOR_PATTERNS.textPatterns.totp) {
      if (contentLower.includes(pattern)) {
        method = 'totp';
        break;
      }
    }

    // Extract phone number hint if SMS
    let phoneNumberHint: string | undefined;
    const phoneMatch = pageContent.match(/\+\d+[\s*]+\d+/);
    if (phoneMatch) {
      phoneNumberHint = phoneMatch[0];
    }

    return {
      method,
      phoneNumberHint,
      backupCodesAvailable: contentLower.includes('backup') || contentLower.includes('recovery'),
    };
  }

  /**
   * Handle 2FA challenge
   */
  async handleChallenge(challenge: TwoFactorChallenge): Promise<TwoFactorResult> {
    const method = challenge.method;
    let attempts = 0;

    while (attempts < this.maxRetries) {
      attempts++;

      try {
        const result = await this.getCodeForMethod(method);

        if (result.success) {
          return {
            ...result,
            attempts,
          };
        }

        if (!this.autoRetry) {
          return {
            ...result,
            attempts,
          };
        }
      } catch (error) {
        if (!this.autoRetry || attempts >= this.maxRetries) {
          return {
            success: false,
            method,
            error: error instanceof Error ? error.message : 'Unknown error',
            attempts,
          };
        }
      }
    }

    return {
      success: false,
      method,
      error: `Max retries (${this.maxRetries}) exceeded`,
      attempts,
    };
  }

  /**
   * Get verification code for specific method
   */
  async getCodeForMethod(method: TwoFactorMethod): Promise<TwoFactorResult> {
    switch (method) {
      case 'totp':
        return this.getTOTPCode();

      case 'sms':
        return this.getSMSCode();

      case 'backup_code':
        return this.getBackupCode();

      default:
        return {
          success: false,
          method,
          error: `Unsupported 2FA method: ${method}`,
          attempts: 1,
        };
    }
  }

  /**
   * Generate TOTP code
   */
  getTOTPCode(): TwoFactorResult {
    if (!this.totpGenerator) {
      return {
        success: false,
        method: 'totp',
        error: 'TOTP not configured. Set INSTAGRAM_TOTP_SECRET environment variable.',
        attempts: 1,
      };
    }

    try {
      const result = this.totpGenerator.generate();

      console.log(`Generated TOTP code: ${result.code}`);
      console.log(`Expires in: ${result.remainingSeconds} seconds`);

      return {
        success: true,
        method: 'totp',
        code: result.code,
        attempts: 1,
      };
    } catch (error) {
      return {
        success: false,
        method: 'totp',
        error: error instanceof Error ? error.message : 'TOTP generation failed',
        attempts: 1,
      };
    }
  }

  /**
   * Wait for fresh TOTP code (if remaining time is low)
   */
  async getFreshTOTPCode(minRemainingSeconds: number = 5): Promise<TwoFactorResult> {
    if (!this.totpGenerator) {
      return {
        success: false,
        method: 'totp',
        error: 'TOTP not configured',
        attempts: 1,
      };
    }

    try {
      const result = await this.totpGenerator.waitForFreshCode(minRemainingSeconds);
      return {
        success: true,
        method: 'totp',
        code: result.code,
        attempts: 1,
      };
    } catch (error) {
      return {
        success: false,
        method: 'totp',
        error: error instanceof Error ? error.message : 'TOTP generation failed',
        attempts: 1,
      };
    }
  }

  /**
   * Wait for SMS code from user
   */
  async getSMSCode(): Promise<TwoFactorResult> {
    console.log('\nSMS verification required.');
    console.log('Please check your phone for the verification code.\n');

    const result = await this.smsHandler.waitForCode();

    return {
      success: result.success,
      method: 'sms',
      code: result.code,
      error: result.error,
      attempts: result.attempts,
    };
  }

  /**
   * Get backup code
   */
  getBackupCode(): TwoFactorResult {
    if (this.backupCodes.length === 0) {
      return {
        success: false,
        method: 'backup_code',
        error: 'No backup codes available',
        attempts: 1,
      };
    }

    // Use and remove the first available backup code
    const code = this.backupCodes.shift()!;

    console.log(`Using backup code: ${code}`);
    console.log(`Remaining backup codes: ${this.backupCodes.length}`);

    return {
      success: true,
      method: 'backup_code',
      code,
      attempts: 1,
    };
  }

  /**
   * Cancel ongoing SMS wait
   */
  cancelSMSWait(): void {
    this.smsHandler.cancel();
  }

  /**
   * Get current TOTP info (for debugging)
   */
  getTOTPInfo(): TOTPResult | null {
    if (!this.totpGenerator) {
      return null;
    }
    return this.totpGenerator.generate();
  }

  /**
   * Verify a TOTP code (for testing)
   */
  verifyTOTPCode(code: string): boolean {
    if (!this.totpGenerator) {
      return false;
    }
    return this.totpGenerator.verify(code);
  }
}

/**
 * Create TwoFactorAuth instance from environment
 */
export function createTwoFactorAuth(config?: TwoFactorConfig): TwoFactorAuth {
  return new TwoFactorAuth(config);
}

export const twoFactorAuth = TwoFactorAuth.fromEnv();
