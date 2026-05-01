import { query } from '../../database/connection';

describe('Database Connection', () => {
  it('should execute a simple query', async () => {
    const result = await query('SELECT 1 as test');
    expect(result.rows).toBeDefined();
    expect(result.rows[0].test).toBe(1);
  });

  it('should handle parameterized queries', async () => {
    const result = await query('SELECT $1 as value', ['test']);
    expect(result.rows[0].value).toBe('test');
  });

  it('should handle errors gracefully', async () => {
    await expect(query('SELECT * FROM non_existent_table')).rejects.toThrow();
  });
});

