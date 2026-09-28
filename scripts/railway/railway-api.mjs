// Small client of Railway's public API for the scripts of this folder (docs/DEPLOYMENT.md). The
// workspace token comes from RAILWAY_API_TOKEN (a Codespaces secret) and is never printed.
export const PROJECT = '6bb97b26-059a-4e3a-b018-98072a93391b';
export const ENVIRONMENT = 'ff230db5-af41-4b94-aad1-5ece0c1e48f7';

export async function gql(query, variables = {}) {
  if (!process.env.RAILWAY_API_TOKEN)
    throw new Error('RAILWAY_API_TOKEN is missing (Codespaces secret).');
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

export async function serviceIds() {
  const { project } = await gql(
    `query($p: String!) { project(id: $p) { services { edges { node { id name } } } } }`,
    { p: PROJECT },
  );
  return new Map(project.services.edges.map(({ node }) => [node.name, node.id]));
}

export async function deploy(serviceId, commitSha) {
  return gql(
    `mutation($s: String!, $e: String!, $c: String) {
       serviceInstanceDeployV2(serviceId: $s, environmentId: $e, commitSha: $c) }`,
    { s: serviceId, e: ENVIRONMENT, c: commitSha },
  );
}

/** Waits until the latest deployment of the service ends; returns its status. */
export async function settled(serviceId) {
  for (;;) {
    const { deployments } = await gql(
      `query($i: DeploymentListInput!) { deployments(input: $i, first: 1) { edges { node { status } } } }`,
      { i: { projectId: PROJECT, serviceId, environmentId: ENVIRONMENT } },
    );
    const status = deployments.edges[0]?.node.status;
    if (!['BUILDING', 'DEPLOYING', 'INITIALIZING', 'QUEUED', 'WAITING'].includes(status)) {
      return status;
    }
    await new Promise((resolve) => setTimeout(resolve, 15_000));
  }
}

export async function setPreDeploy(serviceId, command) {
  await gql(
    `mutation($s: String!, $e: String!, $i: ServiceInstanceUpdateInput!) {
       serviceInstanceUpdate(serviceId: $s, environmentId: $e, input: $i) }`,
    { s: serviceId, e: ENVIRONMENT, i: { preDeployCommand: [command] } },
  );
}

export async function setVariables(serviceId, variables) {
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
