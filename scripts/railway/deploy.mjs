// Publishes the latest commit of main on Railway (api, web, mailpit): `pnpm online:deploy`.
// Needed as long as Railway's GitHub application has no access to the repository (it would then
// deploy every push by itself, docs/DEPLOYMENT.md).
import { execSync } from 'node:child_process';
import { deploy, serviceIds, settled } from './railway-api.mjs';

const commit = execSync('git rev-parse origin/main').toString().trim();
const ids = await serviceIds();
for (const name of ['api', 'web', 'mailpit']) {
  await deploy(ids.get(name), commit);
  console.log(`${name}: deployment of ${commit.slice(0, 7)} started`);
}
for (const name of ['api', 'web', 'mailpit'])
  console.log(`${name}: ${await settled(ids.get(name))}`);
