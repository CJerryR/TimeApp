import { spawn } from 'node:child_process';
import { createServer } from 'vite';
import electronPath from 'electron';

const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: 'inherit', shell: process.platform === 'win32', ...options });
    child.on('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} ${args.join(' ')} exited with ${code}`));
    });
  });
}

const server = await createServer({ configFile: 'vite.config.ts' });
await server.listen();
server.printUrls();

await run(npmCmd, ['run', 'build:main']);

const electron = spawn(electronPath, ['.'], {
  stdio: 'inherit',
  shell: false,
  env: {
    ...process.env,
    VITE_DEV_SERVER_URL: 'http://127.0.0.1:5173'
  }
});

const shutdown = async () => {
  electron.kill();
  await server.close();
  process.exit(0);
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
electron.on('exit', async (code) => {
  await server.close();
  process.exit(code ?? 0);
});
