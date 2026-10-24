/**
 * Purge offline (en_linea=false) test businesses + related Storage objects.
 *
 * Usage:
 *   node scripts/purge-offline-test-businesses.mjs           # dry-run
 *   node scripts/purge-offline-test-businesses.mjs --execute # delete
 */
import fs from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const BUCKETS_BY_COMMERCE_PREFIX = [
  'product-images',
  'comprobantes',
  'comprobantes-suscripcion',
];

function loadEnv() {
  const envPath = new URL('../.env.local', import.meta.url);
  return Object.fromEntries(
    fs
      .readFileSync(envPath, 'utf8')
      .split(/\r?\n/)
      .filter((line) => line && !line.startsWith('#') && line.includes('='))
      .map((line) => {
        const i = line.indexOf('=');
        let value = line.slice(i + 1).trim();
        if (
          (value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))
        ) {
          value = value.slice(1, -1);
        }
        return [line.slice(0, i).trim(), value];
      }),
  );
}

function parseArgs(argv) {
  return { execute: argv.includes('--execute') };
}

function extractStoragePathFromPublicUrl(url, bucket) {
  if (!url || typeof url !== 'string') return null;
  const marker = `/object/public/${bucket}/`;
  const idx = url.indexOf(marker);
  if (idx >= 0) {
    return decodeURIComponent(url.slice(idx + marker.length).split('?')[0]);
  }
  const signed = `/object/sign/${bucket}/`;
  const sidx = url.indexOf(signed);
  if (sidx >= 0) {
    return decodeURIComponent(url.slice(sidx + signed.length).split('?')[0]);
  }
  return null;
}

async function listRecursive(supabase, bucket, prefix = '') {
  const paths = [];
  const queue = [prefix.replace(/\/+$/, '')];

  while (queue.length > 0) {
    const folder = queue.shift();
    let offset = 0;
    for (;;) {
      const { data, error } = await supabase.storage.from(bucket).list(folder || undefined, {
        limit: 100,
        offset,
        sortBy: { column: 'name', order: 'asc' },
      });
      if (error) {
        throw new Error(`[${bucket}] list ${folder || '/'}: ${error.message}`);
      }
      if (!data || data.length === 0) break;

      for (const entry of data) {
        const fullPath = folder ? `${folder}/${entry.name}` : entry.name;
        // Folders from Storage list usually have id null and no metadata size.
        const isFolder = entry.id == null && !entry.metadata;
        if (isFolder) {
          queue.push(fullPath);
        } else {
          paths.push(fullPath);
        }
      }

      if (data.length < 100) break;
      offset += data.length;
    }
  }

  return paths;
}

async function removeInBatches(supabase, bucket, paths) {
  let removed = 0;
  for (let i = 0; i < paths.length; i += 100) {
    const chunk = paths.slice(i, i + 100);
    const { error } = await supabase.storage.from(bucket).remove(chunk);
    if (error) {
      throw new Error(`[${bucket}] remove: ${error.message}`);
    }
    removed += chunk.length;
  }
  return removed;
}

async function main() {
  const { execute } = parseArgs(process.argv.slice(2));
  const env = loadEnv();
  const url = (env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL || '').trim();
  const key = (env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  if (!url || !key) {
    console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in site/.env.local');
    process.exit(1);
  }

  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: businesses, error: listError } = await supabase
    .from('comercios')
    .select('id, nombre, slug, owner_id, logo_url, en_linea, created_at')
    .eq('en_linea', false)
    .order('created_at', { ascending: true });

  if (listError) {
    console.error('Failed to list offline businesses:', listError.message);
    process.exit(1);
  }

  const targets = businesses ?? [];
  console.log(`Offline businesses (en_linea=false): ${targets.length}`);
  for (const row of targets) {
    console.log(`- ${row.nombre} | /${row.slug} | ${row.id}`);
  }

  if (targets.length === 0) {
    console.log('Nothing to purge.');
    return;
  }

  const commerceIds = targets.map((row) => row.id);
  const storagePlan = [];

  for (const bucket of BUCKETS_BY_COMMERCE_PREFIX) {
    for (const id of commerceIds) {
      const paths = await listRecursive(supabase, bucket, id);
      if (paths.length > 0) {
        storagePlan.push({ bucket, prefix: id, paths });
      }
    }
  }

  // Logos are stored under owner user id; collect explicit logo_url paths.
  const logoPaths = [];
  for (const row of targets) {
    const path = extractStoragePathFromPublicUrl(row.logo_url, 'logos-comercios');
    if (path) logoPaths.push(path);
  }
  if (logoPaths.length > 0) {
    storagePlan.push({
      bucket: 'logos-comercios',
      prefix: '(from logo_url)',
      paths: [...new Set(logoPaths)],
    });
  }

  let totalFiles = 0;
  for (const item of storagePlan) {
    totalFiles += item.paths.length;
    console.log(
      `Storage ${item.bucket}/${item.prefix}: ${item.paths.length} file(s)`,
    );
  }
  console.log(`Total storage files to remove: ${totalFiles}`);

  if (!execute) {
    console.log('\nDry-run only. Re-run with --execute to delete storage + comercios.');
    return;
  }

  console.log('\nExecuting purge…');

  for (const item of storagePlan) {
    const removed = await removeInBatches(supabase, item.bucket, item.paths);
    console.log(`Removed ${removed} from ${item.bucket}/${item.prefix}`);
  }

  // Related rows cascade from comercios in most tables.
  const { data: deleted, error: deleteError } = await supabase
    .from('comercios')
    .delete()
    .in('id', commerceIds)
    .eq('en_linea', false)
    .select('id, nombre, slug');

  if (deleteError) {
    console.error('DB delete failed:', deleteError.message);
    process.exit(1);
  }

  console.log(`Deleted comercios: ${(deleted ?? []).length}`);
  for (const row of deleted ?? []) {
    console.log(`  ✓ ${row.nombre} (/${row.slug})`);
  }

  const { count: remainingOffline } = await supabase
    .from('comercios')
    .select('id', { count: 'exact', head: true })
    .eq('en_linea', false);
  const { count: remainingTotal } = await supabase
    .from('comercios')
    .select('id', { count: 'exact', head: true });

  console.log(
    `Done. Remaining offline=${remainingOffline ?? '?'} total=${remainingTotal ?? '?'}`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
