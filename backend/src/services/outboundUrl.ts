import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

const MAX_URL_LENGTH = 2048;

function isBlockedIpv4(address: string): boolean {
  const octets = address.split('.').map(Number);
  if (octets.length !== 4 || octets.some(octet => !Number.isInteger(octet) || octet < 0 || octet > 255)) {
    return true;
  }

  const [a, b] = octets;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 0) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 0 && octets[2] === 2) ||
    (a === 198 && (b === 18 || b === 19)) ||
    (a === 198 && b === 51 && octets[2] === 100) ||
    (a === 203 && b === 0 && octets[2] === 113) ||
    a >= 224
  );
}

function isBlockedIp(address: string): boolean {
  const normalized = address.toLowerCase().split('%')[0];
  const version = isIP(normalized);
  if (version === 4) return isBlockedIpv4(normalized);
  if (version !== 6) return true;

  const mappedIpv4 = normalized.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/)?.[1];
  if (mappedIpv4) return isBlockedIpv4(mappedIpv4);

  return (
    normalized === '::' ||
    normalized === '::1' ||
    normalized.startsWith('fc') ||
    normalized.startsWith('fd') ||
    /^fe[89ab]/.test(normalized) ||
    normalized.startsWith('ff') ||
    normalized.startsWith('2001:db8:')
  );
}

function configuredAllowedHosts(variableName: string): Set<string> {
  return new Set(
    (process.env[variableName] || '')
      .split(',')
      .map(host => host.trim().toLowerCase().replace(/\.$/, ''))
      .filter(Boolean)
  );
}

export async function assertSafeOutboundHttpsUrl(
  rawValue: unknown,
  allowedHostsVariable: string,
  label: string
): Promise<string> {
  if (typeof rawValue !== 'string' || rawValue.length === 0 || rawValue.length > MAX_URL_LENGTH) {
    throw new Error(`${label} must be a non-empty URL shorter than 2048 characters`);
  }

  let url: URL;
  try {
    url = new URL(rawValue);
  } catch {
    throw new Error(`${label} is invalid`);
  }
  if (url.protocol !== 'https:') throw new Error(`${label} must use HTTPS`);
  if (url.username || url.password || url.hash) {
    throw new Error(`${label} must not include credentials or fragments`);
  }

  const hostname = url.hostname.toLowerCase().replace(/\.$/, '');
  const allowedHosts = configuredAllowedHosts(allowedHostsVariable);
  if (process.env.NODE_ENV === 'production' && allowedHosts.size === 0) {
    throw new Error(`${allowedHostsVariable} must be configured in production`);
  }
  if (allowedHosts.size > 0 && !allowedHosts.has(hostname)) {
    throw new Error(`${label} hostname is not in ${allowedHostsVariable}`);
  }

  const addresses = isIP(hostname)
    ? [{ address: hostname }]
    : await lookup(hostname, { all: true, verbatim: true });
  if (addresses.length === 0 || addresses.some(entry => isBlockedIp(entry.address))) {
    throw new Error(`${label} hostname resolves to a private or reserved network`);
  }
  return url.toString();
}

/**
 * Validates admin-configured RPC endpoints before any server-side request.
 * Production requires an exact hostname allow-list; every resolved address is
 * also checked to prevent access to loopback, private, link-local and reserved ranges.
 */
export async function assertSafeBlockchainRpcUrl(rawValue: unknown): Promise<string> {
  return assertSafeOutboundHttpsUrl(
    rawValue,
    'BLOCKCHAIN_RPC_ALLOWED_HOSTS',
    'RPC URL'
  );
}
