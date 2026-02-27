import axios from 'axios';
import { getVpnDetectionKeys } from '../config/secrets';

export interface VpnDetectionResult {
  isVpnOrProxy: boolean;
  ipAddress: string;
  reason?: string;
  details?: {
    isVpn?: boolean;
    isProxy?: boolean;
    isTor?: boolean;
    isDatacenter?: boolean;
    isPublicProxy?: boolean;
    isCrawler?: boolean;
    riskScore?: number;
    country?: string;
    isp?: string;
  };
}

/**
 * Check if an IP address is from a VPN, proxy, or anonymizing service
 *
 * IMPLEMENTATION OPTIONS:
 *
 * 1. IPQualityScore (https://www.ipqualityscore.com/)
 *    - Free tier: 5,000 requests/month
 *    - Paid: $0.005/request
 *    - Very accurate, real-time
 *
 * 2. IPHub (https://iphub.info/)
 *    - Free tier: 1,000 requests/day
 *    - Paid: $4.99/month for 30k requests
 *    - Simple, reliable
 *
 * 3. ProxyCheck.io (https://proxycheck.io/)
 *    - Free tier: 1,000 requests/day
 *    - Paid: $9.99/month unlimited
 *    - Custom whitelist/blacklist
 *
 * 4. IP2Proxy (https://www.ip2location.com/ip2proxy)
 *    - Database download (offline)
 *    - One-time cost, no API calls
 *    - Good for high-volume
 */
export class VpnDetectionService {
  /**
   * Check if IP should be blocked based on VPN/Proxy detection
   * This is a PLACEHOLDER - integrate with a real service in production
   */
  static async checkIp(ipAddress: string): Promise<VpnDetectionResult> {
    // Skip localhost and private IPs
    if (this.isLocalOrPrivateIp(ipAddress)) {
      return {
        isVpnOrProxy: false,
        ipAddress,
        reason: 'Local or private IP',
      };
    }

    // PLACEHOLDER: Replace with real service
    // For now, return false (allow all) until you integrate a provider
    return {
      isVpnOrProxy: false,
      ipAddress,
      reason: 'VPN detection not yet configured',
    };

    // EXAMPLE: IPQualityScore integration (commented out)
    // return await this.checkWithIPQualityScore(ipAddress);

    // EXAMPLE: IPHub integration (commented out)
    // return await this.checkWithIPHub(ipAddress);

    // EXAMPLE: ProxyCheck.io integration (commented out)
    // return await this.checkWithProxyCheck(ipAddress);
  }

  /**
   * Check with IPQualityScore API
   * Requires API key in environment: IPQUALITYSCORE_API_KEY
   */
  static async checkWithIPQualityScore(ipAddress: string): Promise<VpnDetectionResult> {
    const keys = getVpnDetectionKeys();
    const apiKey = keys.ipQualityScore;
    if (!apiKey) {
      throw new Error('IPQUALITYSCORE_API_KEY not configured');
    }

    try {
      const url = `https://ipqualityscore.com/api/json/ip/${apiKey}/${ipAddress}?strictness=1&allow_public_access_points=true`;
      const response = await axios.get(url);
      const data = response.data as any;

      const isVpnOrProxy =
        data.vpn ||
        data.proxy ||
        data.tor ||
        data.recent_abuse ||
        (data.fraud_score >= 75);

      return {
        isVpnOrProxy,
        ipAddress,
        reason: isVpnOrProxy
          ? `Detected: ${[
              data.vpn && 'VPN',
              data.proxy && 'Proxy',
              data.tor && 'Tor',
              data.recent_abuse && 'Abuse',
            ]
              .filter(Boolean)
              .join(', ')}`
          : 'Clean IP',
        details: {
          isVpn: data.vpn,
          isProxy: data.proxy,
          isTor: data.tor,
          isCrawler: data.is_crawler,
          riskScore: data.fraud_score,
          country: data.country_code,
          isp: data.ISP,
        },
      };
    } catch (error) {
      console.error('[VpnDetection] IPQualityScore error:', error);
      // Fail open: allow request if service is down
      return {
        isVpnOrProxy: false,
        ipAddress,
        reason: 'Detection service error',
      };
    }
  }

  /**
   * Check with IPHub API
   * Requires API key in environment: IPHUB_API_KEY
   */
  static async checkWithIPHub(ipAddress: string): Promise<VpnDetectionResult> {
    const keys = getVpnDetectionKeys();
    const apiKey = keys.ipHub;
    if (!apiKey) {
      throw new Error('IPHUB_API_KEY not configured');
    }

    try {
      const url = `https://v2.api.iphub.info/ip/${ipAddress}`;
      const response = await axios.get(url, {
        headers: {
          'X-Key': apiKey,
        },
      });
      const data = response.data as any;

      // block: 0 = Residential/Unclassified, 1 = Proxy/VPN/Datacenter, 2 = Unknown
      const isVpnOrProxy = data.block === 1;

      return {
        isVpnOrProxy,
        ipAddress,
        reason: isVpnOrProxy ? 'Proxy/VPN/Datacenter detected' : 'Clean residential IP',
        details: {
          isVpn: data.block === 1,
          country: data.countryCode,
          isp: data.isp,
        },
      };
    } catch (error) {
      console.error('[VpnDetection] IPHub error:', error);
      return {
        isVpnOrProxy: false,
        ipAddress,
        reason: 'Detection service error',
      };
    }
  }

  /**
   * Check with ProxyCheck.io API
   * Requires API key in environment: PROXYCHECK_API_KEY (optional for free tier)
   */
  static async checkWithProxyCheck(ipAddress: string): Promise<VpnDetectionResult> {
    const keys = getVpnDetectionKeys();
    const apiKey = keys.proxyCheck || '';

    try {
      const url = apiKey
        ? `https://proxycheck.io/v2/${ipAddress}?key=${apiKey}&vpn=1&asn=1`
        : `https://proxycheck.io/v2/${ipAddress}?vpn=1&asn=1`;

      const response = await axios.get(url);
      const data = response.data as any;

      if (data.status === 'error') {
        throw new Error(data.message);
      }

      const result = data[ipAddress];
      const isVpnOrProxy = result.proxy === 'yes';

      return {
        isVpnOrProxy,
        ipAddress,
        reason: isVpnOrProxy
          ? `Detected: ${result.type || 'Proxy/VPN'}`
          : 'Clean IP',
        details: {
          isProxy: result.proxy === 'yes',
          isVpn: result.type === 'VPN',
          country: result.country,
          isp: result.provider,
        },
      };
    } catch (error) {
      console.error('[VpnDetection] ProxyCheck error:', error);
      return {
        isVpnOrProxy: false,
        ipAddress,
        reason: 'Detection service error',
      };
    }
  }

  /**
   * Check if IP is localhost or private network
   */
  private static isLocalOrPrivateIp(ip: string): boolean {
    // Remove IPv6 prefix if present
    const cleanIp = ip.replace('::ffff:', '');

    // Localhost
    if (cleanIp === '127.0.0.1' || cleanIp === 'localhost' || cleanIp === '::1') {
      return true;
    }

    // Private networks
    const privateRanges = [
      /^10\./,           // 10.0.0.0/8
      /^172\.(1[6-9]|2[0-9]|3[0-1])\./, // 172.16.0.0/12
      /^192\.168\./,     // 192.168.0.0/16
      /^fc00:/,          // IPv6 Unique Local
      /^fe80:/,          // IPv6 Link Local
    ];

    return privateRanges.some(range => range.test(cleanIp));
  }

  /**
   * Simple cache to avoid repeated API calls for the same IP
   * Cache results for 1 hour
   */
  private static cache = new Map<string, { result: VpnDetectionResult; expiresAt: number }>();

  static async checkIpWithCache(ipAddress: string): Promise<VpnDetectionResult> {
    const now = Date.now();
    const cached = this.cache.get(ipAddress);

    if (cached && cached.expiresAt > now) {
      return cached.result;
    }

    const result = await this.checkIp(ipAddress);

    // Cache for 1 hour
    this.cache.set(ipAddress, {
      result,
      expiresAt: now + 60 * 60 * 1000,
    });

    // Cleanup old entries
    if (this.cache.size > 10000) {
      const entries = Array.from(this.cache.entries());
      entries.sort((a, b) => a[1].expiresAt - b[1].expiresAt);
      this.cache.delete(entries[0][0]);
    }

    return result;
  }
}
