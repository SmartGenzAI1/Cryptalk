/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require('fs');
const path = require('path');

try {
  // Ensure target dirs exist
  fs.mkdirSync(path.join(__dirname, '.next', 'standalone', '.next'), { recursive: true });
  
  // Copy static
  const staticSrc = path.join(__dirname, '.next', 'static');
  const staticDest = path.join(__dirname, '.next', 'standalone', '.next', 'static');
  if (fs.existsSync(staticSrc)) {
    fs.cpSync(staticSrc, staticDest, { recursive: true, force: true });
    console.log('Successfully copied .next/static to .next/standalone/.next/static');
  }

  // Copy public
  const publicSrc = path.join(__dirname, 'public');
  const publicDest = path.join(__dirname, '.next', 'standalone', 'public');
  if (fs.existsSync(publicSrc)) {
    fs.cpSync(publicSrc, publicDest, { recursive: true, force: true });
    console.log('Successfully copied public to .next/standalone/public');
  }
} catch (err) {
  console.error('Error copying build assets:', err);
  process.exit(1);
}
