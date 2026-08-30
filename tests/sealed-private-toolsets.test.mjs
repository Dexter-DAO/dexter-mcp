import assert from 'node:assert/strict';
import test from 'node:test';

import {
  registerSelectedToolsets,
  SEALED_PRIVATE_TOOLSET_PROFILE,
} from '../toolsets/index.mjs';

test('sealed private toolset registration fails closed on a partial roster', async () => {
  const server = {
    _registeredTools: {},
    registerTool() {
      throw new Error('forced registration failure');
    },
  };
  await assert.rejects(
    registerSelectedToolsets(server, {
      profile: SEALED_PRIVATE_TOOLSET_PROFILE,
    }),
    /sealed_private_toolset_registration_failed:general/,
  );
});
