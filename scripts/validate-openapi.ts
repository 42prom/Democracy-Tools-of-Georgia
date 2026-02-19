/**
 * OpenAPI Contract Validation Script
 *
 * Validates that endpoints defined in OpenAPI specs exist in the backend.
 * Run: npx tsx scripts/validate-openapi.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';

interface OpenAPISpec {
  paths: Record<string, Record<string, any>>;
}

interface RouteInfo {
  method: string;
  path: string;
  source: string;
}

// Known backend routes (extracted from src/index.ts)
const BACKEND_ROUTES: RouteInfo[] = [
  // Health
  { method: 'GET', path: '/health', source: 'healthRouter' },
  { method: 'GET', path: '/metrics', source: 'healthRouter' },

  // Auth
  { method: 'POST', path: '/api/v1/auth/challenge', source: 'authRouter' },
  { method: 'POST', path: '/api/v1/auth/login-or-enroll', source: 'authRouter' },

  // Enrollment
  { method: 'POST', path: '/api/v1/enrollment/nfc', source: 'enrollmentRouter' },
  { method: 'POST', path: '/api/v1/enrollment/profile', source: 'enrollmentRouter' },
  { method: 'POST', path: '/api/v1/enrollment/verify-biometrics', source: 'enrollmentRouter' },

  // Polls (Public)
  { method: 'GET', path: '/api/v1/polls', source: 'pollsRouter' },
  { method: 'GET', path: '/api/v1/polls/:id', source: 'pollsRouter' },
  { method: 'POST', path: '/api/v1/polls/:id/vote', source: 'pollsRouter' },

  // Messages
  { method: 'GET', path: '/api/v1/messages', source: 'messagesRouter' },

  // Rewards
  { method: 'GET', path: '/api/v1/rewards/history', source: 'rewardsRouter' },
  { method: 'GET', path: '/api/v1/rewards/balance', source: 'rewardsRouter' },

  // Stats
  { method: 'GET', path: '/api/v1/stats/polls/:id', source: 'statsRouter' },

  // Profile
  { method: 'GET', path: '/api/v1/profile/me', source: 'profileRouter' },

  // Activity
  { method: 'GET', path: '/api/v1/activity/me', source: 'activityRouter' },

  // Devices
  { method: 'POST', path: '/api/v1/devices/register', source: 'devicesRouter' },
  { method: 'POST', path: '/api/v1/devices/unregister', source: 'devicesRouter' },

  // Admin Auth
  { method: 'POST', path: '/api/v1/admin/auth/login', source: 'adminAuthRouter' },
  { method: 'GET', path: '/api/v1/admin/auth/me', source: 'adminAuthRouter' },

  // Admin Polls
  { method: 'GET', path: '/api/v1/admin/polls', source: 'adminPollsRouter' },
  { method: 'POST', path: '/api/v1/admin/polls', source: 'adminPollsRouter' },
  { method: 'GET', path: '/api/v1/admin/polls/:id', source: 'adminPollsRouter' },
  { method: 'PUT', path: '/api/v1/admin/polls/:id', source: 'adminPollsRouter' },
  { method: 'DELETE', path: '/api/v1/admin/polls/:id', source: 'adminPollsRouter' },
  { method: 'PATCH', path: '/api/v1/admin/polls/:id/publish', source: 'adminPollsRouter' },
  { method: 'PATCH', path: '/api/v1/admin/polls/:id/close', source: 'adminPollsRouter' },
  { method: 'GET', path: '/api/v1/admin/polls/:id/survey-results', source: 'adminPollsRouter' },
  { method: 'POST', path: '/api/v1/admin/polls/estimate', source: 'adminPollsRouter' },

  // Admin Insights
  { method: 'GET', path: '/api/v1/admin/insights/polls/:id', source: 'adminInsightsRouter' },

  // Admin Profiles
  { method: 'GET', path: '/api/v1/admin/profiles', source: 'adminProfilesRouter' },

  // Admin Regions
  { method: 'GET', path: '/api/v1/admin/regions', source: 'adminRegionsRouter' },

  // Admin Messages
  { method: 'GET', path: '/api/v1/admin/messages', source: 'adminMessagesRouter' },
  { method: 'POST', path: '/api/v1/admin/messages', source: 'adminMessagesRouter' },
  { method: 'PUT', path: '/api/v1/admin/messages/:id', source: 'adminMessagesRouter' },
  { method: 'DELETE', path: '/api/v1/admin/messages/:id', source: 'adminMessagesRouter' },
  { method: 'PATCH', path: '/api/v1/admin/messages/:id/publish', source: 'adminMessagesRouter' },

  // Admin Settings
  { method: 'GET', path: '/api/v1/admin/settings', source: 'adminSettingsRouter' },
  { method: 'PUT', path: '/api/v1/admin/settings', source: 'adminSettingsRouter' },

  // Admin Security
  { method: 'GET', path: '/api/v1/admin/security-events', source: 'adminSecurityRouter' },

  // Admin Export
  { method: 'GET', path: '/api/v1/admin/export/polls/:id', source: 'adminExportRouter' },
];

function normalizeOpenAPIPath(openapiPath: string): string {
  // Convert OpenAPI path params {id} to Express :id format
  return openapiPath.replace(/\{([^}]+)\}/g, ':$1');
}

function loadOpenAPISpec(filePath: string): OpenAPISpec | null {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    return yaml.load(content) as OpenAPISpec;
  } catch (e) {
    console.error(`Failed to load ${filePath}:`, e);
    return null;
  }
}

function extractEndpointsFromSpec(spec: OpenAPISpec, basePath: string = ''): RouteInfo[] {
  const endpoints: RouteInfo[] = [];

  for (const [path, methods] of Object.entries(spec.paths)) {
    for (const method of Object.keys(methods)) {
      if (['get', 'post', 'put', 'patch', 'delete'].includes(method.toLowerCase())) {
        endpoints.push({
          method: method.toUpperCase(),
          path: basePath + normalizeOpenAPIPath(path),
          source: 'openapi',
        });
      }
    }
  }

  return endpoints;
}

function validateEndpoints(specEndpoints: RouteInfo[], backendRoutes: RouteInfo[]): {
  missing: RouteInfo[];
  extra: RouteInfo[];
} {
  const backendSet = new Set(
    backendRoutes.map(r => `${r.method}:${r.path}`)
  );

  const specSet = new Set(
    specEndpoints.map(r => `${r.method}:${r.path}`)
  );

  const missing = specEndpoints.filter(
    e => !backendSet.has(`${e.method}:${e.path}`)
  );

  // Find routes in backend but not in spec (informational)
  const extra = backendRoutes.filter(
    e => !specSet.has(`${e.method}:${e.path}`) && e.path.startsWith('/api/v1')
  );

  return { missing, extra };
}

async function main() {
  console.log('OpenAPI Contract Validation\n');
  console.log('='.repeat(60));

  const apiDir = path.join(__dirname, '..', 'docs', 'api');

  // Load specs
  const publicSpec = loadOpenAPISpec(path.join(apiDir, 'openapi_public.yaml'));
  const adminSpec = loadOpenAPISpec(path.join(apiDir, 'openapi_admin.yaml'));

  if (!publicSpec || !adminSpec) {
    console.error('Failed to load OpenAPI specs');
    process.exit(1);
  }

  // Extract endpoints
  const publicEndpoints = extractEndpointsFromSpec(publicSpec, '/api/v1');
  const adminEndpoints = extractEndpointsFromSpec(adminSpec, '/api/v1');
  const allSpecEndpoints = [...publicEndpoints, ...adminEndpoints];

  console.log(`\nPublic API endpoints: ${publicEndpoints.length}`);
  console.log(`Admin API endpoints: ${adminEndpoints.length}`);
  console.log(`Total spec endpoints: ${allSpecEndpoints.length}`);
  console.log(`Backend routes: ${BACKEND_ROUTES.length}`);

  // Validate
  const { missing, extra } = validateEndpoints(allSpecEndpoints, BACKEND_ROUTES);

  console.log('\n' + '='.repeat(60));

  if (missing.length > 0) {
    console.log('\n❌ MISSING: Endpoints in OpenAPI but NOT in backend:\n');
    for (const e of missing) {
      console.log(`   ${e.method} ${e.path}`);
    }
  }

  if (extra.length > 0) {
    console.log('\n⚠️  EXTRA: Endpoints in backend but NOT in OpenAPI:\n');
    for (const e of extra) {
      console.log(`   ${e.method} ${e.path} (${e.source})`);
    }
  }

  if (missing.length === 0 && extra.length === 0) {
    console.log('\n✅ All endpoints match!');
  }

  console.log('\n' + '='.repeat(60));

  // Exit with error if missing endpoints
  if (missing.length > 0) {
    console.log('\n❌ Contract validation FAILED');
    process.exit(1);
  }

  console.log('\n✅ Contract validation PASSED');
}

main().catch(console.error);
