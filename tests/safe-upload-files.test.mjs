import assert from 'node:assert/strict';
import { mkdtemp, mkdir, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { loadSafeUploadFiles } from '../lib/safe-upload-files.mjs';

test('filesystem multipart is disabled unless an upload root is explicit', async () => {
  await assert.rejects(
    loadSafeUploadFiles([{ fieldName: 'file', path: '/etc/passwd' }], {
      uploadRoot: '',
    }),
    /uploads_disabled/,
  );
});

test('loader accepts regular files inside the real upload root', async () => {
  const root = await mkdtemp(join(tmpdir(), 'opendexter-upload-root-'));
  const nested = join(root, 'nested');
  await mkdir(nested);
  const file = join(nested, 'input.txt');
  await writeFile(file, 'safe payload');

  const [loaded] = await loadSafeUploadFiles(
    [
      {
        fieldName: 'document',
        path: file,
        filename: '../../sanitized.txt',
        contentType: 'text/plain',
      },
    ],
    { uploadRoot: root, maxBytes: 1024 },
  );
  assert.equal(loaded.filename, 'sanitized.txt');
  assert.equal(loaded.data.toString('utf8'), 'safe payload');
});

test('loader blocks traversal, symlink escape, secret paths, and oversized files', async () => {
  const root = await mkdtemp(join(tmpdir(), 'opendexter-upload-root-'));
  const outside = await mkdtemp(join(tmpdir(), 'opendexter-upload-outside-'));
  const secret = join(outside, '.env');
  await writeFile(secret, 'SECRET=do-not-exfiltrate');
  const link = join(root, 'looks-safe.txt');
  await symlink(secret, link);

  await assert.rejects(
    loadSafeUploadFiles([{ fieldName: 'file', path: secret }], { uploadRoot: root }),
    /outside OPEN_MCP_UPLOAD_ROOT/,
  );
  await assert.rejects(
    loadSafeUploadFiles([{ fieldName: 'file', path: link }], { uploadRoot: root }),
    /outside OPEN_MCP_UPLOAD_ROOT/,
  );

  const large = join(root, 'large.bin');
  await writeFile(large, '12345');
  await assert.rejects(
    loadSafeUploadFiles([{ fieldName: 'file', path: large }], {
      uploadRoot: root,
      maxBytes: 4,
    }),
    /payload exceeds/,
  );
});
