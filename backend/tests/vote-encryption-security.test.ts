import { randomBytes } from 'node:crypto';
import pool from '../src/db/client';
import { decryptOptionId, encryptOptionId } from '../src/services/voteEncryption';

jest.mock('../src/db/client', () => ({ __esModule: true, default: { query: jest.fn() } }));

describe('vote choice authenticated encryption', () => {
  beforeEach(() => {
    (pool.query as jest.Mock).mockReset().mockResolvedValue({
      rows: [{ sealed_key_hex: randomBytes(32).toString('hex'), revealed_at: new Date() }],
    });
  });

  it('round-trips an option with a 128-bit authentication tag', async () => {
    const choice = await encryptOptionId('option-a', 'poll-a', 'key-a');
    expect(choice.authTag).toHaveLength(32);
    await expect(decryptOptionId(choice, 'poll-a')).resolves.toBe('option-a');
  });

  it('rejects a truncated authentication tag', async () => {
    const choice = await encryptOptionId('option-a', 'poll-a', 'key-a');
    await expect(decryptOptionId({ ...choice, authTag: choice.authTag.slice(0, 24) }, 'poll-a')).rejects.toThrow();
  });

  it('rejects tampered ciphertext', async () => {
    const choice = await encryptOptionId('option-a', 'poll-a', 'key-a');
    const changed = Buffer.from(choice.ciphertext, 'hex');
    changed[0] ^= 1;
    await expect(decryptOptionId({ ...choice, ciphertext: changed.toString('hex') }, 'poll-a')).rejects.toThrow();
  });
});
