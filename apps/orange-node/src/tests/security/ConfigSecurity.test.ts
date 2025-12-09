import { getConfigFromDataDir } from '../../config';
import fs from 'fs';
import os from 'os';
import path from 'path';

/**
 * Security tests for configuration file reading vulnerabilities
 * Tests for path traversal prevention and secure file handling
 */
describe('Configuration Security Tests', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('Path Traversal Prevention', () => {
    it('should prevent path traversal attacks in ALGORAND_DATA', () => {
      const maliciousPaths = [
        '../../../etc/passwd',
        '..\\..\\..\\windows\\system32\\config\\sam',
        '/etc/shadow',
        'C:\\Windows\\System32\\config\\SAM',
        '/var/www/../../etc/hosts',
        'data/../../../etc/passwd',
        'normal/path/../../../malicious'
      ];

      maliciousPaths.forEach(maliciousPath => {
        process.env['ALGORAND_DATA'] = maliciousPath;

        // This should safely return undefined values instead of reading malicious files
        const config = getConfigFromDataDir();

        expect(config.ALGOD_TOKEN).toBeUndefined();
        expect(config.ALGOD_URL).toBeUndefined();
      });
    });

    it('should handle null bytes in paths', () => {
      process.env['ALGORAND_DATA'] = '/some/path\0malicious.txt';

      const config = getConfigFromDataDir();

      expect(config.ALGOD_TOKEN).toBeUndefined();
      expect(config.ALGOD_URL).toBeUndefined();
    });

    it('should reject relative paths for security', () => {
      const relativePaths = [
        './data',
        '../algorand',
        'algorand/data',
        './algorand/data'
      ];

      relativePaths.forEach(relativePath => {
        process.env['ALGORAND_DATA'] = relativePath;

        const config = getConfigFromDataDir();

        expect(config.ALGOD_TOKEN).toBeUndefined();
        expect(config.ALGOD_URL).toBeUndefined();
      });
    });
  });

  describe('File Access Security', () => {
    it('should only read allowed filenames', () => {
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'orange-config-test-'));
      const allowedFile = path.join(tempDir, 'algod.net');
      const disallowedFile = path.join(tempDir, 'malicious.txt');

      try {
        fs.writeFileSync(allowedFile, 'localhost:8080');
        fs.writeFileSync(disallowedFile, 'MALICIOUS_CONTENT');
        process.env['ALGORAND_DATA'] = tempDir;

        const config = getConfigFromDataDir();
        expect(config.ALGOD_URL).toBe('http://localhost:8080');
        expect(config.ALGOD_TOKEN).toBeUndefined();
      } finally {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    });

    it('should prevent reading symbolic links outside data directory', () => {
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'orange-config-test-'));
      const symlinkFile = path.join(tempDir, 'algod.token');
      const outsideFile = path.join(tempDir, '../outside-secret.txt');

      try {
        fs.writeFileSync(outsideFile, 'SECRET_TOKEN');
        fs.symlinkSync(outsideFile, symlinkFile);
        process.env['ALGORAND_DATA'] = tempDir;

        const config = getConfigFromDataDir();
        expect(config.ALGOD_TOKEN).toBeUndefined();
      } finally {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    });

    it('should limit file size to prevent DoS attacks', () => {
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'orange-config-test-'));
      const largeFile = path.join(tempDir, 'algod.net');

      try {
        const largeContent = 'x'.repeat(2 * 1024 * 1024);
        fs.writeFileSync(largeFile, largeContent);
        process.env['ALGORAND_DATA'] = tempDir;

        const config = getConfigFromDataDir();
        expect(config.ALGOD_URL).toBeUndefined();
      } finally {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    });
  });

  describe('Error Handling Security', () => {
    it('should handle non-existent directories gracefully', () => {
      process.env['ALGORAND_DATA'] = '/non/existent/path';

      expect(() => {
        const config = getConfigFromDataDir();
        expect(config.ALGOD_TOKEN).toBeUndefined();
        expect(config.ALGOD_URL).toBeUndefined();
      }).not.toThrow();
    });

    it('should handle permission denied errors gracefully', () => {
      process.env['ALGORAND_DATA'] = '/root/.algorand';

      expect(() => {
        const config = getConfigFromDataDir();
        expect(typeof config.ALGOD_TOKEN).toBe('undefined');
        expect(typeof config.ALGOD_URL).toBe('undefined');
      }).not.toThrow();
    });

    it('should handle file read errors gracefully', () => {
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'orange-config-test-'));

      try {
        process.env['ALGORAND_DATA'] = tempDir;

        expect(() => {
          const config = getConfigFromDataDir();
          expect(config.ALGOD_TOKEN).toBeUndefined();
          expect(config.ALGOD_URL).toBeUndefined();
        }).not.toThrow();
      } finally {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    });
  });

  describe('Content Validation Security', () => {
    it('should validate algod.net content for malicious input', () => {
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'orange-config-test-'));
      const maliciousNetFile = path.join(tempDir, 'algod.net');

      try {
        const maliciousContent = '../../../etc/passwd';
        fs.writeFileSync(maliciousNetFile, maliciousContent);
        process.env['ALGORAND_DATA'] = tempDir;

        const config = getConfigFromDataDir();
        expect(config.ALGOD_URL).toBeUndefined();
      } finally {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    });

    it('should handle null bytes in file content', () => {
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'orange-config-test-'));
      const netFile = path.join(tempDir, 'algod.net');

      try {
        const contentWithNull = 'localhost:8080\0malicious';
        fs.writeFileSync(netFile, contentWithNull);
        process.env['ALGORAND_DATA'] = tempDir;

        const config = getConfigFromDataDir();
        expect(config.ALGOD_URL).toBeUndefined();
      } finally {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    });
  });

  describe('Environment Variable Security', () => {
    it('should handle undefined ALGORAND_DATA gracefully', () => {
      delete process.env['ALGORAND_DATA'];

      const config = getConfigFromDataDir();
      expect(config.ALGOD_TOKEN).toBeUndefined();
      expect(config.ALGOD_URL).toBeUndefined();
    });

    it('should handle empty string ALGORAND_DATA', () => {
      process.env['ALGORAND_DATA'] = '';

      const config = getConfigFromDataDir();
      expect(config.ALGOD_TOKEN).toBeUndefined();
      expect(config.ALGOD_URL).toBeUndefined();
    });
  });

  describe('Integration Security Test', () => {
    it('should provide secure configuration in normal operation', () => {
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'orange-config-test-'));
      const netFile = path.join(tempDir, 'algod.net');
      const tokenFile = path.join(tempDir, 'algod.token');

      try {
        fs.writeFileSync(netFile, '127.0.0.1:8080');
        fs.writeFileSync(tokenFile, 'valid-token-123');
        process.env['ALGORAND_DATA'] = tempDir;

        const config = getConfigFromDataDir();
        expect(config.ALGOD_URL).toBe('http://127.0.0.1:8080');
        expect(config.ALGOD_TOKEN).toBe('valid-token-123');
      } finally {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    });

    it('should handle IPv6 replacement securely', () => {
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'orange-config-test-'));
      const netFile = path.join(tempDir, 'algod.net');

      try {
        fs.writeFileSync(netFile, '[::]:8080');
        process.env['ALGORAND_DATA'] = tempDir;

        const config = getConfigFromDataDir();
        expect(config.ALGOD_URL).toBe('http://127.0.0.1:8080');
      } finally {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    });
  });
});

describe('CRITICAL SECURITY FIX: Insecure File Reading Vulnerability', () => {
  it('should completely prevent unauthorized file access through path traversal', () => {
    const attacks = [
      { path: '../../../etc/passwd', description: 'basic path traversal' },
      { path: '..\\..\\..\\windows\\system32\\config\\sam', description: 'Windows path traversal' },
      { path: '/etc/shadow', description: 'absolute system path' },
      { path: 'normal/path/../../../etc/hosts', description: 'mixed relative traversal' },
      { path: './data/../../../etc/passwd', description: 'current directory traversal' },
      { path: '/some/path\0malicious.txt', description: 'null byte injection' }
    ];

    attacks.forEach(attack => {
      process.env['ALGORAND_DATA'] = attack.path;
      const config = getConfigFromDataDir();
      expect(config.ALGOD_TOKEN).toBeUndefined();
      expect(config.ALGOD_URL).toBeUndefined();
    });
  });

  it('should prevent DoS attacks through large files', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'orange-config-test-'));
    const largeFile = path.join(tempDir, 'algod.token');

    try {
      const largeContent = 'x'.repeat(5 * 1024 * 1024);
      fs.writeFileSync(largeFile, largeContent);
      process.env['ALGORAND_DATA'] = tempDir;

      const config = getConfigFromDataDir();
      expect(config.ALGOD_TOKEN).toBeUndefined();
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
