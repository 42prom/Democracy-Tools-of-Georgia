import { pool } from '../db/client';

/**
 * Poll Status Monitor
 * Automatically transitions polls between statuses based on time
 */
export class PollStatusMonitor {
  private static interval: NodeJS.Timeout | null = null;
  private static isRunning = false;
  private static CHECK_INTERVAL = 60000; // Check every minute

  /**
   * Start the status monitor
   */
  static start() {
    if (this.interval) return;
    
    console.log('[PollStatusMonitor] Starting background monitor...');
    this.interval = setInterval(() => this.checkPollStatuses(), this.CHECK_INTERVAL);
    
    // Run initial check immediately
    this.checkPollStatuses();
  }

  /**
   * Stop the status monitor
   */
  static stop() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
      console.log('[PollStatusMonitor] Background monitor stopped.');
    }
  }

  /**
   * Check for polls that need status transitions
   */
  private static async checkPollStatuses() {
    if (this.isRunning) return;
    this.isRunning = true;

    try {
      // Transition Active -> Ended
      const expiredResult = await pool.query(`
        UPDATE polls 
        SET status = 'ended', updated_at = NOW()
        WHERE status = 'active' 
        AND end_at IS NOT NULL 
        AND end_at <= NOW()
        RETURNING id, title
      `);

      const rowCount = expiredResult.rowCount ?? 0;
      if (rowCount > 0) {
        console.log(`[PollStatusMonitor] Transitioned ${rowCount} polls to 'ended' status.`);
        expiredResult.rows.forEach(p => console.log(`  - ${p.title} (${p.id})`));
      }

    } catch (error) {
      console.error('[PollStatusMonitor] Error checking poll statuses:', error);
    } finally {
      this.isRunning = false;
    }
  }
}
