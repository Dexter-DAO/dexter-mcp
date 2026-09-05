import assert from 'node:assert/strict';
import { execFile, execFileSync, spawn } from 'node:child_process';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:net';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import {
  materializeOpenToolDescriptorsFromGit,
  materializeOpenToolDescriptorsFromRegistrations,
  serializeOpenToolDescriptors,
  verifyOpenToolDescriptor,
  writeOpenToolDescriptor,
} from '../scripts/materialize-open-tool-descriptors.mjs';
import {
  reviewedReleaseToolEnvironment,
  reviewedNpmInvocation,
} from '../lib/open-release-tooling.mjs';
import {
  OPEN_RELEASE_FINALIZATION_SCRIPTS,
  OPEN_RELEASE_INSTALL_ARGS,
} from '../lib/open-release-finalization.mjs';
import {
  DEXTER_WALLET_WIDGET_URIS,
  GOVERNED_ASSET_WIDGET_URIS,
  INDEXTER_WIDGET_URIS,
} from '../apps-sdk/widget-uris.mjs';

const execFileAsync = promisify(execFile);

const CONNECTED = [
  'indexter_discover',
  'indexter_search',
  'x402_check',
  'x402_fetch',
  'x402_status',
  'x402_access',
  'dexter_wallet',
  'dexter_wallet_portfolio',
  'dexter_prepare_asset_action',
  'dexter_execute_asset_action',
  'dexter_asset_action_status',
  'dexter_reconcile_asset_action',
  'dexter_wallet_history',
];

const ANONYMOUS = [];
const PROMOTED = CONNECTED;

function descriptorSourceFixture(packageManager = 'npm@10.9.3') {
  const directory = mkdtempSync(join(tmpdir(), 'opendexter-source-fixture-'));
  writeFileSync(join(directory, 'package.json'), `${JSON.stringify({
    name: 'descriptor-source-fixture',
    version: '1.0.0',
    packageManager,
    scripts: Object.fromEntries(
      OPEN_RELEASE_FINALIZATION_SCRIPTS.map((script) => [script, 'true']),
    ),
  })}\n`);
  writeFileSync(join(directory, 'package-lock.json'), `${JSON.stringify({
    name: 'descriptor-source-fixture',
    version: '1.0.0',
    lockfileVersion: 3,
    packages: { '': { name: 'descriptor-source-fixture', version: '1.0.0' } },
  })}\n`);
  mkdirSync(join(directory, 'scripts'), { recursive: true });
  writeFileSync(
    join(directory, 'scripts/materialize-open-tool-descriptors.mjs'),
    '// intercepted by the descriptor finalization fixture\n',
  );
  execFileSync('git', ['init', '-q'], { cwd: directory });
  execFileSync('git', ['config', 'user.email', 'fixture@dexter.test'], {
    cwd: directory,
  });
  execFileSync('git', ['config', 'user.name', 'Dexter Fixture'], {
    cwd: directory,
  });
  execFileSync('git', [
    'remote', 'add', 'origin', 'https://github.com/Dexter-DAO/dexter-mcp.git',
  ], { cwd: directory });
  execFileSync('git', ['add', '.'], { cwd: directory });
  execFileSync('git', ['commit', '-qm', 'fixture'], { cwd: directory });
  return directory;
}

function descriptorFinalizationFixture() {
  return {
    schemaVersion: 2,
    kind: 'opendexter-hosted-tool-descriptors/v2',
    sourceContracts: { kind: 'opendexter-source-contracts/v3' },
    oauth: {
      mode: 'required',
      resource: 'https://open.dexter.cash/mcp',
      authorizationServer: 'https://mcp.dexter.cash/mcp',
      authorizationServerMetadata:
        'https://mcp.dexter.cash/.well-known/oauth-authorization-server/mcp',
      tokenIssuer: 'https://dexter.cash',
      protectedResourcePaths: [],
      scopesSupported: ['vault'],
      challengeRequiredParameters: [],
    },
    buildState: 'finalized-widgets',
  };
}

function canonicalFixtureRunner(
  directory,
  { advertised = true, unreachable = false, calls = [] } = {},
) {
  return async (command, args, options = {}) => {
    calls.push({ command, args: [...args], options });
    if (
      command === 'git'
      && args.includes('ls-remote')
    ) {
      if (unreachable) throw new Error('fixture origin unavailable');
      const commit = execFileSync('git', ['rev-parse', 'HEAD'], {
        cwd: directory,
        encoding: 'utf8',
      }).trim();
      return {
        stdout: advertised
          ? `${commit}\trefs/heads/main\n`
          : `${'f'.repeat(40)}\trefs/heads/main\n`,
        stderr: '',
      };
    }
    return execFileAsync(command, args, options);
  };
}

test('importing the fixed materializer interface starts no server or reaper', () => {
  const scriptUrl = new URL(
    '../scripts/materialize-open-tool-descriptors.mjs',
    import.meta.url,
  );
  const output = execFileSync(process.execPath, [
    '--input-type=module',
    '--eval',
    `await import(${JSON.stringify(scriptUrl.href)}); process.stdout.write('import-safe');`,
  ], {
    encoding: 'utf8',
    timeout: 5_000,
  });
  assert.equal(output, 'import-safe');
});

test('--emit-json emits exactly one descriptor document and exits', () => {
  const materializerPath = fileURLToPath(new URL(
    '../scripts/materialize-open-tool-descriptors.mjs',
    import.meta.url,
  ));
  const output = execFileSync(process.execPath, [materializerPath, '--emit-json'], {
    cwd: fileURLToPath(new URL('..', import.meta.url)),
    encoding: 'utf8',
    timeout: 5_000,
    env: {
      ...process.env,
      SENTRY_DSN: '',
      SENTRY_OPEN_MCP_DSN: '',
    },
  });
  const descriptor = JSON.parse(output);
  assert.equal(descriptor.kind, 'opendexter-hosted-tool-descriptors/v2');
  assert.deepEqual(descriptor.tools.map(({ name }) => name), CONNECTED);

  for (const name of [
    'dexter_prepare_asset_action',
    'dexter_execute_asset_action',
    'dexter_asset_action_status',
    'dexter_reconcile_asset_action',
  ]) {
    const tool = descriptor.tools.find((candidate) => candidate.name === name);
    assert.ok(tool, name);
    assert.equal(tool._meta.ui.resourceUri, GOVERNED_ASSET_WIDGET_URIS.action);
    assert.equal(tool._meta['ui/resourceUri'], GOVERNED_ASSET_WIDGET_URIS.action);
    assert.equal(tool._meta['openai/outputTemplate'], GOVERNED_ASSET_WIDGET_URIS.action);
    assert.equal(tool._meta['openai/resultCanProduceWidget'], true);
    assert.equal(tool._meta['openai/widgetAccessible'], false);
    assert.deepEqual(tool._meta.ui.visibility, ['model']);
    assert.doesNotMatch(
      tool._meta['openai/toolInvocation/invoked'],
      /confirmed|executed|succeeded|complete/i,
      `${name} invocation copy cannot claim transaction success`,
    );
  }

  const history = descriptor.tools.find((candidate) =>
    candidate.name === 'dexter_wallet_history');
  assert.ok(history);
  assert.equal(history._meta.ui.resourceUri, GOVERNED_ASSET_WIDGET_URIS.history);
  assert.equal(history._meta['ui/resourceUri'], GOVERNED_ASSET_WIDGET_URIS.history);
  assert.equal(history._meta['openai/outputTemplate'], GOVERNED_ASSET_WIDGET_URIS.history);
  assert.equal(history._meta['openai/resultCanProduceWidget'], true);
  assert.equal(history._meta['openai/widgetAccessible'], false);
  assert.deepEqual(history._meta.ui.visibility, ['model']);

  const indexter = descriptor.tools.find((candidate) =>
    candidate.name === 'indexter_search');
  assert.equal(indexter._meta.ui.resourceUri, INDEXTER_WIDGET_URIS.search);
  assert.equal(indexter._meta['openai/widgetAccessible'], false);
  assert.deepEqual(indexter._meta.ui.visibility, ['model']);
  const indexterDiscovery = descriptor.tools.find((candidate) =>
    candidate.name === 'indexter_discover');
  assert.equal(indexterDiscovery._meta.ui.resourceUri, INDEXTER_WIDGET_URIS.search);
  assert.match(
    indexterDiscovery._meta.ui.resourceUri,
    /^ui:\/\/dexter\/indexter-search-[a-f0-9]{8}$/,
  );
  assert.equal(indexterDiscovery._meta['openai/outputTemplate'], INDEXTER_WIDGET_URIS.search);
  assert.equal(indexterDiscovery._meta['openai/widgetAccessible'], true);
  assert.deepEqual(indexterDiscovery._meta.ui.visibility, ['app']);
  assert.equal(
    Object.hasOwn(indexterDiscovery.inputSchema.properties, 'cursor'),
    true,
  );
  assert.equal(
    Object.hasOwn(indexterDiscovery.inputSchema.properties, 'offset'),
    false,
  );
  const discoveryPage = indexterDiscovery.outputSchema.properties.page;
  assert.equal(Object.hasOwn(discoveryPage.properties, 'nextCursor'), true);
  assert.equal(Object.hasOwn(discoveryPage.properties, 'nextOffset'), false);
  assert.equal(Object.hasOwn(discoveryPage.properties, 'offset'), false);
  const discoverySummary = indexterDiscovery.outputSchema.properties.summary;
  assert.deepEqual(
    Object.keys(discoverySummary.properties).sort(),
    ['endpointCatalog', 'returnedProviderCount'],
  );
  assert.deepEqual(
    Object.keys(discoverySummary.properties.endpointCatalog.properties).sort(),
    ['endpointCount', 'featuredProviderCount', 'providerCount'],
  );
  const discoveryEndpoint = indexterDiscovery.outputSchema.properties.providers
    .items.properties.capabilityGroups.items.properties.resources.items;
  assert.equal(discoveryEndpoint.properties.kind.const, 'endpoint');
  assert.deepEqual(discoveryEndpoint.properties.method.enum, [
    'GET',
    'POST',
    'PUT',
    'DELETE',
  ]);
  const accessCheck = descriptor.tools.find((candidate) =>
    candidate.name === 'x402_check');
  assert.equal(accessCheck._meta['openai/widgetAccessible'], false);
  assert.deepEqual(accessCheck._meta.ui.visibility, ['model']);
  assert.equal(Object.hasOwn(accessCheck.inputSchema.properties, 'url'), true);
  assert.equal(Object.hasOwn(accessCheck.inputSchema.properties, 'resourceId'), true);

  const wallet = descriptor.tools.find((candidate) =>
    candidate.name === 'dexter_wallet');
  assert.equal(wallet._meta.ui.resourceUri, DEXTER_WALLET_WIDGET_URIS.wallet);
  assert.match(
    wallet._meta.ui.resourceUri,
    /^ui:\/\/dexter\/dexter-wallet(?:-[a-f0-9]{8})?$/,
  );

  for (const name of [
    'x402_fetch',
    'x402_status',
    'x402_access',
    'dexter_wallet',
    'dexter_wallet_portfolio',
  ]) {
    const tool = descriptor.tools.find((candidate) => candidate.name === name);
    assert.ok(tool, name);
    assert.equal(tool._meta['openai/widgetAccessible'], false, name);
    assert.deepEqual(tool._meta.ui.visibility, ['model'], name);
  }
});

test('descriptor archive preflight rejects visible and hidden checkout state before npm', async (t) => {
  const directory = descriptorSourceFixture();
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const packagePath = join(directory, 'package.json');
  const originalPackage = readFileSync(packagePath, 'utf8');

  writeFileSync(join(directory, 'untracked.txt'), 'untracked\n');
  await assert.rejects(
    materializeOpenToolDescriptorsFromGit({ sourceRoot: directory }),
    /source checkout is not clean/,
  );
  rmSync(join(directory, 'untracked.txt'));

  execFileSync('git', ['update-index', '--assume-unchanged', 'package.json'], {
    cwd: directory,
  });
  writeFileSync(packagePath, `${originalPackage} `);
  await assert.rejects(
    materializeOpenToolDescriptorsFromGit({ sourceRoot: directory }),
    /hidden index state/,
  );
  execFileSync('git', ['update-index', '--no-assume-unchanged', 'package.json'], {
    cwd: directory,
  });
  writeFileSync(packagePath, originalPackage);

  execFileSync('git', ['update-index', '--skip-worktree', 'package-lock.json'], {
    cwd: directory,
  });
  await assert.rejects(
    materializeOpenToolDescriptorsFromGit({ sourceRoot: directory }),
    /hidden index state/,
  );
  execFileSync('git', ['update-index', '--no-skip-worktree', 'package-lock.json'], {
    cwd: directory,
  });
});

test('descriptor archive preflight enforces the committed exact npm version before install', async (t) => {
  const directory = descriptorSourceFixture('npm@0.0.1');
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  await assert.rejects(
    materializeOpenToolDescriptorsFromGit({
      sourceRoot: directory,
      runCommand: canonicalFixtureRunner(directory),
    }),
    /pins npm 0\.0\.1, expected 10\.9\.3/,
  );
  assert.throws(() => readFileSync(join(directory, 'node_modules/.package-lock.json')));
});

test('descriptor archive runs the exact shared finalization before tools/list emission', async (t) => {
  const directory = descriptorSourceFixture();
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const calls = [];
  const reviewedNpm = reviewedNpmInvocation();
  const finalizedDescriptor = descriptorFinalizationFixture();
  let appsSdkFinalized = false;
  const runCommand = async (command, args, options = {}) => {
    calls.push({ command, args: [...args] });
    if (command === 'git' && args.includes('ls-remote')) {
      const commit = execFileSync('git', ['rev-parse', 'HEAD'], {
        cwd: directory,
        encoding: 'utf8',
      }).trim();
      return { stdout: `${commit}\trefs/heads/main\n`, stderr: '' };
    }
    const npmCall = command === reviewedNpm.command
      && args[0] === reviewedNpm.npmCli;
    if (npmCall) {
      const effectiveArgs = args.slice(1);
      if (effectiveArgs[0] === '--version') {
        return { stdout: '10.9.3\n', stderr: '' };
      }
      if (effectiveArgs.join(' ') === 'run build:apps-sdk:local') {
        appsSdkFinalized = true;
      }
      return { stdout: '', stderr: '' };
    }
    if (
      command === reviewedNpm.nodeExecutable
      && args[0]?.endsWith('materialize-open-tool-descriptors.mjs')
    ) {
      return {
        stdout: JSON.stringify(appsSdkFinalized
          ? finalizedDescriptor
          : { ...finalizedDescriptor, buildState: 'prebuild-widgets' }),
        stderr: '',
      };
    }
    return execFileAsync(command, args, options);
  };

  const descriptor = await materializeOpenToolDescriptorsFromGit({
    sourceRoot: directory,
    runCommand,
  });
  assert.equal(descriptor.buildState, 'finalized-widgets');
  const npmCalls = calls
    .filter(({ command, args }) => (
      command === reviewedNpm.command && args[0] === reviewedNpm.npmCli
    ))
    .map(({ args }) => args.slice(1).join(' '));
  assert.deepEqual(npmCalls, [
    '--version',
    OPEN_RELEASE_INSTALL_ARGS.join(' '),
    ...OPEN_RELEASE_FINALIZATION_SCRIPTS.map((script) => `run ${script}`),
  ]);
  const widgetBuildCall = calls.findIndex(({ command, args }) => (
    command === reviewedNpm.command
    && args[0] === reviewedNpm.npmCli
    && args.slice(1).join(' ') === 'run build:apps-sdk:local'
  ));
  const emitCall = calls.findIndex(({ command, args }) => (
    command === reviewedNpm.nodeExecutable
    && args[0]?.endsWith('materialize-open-tool-descriptors.mjs')
  ));
  assert.ok(widgetBuildCall >= 0);
  assert.ok(emitCall > widgetBuildCall);
});

test('descriptor archive preflight requires the exact HEAD at the reachable canonical origin', async (t) => {
  const directory = descriptorSourceFixture('npm@0.0.1');
  t.after(() => rmSync(directory, { recursive: true, force: true }));

  await assert.rejects(
    materializeOpenToolDescriptorsFromGit({
      sourceRoot: directory,
      runCommand: canonicalFixtureRunner(directory, { advertised: false }),
    }),
    /canonical origin does not advertise HEAD/,
  );
  await assert.rejects(
    materializeOpenToolDescriptorsFromGit({
      sourceRoot: directory,
      runCommand: canonicalFixtureRunner(directory, { unreachable: true }),
    }),
    /canonical origin is unreachable/,
  );
});

test('descriptor child environment refuses loader/archive injection and strips npm markers', async () => {
  for (const key of [
    'NODE_OPTIONS',
    'NODE_PATH',
    'LD_PRELOAD',
    'LD_LIBRARY_PATH',
    'LD_AUDIT',
    'LD_DEBUG',
    'TAR_OPTIONS',
  ]) {
    assert.throws(
      () => reviewedReleaseToolEnvironment({
        env: { HOME: '/tmp', [key]: '/tmp/hostile-marker' },
      }),
      new RegExp(`opendexter_release_tool_env_forbidden:${key}`),
    );
  }

  const marker = '/tmp/opendexter-hostile-npm-marker';
  const clean = reviewedReleaseToolEnvironment({
    env: {
      HOME: '/tmp',
      npm_config_userconfig: marker,
      npm_config_node_options: `--require=${marker}`,
      npm_config_script_shell: marker,
    },
  });
  assert.equal(clean.npm_config_userconfig, '/dev/null');
  assert.equal(clean.npm_config_node_options, undefined);
  assert.equal(clean.npm_config_script_shell, undefined);
  assert.equal(Object.values(clean).some((value) => value.includes(marker)), false);
});

test('descriptor archive preflight rejects replace refs and any revision other than HEAD', async (t) => {
  const directory = descriptorSourceFixture('npm@0.0.1');
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  writeFileSync(join(directory, 'second.txt'), 'second\n');
  execFileSync('git', ['add', 'second.txt'], { cwd: directory });
  execFileSync('git', ['commit', '-qm', 'second'], { cwd: directory });

  await assert.rejects(
    materializeOpenToolDescriptorsFromGit({
      sourceRoot: directory,
      revision: 'HEAD~1',
    }),
    /revision must be the clean checkout HEAD/,
  );

  execFileSync('git', ['replace', 'HEAD~1', 'HEAD'], { cwd: directory });
  await assert.rejects(
    materializeOpenToolDescriptorsFromGit({ sourceRoot: directory }),
    /contains Git replace refs/,
  );
});

test('source materializer emits one deterministic full hosted descriptor', async () => {
  const first = await materializeOpenToolDescriptorsFromRegistrations();
  const second = await materializeOpenToolDescriptorsFromRegistrations();
  assert.equal(
    serializeOpenToolDescriptors(first),
    serializeOpenToolDescriptors(second),
  );

  const descriptor = first;
  assert.equal(descriptor.schemaVersion, 2);
  assert.equal(descriptor.kind, 'opendexter-hosted-tool-descriptors/v2');
  assert.deepEqual(descriptor.sourceContracts, JSON.parse(readFileSync(
    new URL('../release/opendexter-source-contracts.json', import.meta.url),
    'utf8',
  )));
  assert.equal(descriptor.sourceContracts.schemaVersion, 3);
  assert.equal(descriptor.sourceContracts.kind, 'opendexter-source-contracts/v3');
  const acceptedProduction = JSON.parse(readFileSync(
    new URL('../release/opendexter-accepted-production.json', import.meta.url),
    'utf8',
  ));
  assert.equal(
    descriptor.sourceContracts.api.commit,
    'fa0701b67625911b8ec97a5399f62ec97a69f976',
  );
  assert.equal(
    descriptor.sourceContracts.api.tree,
    'dcee95df1d92018b8fcd8b43645fe63211383274',
  );
  assert.deepEqual(descriptor.sourceContracts.integratedApiRelease, {
    repository: 'https://github.com/Dexter-DAO/dexter-api',
    commit: acceptedProduction.api.sourceCommit,
    tree: acceptedProduction.api.sourceTree,
    governedContractCommit: 'fa0701b67625911b8ec97a5399f62ec97a69f976',
    governedContractTree: 'dcee95df1d92018b8fcd8b43645fe63211383274',
  });
  assert.deepEqual(descriptor.sourceContracts.portfolioProjection, {
    repository: 'https://github.com/Dexter-DAO/dexter-api',
    commit: acceptedProduction.api.sourceCommit,
    tree: acceptedProduction.api.sourceTree,
    sourcePaths: [
      'src/portfolio/approvedActionTargets.ts',
      'src/routes/passkeyMcpBinding.ts',
      'src/routes/defaultGovernedDelegatedAssetActions.ts',
    ],
    fixture: {
      consumerPath:
        'tests/fixtures/opendexter-portfolio-v1-zero-holding-approved-action-targets.json',
      apiPath:
        'tests/fixtures/opendexter-portfolio-v1-zero-holding-approved-action-targets.json',
      sha256:
        '9c4c29b0d911b490d53a375eca1ae302501397be9c56250591bafaeb34a4e625',
      canonicalDigest:
        'f4a3f826aa1c08531d42da402f08df709642ea75a84fd74608be75cdba2fc28a',
    },
  });
  assert.equal(
    descriptor.sourceContracts.facilitator.commit,
    acceptedProduction.facilitator.sourceCommit,
  );
  assert.equal(
    descriptor.sourceContracts.facilitator.tree,
    acceptedProduction.facilitator.sourceTree,
  );
  assert.equal(
    descriptor.sourceContracts.facilitator.bindingFixture.sha256,
    '66bbd343637fe9b3af245b2ace823a9dff1d8032e2dd01da7ee4bd71cc1ff7d6',
  );
  assert.equal(
    descriptor.sourceContracts.mcp.commit,
    '0647bbdf081733ac3ca5ba82850c2c1db79307cb',
  );
  assert.equal(
    execFileSync('git', [
      'rev-parse', `${descriptor.sourceContracts.mcp.commit}^{tree}`,
    ], {
      cwd: fileURLToPath(new URL('..', import.meta.url)),
      encoding: 'utf8',
    }).trim(),
    descriptor.sourceContracts.mcp.tree,
  );
  assert.deepEqual(descriptor.oauth, {
    mode: 'required',
    resource: 'https://open.dexter.cash/mcp',
    protectedResourceMetadata:
      'https://open.dexter.cash/.well-known/oauth-protected-resource/mcp',
    protectedResourcePaths: [
      '/.well-known/oauth-protected-resource',
      '/.well-known/oauth-protected-resource/mcp',
    ],
    authorizationServer: 'https://mcp.dexter.cash/mcp',
    authorizationServerMetadata:
      'https://mcp.dexter.cash/.well-known/oauth-authorization-server/mcp',
    tokenIssuer: 'https://dexter.cash',
    scopesSupported: ['vault'],
    challengeRequiredParameters: [
      'resource_metadata',
      'scope',
    ],
  });
  assert.deepEqual(descriptor.anonymousToolNames, ANONYMOUS);
  assert.deepEqual(descriptor.oauthPromotedToolNames, PROMOTED);
  assert.deepEqual(descriptor.connectedToolNames, CONNECTED);
  assert.deepEqual(descriptor.optionalOAuthToolNames, []);
  assert.deepEqual(descriptor.tools.map((tool) => tool.name), CONNECTED);

  for (const tool of descriptor.tools) {
    assert.equal(typeof tool.title, 'string', `${tool.name} title`);
    assert.ok(tool.title.length > 0, `${tool.name} title`);
    assert.equal(typeof tool.description, 'string', `${tool.name} description`);
    assert.ok(tool.description.length > 0, `${tool.name} description`);
    assert.equal(tool.inputSchema.type, 'object', `${tool.name} input schema`);
    assert.equal(tool.outputSchema.type, 'object', `${tool.name} output schema`);
    assert.ok(tool.securitySchemes.length > 0, `${tool.name} security`);
    assert.ok(tool._meta.ui.visibility.length > 0, `${tool.name} visibility`);
    assert.equal(
      typeof tool._meta['openai/widgetAccessible'],
      'boolean',
      `${tool.name} widget`,
    );
    for (const hint of [
      'readOnlyHint',
      'destructiveHint',
      'idempotentHint',
      'openWorldHint',
    ]) {
      assert.equal(typeof tool.annotations[hint], 'boolean', `${tool.name} ${hint}`);
    }
  }

  const search = descriptor.tools.find(({ name }) => name === 'indexter_search');
  const access = descriptor.tools.find(({ name }) => name === 'x402_access');
  const prepare = descriptor.tools.find(
    ({ name }) => name === 'dexter_prepare_asset_action',
  );
  const reconcile = descriptor.tools.find(
    ({ name }) => name === 'dexter_reconcile_asset_action',
  );
  assert.deepEqual(search.annotations, {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  });
  assert.deepEqual(prepare.annotations, {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  });
  assert.deepEqual(reconcile.annotations, {
    readOnlyHint: false,
    destructiveHint: true,
    idempotentHint: true,
    openWorldHint: true,
  });
  assert.deepEqual(
    Object.keys(access.inputSchema.properties).sort(),
    ['body', 'method', 'url'],
  );
  assert.equal(search._meta['ui/resourceUri'], search._meta.ui.resourceUri);
  assert.equal(search._meta['openai/outputTemplate'], search._meta.ui.resourceUri);
  assert.equal(search._meta['openai/widgetDomain'], search._meta.ui.domain);
  assert.deepEqual(
    search._meta['openai/widgetCSP'].resource_domains,
    search._meta.ui.csp.resourceDomains,
  );
  assert.deepEqual(
    search._meta['openai/widgetCSP'].connect_domains,
    search._meta.ui.csp.connectDomains.filter(
      (domain) => domain !== 'https://dexter.cash',
    ),
  );
  assert.equal(search._meta['openai/toolInvocation/invoking'], 'Opening Indexter…');
  assert.equal(search._meta['openai/toolInvocation/invoked'], 'Indexter results ready');
  assert.deepEqual(search._meta.securitySchemes, search.securitySchemes);

  const portfolio = descriptor.tools.find(
    ({ name }) => name === 'dexter_wallet_portfolio',
  );
  const targets =
    portfolio.outputSchema.properties.portfolio.properties.approvedActionTargets;
  assert.equal(targets.type, 'array');
  assert.equal(targets.maxItems, 128);
  assert.deepEqual(
    targets.items.properties.actions.items.properties.action.enum,
    ['buy', 'sell', 'send'],
  );
  assert.equal(
    targets.items.properties.assetId.pattern,
    '^[a-z0-9][a-z0-9._:-]{0,127}$',
  );
});

test('descriptor check is byte-exact and refuses schema or OAuth drift', async (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'opendexter-descriptor-'));
  const descriptorPath = join(directory, 'open-tool-descriptors.json');
  t.after(() => rmSync(directory, { recursive: true, force: true }));

  const descriptor = await materializeOpenToolDescriptorsFromRegistrations();
  const expected = serializeOpenToolDescriptors(descriptor);
  await writeOpenToolDescriptor({ descriptorPath, descriptor });
  assert.equal(readFileSync(descriptorPath, 'utf8'), expected);
  assert.equal(
    await verifyOpenToolDescriptor({ descriptorPath, descriptor }),
    descriptorPath,
  );

  const schemaDrift = JSON.parse(expected);
  schemaDrift.tools[0].inputSchema = { type: 'string' };
  writeFileSync(descriptorPath, `${JSON.stringify(schemaDrift, null, 2)}\n`);
  await assert.rejects(
    verifyOpenToolDescriptor({ descriptorPath, descriptor }),
    /differs from the finalized hosted tools/,
  );

  const missingMeta = JSON.parse(expected);
  delete missingMeta.tools[0]._meta['openai/outputTemplate'];
  writeFileSync(descriptorPath, `${JSON.stringify(missingMeta, null, 2)}\n`);
  await assert.rejects(
    verifyOpenToolDescriptor({ descriptorPath, descriptor }),
    /differs from the finalized hosted tools/,
  );

  const inventedMeta = JSON.parse(expected);
  inventedMeta.tools[0]._meta['openai/inventedReleaseClaim'] = true;
  writeFileSync(descriptorPath, `${JSON.stringify(inventedMeta, null, 2)}\n`);
  await assert.rejects(
    verifyOpenToolDescriptor({ descriptorPath, descriptor }),
    /differs from the finalized hosted tools/,
  );

  const oauthDrift = JSON.parse(expected);
  oauthDrift.oauth.mode = 'mixed';
  writeFileSync(descriptorPath, `${JSON.stringify(oauthDrift, null, 2)}\n`);
  await assert.rejects(
    verifyOpenToolDescriptor({ descriptorPath, descriptor }),
    /differs from the finalized hosted tools/,
  );
});

test('descriptor fields equal an actual finalized SDK tools/list projection', async (t) => {
  const [
    { Client },
    { InMemoryTransport },
    { createOpenMcpServer },
    { OPEN_TOOL_NAMES },
    { installCanonicalSecuritySchemeProjection },
  ] = await Promise.all([
    import('@modelcontextprotocol/sdk/client/index.js'),
    import('@modelcontextprotocol/sdk/inMemory.js'),
    import('../open-mcp-server.mjs'),
    import('../lib/open-tool-contracts.mjs'),
    import('../lib/open-tool-auth.mjs'),
  ]);
  const server = createOpenMcpServer({
    includeResources: false,
    listedToolNames: () => OPEN_TOOL_NAMES,
  });
  const client = new Client({ name: 'descriptor-client', version: '1.0.0' });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const wireMessages = [];
  const rawSend = serverTransport.send.bind(serverTransport);
  serverTransport.send = (message, options) => {
    wireMessages.push(message);
    return rawSend(message, options);
  };
  installCanonicalSecuritySchemeProjection(serverTransport);
  t.after(async () => {
    await client.close();
    await server.close();
  });
  await Promise.all([
    server.connect(serverTransport),
    client.connect(clientTransport),
  ]);

  const descriptor = await materializeOpenToolDescriptorsFromRegistrations();
  await client.listTools();
  const wireTools = wireMessages.find(
    (message) => Array.isArray(message?.result?.tools),
  )?.result?.tools;
  assert.ok(wireTools);
  assert.deepEqual(descriptor.tools, wireTools);
});

test('descriptor materialization refuses unfinalized, missing, or disabled tools', async () => {
  const [
    { McpServer },
    {
      OPEN_TOOL_NAMES,
      buildHostedOpenToolDescriptor,
      finalizeOpenToolContracts,
      installOpenToolContracts,
    },
  ] = await Promise.all([
    import('@modelcontextprotocol/sdk/server/mcp.js'),
    import('../lib/open-tool-contracts.mjs'),
  ]);
  const server = new McpServer({ name: 'descriptor-failure-test', version: '1' });
  installOpenToolContracts(server);
  assert.throws(
    () => buildHostedOpenToolDescriptor(server),
    /must be installed and finalized/,
  );
  for (const name of OPEN_TOOL_NAMES) {
    server.registerTool(name, { inputSchema: {} }, async () => ({ content: [] }));
  }
  finalizeOpenToolContracts(server);

  const first = OPEN_TOOL_NAMES[0];
  const registered = server.__openToolContractRegistry.get(first);
  server.__openToolContractRegistry.delete(first);
  assert.throws(
    () => buildHostedOpenToolDescriptor(server),
    /is not enabled in the executable registry/,
  );
  server.__openToolContractRegistry.set(first, registered);
  registered.enabled = false;
  assert.throws(
    () => buildHostedOpenToolDescriptor(server),
    /is not enabled in the executable registry/,
  );
});

test('direct server execution still binds and serves health', async (t) => {
  const probe = createServer();
  await new Promise((resolve, reject) => {
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', resolve);
  });
  const address = probe.address();
  const port = typeof address === 'object' && address ? address.port : null;
  await new Promise((resolve, reject) => probe.close((error) => (
    error ? reject(error) : resolve()
  )));
  assert.ok(port);

  const child = spawn(process.execPath, [
    fileURLToPath(new URL('../open-mcp-server.mjs', import.meta.url)),
  ], {
    cwd: fileURLToPath(new URL('..', import.meta.url)),
    env: {
      ...process.env,
      OPEN_MCP_PORT: String(port),
      GOVERNED_AGENT_ACTIONS_HMAC_SECRET: 's'.repeat(32),
      SENTRY_DSN: '',
      SENTRY_OPEN_MCP_DSN: '',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  t.after(() => child.kill('SIGTERM'));
  let output = '';
  child.stdout.on('data', (chunk) => { output += chunk; });
  child.stderr.on('data', (chunk) => { output += chunk; });
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error(`OpenDexter server did not start: ${output}`)),
      8_000,
    );
    const poll = () => {
      if (output.includes(`listening on :${port}`)) {
        clearTimeout(timeout);
        resolve();
      } else if (child.exitCode !== null) {
        clearTimeout(timeout);
        reject(new Error(`OpenDexter server exited early: ${output}`));
      } else {
        setTimeout(poll, 20);
      }
    };
    poll();
  });
  const response = await fetch(`http://127.0.0.1:${port}/health`);
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.name, 'OpenDexter');
  assert.deepEqual(body.tools, CONNECTED);
});
