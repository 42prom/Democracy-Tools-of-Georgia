
import { pool } from '../db/client';

interface SystemSettings {
  biometric_match_threshold?: number;
  [key: string]: any;
}

// In-memory cache
let settingsCache: SystemSettings = {};
let lastCacheUpdate = 0;
const CACHE_TTL_MS = 60 * 1000; // 1 minute

export class SettingsService {
  /**
   * Get a specific setting value, with caching.
   * @param key The setting key
   * @param defaultValue Default value if not found
   */
  static async get<T>(key: string, defaultValue: T): Promise<T> {
    await this.ensureCache();
    return (settingsCache[key] as T) ?? defaultValue;
  }

  /**
   * Get the biometric match threshold
   */
  static async getBiometricThreshold(): Promise<number> {
    // Default to 0.75 (matches loadFullConfig default)
    // The key in 'settings' table is 'verification_facematch_min_score'
    // Note: system_settings vs settings table. Backend uses 'settings' for this.
    // 'settings' table has columns: key, value.
    // settingsCache logic needs to read from 'settings' table too?
    
    // My SettingsService reads from 'system_settings'.
    // backend/src/routes/admin/settings.ts reads from 'settings' AND 'system_settings'.
    
    // I need to update ensureCache to read from BOTH or just 'settings'.
    // verification_* keys are in 'settings'.
    
    return this.get<number>('verification_facematch_min_score', 0.75); 
  }

  private static async ensureCache() {
    const now = Date.now();
    if (now - lastCacheUpdate < CACHE_TTL_MS && Object.keys(settingsCache).length > 0) {
      return;
    }

    try {
      // Read from system_settings (Rate Limits)
      const systemRes = await pool.query('SELECT key, value FROM system_settings');
      
      // Read from settings (Verification, Blockchain, etc.)
      const settingsRes = await pool.query('SELECT key, value FROM settings');

      const newCache: SystemSettings = {};
      
      systemRes.rows.forEach(row => {
        newCache[row.key] = row.value;
      });

      settingsRes.rows.forEach(row => {
        // value in 'settings' is TEXT usually, need to parse if number/bool?
        // But get<T> casts it. 
        // If it's stored as string "0.75", config returns number?
        // parseBool/parseFloat is done in loadFullConfig.
        // We should probably parse it here to be safe and consistent.
        
        let val = row.value;
        if (row.key.endsWith('_score') || row.key.endsWith('_threshold')) {
             val = parseFloat(row.value);
        } else if (row.key === 'verification_nfc_require_nfc' || row.value === 'true' || row.value === 'false') {
             val = row.value === 'true';
        }
        
        newCache[row.key] = val;
      });

      settingsCache = newCache;
      lastCacheUpdate = now;
    } catch (error) {
      console.error('[SettingsService] Failed to update settings cache:', error);
      // Keep old cache if update fails
    }
  }

  /**
   * Force cache invalidation (call this after updates)
   */
  static invalidateCache() {
    lastCacheUpdate = 0;
  }
}
