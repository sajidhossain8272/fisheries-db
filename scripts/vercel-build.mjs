import { execSync } from 'child_process';

try {
  // Run Next.js build
  execSync('npm run build', { stdio: 'inherit' });
  console.log('✓ Build completed successfully');
} catch (error) {
  console.error('✗ Build failed:', error.message);
  process.exit(1);
}
