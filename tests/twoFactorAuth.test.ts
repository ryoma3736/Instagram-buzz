/**
 * Two-Factor Authentication Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  TOTPGenerator,
  generateTOTP,
  verifyTOTP,
} from '../src/services/instagram/totpGenerator.js';
import {
  SMSHandler,
} from '../src/services/instagram/smsHandler.js';
import {
  TwoFactorAuth,
  TWO_FACTOR_PATTERNS,
} from '../src/services/instagram/twoFactorAuth.js';

// Test secret (DO NOT use in production)
const TEST_SECRET = 'JBSWY3DPEHPK3PXP';

describe('TOTPGenerator', () => {
  describe('constructor and fromEnv', () => {
    it('should create instance with config', () => {
      const generator = new TOTPGenerator({ secret: TEST_SECRET });
      expect(generator).toBeInstanceOf(TOTPGenerator);
    });

    it('should return null from fromEnv when no secret is set', () => {
      const originalEnv = process.env.INSTAGRAM_TOTP_SECRET;
      delete process.env.INSTAGRAM_TOTP_SECRET;

      const generator = TOTPGenerator.fromEnv();
      expect(generator).toBeNull();

      if (originalEnv) {
        process.env.INSTAGRAM_TOTP_SECRET = originalEnv;
      }
    });

    it('should create instance from env when secret is set', () => {
      const originalEnv = process.env.INSTAGRAM_TOTP_SECRET;
      process.env.INSTAGRAM_TOTP_SECRET = TEST_SECRET;

      const generator = TOTPGenerator.fromEnv();
      expect(generator).toBeInstanceOf(TOTPGenerator);

      if (originalEnv) {
        process.env.INSTAGRAM_TOTP_SECRET = originalEnv;
      } else {
        delete process.env.INSTAGRAM_TOTP_SECRET;
      }
    });
  });

  describe('validateSecret', () => {
    it('should validate correct base32 secret', () => {
      const result = TOTPGenerator.validateSecret(TEST_SECRET);
      expect(result.isValid).toBe(true);
    });

    it('should reject empty secret', () => {
      const result = TOTPGenerator.validateSecret('');
      expect(result.isValid).toBe(false);
      expect(result.error).toBe('Secret is empty');
    });

    it('should reject too short secret', () => {
      const result = TOTPGenerator.validateSecret('ABC');
      expect(result.isValid).toBe(false);
      expect(result.error).toBe('Secret too short (minimum 16 characters)');
    });

    it('should reject invalid base32 characters', () => {
      const result = TOTPGenerator.validateSecret('INVALID89!@#$%^&');
      expect(result.isValid).toBe(false);
      expect(result.error).toBe('Invalid base32 format');
    });
  });

  describe('generate', () => {
    it('should generate 6-digit code', () => {
      const generator = new TOTPGenerator({ secret: TEST_SECRET });
      const result = generator.generate();

      expect(result.code).toMatch(/^\d{6}$/);
      expect(result.remainingSeconds).toBeGreaterThanOrEqual(0);
      expect(result.remainingSeconds).toBeLessThanOrEqual(30);
      expect(result.generatedAt).toBeLessThanOrEqual(Date.now());
    });

    it('should generate verifiable code', () => {
      const generator = new TOTPGenerator({ secret: TEST_SECRET });
      const result = generator.generate();

      expect(generator.verify(result.code)).toBe(true);
    });
  });

  describe('getRemainingSeconds', () => {
    it('should return value between 0 and step', () => {
      const generator = new TOTPGenerator({ secret: TEST_SECRET });
      const remaining = generator.getRemainingSeconds();

      expect(remaining).toBeGreaterThanOrEqual(0);
      expect(remaining).toBeLessThanOrEqual(30);
    });
  });

  describe('getNextCodeTime', () => {
    it('should return future date', () => {
      const generator = new TOTPGenerator({ secret: TEST_SECRET });
      const nextTime = generator.getNextCodeTime();

      expect(nextTime.getTime()).toBeGreaterThan(Date.now());
    });
  });
});

describe('generateTOTP and verifyTOTP functions', () => {
  it('should generate valid code', () => {
    const code = generateTOTP(TEST_SECRET);
    expect(code).toMatch(/^\d{6}$/);
  });

  it('should verify valid code', () => {
    const code = generateTOTP(TEST_SECRET);
    expect(verifyTOTP(code, TEST_SECRET)).toBe(true);
  });

  it('should reject invalid code', () => {
    expect(verifyTOTP('000000', TEST_SECRET)).toBe(false);
  });
});

describe('SMSHandler', () => {
  describe('constructor', () => {
    it('should create instance with default config', () => {
      const handler = new SMSHandler();
      expect(handler).toBeInstanceOf(SMSHandler);
      expect(handler.getStatus()).toBe('waiting');
    });

    it('should create instance with custom config', () => {
      const handler = new SMSHandler({
        timeout: 60000,
        maxRetries: 5,
      });
      expect(handler).toBeInstanceOf(SMSHandler);
    });
  });

  describe('getStatus', () => {
    it('should return initial status as waiting', () => {
      const handler = new SMSHandler();
      expect(handler.getStatus()).toBe('waiting');
    });
  });

  describe('cancel', () => {
    it('should set status to cancelled', () => {
      const handler = new SMSHandler();
      handler.cancel();
      expect(handler.getStatus()).toBe('cancelled');
    });
  });

  describe('waitForCodeProgrammatic', () => {
    it('should succeed with valid code provider', async () => {
      const handler = new SMSHandler({ maxRetries: 3 });

      const result = await handler.waitForCodeProgrammatic(async () => '123456');

      expect(result.success).toBe(true);
      expect(result.code).toBe('123456');
    });

    it('should fail with invalid code format', async () => {
      const handler = new SMSHandler({ maxRetries: 1, timeout: 500 });

      const result = await handler.waitForCodeProgrammatic(async () => 'invalid');

      expect(result.success).toBe(false);
    }, 10000);

    it('should timeout when no code provided', async () => {
      const handler = new SMSHandler({ timeout: 500, maxRetries: 1 });

      const result = await handler.waitForCodeProgrammatic(async () => null);

      expect(result.success).toBe(false);
      // When code provider returns null, max retries is exceeded
      expect(result.error).toMatch(/Timeout|Max retries/);
    }, 10000);
  });
});

describe('TwoFactorAuth', () => {
  describe('constructor and fromEnv', () => {
    it('should create instance with config', () => {
      const auth = new TwoFactorAuth({
        totpSecret: TEST_SECRET,
      });
      expect(auth).toBeInstanceOf(TwoFactorAuth);
      expect(auth.hasTOTP()).toBe(true);
    });

    it('should create instance without TOTP', () => {
      const auth = new TwoFactorAuth({});
      expect(auth).toBeInstanceOf(TwoFactorAuth);
    });
  });

  describe('hasTOTP', () => {
    it('should return true when TOTP is configured', () => {
      const auth = new TwoFactorAuth({ totpSecret: TEST_SECRET });
      expect(auth.hasTOTP()).toBe(true);
    });

    it('should return false when TOTP is not configured', () => {
      const originalEnv = process.env.INSTAGRAM_TOTP_SECRET;
      delete process.env.INSTAGRAM_TOTP_SECRET;

      const auth = new TwoFactorAuth({});
      expect(auth.hasTOTP()).toBe(false);

      if (originalEnv) {
        process.env.INSTAGRAM_TOTP_SECRET = originalEnv;
      }
    });
  });

  describe('hasBackupCodes', () => {
    it('should return true when backup codes exist', () => {
      const auth = new TwoFactorAuth({
        backupCodes: ['12345678', '87654321'],
      });
      expect(auth.hasBackupCodes()).toBe(true);
    });

    it('should return false when no backup codes', () => {
      const auth = new TwoFactorAuth({});
      expect(auth.hasBackupCodes()).toBe(false);
    });
  });

  describe('detectChallengeType', () => {
    it('should detect TOTP challenge', () => {
      const auth = new TwoFactorAuth({});
      const challenge = auth.detectChallengeType(
        'Please enter code from your authentication app',
        'https://instagram.com/accounts/login/two_factor'
      );

      expect(challenge).not.toBeNull();
      expect(challenge?.method).toBe('totp');
    });

    it('should detect SMS challenge', () => {
      const auth = new TwoFactorAuth({});
      const challenge = auth.detectChallengeType(
        'We sent a text message to +81*****1234',
        'https://instagram.com/accounts/login/two_factor'
      );

      expect(challenge).not.toBeNull();
      expect(challenge?.method).toBe('sms');
      expect(challenge?.phoneNumberHint).toMatch(/\+\d+/);
    });

    it('should return null for non-2FA page', () => {
      const auth = new TwoFactorAuth({});
      const challenge = auth.detectChallengeType(
        'Welcome to Instagram',
        'https://instagram.com/feed'
      );

      expect(challenge).toBeNull();
    });
  });

  describe('getTOTPCode', () => {
    it('should generate TOTP code', () => {
      const auth = new TwoFactorAuth({ totpSecret: TEST_SECRET });
      const result = auth.getTOTPCode();

      expect(result.success).toBe(true);
      expect(result.method).toBe('totp');
      expect(result.code).toMatch(/^\d{6}$/);
    });

    it('should fail when TOTP not configured', () => {
      const originalEnv = process.env.INSTAGRAM_TOTP_SECRET;
      delete process.env.INSTAGRAM_TOTP_SECRET;

      const auth = new TwoFactorAuth({});
      const result = auth.getTOTPCode();

      expect(result.success).toBe(false);
      expect(result.error).toContain('TOTP not configured');

      if (originalEnv) {
        process.env.INSTAGRAM_TOTP_SECRET = originalEnv;
      }
    });
  });

  describe('getBackupCode', () => {
    it('should return and consume backup code', () => {
      const auth = new TwoFactorAuth({
        backupCodes: ['CODE1234', 'CODE5678'],
      });

      const result1 = auth.getBackupCode();
      expect(result1.success).toBe(true);
      expect(result1.code).toBe('CODE1234');

      const result2 = auth.getBackupCode();
      expect(result2.success).toBe(true);
      expect(result2.code).toBe('CODE5678');

      const result3 = auth.getBackupCode();
      expect(result3.success).toBe(false);
      expect(result3.error).toContain('No backup codes');
    });
  });

  describe('verifyTOTPCode', () => {
    it('should verify valid code', () => {
      const auth = new TwoFactorAuth({ totpSecret: TEST_SECRET });
      const result = auth.getTOTPCode();

      expect(auth.verifyTOTPCode(result.code!)).toBe(true);
    });

    it('should reject invalid code', () => {
      const auth = new TwoFactorAuth({ totpSecret: TEST_SECRET });

      expect(auth.verifyTOTPCode('000000')).toBe(false);
    });
  });

  describe('cancelSMSWait', () => {
    it('should cancel SMS wait without error', () => {
      const auth = new TwoFactorAuth({});
      expect(() => auth.cancelSMSWait()).not.toThrow();
    });
  });
});

describe('TWO_FACTOR_PATTERNS', () => {
  it('should have URL patterns', () => {
    expect(TWO_FACTOR_PATTERNS.urlPatterns).toContain('/accounts/login/two_factor');
    expect(TWO_FACTOR_PATTERNS.urlPatterns).toContain('/challenge/');
  });

  it('should have DOM selectors', () => {
    expect(TWO_FACTOR_PATTERNS.selectors.totpInput).toBeDefined();
    expect(TWO_FACTOR_PATTERNS.selectors.smsInput).toBeDefined();
    expect(TWO_FACTOR_PATTERNS.selectors.submitButton).toBeDefined();
  });

  it('should have text patterns', () => {
    expect(TWO_FACTOR_PATTERNS.textPatterns.totp).toContain('authenticator');
    expect(TWO_FACTOR_PATTERNS.textPatterns.sms).toContain('sms');
  });
});
