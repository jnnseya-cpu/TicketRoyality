/**
 * Completes the standalone build.
 *
 * `output: 'standalone'` writes a self-contained server to `.next/standalone`, but
 * Next deliberately leaves two things out of it: the hashed client bundles in
 * `.next/static` and anything in `public/`. Both are expected to be served by a CDN
 * in the canonical deployment, so the standalone tree ships without them.
 *
 * Cloud Run has no CDN in front of it here — the Node process serves everything. So
 * without this copy the server boots, returns HTML, and every stylesheet and script
 * tag inside that HTML 404s. The page renders unstyled and dead, which looks like a
 * broken app rather than a missing file, and it only shows up once something is
 * actually deployed.
 */

import { cp, access } from 'node:fs/promises';
import { join } from 'node:path';

const root = process.cwd();
const standalone = join(root, '.next', 'standalone');

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

if (!(await exists(standalone))) {
  console.error('postbuild: .next/standalone is missing — did `next build` run?');
  process.exit(1);
}

await cp(join(root, '.next', 'static'), join(standalone, '.next', 'static'), {
  recursive: true,
});
console.log('postbuild: copied .next/static');

// `public/` is optional — the repository has no static assets today.
if (await exists(join(root, 'public'))) {
  await cp(join(root, 'public'), join(standalone, 'public'), { recursive: true });
  console.log('postbuild: copied public/');
}
