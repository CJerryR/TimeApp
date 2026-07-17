import fs from 'node:fs';
import path from 'node:path';
import { safeStorage } from 'electron';

interface SecureFile {
  deepseekApiKey?: {
    encoding: 'electron-safe-storage';
    value: string;
    updatedAt: string;
  };
}

export class SecureStore {
  private readonly filePath: string;

  constructor(userDataPath: string) {
    this.filePath = path.join(userDataPath, 'secure-store.json');
  }

  isAvailable(): boolean {
    return safeStorage.isEncryptionAvailable();
  }

  getApiKey(): string | undefined {
    const file = this.read();
    const entry = file.deepseekApiKey;
    if (!entry || !this.isAvailable()) return undefined;
    try {
      return safeStorage.decryptString(Buffer.from(entry.value, 'base64'));
    } catch {
      return undefined;
    }
  }

  setApiKey(apiKey: string): void {
    if (!this.isAvailable()) {
      throw new Error('Electron safeStorage is not available on this system.');
    }
    const encrypted = safeStorage.encryptString(apiKey);
    const file = this.read();
    file.deepseekApiKey = {
      encoding: 'electron-safe-storage',
      value: encrypted.toString('base64'),
      updatedAt: new Date().toISOString()
    };
    this.write(file);
  }

  clearApiKey(): void {
    const file = this.read();
    delete file.deepseekApiKey;
    this.write(file);
  }

  private read(): SecureFile {
    try {
      if (!fs.existsSync(this.filePath)) return {};
      return JSON.parse(fs.readFileSync(this.filePath, 'utf8')) as SecureFile;
    } catch {
      return {};
    }
  }

  private write(file: SecureFile): void {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    fs.writeFileSync(this.filePath, JSON.stringify(file, null, 2), 'utf8');
  }
}
