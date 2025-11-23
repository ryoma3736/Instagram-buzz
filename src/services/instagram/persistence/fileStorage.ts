/**
 * File storage utilities for cookie persistence
 * @module services/instagram/persistence/fileStorage
 */

import * as fs from 'fs';
import * as path from 'path';

/**
 * File lock for concurrent access prevention
 */
interface FileLock {
  lockFile: string;
  acquired: boolean;
}

/**
 * Secure file storage with proper permissions and locking
 */
export class FileStorage {
  private basePath: string;
  private lockTimeout: number;

  constructor(basePath: string, lockTimeout = 5000) {
    this.basePath = basePath;
    this.lockTimeout = lockTimeout;
    this.ensureDirectory();
  }

  /**
   * Ensure base directory exists with secure permissions
   */
  private ensureDirectory(): void {
    if (!fs.existsSync(this.basePath)) {
      fs.mkdirSync(this.basePath, { recursive: true, mode: 0o700 });
    }
  }

  /**
   * Get full path for a file
   */
  getFilePath(filename: string): string {
    return path.join(this.basePath, filename);
  }

  /**
   * Acquire file lock for concurrent access prevention
   */
  async acquireLock(filename: string): Promise<FileLock> {
    const lockFile = this.getFilePath(`${filename}.lock`);
    const startTime = Date.now();

    while (Date.now() - startTime < this.lockTimeout) {
      try {
        // Try to create lock file exclusively
        fs.writeFileSync(lockFile, String(process.pid), { flag: 'wx' });
        return { lockFile, acquired: true };
      } catch (error: unknown) {
        if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
          // Lock exists, check if stale (older than lockTimeout)
          try {
            const stats = fs.statSync(lockFile);
            if (Date.now() - stats.mtimeMs > this.lockTimeout) {
              // Stale lock, remove it
              fs.unlinkSync(lockFile);
              continue;
            }
          } catch {
            // Lock file was removed, retry
            continue;
          }
          // Wait and retry
          await this.sleep(100);
        } else {
          throw error;
        }
      }
    }

    throw new Error(`Failed to acquire lock for ${filename} within ${this.lockTimeout}ms`);
  }

  /**
   * Release file lock
   */
  releaseLock(lock: FileLock): void {
    if (lock.acquired && fs.existsSync(lock.lockFile)) {
      try {
        fs.unlinkSync(lock.lockFile);
      } catch {
        // Ignore errors during unlock
      }
    }
  }

  /**
   * Read file with lock
   */
  async readFile(filename: string): Promise<string | null> {
    const filePath = this.getFilePath(filename);

    if (!fs.existsSync(filePath)) {
      return null;
    }

    const lock = await this.acquireLock(filename);
    try {
      return fs.readFileSync(filePath, 'utf-8');
    } finally {
      this.releaseLock(lock);
    }
  }

  /**
   * Write file with lock and secure permissions (600)
   */
  async writeFile(filename: string, content: string): Promise<void> {
    const filePath = this.getFilePath(filename);
    const lock = await this.acquireLock(filename);

    try {
      // Write to temp file first for atomic operation
      const tempPath = `${filePath}.tmp`;
      fs.writeFileSync(tempPath, content, { mode: 0o600 });

      // Rename for atomic update
      fs.renameSync(tempPath, filePath);

      // Ensure correct permissions
      fs.chmodSync(filePath, 0o600);
    } finally {
      this.releaseLock(lock);
    }
  }

  /**
   * Delete file with lock
   */
  async deleteFile(filename: string): Promise<boolean> {
    const filePath = this.getFilePath(filename);

    if (!fs.existsSync(filePath)) {
      return false;
    }

    const lock = await this.acquireLock(filename);
    try {
      fs.unlinkSync(filePath);
      return true;
    } finally {
      this.releaseLock(lock);
    }
  }

  /**
   * Check if file exists
   */
  exists(filename: string): boolean {
    return fs.existsSync(this.getFilePath(filename));
  }

  /**
   * List all files matching pattern
   */
  listFiles(pattern?: RegExp): string[] {
    if (!fs.existsSync(this.basePath)) {
      return [];
    }

    const files = fs.readdirSync(this.basePath);

    if (pattern) {
      return files.filter(f => pattern.test(f) && !f.endsWith('.lock'));
    }

    return files.filter(f => !f.endsWith('.lock'));
  }

  /**
   * Get file stats
   */
  getStats(filename: string): fs.Stats | null {
    const filePath = this.getFilePath(filename);

    if (!fs.existsSync(filePath)) {
      return null;
    }

    return fs.statSync(filePath);
  }

  /**
   * Sleep utility
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
