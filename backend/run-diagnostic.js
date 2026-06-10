const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const logFile = path.join(__dirname, 'diagnostic_result.txt');
let logContent = '--- DIAGNOSTIC RUN LOG ---\n';

function log(msg) {
  console.log(msg);
  logContent += msg + '\n';
}

try {
  log('1. Compiling TypeScript backend...');
  const buildOut = execSync('npx tsc', { encoding: 'utf-8' });
  log('Build successful!');
  log(buildOut);

  log('2. Running compiled diagnostic script...');
  const runOut = execSync('node dist/test-adsense.js', { encoding: 'utf-8' });
  log('Execution successful!');
  log(runOut);
} catch (err) {
  log('ERROR OCCURRED:');
  log(err.message || String(err));
  if (err.stdout) {
    log('Stdout:');
    log(err.stdout);
  }
  if (err.stderr) {
    log('Stderr:');
    log(err.stderr);
  }
} finally {
  fs.writeFileSync(logFile, logContent, 'utf-8');
  console.log('Diagnostic log written to: ' + logFile);
}
