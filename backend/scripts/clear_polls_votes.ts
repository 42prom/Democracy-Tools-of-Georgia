import { pool } from '../src/db/client';

async function clearPollsAndVotes() {
  try {
    console.log('Starting cleanup of polls and votes...');

    const tables = [
      'public.vote_anchors',
      'public.vote_attestations',
      'public.vote_nullifiers',
      'public.votes',
      'public.poll_participants',
      'public.device_poll_voters',
      'public.poll_options',
      'public.survey_responses',
      'public.survey_nullifiers',
      'public.question_options',
      'public.survey_questions',
      'public.user_rewards',
      'public.polls'
    ];

    for (const table of tables) {
      console.log(`Clearing table ${table}...`);
      await pool.query(`TRUNCATE TABLE ${table} CASCADE`);
      console.log(`✓ Table ${table} cleared.`);
    }

    console.log('\nSuccessfully cleared all polls and votes data.');
  } catch (_err) {
    console.error('Error clearing polls and votes:', _err);
  } finally {
    await pool.end();
  }
}

clearPollsAndVotes();
