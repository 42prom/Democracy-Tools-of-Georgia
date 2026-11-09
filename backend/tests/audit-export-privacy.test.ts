import { AuditExportOptions, AuditExportService, PollMetadata } from '../src/services/auditExport';

function options(overrides: Partial<AuditExportOptions> = {}): AuditExportOptions {
  return {
    pollId: 'poll-1',
    includeVoteLevelData: false,
    anonymizeVoters: true,
    adminUserId: 'auditor-1',
    adminEmail: 'auditor@example.ge',
    ...overrides,
  };
}

const poll = {
  id: 'poll-1',
  title: 'Test',
  description: null,
  type: 'election',
  status: 'ended',
  start_at: new Date(),
  end_at: new Date(),
  created_at: new Date(),
  published_at: new Date(),
  min_k_anonymity: 30,
  rewards_enabled: false,
  reward_amount: null,
  audience_rules: {},
  merkle_root: null,
} as PollMetadata;

describe('audit export ballot-secrecy invariants', () => {
  const service = new AuditExportService() as unknown as {
    assertPrivacySafeExport(
      exportOptions: AuditExportOptions,
      pollMetadata: PollMetadata,
      totalVotes: number
    ): void;
  };

  it('rejects vote-level records even when voter IDs would be renamed', () => {
    expect(() =>
      service.assertPrivacySafeExport(options({ includeVoteLevelData: true }), poll, 100)
    ).toThrow(/ballot secrecy/);
  });

  it('rejects non-anonymized export settings', () => {
    expect(() =>
      service.assertPrivacySafeExport(options({ anonymizeVoters: false }), poll, 100)
    ).toThrow(/non-anonymized/);
  });

  it('suppresses exports below the strongest configured k threshold', () => {
    process.env.MIN_K_ANONYMITY = '40';
    expect(() => service.assertPrivacySafeExport(options(), poll, 39)).toThrow(
      /privacy threshold of 40/
    );
    expect(() => service.assertPrivacySafeExport(options(), poll, 40)).not.toThrow();
  });
});
