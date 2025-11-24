/**
 * SMS Authentication Handler for Instagram 2FA
 * @module services/instagram/smsHandler
 */

import * as readline from 'readline';

/**
 * SMS handler configuration
 */
export interface SMSHandlerConfig {
  /** Timeout for waiting SMS code input (ms, default: 120000 = 2 minutes) */
  timeout?: number;
  /** Maximum retry attempts (default: 3) */
  maxRetries?: number;
  /** Callback when SMS code is requested */
  onCodeRequested?: () => void;
  /** Callback when timeout occurs */
  onTimeout?: () => void;
}

/**
 * SMS verification result
 */
export interface SMSVerificationResult {
  success: boolean;
  code?: string;
  error?: string;
  attempts: number;
}

/**
 * SMS wait status
 */
export type SMSWaitStatus = 'waiting' | 'received' | 'timeout' | 'cancelled';

/**
 * SMS Handler class for Instagram 2FA
 * Handles interactive SMS code input from user
 */
export class SMSHandler {
  private timeout: number;
  private maxRetries: number;
  private onCodeRequested?: () => void;
  private onTimeout?: () => void;
  private currentStatus: SMSWaitStatus = 'waiting';
  private abortController: AbortController | null = null;

  constructor(config: SMSHandlerConfig = {}) {
    this.timeout = config.timeout ?? 120000; // 2 minutes default
    this.maxRetries = config.maxRetries ?? 3;
    this.onCodeRequested = config.onCodeRequested;
    this.onTimeout = config.onTimeout;
  }

  /**
   * Get current wait status
   */
  getStatus(): SMSWaitStatus {
    return this.currentStatus;
  }

  /**
   * Wait for SMS code input from user (interactive mode)
   */
  async waitForCode(): Promise<SMSVerificationResult> {
    this.currentStatus = 'waiting';
    this.abortController = new AbortController();

    if (this.onCodeRequested) {
      this.onCodeRequested();
    }

    let attempts = 0;

    while (attempts < this.maxRetries) {
      attempts++;

      try {
        const code = await this.promptForCode(attempts);

        if (this.validateCodeFormat(code)) {
          this.currentStatus = 'received';
          return {
            success: true,
            code,
            attempts,
          };
        } else {
          console.log(`Invalid code format. Please enter a 6-digit code. (Attempt ${attempts}/${this.maxRetries})`);
        }
      } catch (error) {
        if (error instanceof Error && error.message === 'TIMEOUT') {
          this.currentStatus = 'timeout';
          if (this.onTimeout) {
            this.onTimeout();
          }
          return {
            success: false,
            error: 'Timeout waiting for SMS code',
            attempts,
          };
        }
        if (error instanceof Error && error.message === 'CANCELLED') {
          this.currentStatus = 'cancelled';
          return {
            success: false,
            error: 'SMS verification cancelled',
            attempts,
          };
        }
        throw error;
      }
    }

    return {
      success: false,
      error: `Max retries (${this.maxRetries}) exceeded`,
      attempts,
    };
  }

  /**
   * Wait for SMS code with programmatic input (non-interactive mode)
   * @param codeProvider Function that provides the SMS code
   */
  async waitForCodeProgrammatic(
    codeProvider: () => Promise<string | null>
  ): Promise<SMSVerificationResult> {
    this.currentStatus = 'waiting';
    let attempts = 0;

    const startTime = Date.now();

    while (attempts < this.maxRetries) {
      attempts++;

      if (Date.now() - startTime > this.timeout) {
        this.currentStatus = 'timeout';
        return {
          success: false,
          error: 'Timeout waiting for SMS code',
          attempts,
        };
      }

      const code = await codeProvider();

      if (code && this.validateCodeFormat(code)) {
        this.currentStatus = 'received';
        return {
          success: true,
          code,
          attempts,
        };
      }

      // Wait before next attempt
      await this.sleep(5000);
    }

    return {
      success: false,
      error: `Max retries (${this.maxRetries}) exceeded`,
      attempts,
    };
  }

  /**
   * Cancel waiting for SMS code
   */
  cancel(): void {
    this.currentStatus = 'cancelled';
    if (this.abortController) {
      this.abortController.abort();
    }
  }

  /**
   * Validate SMS code format (6 digits)
   */
  private validateCodeFormat(code: string): boolean {
    return /^\d{6}$/.test(code.trim());
  }

  /**
   * Prompt user for SMS code via CLI
   */
  private promptForCode(attempt: number): Promise<string> {
    return new Promise((resolve, reject) => {
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
      });

      const timeoutId = setTimeout(() => {
        rl.close();
        reject(new Error('TIMEOUT'));
      }, this.timeout);

      // Listen for abort signal
      if (this.abortController) {
        this.abortController.signal.addEventListener('abort', () => {
          clearTimeout(timeoutId);
          rl.close();
          reject(new Error('CANCELLED'));
        });
      }

      console.log(`\n${'='.repeat(50)}`);
      console.log('SMS Authentication Required');
      console.log(`${'='.repeat(50)}`);
      console.log(`A verification code has been sent to your phone.`);
      console.log(`Timeout: ${this.timeout / 1000} seconds`);
      console.log(`Attempt: ${attempt}/${this.maxRetries}`);
      console.log(`${'='.repeat(50)}\n`);

      rl.question('Enter 6-digit SMS code: ', (answer) => {
        clearTimeout(timeoutId);
        rl.close();
        resolve(answer.trim());
      });
    });
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * Create SMS handler with default config
 */
export function createSMSHandler(config?: SMSHandlerConfig): SMSHandler {
  return new SMSHandler(config);
}

export const smsHandler = new SMSHandler();
