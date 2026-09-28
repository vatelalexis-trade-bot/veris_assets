// Resets the online demonstration data (fictitious): `pnpm online:reset`. The API is redeployed
// once with "pnpm db:reset" as its pre-deploy command (allowed online because DEMO_MODE=true),
// then the usual "pnpm db:setup" is put back. The stored documents are kept.
import { deploy, serviceIds, setPreDeploy, settled } from './railway-api.mjs';

const api = (await serviceIds()).get('api');
await setPreDeploy(api, 'pnpm db:reset');
try {
  await deploy(api);
  console.log('api: reset of the demo data started');
  console.log(`api: ${await settled(api)}`);
} finally {
  await setPreDeploy(api, 'pnpm db:setup');
}
