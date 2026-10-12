// -----------------------------------------------------------------------------
// Nachbildung der Storage-API fuer den Cloud-Stack (scripts/cloud-stack.sh).
//
// Die echte Storage-API (supabase/storage) gibt es nur als Container-Image,
// und Container laufen in der Cloud-Umgebung nicht. Nachgebildet ist der Teil,
// den die Anwendung und die E2E-Tests benutzen - hochladen, signieren, laden,
// auflisten, loeschen - und zwar an der Stelle, auf die es ankommt: Jeder
// Zugriff laeuft wie bei der echten API in einer Transaktion mit der Rolle und
// den JWT-Claims der anfragenden Person (`set_config('role', ...)`,
// `request.jwt.claims`) und mit der Operation in `storage.operation`. Die
// RLS-Policies aus den Migrationen entscheiden also genauso wie dort; hier
// wird nichts erlaubt, was die Datenbank nicht erlaubt.
//
// Die Bytes liegen unter .tmp/stack/storage/<bucket>/<name>. Nicht
// nachgebildet: Bildtransformation, TUS/Resumable, S3-Protokoll,
// Bucket-Verwaltung ueber die API. Solche Aufrufe beantwortet die Nachbildung
// mit 501 und einer Meldung, die das sagt.
// -----------------------------------------------------------------------------
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import pg from 'pg';
import { signJwt, verifyJwt } from './jwt.mjs';

const API_ROLES = new Set(['anon', 'authenticated', 'service_role']);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

class StorageError extends Error {
  constructor(httpStatus, statusCode, error, message) {
    super(message);
    this.httpStatus = httpStatus;
    this.statusCode = statusCode;
    this.error = error;
  }
}

const notFound = () => new StorageError(400, '404', 'not_found', 'Object not found');

/** Uebersetzt einen Datenbankfehler so, wie die Storage-API ihn meldet. */
function fromDatabaseError(cause) {
  if (cause instanceof StorageError) return cause;
  const code = cause?.code;
  if (code === '42501') {
    return new StorageError(400, '403', 'Unauthorized', cause.message);
  }
  if (code === '23505') {
    return new StorageError(400, '409', 'Duplicate', 'The resource already exists');
  }
  if (typeof code === 'string' && code.length === 5) {
    return new StorageError(400, '400', 'DatabaseError', cause.message);
  }
  return new StorageError(500, '500', 'internal', String(cause?.message ?? cause));
}

/**
 * Zerlegt einen Objektnamen und weist alles ab, was aus dem Bucket fuehren
 * koennte. Segmente aus dem Adresspfad sind URL-kodiert, Pfade aus einem
 * JSON-Koerper nicht.
 */
function objectSegments(rawSegments, { encoded = true } = {}) {
  let segments;
  try {
    segments = encoded ? rawSegments.map((segment) => decodeURIComponent(segment)) : rawSegments;
  } catch {
    throw new StorageError(400, '400', 'InvalidKey', 'Invalid key');
  }
  if (
    segments.length === 0 ||
    segments.some(
      (segment) =>
        segment === '' ||
        segment === '.' ||
        segment === '..' ||
        segment.includes('\\') ||
        segment.includes('\0'),
    )
  ) {
    throw new StorageError(400, '400', 'InvalidKey', 'Invalid key');
  }
  return segments;
}

function parseMetadata(text) {
  try {
    return JSON.parse(text);
  } catch {
    throw new StorageError(400, '400', 'InvalidRequest', 'metadata is not valid JSON');
  }
}

function mimeAllowed(mimetype, allowed) {
  if (!Array.isArray(allowed) || allowed.length === 0) return true;
  const base = mimetype.split(';')[0].trim().toLowerCase();
  return allowed.some((entry) => {
    const pattern = String(entry).toLowerCase();
    return pattern.endsWith('/*') ? base.startsWith(pattern.slice(0, -1)) : base === pattern;
  });
}

export function createStorage({ databaseUrl, storageDir, jwtSecret, globalFileSizeLimit }) {
  const pool = new pg.Pool({ connectionString: databaseUrl, max: 5 });
  const root = path.resolve(storageDir);

  function filePath(bucket, segments) {
    const target = path.resolve(root, bucket, ...segments);
    if (!target.startsWith(root + path.sep)) {
      throw new StorageError(400, '400', 'InvalidKey', 'Invalid key');
    }
    return target;
  }

  /** Eine Transaktion mit Rolle, Claims und Operation der Anfrage - wie die Storage-API. */
  async function asRequester(claims, operation, work) {
    const role = API_ROLES.has(claims.role) ? claims.role : 'anon';
    const client = await pool.connect();
    try {
      await client.query('begin');
      await client.query(
        `select set_config('role', $1, true),
                set_config('request.jwt.claims', $2, true),
                set_config('request.jwt.claim.sub', $3, true),
                set_config('request.jwt.claim.role', $1, true),
                set_config('storage.operation', $4, true)`,
        [role, JSON.stringify(claims), typeof claims.sub === 'string' ? claims.sub : '', operation],
      );
      const result = await work(client);
      await client.query('commit');
      return result;
    } catch (cause) {
      await client.query('rollback').catch(() => undefined);
      throw fromDatabaseError(cause);
    } finally {
      client.release();
    }
  }

  async function findBucket(bucket) {
    const { rows } = await pool.query(
      'select id, public, file_size_limit, allowed_mime_types from storage.buckets where id = $1',
      [bucket],
    );
    if (rows.length === 0)
      throw new StorageError(400, '404', 'Bucket not found', 'Bucket not found');
    return rows[0];
  }

  async function readUpload(request, body) {
    const contentType = request.headers['content-type'] ?? '';
    if (contentType.startsWith('multipart/form-data')) {
      const form = await new Request('http://storage.invalid/', {
        method: 'POST',
        headers: { 'content-type': contentType },
        body,
      }).formData();
      let file = null;
      let cacheControl = 'no-cache';
      let userMetadata = null;
      for (const [key, value] of form) {
        if (typeof value !== 'string') file = value;
        else if (key === 'cacheControl' && value !== '') cacheControl = `max-age=${value}`;
        else if (key === 'metadata') userMetadata = parseMetadata(value);
      }
      if (!file) throw new StorageError(400, '400', 'InvalidRequest', 'No file found in request');
      return {
        data: Buffer.from(await file.arrayBuffer()),
        mimetype: file.type || 'application/octet-stream',
        cacheControl,
        userMetadata,
      };
    }
    const metadataHeader = request.headers['x-metadata'];
    return {
      data: body,
      mimetype: contentType || 'application/octet-stream',
      cacheControl: request.headers['cache-control'] ?? 'no-cache',
      userMetadata:
        typeof metadataHeader === 'string'
          ? parseMetadata(Buffer.from(metadataHeader, 'base64').toString('utf8'))
          : null,
    };
  }

  async function upload(request, claims, bucket, segments, body, upsert, operation) {
    const name = segments.join('/');
    const target = filePath(bucket, segments);
    const bucketRow = await findBucket(bucket);
    const { data, mimetype, cacheControl, userMetadata } = await readUpload(request, body);

    const limit = Math.min(
      Number(bucketRow.file_size_limit ?? globalFileSizeLimit),
      globalFileSizeLimit,
    );
    if (data.length > limit) {
      throw new StorageError(
        400,
        '413',
        'Payload too large',
        'The object exceeded the maximum allowed size',
      );
    }
    if (!mimeAllowed(mimetype, bucketRow.allowed_mime_types)) {
      throw new StorageError(
        400,
        '415',
        'invalid_mime_type',
        `mime type ${mimetype} is not supported`,
      );
    }

    const metadata = {
      eTag: `"${createHash('md5').update(data).digest('hex')}"`,
      size: data.length,
      mimetype,
      cacheControl,
      lastModified: new Date().toUTCString(),
      contentLength: data.length,
      httpStatusCode: 200,
    };
    const owner = typeof claims.sub === 'string' && UUID.test(claims.sub) ? claims.sub : null;
    const ownerId = typeof claims.sub === 'string' ? claims.sub : null;
    const version = randomUUID();

    const id = await asRequester(claims, operation, async (client) => {
      let objectId = randomUUID();
      if (upsert) {
        // Wie die Storage-API (upsertObject): ON CONFLICT mit RETURNING -
        // dafuer braucht es neben INSERT auch UPDATE- und SELECT-Policies.
        const { rows } = await client.query(
          `insert into storage.objects (id, bucket_id, name, owner, owner_id, metadata, version, user_metadata)
           values ($1, $2, $3, $4, $5, $6, $7, $8)
           on conflict (bucket_id, name) do update
             set metadata = excluded.metadata, version = excluded.version,
                 owner = excluded.owner, owner_id = excluded.owner_id,
                 user_metadata = excluded.user_metadata, updated_at = now()
           returning id`,
          [objectId, bucket, name, owner, ownerId, metadata, version, userMetadata],
        );
        objectId = rows[0]?.id ?? objectId;
      } else {
        // Wie die Storage-API (createObject): ein reines INSERT ohne RETURNING.
        await client.query(
          `insert into storage.objects (id, bucket_id, name, owner, owner_id, metadata, version, user_metadata)
           values ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [objectId, bucket, name, owner, ownerId, metadata, version, userMetadata],
        );
      }
      // Erst schreiben, dann festschreiben: scheitert die Datei, rollt die Zeile zurueck.
      // eslint-disable-next-line security/detect-non-literal-fs-filename -- filePath() haelt den Pfad im Bucket
      await mkdir(path.dirname(target), { recursive: true });
      // eslint-disable-next-line security/detect-non-literal-fs-filename -- filePath() haelt den Pfad im Bucket
      await writeFile(target, data);
      return objectId;
    });
    return { Key: `${bucket}/${name}`, Id: id };
  }

  async function sign(claims, bucket, name, expiresIn) {
    const seconds = Number(expiresIn);
    if (!Number.isFinite(seconds) || seconds < 1) {
      throw new StorageError(400, '400', 'InvalidRequest', 'expiresIn must be a positive number');
    }
    await asRequester(claims, 'storage.object.sign', async (client) => {
      const { rows } = await client.query(
        'select id from storage.objects where bucket_id = $1 and name = $2',
        [bucket, name],
      );
      if (rows.length === 0) throw notFound();
    });
    const now = Math.floor(Date.now() / 1000);
    const token = signJwt(
      { url: `${bucket}/${name}`, iat: now, exp: now + Math.floor(seconds) },
      jwtSecret,
    );
    const encoded = name.split('/').map(encodeURIComponent).join('/');
    return `/object/sign/${bucket}/${encoded}?token=${token}`;
  }

  async function sendObject(request, response, bucket, segments, metadata, download) {
    let data;
    try {
      // eslint-disable-next-line security/detect-non-literal-fs-filename -- filePath() haelt den Pfad im Bucket
      data = await readFile(filePath(bucket, segments));
    } catch {
      throw notFound();
    }
    const headers = {
      'content-type': metadata?.mimetype ?? 'application/octet-stream',
      'content-length': String(data.length),
      'cache-control': metadata?.cacheControl ?? 'no-cache',
    };
    if (metadata?.eTag) headers.etag = metadata.eTag;
    if (metadata?.lastModified) headers['last-modified'] = metadata.lastModified;
    if (download !== null) {
      const fileName = download || segments[segments.length - 1];
      headers['content-disposition'] =
        `attachment; filename="${fileName.replace(/[^\x20-\x7e]|"/g, '_')}"; ` +
        `filename*=UTF-8''${encodeURIComponent(fileName)}`;
    }
    response.writeHead(200, headers);
    response.end(request.method === 'HEAD' ? undefined : data);
  }

  async function readMetadataAs(claims, operation, bucket, name) {
    return asRequester(claims, operation, async (client) => {
      const { rows } = await client.query(
        'select metadata from storage.objects where bucket_id = $1 and name = $2',
        [bucket, name],
      );
      if (rows.length === 0) throw notFound();
      return rows[0].metadata;
    });
  }

  /**
   * Kopieren und Verschieben wie die Storage-API: Die Quelle liest die
   * anfragende Rolle (SELECT unter RLS), das Ziel legt sie an (INSERT unter
   * RLS), beim Verschieben loescht sie zusaetzlich die Quelle (DELETE unter
   * RLS) - alles in einer Transaktion.
   */
  async function copyOrMove(request, claims, input, move) {
    const sourceBucket = String(input.bucketId ?? '');
    const targetBucket = String(input.destinationBucket ?? sourceBucket);
    const sourceSegments = objectSegments(String(input.sourceKey ?? '').split('/'), {
      encoded: false,
    });
    const targetSegments = objectSegments(String(input.destinationKey ?? '').split('/'), {
      encoded: false,
    });
    const sourceName = sourceSegments.join('/');
    const targetName = targetSegments.join('/');
    const sourceFile = filePath(sourceBucket, sourceSegments);
    const targetFile = filePath(targetBucket, targetSegments);
    await findBucket(targetBucket);
    const upsert = request.headers['x-upsert'] === 'true';

    return asRequester(
      claims,
      move ? 'storage.object.move' : 'storage.object.copy',
      async (client) => {
        const { rows } = await client.query(
          'select metadata, user_metadata from storage.objects where bucket_id = $1 and name = $2',
          [sourceBucket, sourceName],
        );
        if (rows.length === 0) throw notFound();
        const objectId = randomUUID();
        const owner = typeof claims.sub === 'string' && UUID.test(claims.sub) ? claims.sub : null;
        const values = [
          objectId,
          targetBucket,
          targetName,
          owner,
          typeof claims.sub === 'string' ? claims.sub : null,
          rows[0].metadata,
          randomUUID(),
          rows[0].user_metadata,
        ];
        await client.query(
          `insert into storage.objects (id, bucket_id, name, owner, owner_id, metadata, version, user_metadata)
         values ($1, $2, $3, $4, $5, $6, $7, $8)` +
            (upsert && !move
              ? ` on conflict (bucket_id, name) do update
                  set metadata = excluded.metadata, version = excluded.version,
                      owner = excluded.owner, owner_id = excluded.owner_id,
                      user_metadata = excluded.user_metadata, updated_at = now()`
              : ''),
          values,
        );
        if (move) {
          const removed = await client.query(
            'delete from storage.objects where bucket_id = $1 and name = $2 returning id',
            [sourceBucket, sourceName],
          );
          if (removed.rows.length === 0) throw notFound();
        }
        // eslint-disable-next-line security/detect-non-literal-fs-filename -- filePath() haelt den Pfad im Bucket
        const data = await readFile(sourceFile);
        // eslint-disable-next-line security/detect-non-literal-fs-filename -- filePath() haelt den Pfad im Bucket
        await mkdir(path.dirname(targetFile), { recursive: true });
        // eslint-disable-next-line security/detect-non-literal-fs-filename -- filePath() haelt den Pfad im Bucket
        await writeFile(targetFile, data);
        if (move) await rm(sourceFile, { force: true });
        return move
          ? { message: 'Successfully moved' }
          : { Key: `${targetBucket}/${targetName}`, Id: objectId };
      },
    );
  }

  async function removeFiles(bucket, names) {
    for (const name of names) {
      await rm(filePath(bucket, name.split('/')), { force: true });
    }
  }

  function json(response, status, payload) {
    response.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
    response.end(JSON.stringify(payload));
  }

  function parseJson(body) {
    if (body.length === 0) return {};
    try {
      return JSON.parse(body.toString('utf8'));
    } catch {
      throw new StorageError(400, '400', 'InvalidRequest', 'Body is not valid JSON');
    }
  }

  /**
   * Beantwortet eine Anfrage unter /storage/v1. `claims` sind die gepruefte
   * Nutzlast des Tokens der Anfrage (anon, wenn keines kam).
   */
  async function handle(request, response, url, claims, body) {
    const parts = url.pathname.split('/').filter((part) => part !== '');
    const method = request.method ?? 'GET';
    const read = method === 'GET' || method === 'HEAD';
    try {
      const [area, second, third, ...rest] = parts;

      if (area === 'object' && second === 'sign' && third && read) {
        const segments = objectSegments(rest);
        const name = segments.join('/');
        const payload = verifyJwt(url.searchParams.get('token') ?? '', jwtSecret);
        if (!payload || payload.url !== `${third}/${name}`) {
          throw new StorageError(400, '400', 'InvalidSignature', 'invalid signature');
        }
        const { rows } = await pool.query(
          'select metadata from storage.objects where bucket_id = $1 and name = $2',
          [third, name],
        );
        if (rows.length === 0) throw notFound();
        return await sendObject(
          request,
          response,
          third,
          segments,
          rows[0].metadata,
          url.searchParams.get('download'),
        );
      }

      if (area === 'object' && second === 'sign' && third && method === 'POST') {
        const input = parseJson(body);
        if (rest.length === 0) {
          const paths = Array.isArray(input.paths) ? input.paths : [];
          const result = [];
          for (const objectPath of paths) {
            try {
              const signedURL = await sign(
                claims,
                third,
                objectSegments(String(objectPath).split('/'), { encoded: false }).join('/'),
                input.expiresIn,
              );
              result.push({ error: null, path: objectPath, signedURL });
            } catch (cause) {
              result.push({
                error: fromDatabaseError(cause).message,
                path: objectPath,
                signedURL: null,
              });
            }
          }
          return json(response, 200, result);
        }
        const signedURL = await sign(
          claims,
          third,
          objectSegments(rest).join('/'),
          input.expiresIn,
        );
        return json(response, 200, { signedURL });
      }

      if (
        area === 'object' &&
        (second === 'copy' || second === 'move') &&
        !third &&
        method === 'POST'
      ) {
        return json(
          response,
          200,
          await copyOrMove(request, claims, parseJson(body), second === 'move'),
        );
      }

      if (area === 'object' && second === 'list' && third && method === 'POST') {
        const input = parseJson(body);
        let prefix = typeof input.prefix === 'string' ? input.prefix : '';
        if (prefix.length > 0 && !prefix.endsWith('/')) prefix += '/';
        const levels = prefix === '' ? 1 : prefix.split('/').length;
        const rows = await asRequester(claims, 'storage.object.list', async (client) => {
          const result = await client.query(
            'select * from storage.search($1, $2, $3, $4, $5, $6, $7, $8)',
            [
              prefix,
              third,
              Number(input.limit ?? 100),
              levels,
              Number(input.offset ?? 0),
              typeof input.search === 'string' ? input.search : '',
              input.sortBy?.column ?? 'name',
              input.sortBy?.order ?? 'asc',
            ],
          );
          return result.rows;
        });
        return json(response, 200, rows);
      }

      if (
        area === 'object' &&
        (second === 'authenticated' || second === 'public') &&
        third &&
        read
      ) {
        const segments = objectSegments(rest);
        const name = segments.join('/');
        let metadata;
        if (second === 'public') {
          const bucketRow = await findBucket(third);
          if (!bucketRow.public) throw notFound();
          const { rows } = await pool.query(
            'select metadata from storage.objects where bucket_id = $1 and name = $2',
            [third, name],
          );
          if (rows.length === 0) throw notFound();
          metadata = rows[0].metadata;
        } else {
          metadata = await readMetadataAs(claims, 'storage.object.get_authenticated', third, name);
        }
        return await sendObject(
          request,
          response,
          third,
          segments,
          metadata,
          url.searchParams.get('download'),
        );
      }

      if (
        area === 'object' &&
        second &&
        !['sign', 'list', 'authenticated', 'public', 'info', 'move', 'copy', 'upload'].includes(
          second,
        )
      ) {
        const bucket = second;
        const objectParts = [third, ...rest].filter((part) => part !== undefined);

        if (method === 'DELETE' && objectParts.length === 0) {
          const input = parseJson(body);
          const prefixes = Array.isArray(input.prefixes) ? input.prefixes.map(String) : [];
          const deleted = await asRequester(
            claims,
            'storage.object.delete_many',
            async (client) => {
              const { rows } = await client.query(
                `delete from storage.objects where bucket_id = $1 and name = any($2::text[])
               returning name, id, bucket_id, owner, metadata, created_at, updated_at, last_accessed_at`,
                [bucket, prefixes],
              );
              return rows;
            },
          );
          await removeFiles(
            bucket,
            deleted.map((row) => row.name),
          );
          return json(response, 200, deleted);
        }

        if (objectParts.length > 0) {
          const segments = objectSegments(objectParts);
          const name = segments.join('/');
          if (method === 'POST' || method === 'PUT') {
            const upsert = method === 'PUT' || request.headers['x-upsert'] === 'true';
            const operation =
              method === 'PUT' ? 'storage.object.upload_update' : 'storage.object.upload';
            return json(
              response,
              200,
              await upload(request, claims, bucket, segments, body, upsert, operation),
            );
          }
          if (method === 'DELETE') {
            const deleted = await asRequester(claims, 'storage.object.delete', async (client) => {
              const { rows } = await client.query(
                'delete from storage.objects where bucket_id = $1 and name = $2 returning name',
                [bucket, name],
              );
              return rows;
            });
            if (deleted.length === 0) throw notFound();
            await removeFiles(bucket, [name]);
            return json(response, 200, { message: 'Successfully deleted' });
          }
          if (read) {
            const metadata = await readMetadataAs(
              claims,
              'storage.object.get_authenticated',
              bucket,
              name,
            );
            return await sendObject(
              request,
              response,
              bucket,
              segments,
              metadata,
              url.searchParams.get('download'),
            );
          }
        }
      }

      if (area === 'bucket' && read) {
        const rows = await asRequester(claims, 'storage.bucket.list', async (client) => {
          const result = await client.query(
            `select id, name, owner, public, file_size_limit, allowed_mime_types, created_at, updated_at
             from storage.buckets ${second ? 'where id = $1' : 'order by name'}`,
            second ? [second] : [],
          );
          return result.rows;
        });
        if (second) {
          if (rows.length === 0)
            throw new StorageError(400, '404', 'Bucket not found', 'Bucket not found');
          return json(response, 200, rows[0]);
        }
        return json(response, 200, rows);
      }

      throw new StorageError(
        501,
        '501',
        'not_implemented',
        `Cloud-Stack: ${method} /storage/v1/${parts.join('/')} ist in der Nachbildung der Storage-API nicht umgesetzt (scripts/cloud-stack/storage.mjs).`,
      );
    } catch (cause) {
      const failure = fromDatabaseError(cause);
      if (response.headersSent) {
        response.destroy();
        return undefined;
      }
      return json(response, failure.httpStatus, {
        statusCode: failure.statusCode,
        error: failure.error,
        message: failure.message,
      });
    }
  }

  return {
    handle,
    close: () => pool.end(),
  };
}
