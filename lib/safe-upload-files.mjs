import { readFile, realpath, stat } from 'node:fs/promises';
import { basename, isAbsolute, relative, resolve } from 'node:path';

export const DEFAULT_MULTIPART_MAX_BYTES = 200 * 1024 * 1024;

function isInsideRoot(root, candidate) {
  const rel = relative(root, candidate);
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
}

function safeFieldName(value) {
  return typeof value === 'string' && /^[a-zA-Z0-9_.[\]-]{1,128}$/.test(value);
}

function safeContentType(value) {
  return (
    value === undefined ||
    (typeof value === 'string' &&
      value.length <= 128 &&
      /^[a-zA-Z0-9!#$&^_.+*/-]+$/.test(value))
  );
}

/**
 * Load server-side multipart files only from an explicitly configured upload
 * root. `realpath()` checks both root and candidate so traversal and symlinks
 * cannot escape the boundary. Hosted OpenDexter leaves the root unset by
 * default, disabling filesystem uploads instead of exposing arbitrary paths.
 */
export async function loadSafeUploadFiles(
  files,
  {
    uploadRoot = process.env.OPEN_MCP_UPLOAD_ROOT,
    maxBytes = DEFAULT_MULTIPART_MAX_BYTES,
  } = {},
) {
  const configuredRoot = String(uploadRoot || '').trim();
  if (!configuredRoot) {
    throw new Error(
      'multipart_file_uploads_disabled: OPEN_MCP_UPLOAD_ROOT is not configured',
    );
  }
  const rootPath = await realpath(resolve(configuredRoot));
  const rootInfo = await stat(rootPath);
  if (!rootInfo.isDirectory()) {
    throw new Error('multipart_upload_root_invalid: configured root is not a directory');
  }

  const loaded = [];
  let total = 0;
  for (const file of files) {
    if (!file || typeof file !== 'object' || !safeFieldName(file.fieldName) || !file.path) {
      throw new Error(
        'multipart.files entries must include a safe { fieldName, path }',
      );
    }
    if (!isAbsolute(file.path)) {
      throw new Error('multipart file paths must be absolute');
    }
    if (!safeContentType(file.contentType)) {
      throw new Error(`multipart.files[${file.fieldName}]: invalid content type`);
    }

    const candidate = await realpath(resolve(file.path));
    if (!isInsideRoot(rootPath, candidate)) {
      throw new Error(
        `multipart.files[${file.fieldName}]: path is outside OPEN_MCP_UPLOAD_ROOT`,
      );
    }
    const info = await stat(candidate);
    if (!info.isFile()) {
      throw new Error(`multipart.files[${file.fieldName}]: not a regular file`);
    }
    total += info.size;
    if (info.size > maxBytes || total > maxBytes) {
      throw new Error(`multipart payload exceeds ${maxBytes} bytes`);
    }
    const data = await readFile(candidate);
    loaded.push({
      fieldName: file.fieldName,
      filename: basename(file.filename || candidate),
      mimeType: file.contentType || 'application/octet-stream',
      data,
    });
  }
  return loaded;
}
