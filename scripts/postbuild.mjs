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

// Not fatal, deliberately.
//
// This script exists so `npm run start` can serve `.next/standalone` locally, which
// is the only way to exercise the real Cloud Run artefact before deploying. Firebase
// App Hosting does NOT use that path — its Next.js adapter runs its own build and
// serves assets itself — so on a hosted build the directory legitimately may not
// exist.
//
// An earlier version exited 1 here, which turned a missing convenience copy into a
// failed deploy of the entire site. A postbuild helper must never be able to fail a
// build it is not required by.
if (!(await exists(standalone))) {
  console.log('postbuild: no .next/standalone (framework adapter build) — nothing to copy');
  process.exit(0);
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
