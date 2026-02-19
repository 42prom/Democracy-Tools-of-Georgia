import { Router, Request, Response, NextFunction } from 'express';
import { pool } from '../db/client';
import jwt from 'jsonwebtoken';

const router = Router();

interface AudienceRules {
  regions?: string[];
  gender?: 'M' | 'F' | 'all' | null;
  min_age?: number | null;
  max_age?: number | null;
}

// Note: Audience matching is now done inline in the route handler
// using JWT demographics directly for consistency with poll filtering

/**
 * GET /api/v1/messages
 * Get published messages filtered by user's demographic profile
 */
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  console.log('[Messages] GET /messages - Fetching audience-filtered messages');
  try {
    // Try to get user demographics from JWT token
    let userDemographics: { region?: string; region_codes?: string[]; gender?: string; age_bucket?: string } | null = null;
    let userId: string | null = null;
    const authHeader = req.headers.authorization;
    
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'dev-secret-key') as { sub: string; data?: any };
        userId = decoded.sub;
        if (decoded.data) {
          // Use demographics directly from JWT (preferred approach)
          const demo: { region?: string; region_codes?: string[]; gender?: string; age_bucket?: string } = decoded.data;
          userDemographics = demo;
          console.log(`[Messages] User authenticated via JWT. Region: ${demo.region || demo.region_codes?.[0] || 'none'}, Gender: ${demo.gender || 'none'}`);
          
          // If region is 'unknown' or missing, fallback to database
          if (!demo.region || demo.region === 'unknown') {
            if ((!demo.region_codes || demo.region_codes.length === 0) && userId) {
              console.log('[Messages] JWT has unknown/missing region, falling back to database lookup');
              const userResult = await pool.query(
                'SELECT credential_region_codes, credential_gender FROM users WHERE id = $1',
                [userId]
              );
              if (userResult.rows.length > 0) {
                const dbUser = userResult.rows[0];
                if (dbUser.credential_region_codes && dbUser.credential_region_codes.length > 0) {
                  demo.region_codes = dbUser.credential_region_codes;
                  console.log(`[Messages] Loaded region_codes from DB: ${dbUser.credential_region_codes}`);
                }
                if (dbUser.credential_gender && !demo.gender) {
                  demo.gender = dbUser.credential_gender;
                }
              }
            }
          }
        }

      } catch (tokenError) {
        console.log('[Messages] Invalid/expired token, treating as anonymous user');
      }
    }

    // Fetch all published messages
    const result = await pool.query(
      `SELECT * FROM messages 
       WHERE status = 'published' 
       ORDER BY published_at DESC 
       LIMIT 100`
    );

    // Filter messages by audience rules using JWT demographics
    const filteredMessages = result.rows.filter((msg: any) => {
      const rules: AudienceRules = msg.audience_rules || {};
      
      // No rules = everyone matches
      if (!rules || Object.keys(rules).length === 0) {
        return true;
      }
      
      // No user demographics = can only see messages without targeting rules
      if (!userDemographics) {
        return !rules.regions?.length && !rules.gender && !rules.min_age && !rules.max_age;
      }
      
      // Check region - support both 'region' (string) and 'region_codes' (array)
      if (rules.regions && rules.regions.length > 0) {
        const userRegion = userDemographics.region;
        const userRegionCodes = userDemographics.region_codes || [];
        
        // Try single region first, then fallback to array
        let hasMatch = false;
        if (userRegion && userRegion !== 'unknown') {
          hasMatch = rules.regions.includes(userRegion);
        }
        if (!hasMatch && userRegionCodes.length > 0) {
          hasMatch = rules.regions.some(r => userRegionCodes.includes(r));
        }
        if (!hasMatch) {
          return false;
        }
      }
      
      // Check gender
      if (rules.gender && rules.gender !== 'all') {
        if (userDemographics.gender !== rules.gender) {
          return false;
        }
      }
      
      // Check age (using age_bucket from JWT)
      // This is approximate - for exact matching we'd need DOB
      if (rules.min_age || rules.max_age) {
        const bucket = userDemographics.age_bucket || '';
        const match = bucket.match(/(\d+)-(\d+)/);
        if (match) {
          const bucketMin = parseInt(match[1]);
          const bucketMax = parseInt(match[2]);
          if (rules.min_age && bucketMax < rules.min_age) return false;
          if (rules.max_age && bucketMin > rules.max_age) return false;
        } else if (bucket === '65+') {
          if (rules.max_age && 65 > rules.max_age) return false;
        }
        // If no bucket data, we don't filter by age (lenient)
      }
      
      return true;
    });

    console.log(`[Messages] Found ${result.rows.length} total, ${filteredMessages.length} matched user's profile`);
    return res.json(filteredMessages);
  } catch (error) {
    console.error('[Messages] Error fetching messages:', error);
    return next(error);
  }
});

export default router;
