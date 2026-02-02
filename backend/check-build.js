const { execSync } = require('child_process');
const fs = require('fs');

try {
  execSync('npx tsc --noEmit --pretty false', { stdio: 'pipe', encoding: 'utf8' });
  console.log('Build succeeded!');
} catch (error) {
  const output = error.stdout + error.stderr;
  fs.writeFileSync('build-errors.txt', output, 'utf8');
  console.log(output);
  process.exit(1);
}
