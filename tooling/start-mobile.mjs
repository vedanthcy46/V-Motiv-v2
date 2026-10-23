import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

const require = createRequire(import.meta.url);
const run = promisify(execFile);
const args = process.argv.slice(2);
const buildAndroid = args[0] === '--run-android';
if (buildAndroid) args.shift();
const adbCandidate = process.env.LOCALAPPDATA && join(process.env.LOCALAPPDATA, 'Android', 'Sdk', 'platform-tools', 'adb.exe');
const adb = adbCandidate && existsSync(adbCandidate) ? adbCandidate : 'adb';
const portArg = args.indexOf('--port');
const metroPort = portArg >= 0 ? args[portArg + 1] : process.env.RCT_METRO_PORT || '8081';
const apiPort = process.env.VMOTIV_API_PORT || '4100';
let checking = false;
let stopped = false;

async function reconnectUsb() {
  if (checking || stopped) return;
  checking = true;
  try {
    const { stdout } = await run(adb, ['devices'], { timeout: 3000, windowsHide: true });
    const devices = stdout.split(/\r?\n/).map(line => /^(\S+)\s+device$/.exec(line)?.[1]).filter(Boolean);
    for (const device of devices) {
      const { stdout: routes } = await run(adb, ['-s', device, 'reverse', '--list'], { timeout: 3000, windowsHide: true });
      for (const port of [metroPort, apiPort]) {
        if (!new RegExp(`tcp:${port}\\s+tcp:${port}(?:\\s|$)`).test(routes)) {
          await run(adb, ['-s', device, 'reverse', `tcp:${port}`, `tcp:${port}`], { timeout: 3000, windowsHide: true });
          console.info(`[V MOTIV] Restored Android USB route for port ${port}.`);
        }
      }
    }
  } catch {
    // Wi-Fi development is supported without adb or an attached Android device.
  } finally { checking = false; }
}

await reconnectUsb();
const timer = setInterval(() => void reconnectUsb(), 5000);
timer.unref();
const child = spawn(process.execPath, [require.resolve('expo/bin/cli'), buildAndroid ? 'run:android' : 'start', ...args], {
  stdio: 'inherit', env: process.env,
});
child.on('error', () => { stopped = true; clearInterval(timer); process.exitCode = 1; });
child.on('exit', code => { stopped = true; clearInterval(timer); process.exitCode = code ?? 1; });
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => { stopped = true; clearInterval(timer); child.kill(signal); });
