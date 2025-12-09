import { Logger, ChildLogger } from '../utils/Logger';
import { LogLevel } from '../types';

describe('Logger', () => {
  let consoleSpy: {
    log: jest.SpyInstance;
    info: jest.SpyInstance;
    warn: jest.SpyInstance;
    error: jest.SpyInstance;
    debug: jest.SpyInstance;
  };

  beforeEach(() => {
    // Spy on console methods
    consoleSpy = {
      log: jest.spyOn(console, 'log').mockImplementation(),
      info: jest.spyOn(console, 'info').mockImplementation(),
      warn: jest.spyOn(console, 'warn').mockImplementation(),
      error: jest.spyOn(console, 'error').mockImplementation(),
      debug: jest.spyOn(console, 'debug').mockImplementation(),
    };
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Constructor', () => {
    it('should create logger with default log level', () => {
      const logger = new Logger();
      expect(logger).toBeDefined();
    });

    it('should create logger with specified log level', () => {
      const logger = new Logger(LogLevel.DEBUG);
      expect(logger).toBeDefined();
    });

    it('should create logger with ERROR level', () => {
      const logger = new Logger(LogLevel.ERROR);
      expect(logger).toBeDefined();
    });
  });

  describe('Log Levels', () => {
    it('should log DEBUG level messages when level is DEBUG', () => {
      const logger = new Logger(LogLevel.DEBUG);
      logger.debug('Test debug message');

      expect(consoleSpy.debug).toHaveBeenCalled();
    });

    it('should not log DEBUG messages when level is INFO', () => {
      const logger = new Logger(LogLevel.INFO);
      logger.debug('Test debug message');

      expect(consoleSpy.debug).not.toHaveBeenCalled();
    });

    it('should log INFO level messages when level is INFO', () => {
      const logger = new Logger(LogLevel.INFO);
      logger.info('Test info message');

      expect(consoleSpy.info).toHaveBeenCalled();
    });

    it('should log WARN level messages when level is WARN', () => {
      const logger = new Logger(LogLevel.WARN);
      logger.warn('Test warning message');

      expect(consoleSpy.warn).toHaveBeenCalled();
    });

    it('should log ERROR level messages at any level', () => {
      const logger = new Logger(LogLevel.ERROR);
      logger.error('Test error message');

      expect(consoleSpy.error).toHaveBeenCalled();
    });
  });

  describe('Message Formatting', () => {
    it('should include message text', () => {
      const logger = new Logger(LogLevel.INFO);
      logger.info('Test message content');

      const call = consoleSpy.info.mock.calls[0][0];
      expect(typeof call === 'string' ? call : JSON.stringify(call)).toContain('Test message content');
    });
  });

  describe('Context Object', () => {
    it('should log context data', () => {
      const logger = new Logger(LogLevel.INFO);
      const context = { userId: '123', action: 'login' };

      logger.info('User action', context);

      expect(consoleSpy.info).toHaveBeenCalled();
    });

    it('should handle empty context', () => {
      const logger = new Logger(LogLevel.INFO);

      expect(() => {
        logger.info('Message with empty context', {});
      }).not.toThrow();
    });

    it('should handle complex nested context', () => {
      const logger = new Logger(LogLevel.INFO);
      const context = {
        user: {
          id: '123',
          profile: {
            name: 'Test User',
            settings: {
              notifications: true,
            },
          },
        },
        timestamp: Date.now(),
      };

      expect(() => {
        logger.info('Complex context', context);
      }).not.toThrow();
    });
  });

  describe('Error Logging', () => {
    it('should log error objects', () => {
      const logger = new Logger(LogLevel.ERROR);
      const error = new Error('Test error');

      logger.error('An error occurred', {}, error);

      expect(consoleSpy.error).toHaveBeenCalled();
    });

    it('should handle errors without stack trace', () => {
      const logger = new Logger(LogLevel.ERROR);
      const error = { message: 'Simple error object' } as Error;

      expect(() => {
        logger.error('Error occurred', {}, error);
      }).not.toThrow();
    });
  });

  describe('Statistics', () => {
    it('should track log counts by level', () => {
      const logger = new Logger(LogLevel.DEBUG);

      logger.debug('Debug 1');
      logger.info('Info 1');
      logger.warn('Warn 1');
      logger.error('Error 1');

      const stats = logger.getStats();

      expect(stats).toBeDefined();
      expect(typeof stats).toBe('object');
    });

    it('should return stats object with total', () => {
      const logger = new Logger(LogLevel.INFO);

      const stats = logger.getStats();

      expect(stats).toHaveProperty('total');
      expect(stats).toHaveProperty('byLevel');
    });

    it('should track total log count', () => {
      const logger = new Logger(LogLevel.INFO);

      logger.info('Message 1');
      logger.info('Message 2');
      logger.warn('Warning 1');

      const stats = logger.getStats();

      expect(stats.total).toBeGreaterThanOrEqual(3);
    });

    it('should track logs by level', () => {
      const logger = new Logger(LogLevel.INFO);

      logger.info('Info 1');
      logger.info('Info 2');
      logger.warn('Warn 1');
      logger.error('Error 1');

      const stats = logger.getStats();

      expect(stats.byLevel[LogLevel.INFO]).toBeGreaterThanOrEqual(2);
      expect(stats.byLevel[LogLevel.WARN]).toBeGreaterThanOrEqual(1);
      expect(stats.byLevel[LogLevel.ERROR]).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Child Logger', () => {
    it('should create child logger with context', () => {
      const logger = new Logger(LogLevel.INFO);

      const childLogger = logger.child({ service: 'AuthService', version: '1.0.0', environment: 'test' });

      expect(childLogger).toBeDefined();
      expect(childLogger).toBeInstanceOf(ChildLogger);
    });

    it('should include parent context in child logs', () => {
      const logger = new Logger(LogLevel.INFO);
      const childLogger = logger.child({ service: 'TestService', version: '1.0.0', environment: 'test' });

      childLogger.info('Child log message');

      expect(consoleSpy.info).toHaveBeenCalled();
    });

    it('should allow child logger to log at different levels', () => {
      const logger = new Logger(LogLevel.DEBUG);
      const childLogger = logger.child({ service: 'TestService', version: '1.0.0', environment: 'test' });

      childLogger.debug('Debug message');
      childLogger.info('Info message');
      childLogger.warn('Warn message');
      childLogger.error('Error message');

      expect(consoleSpy.debug).toHaveBeenCalled();
      expect(consoleSpy.info).toHaveBeenCalled();
      expect(consoleSpy.warn).toHaveBeenCalled();
      expect(consoleSpy.error).toHaveBeenCalled();
    });

    it('should share stats with parent logger', () => {
      const logger = new Logger(LogLevel.INFO);
      const childLogger = logger.child({ service: 'TestService', version: '1.0.0', environment: 'test' });

      childLogger.info('From child');
      logger.info('From parent');

      const parentStats = logger.getStats();
      const childStats = childLogger.getStats();

      expect(parentStats.total).toBe(childStats.total);
    });
  });

  describe('Performance', () => {
    it('should handle high volume logging', () => {
      const logger = new Logger(LogLevel.INFO);
      const startTime = Date.now();

      for (let i = 0; i < 1000; i++) {
        logger.info(`Log message ${i}`, { iteration: i });
      }

      const duration = Date.now() - startTime;

      // Should complete in reasonable time (less than 1 second)
      expect(duration).toBeLessThan(1000);
    });

    it('should handle large context objects', () => {
      const logger = new Logger(LogLevel.INFO);
      const largeContext = {
        data: Array.from({ length: 100 }, (_, i) => ({
          id: i,
          name: `Item ${i}`,
          description: `Description for item ${i}`.repeat(10),
        })),
      };

      expect(() => {
        logger.info('Large context', largeContext);
      }).not.toThrow();
    });
  });

  describe('Special Characters', () => {
    it('should handle unicode characters', () => {
      const logger = new Logger(LogLevel.INFO);

      expect(() => {
        logger.info('Unicode test: 你好世界 🌍 αβγ', {});
      }).not.toThrow();
    });

    it('should handle newlines in messages', () => {
      const logger = new Logger(LogLevel.INFO);

      expect(() => {
        logger.info('Line 1\nLine 2\nLine 3', {});
      }).not.toThrow();
    });

    it('should handle special JSON characters', () => {
      const logger = new Logger(LogLevel.INFO);
      const context = {
        message: 'Contains "quotes" and \\backslashes',
        path: '/path/to/file',
      };

      expect(() => {
        logger.info('Special chars test', context);
      }).not.toThrow();
    });
  });

  describe('Edge Cases', () => {
    it('should handle undefined context', () => {
      const logger = new Logger(LogLevel.INFO);

      expect(() => {
        logger.info('No context message');
      }).not.toThrow();
    });

    it('should handle null values in context', () => {
      const logger = new Logger(LogLevel.INFO);
      const context = {
        value: null,
        another: 'valid',
      };

      expect(() => {
        logger.info('Null context value', context);
      }).not.toThrow();
    });

    it('should handle empty message', () => {
      const logger = new Logger(LogLevel.INFO);

      expect(() => {
        logger.info('', {});
      }).not.toThrow();
    });
  });

  describe('Log Level Comparison', () => {
    it('should respect log level hierarchy: DEBUG < INFO', () => {
      const debugLogger = new Logger(LogLevel.DEBUG);
      const infoLogger = new Logger(LogLevel.INFO);

      debugLogger.debug('Debug message');
      infoLogger.debug('Should not appear');

      // Debug logger should have logged, info logger should not
      expect(consoleSpy.debug).toHaveBeenCalledTimes(1);
    });

    it('should respect log level hierarchy: INFO < WARN', () => {
      const infoLogger = new Logger(LogLevel.INFO);
      const warnLogger = new Logger(LogLevel.WARN);

      infoLogger.info('Info message');
      warnLogger.info('Should not appear');

      // Only one info should appear
      expect(consoleSpy.info).toHaveBeenCalledTimes(1);
    });

    it('should respect log level hierarchy: WARN < ERROR', () => {
      const errorLogger = new Logger(LogLevel.ERROR);

      errorLogger.warn('Should not appear');
      errorLogger.error('Should appear');

      expect(consoleSpy.warn).not.toHaveBeenCalled();
      expect(consoleSpy.error).toHaveBeenCalled();
    });
  });

  describe('getLogs', () => {
    it('should return logged entries', () => {
      const logger = new Logger(LogLevel.INFO);

      logger.info('First message');
      logger.info('Second message');

      const logs = logger.getLogs();

      expect(logs).toBeDefined();
      expect(Array.isArray(logs)).toBe(true);
      expect(logs.length).toBeGreaterThanOrEqual(2);
    });

    it('should include log level in entries', () => {
      const logger = new Logger(LogLevel.INFO);

      logger.info('Test message');

      const logs = logger.getLogs();
      const lastLog = logs[logs.length - 1];

      expect(lastLog.level).toBe(LogLevel.INFO);
    });

    it('should include message in entries', () => {
      const logger = new Logger(LogLevel.INFO);

      logger.info('Specific test message');

      const logs = logger.getLogs();
      const hasMessage = logs.some((log) => log.message.includes('Specific test message'));

      expect(hasMessage).toBe(true);
    });
  });
});
