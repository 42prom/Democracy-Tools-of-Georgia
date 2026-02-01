import { query, transaction } from '../db/client.js';
import { CONFIG } from '../config.js';

export async function createPoll(data: {
  title: string;
  description?: string;
  type: 'election' | 'referendum' | 'survey';
  options: string[];
  audience_rules: any;
}) {
  return await transaction(async (client) => {
    const pollResult = await client.query(
      `INSERT INTO polls (title, description, type, status, audience_rules, min_k_anonymity)
       VALUES ($1, $2, $3, 'draft', $4, $5)
       RETURNING *`,
      [data.title, data.description || null, data.type, JSON.stringify(data.audience_rules), CONFIG.privacy.minKAnonymity]
    );

    const poll = pollResult.rows[0];

    for (let i = 0; i < data.options.length; i++) {
      await client.query(
        `INSERT INTO poll_options (poll_id, text, display_order) VALUES ($1, $2, $3)`,
        [poll.id, data.options[i], i]
      );
    }

    return poll;
  });
}

export async function getPoll(pollId: string) {
  const pollResult = await query('SELECT * FROM polls WHERE id = $1', [pollId]);
  if (pollResult.rows.length === 0) return null;

  const poll = pollResult.rows[0];
  const optionsResult = await query(
    'SELECT * FROM poll_options WHERE poll_id = $1 ORDER BY display_order',
    [pollId]
  );

  return { ...poll, options: optionsResult.rows };
}

export async function estimateAudience(rules: any) {
  // Phase 0: Mock estimate
  const mockCount = Math.floor(Math.random() * (1000 - 50) + 50);
  const isPrivacySafe = mockCount >= CONFIG.privacy.minKAnonymity;

  return { count: mockCount, isPrivacySafe };
}

export async function publishPoll(pollId: string) {
  const poll = await getPoll(pollId);
  if (!poll) throw new Error('Poll not found');

  const estimate = await estimateAudience(poll.audience_rules);

  if (!estimate.isPrivacySafe) {
    throw new Error(`Privacy violation: audience (${estimate.count}) below k-anonymity threshold`);
  }

  await query(
    `UPDATE polls SET status = 'active', published_at = NOW() WHERE id = $1`,
    [pollId]
  );

  return { message: 'Poll published' };
}
