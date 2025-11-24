/**
 * Refresh Scheduler for Instagram Session Management
 * Provides background scheduling for automatic session refresh
 * @module services/instagram/session/refreshScheduler
 */

import { SessionRefresher, createSessionRefresher } from './sessionRefresher';
import type { RefreshConfig, RefreshEvents, RefreshResult, SessionData } from './types';
import { DEFAULT_REFRESH_CONFIG } from './types';

/**
 * Scheduler configuration
 */
export interface SchedulerConfig extends RefreshConfig {
  checkInterval: number;
  enabled: boolean;
  maxConsecutiveFailures: number;
  webhookUrl?: string;
}

/**
 * Default scheduler configuration
 */
export const DEFAULT_SCHEDULER_CONFIG: SchedulerConfig = {
  ...DEFAULT_REFRESH_CONFIG,
  checkInterval: 3600000,
  enabled: true,
  maxConsecutiveFailures: 5,
};

/**
 * Scheduler state
 */
export interface SchedulerState {
  isRunning: boolean;
  nextCheckAt: Date | null;
  nextRefreshAt: Date | null;
  lastSuccessfulRefresh: Date | null;
  consecutiveFailures: number;
  totalAttempts: number;
  totalSuccesses: number;
}

/**
 * Scheduler event callbacks
 */
export interface SchedulerEvents extends RefreshEvents {
  onSchedulerStart?: () => void;
  onSchedulerStop?: (reason: string) => void;
  onCheckPerformed?: (state: SchedulerState) => void;
  onMaxFailuresReached?: (failures: number) => void;
}

/**
 * Refresh Scheduler Class
 */
export class RefreshScheduler {
  private config: SchedulerConfig;
  private refresher: SessionRefresher;
  private events: SchedulerEvents;
  private state: SchedulerState;
  private checkTimer: ReturnType<typeof setInterval> | null = null;
  private refreshTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(config: Partial<SchedulerConfig> = {}, events: SchedulerEvents = {}) {
    this.config = { ...DEFAULT_SCHEDULER_CONFIG, ...config };
    this.events = events;

    this.state = {
      isRunning: false,
      nextCheckAt: null,
      nextRefreshAt: null,
      lastSuccessfulRefresh: null,
      consecutiveFailures: 0,
      totalAttempts: 0,
      totalSuccesses: 0,
    };

    this.refresher = createSessionRefresher(this.config, {
      ...events,
      onRefreshSuccess: (session: SessionData) => this.handleRefreshSuccess(session),
      onRefreshFailed: (error: Error) => this.handleRefreshFailed(error),
      onRefreshScheduled: (date: Date) => this.handleRefreshScheduled(date),
    });
  }

  async start(): Promise<void> {
    if (this.state.isRunning) {
      this.log('Scheduler already running');
      return;
    }

    if (!this.config.enabled) {
      this.log('Scheduler is disabled');
      return;
    }

    this.log('Starting refresh scheduler...');
    await this.refresher.initialize();
    this.startPeriodicCheck();
    this.state.isRunning = true;

    if (this.events.onSchedulerStart) {
      this.events.onSchedulerStart();
    }

    await this.performCheck();
    this.log('Refresh scheduler started');
  }

  stop(reason = 'Manual stop'): void {
    if (!this.state.isRunning) return;

    this.log(`Stopping scheduler: ${reason}`);
    this.stopPeriodicCheck();
    this.cancelScheduledRefresh();
    this.state.isRunning = false;
    this.state.nextCheckAt = null;
    this.state.nextRefreshAt = null;

    if (this.events.onSchedulerStop) {
      this.events.onSchedulerStop(reason);
    }
  }

  getState(): Readonly<SchedulerState> {
    return { ...this.state };
  }

  async forceRefresh(): Promise<RefreshResult> {
    this.log('Force refresh requested');
    this.state.totalAttempts++;
    return this.refresher.refreshNow();
  }

  getRefresher(): SessionRefresher {
    return this.refresher;
  }

  updateConfig(config: Partial<SchedulerConfig>): void {
    this.config = { ...this.config, ...config };
    this.log('Configuration updated');

    if (this.state.isRunning) {
      this.stopPeriodicCheck();
      this.startPeriodicCheck();
    }
  }

  async sendNotification(message: string, data?: object): Promise<void> {
    if (!this.config.webhookUrl) return;

    try {
      await fetch(this.config.webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, timestamp: new Date().toISOString(), ...data }),
      });
    } catch (error) {
      this.log(`Webhook notification failed: ${error}`);
    }
  }

  destroy(): void {
    this.stop('Destroy called');
    this.refresher.destroy();
  }

  private startPeriodicCheck(): void {
    if (this.checkTimer) return;

    this.checkTimer = setInterval(() => {
      void this.performCheck();
    }, this.config.checkInterval);

    this.state.nextCheckAt = new Date(Date.now() + this.config.checkInterval);
    this.log(`Periodic check started (interval: ${this.config.checkInterval / 1000}s)`);
  }

  private stopPeriodicCheck(): void {
    if (this.checkTimer) {
      clearInterval(this.checkTimer);
      this.checkTimer = null;
    }
  }

  private async performCheck(): Promise<void> {
    this.log('Performing session check...');

    const sessionManager = this.refresher.getSessionManager();
    const status = sessionManager.getStatus();

    this.log(`Session status: ${status.health} (${status.remainingTimeFormatted})`);
    this.state.nextCheckAt = new Date(Date.now() + this.config.checkInterval);

    if (status.needsRefresh && status.isValid) {
      this.log('Session needs refresh, scheduling...');
      this.refresher.scheduleRefresh();
    } else if (!status.isValid) {
      this.log('Session expired, triggering immediate refresh');
      this.state.totalAttempts++;
      await this.refresher.refreshNow();
    }

    if (this.events.onCheckPerformed) {
      this.events.onCheckPerformed(this.state);
    }
  }

  private scheduleRefreshAt(date: Date): void {
    this.cancelScheduledRefresh();
    const delay = Math.max(0, date.getTime() - Date.now());

    this.refreshTimer = setTimeout(() => {
      this.log('Scheduled refresh triggered');
      this.state.totalAttempts++;
      void this.refresher.refreshNow();
    }, delay);

    this.state.nextRefreshAt = date;
    this.log(`Refresh scheduled for ${date.toISOString()}`);
  }

  private cancelScheduledRefresh(): void {
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
      this.refreshTimer = null;
      this.state.nextRefreshAt = null;
    }
  }

  private handleRefreshSuccess(session: SessionData): void {
    this.state.consecutiveFailures = 0;
    this.state.totalSuccesses++;
    this.state.lastSuccessfulRefresh = new Date();
    this.log('Refresh successful');

    void this.sendNotification('Session refreshed successfully', {
      expiresAt: session.expiresAt,
      totalSuccesses: this.state.totalSuccesses,
    });

    if (this.events.onRefreshSuccess) {
      this.events.onRefreshSuccess(session);
    }
  }

  private handleRefreshFailed(error: Error): void {
    this.state.consecutiveFailures++;
    this.log(`Refresh failed: ${error.message}`);

    void this.sendNotification('Session refresh failed', {
      error: error.message,
      consecutiveFailures: this.state.consecutiveFailures,
    });

    if (this.state.consecutiveFailures >= this.config.maxConsecutiveFailures) {
      this.log(`Max consecutive failures (${this.config.maxConsecutiveFailures}) reached`);

      if (this.events.onMaxFailuresReached) {
        this.events.onMaxFailuresReached(this.state.consecutiveFailures);
      }

      void this.sendNotification('ALERT: Max refresh failures reached', {
        consecutiveFailures: this.state.consecutiveFailures,
      });
    }

    if (this.events.onRefreshFailed) {
      this.events.onRefreshFailed(error);
    }
  }

  private handleRefreshScheduled(date: Date): void {
    this.scheduleRefreshAt(date);

    if (this.events.onRefreshScheduled) {
      this.events.onRefreshScheduled(date);
    }
  }

  private log(message: string): void {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] [RefreshScheduler] ${message}`);
  }
}

export function createRefreshScheduler(
  config?: Partial<SchedulerConfig>,
  events?: SchedulerEvents
): RefreshScheduler {
  return new RefreshScheduler(config, events);
}

let globalScheduler: RefreshScheduler | null = null;

export function getGlobalScheduler(
  config?: Partial<SchedulerConfig>,
  events?: SchedulerEvents
): RefreshScheduler {
  if (!globalScheduler) {
    globalScheduler = createRefreshScheduler(config, events);
  }
  return globalScheduler;
}

export async function startGlobalScheduler(
  config?: Partial<SchedulerConfig>,
  events?: SchedulerEvents
): Promise<RefreshScheduler> {
  const scheduler = getGlobalScheduler(config, events);
  await scheduler.start();
  return scheduler;
}

export function stopGlobalScheduler(): void {
  if (globalScheduler) {
    globalScheduler.stop();
  }
}
