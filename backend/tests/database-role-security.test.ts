const mockedQuery = jest.fn();

jest.mock('pg', () => ({
  Pool: jest.fn().mockImplementation(() => ({
    query: mockedQuery,
    on: jest.fn(),
    end: jest.fn(),
    connect: jest.fn(),
  })),
}));

import { assertRestrictedDatabaseRole } from '../src/db/client';

const restrictedRole = {
  role_name: 'dtg_app',
  is_superuser: false,
  can_create_role: false,
  can_create_db: false,
  can_replicate: false,
  can_bypass_rls: false,
  can_create_public: false,
  owns_database: false,
  owned_objects: '0',
};

describe('database runtime role proof', () => {
  beforeEach(() => mockedQuery.mockReset());

  it('accepts a non-owner role with no administrative capabilities', async () => {
    mockedQuery.mockResolvedValueOnce({ rows: [restrictedRole] });
    await expect(assertRestrictedDatabaseRole()).resolves.toBeUndefined();
  });

  it.each([
    ['is_superuser', true],
    ['can_create_role', true],
    ['can_create_db', true],
    ['can_replicate', true],
    ['can_bypass_rls', true],
    ['can_create_public', true],
    ['owns_database', true],
    ['owned_objects', '1'],
  ])('rejects a role when %s is unsafe', async (property, value) => {
    mockedQuery.mockResolvedValueOnce({
      rows: [{ ...restrictedRole, [property]: value }],
    });
    await expect(assertRestrictedDatabaseRole()).rejects.toThrow(/privileged or owns/);
  });
});
