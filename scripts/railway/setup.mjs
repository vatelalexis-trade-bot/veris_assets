// Installation of the online demonstration on Railway (phase 16b, D-097, D-106), through Railway's
// public API with a workspace token (the CLI does not accept these tokens to link a project):
//   RAILWAY_API_TOKEN=… node scripts/railway/setup.mjs
// Creates what is missing, in the EU West region (Amsterdam): a documents bucket, postgres (with
// its volume), redis, web (the service created when the repository was connected is reused),
// mailpit and api (which also runs the nightly backup). Secrets are drawn here only when the api service is
// created, and kept only in Railway's variables; nothing secret is printed or written to disk.
import { randomBytes } from 'node:crypto';

const PROJECT = '6bb97b26-059a-4e3a-b018-98072a93391b';
const ENVIRONMENT = 'ff230db5-af41-4b94-aad1-5ece0c1e48f7';
const REPO = 'vatelalexis-trade-bot/veris_assets';
const REGION = 'europe-west4-drams3a';
const BUCKET_REGION = 'ams';

async function gql(query, variables = {}) {
  const response = await fetch('https://backboard.railway.com/graphql/v2', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.RAILWAY_API_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query, variables }),
  });
  const body = await response.json();
  if (body.errors) throw new Error(JSON.stringify(body.errors));
  return body.data;
}

const secret = (bytes = 24) => randomBytes(bytes).toString('hex');
const log = (message) => console.log(`- ${message}`);

async function project() {
  const { project: found } = await gql(
    `query($p: String!) { project(id: $p) {
       services { edges { node { id name } } }
       buckets { edges { node { id name } } } } }`,
    { p: PROJECT },
  );
  return {
    services: new Map(found.services.edges.map(({ node }) => [node.name, node.id])),
    buckets: new Map(found.buckets.edges.map(({ node }) => [node.name, node.id])),
  };
}

async function createService(name, source, variables) {
  const { serviceCreate } = await gql(
    `mutation($input: ServiceCreateInput!) { serviceCreate(input: $input) { id } }`,
    { input: { projectId: PROJECT, environmentId: ENVIRONMENT, name, source, variables } },
  );
  log(`service ${name} created`);
  return serviceCreate.id;
}

async function setVariables(serviceId, variables) {
  await gql(
    `mutation($input: VariableCollectionUpsertInput!) { variableCollectionUpsert(input: $input) }`,
    {
      input: {
        projectId: PROJECT,
        environmentId: ENVIRONMENT,
        serviceId,
        variables,
        skipDeploys: true,
      },
    },
  );
}

async function publicDomain(serviceId, port) {
  const { domains } = await gql(
    `query($p: String!, $e: String!, $s: String!) {
       domains(projectId: $p, environmentId: $e, serviceId: $s) { serviceDomains { domain } } }`,
    { p: PROJECT, e: ENVIRONMENT, s: serviceId },
  );
  if (domains.serviceDomains.length > 0) return domains.serviceDomains[0].domain;
  const { serviceDomainCreate } = await gql(
    `mutation($input: ServiceDomainCreateInput!) { serviceDomainCreate(input: $input) { domain } }`,
    { input: { environmentId: ENVIRONMENT, serviceId, targetPort: port } },
  );
  return serviceDomainCreate.domain;
}

async function patch(config, message) {
  await gql(
    `mutation($e: String!, $patch: EnvironmentConfig!, $m: String) {
       environmentPatchCommit(environmentId: $e, patch: $patch, commitMessage: $m) }`,
    { e: ENVIRONMENT, patch: config, m: message },
  );
}

const state = await project();
const europe = {};

/**
 * EU West only. A new service gets a default region (US West): the environment patch would add
 * Amsterdam next to it, which the trial plan refuses, so the whole setting is replaced here.
 */
async function inEurope(serviceId) {
  await gql(
    `mutation($s: String!, $e: String!, $i: ServiceInstanceUpdateInput!) {
       serviceInstanceUpdate(serviceId: $s, environmentId: $e, input: $i) }`,
    { s: serviceId, e: ENVIRONMENT, i: { multiRegionConfig: { [REGION]: { numReplicas: 1 } } } },
  );
}

// 1. Documents bucket, in Amsterdam.
let bucketId = state.buckets.get('veris-documents');
if (!bucketId) {
  const { bucketCreate } = await gql(
    `mutation($input: BucketCreateInput!) { bucketCreate(input: $input) { id } }`,
    { input: { projectId: PROJECT, environmentId: ENVIRONMENT, name: 'veris-documents' } },
  );
  bucketId = bucketCreate.id;
  await patch(
    { buckets: { [bucketId]: { region: BUCKET_REGION, isCreated: true } } },
    'Create the documents bucket',
  );
  log('bucket veris-documents created (EU West)');
}

// 2. PostgreSQL 18 with its volume, and Redis.
let postgres = state.services.get('postgres');
let databasePassword = secret();
if (postgres) {
  // Already installed: the API must use the database's own password.
  const { variables } = await gql(
    `query($p: String!, $e: String!, $s: String!) {
       variables(projectId: $p, environmentId: $e, serviceId: $s) }`,
    { p: PROJECT, e: ENVIRONMENT, s: postgres },
  );
  databasePassword = variables.POSTGRES_PASSWORD;
} else {
  postgres = await createService(
    'postgres',
    { image: 'postgres:18.6-alpine' },
    { POSTGRES_USER: 'va_admin', POSTGRES_PASSWORD: databasePassword, POSTGRES_DB: 'veris_assets' },
  );
  await gql(`mutation($input: VolumeCreateInput!) { volumeCreate(input: $input) { id } }`, {
    input: {
      projectId: PROJECT,
      environmentId: ENVIRONMENT,
      serviceId: postgres,
      mountPath: '/var/lib/postgresql',
      region: REGION,
    },
  });
  log('volume of postgres created');
}
const redis =
  state.services.get('redis') ??
  (await createService('redis', { image: 'redis:8.10.2-alpine' }, {}));

// 3. Web app: the service created when the repository was connected becomes "web".
let web = state.services.get('web');
if (!web && state.services.has('veris_assets')) {
  web = state.services.get('veris_assets');
  await gql(
    `mutation($id: String!, $input: ServiceUpdateInput!) { serviceUpdate(id: $id, input: $input) { id } }`,
    { id: web, input: { name: 'web' } },
  );
  log('service veris_assets renamed web');
}
const webVariables = {
  RAILWAY_DOCKERFILE_PATH: 'apps/web/Dockerfile',
  API_INTERNAL_URL: 'http://api.railway.internal:4000',
  PORT: '3000',
};
if (!web) web = await createService('web', { repo: REPO }, webVariables);
const webDomain = await publicDomain(web, 3000);
await setVariables(web, { ...webVariables, WEB_ORIGIN: `https://${webDomain}` });

// 4. Test mail box.
const mailpit =
  state.services.get('mailpit') ??
  (await createService(
    'mailpit',
    { repo: REPO },
    {
      RAILWAY_DOCKERFILE_PATH: 'infra/mailpit/Dockerfile',
      MAILPIT_UI_PASSWORD: secret(),
      PORT: '8025',
    },
  ));
const mailDomain = await publicDomain(mailpit, 8025);

// 5. API and nightly backup, with the same variables.
let api = state.services.get('api');
if (!api) {
  const { bucketS3Credentials } = await gql(
    `query($b: String!, $e: String!, $p: String!) {
       bucketS3Credentials(bucketId: $b, environmentId: $e, projectId: $p) {
         endpoint region bucketName accessKeyId secretAccessKey urlStyle } }`,
    { b: bucketId, e: ENVIRONMENT, p: PROJECT },
  );
  const storage = bucketS3Credentials[0];
  const variables = {
    RAILWAY_DOCKERFILE_PATH: 'apps/api/Dockerfile',
    NODE_ENV: 'production',
    DEMO_MODE: 'true',
    JOBS_ENABLED: 'true',
    API_HOST: '::',
    API_PORT: '4000',
    WEB_ORIGIN: `https://${webDomain}`,
    WEB_ALTERNATE_ORIGINS: '',
    TRUST_PROXY: 'loopback,uniquelocal',
    CLIENT_IP_HEADER: 'x-real-ip',
    PORT: '4000',
    POSTGRES_HOST: 'postgres.railway.internal',
    POSTGRES_PORT: '5432',
    POSTGRES_USER: 'va_admin',
    POSTGRES_PASSWORD: databasePassword,
    POSTGRES_DB: 'veris_assets',
    DB_MIGRATOR_PASSWORD: secret(),
    DB_APP_PASSWORD: secret(),
    DB_AUTH_PASSWORD: secret(),
    DB_JOBS_PASSWORD: secret(),
    BETTER_AUTH_SECRET: secret(32),
    DEMO_ACCOUNTS_PASSWORD: secret(),
    REDIS_HOST: 'redis.railway.internal',
    REDIS_PORT: '6379',
    REDIS_KEY_PREFIX: 'va:',
    SMTP_HOST: 'mailpit.railway.internal',
    SMTP_PORT: '1025',
    MAIL_FROM: 'Veris Assets <no-reply@veris-assets.example>',
    CONTACT_EMAIL: 'contact@veris-assets.example',
    S3_ENDPOINT: storage.endpoint,
    S3_REGION: storage.region,
    S3_BUCKET: storage.bucketName,
    S3_ACCESS_KEY_ID: storage.accessKeyId,
    S3_SECRET_ACCESS_KEY: storage.secretAccessKey,
    S3_FORCE_PATH_STYLE: storage.urlStyle === 'path' ? 'true' : 'false',
    PROVIDER_KYC_MODE: 'success',
    PROVIDER_FILE_SCANNER_MODE: 'success',
    PROVIDER_PAYMENT_MODE: 'success',
  };
  api = await createService('api', { repo: REPO }, variables);
}
// The nightly backup runs inside the API (the free trial allows 5 services): 02:30 UTC.
await setVariables(api, { BACKUP_SCHEDULE: '30 2 * * *' });

// 6. Build and start-up settings, all services in EU West.
const dockerfile = (path) => ({ builder: 'DOCKERFILE', dockerfilePath: path });
await patch(
  {
    services: {
      [postgres]: { deploy: europe },
      [redis]: { deploy: europe },
      [web]: { build: dockerfile('apps/web/Dockerfile'), deploy: europe },
      [mailpit]: { build: dockerfile('infra/mailpit/Dockerfile'), deploy: europe },
      [api]: {
        build: dockerfile('apps/api/Dockerfile'),
        deploy: {
          ...europe,
          preDeployCommand: ['pnpm db:setup'],
          healthcheckPath: '/health/ready',
        },
      },
    },
  },
  'Veris Assets: build and start-up settings',
);
for (const serviceId of [postgres, redis, web, mailpit, api]) await inEurope(serviceId);
log('settings committed, every service in EU West');
console.log(
  `\nWeb app ....... https://${webDomain}\nTest emails ... https://${mailDomain} (user "demo")`,
);
