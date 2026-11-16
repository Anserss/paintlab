import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const CSC = 'C:\\Windows\\Microsoft.NET\\Framework64\\v4.0.30319\\csc.exe';
const tmpOut = path.join(os.tmpdir(), 'pd-probe.exe');
console.log('cwd=' + process.cwd());
console.log('tmpOut=' + tmpOut);
const args = ['/nologo', '/target:exe', '/codepage:65001', '/out:' + tmpOut, 'H:\\AI\\DEEPSEEK\\harmess\\paint-depot\\.launcher-build\\Launcher.cs'];
try {
  execFileSync(CSC, args, { stdio: 'pipe', cwd: 'H:\\AI\\DEEPSEEK\\harmess\\paint-depot' });
  console.log('TEMP out OK size=' + fs.statSync(tmpOut).size);
  fs.rmSync(tmpOut, { force: true });
} catch (e) {
  console.log('TEMP out FAIL: ' + String(e.stdout || e.message).slice(-260));
}
