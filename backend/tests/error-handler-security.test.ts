import { errorHandler } from '../src/middleware/errorHandler';

describe('production error response sanitization', () => {
  const originalNodeEnv = process.env.NODE_ENV;
  let consoleSpy: jest.SpyInstance;

  beforeEach(() => {
    consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
    consoleSpy.mockRestore();
  });

  it('does not expose unexpected messages, details, or stack traces in production', () => {
    process.env.NODE_ENV = 'production';
    const error = Object.assign(new Error('database secret leaked'), {
      details: { nullifier: 'sensitive' },
    });
    const json = jest.fn();
    const status = jest.fn().mockReturnValue({ json });

    errorHandler(
      error,
      { method: 'POST', path: '/api/v1/polls/example/vote' } as any,
      { status } as any,
      jest.fn()
    );

    expect(status).toHaveBeenCalledWith(500);
    expect(json).toHaveBeenCalledWith({
      error: { message: 'Internal Server Error', statusCode: 500 },
    });
    expect(consoleSpy.mock.calls[0][1]).not.toHaveProperty('stack');
  });

  it('keeps operational 4xx messages available to clients', () => {
    process.env.NODE_ENV = 'production';
    const error = Object.assign(new Error('Invalid vote payload'), { statusCode: 400 });
    const json = jest.fn();
    const status = jest.fn().mockReturnValue({ json });

    errorHandler(
      error,
      { method: 'POST', path: '/api/v1/polls/example/vote' } as any,
      { status } as any,
      jest.fn()
    );

    expect(json).toHaveBeenCalledWith({
      error: { message: 'Invalid vote payload', statusCode: 400 },
    });
  });
});

