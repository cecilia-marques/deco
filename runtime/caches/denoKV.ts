/**
 * WebCache API powered by Deno.KV
 *
 * This creates two indices on KV, one for metadata and another for body chunks.
 *
 * 1. ['CACHES', cacheName, 'metas', key] // response.status, response.headers, response.etag
 * 2. ['CACHES', cacheName, 'chunks', etag, chunkId] // response.body for response.etag
 *
 * `key` is determined after the orignal request. Etag is an uuid representing the
 * response's body version. ChunkId is the chunk number after splitting the body response's
 * into 64Kb chunks.
 *
 * How it works:
 *
 * getMedata (request):
 *    key <- sha1(request.url + request.headers)
 *
 *    return key from 'metas' index on Deno.KV
 *
 * match (request, response):
 *    metadata <- getMetadata(request)
 *
 *    if metadata not exists:
 *      return
 *
 *    etag <- metadata.etag
 *    body <- create stream from etag chunks
 *
 *    return Response(body, metadata)
 *
 * put (request, response):
 *    oldMeta <- getMetadata(request)
 *    newMeta <- { status: response.status, headers: response.headers, etag: new UUID() }
 *
 *    save chunks for response with newMetag.etag on chunks index
 *    res <- atomically replace oldMeta with newMeta
 *
 *    if (res.ok) expire oldMeta chunks
 *    else expire newMeta chunks
 */
import {
  assertCanBeCached,
  assertNoOptions,
  requestURLSHA1,
} from "./common.ts";

interface Metadata {
  body?: {
    etag: string; // body version
    chunks: number; // number of chunks in body
  } | null;
  status: number;
  headers: [string, string][];
}

type Chunk = Uint8Array;

const NAMESPACE = "CACHES";
const SMALL_EXPIRE_MS = 1_000 * 10; // 10seconds
const LARGE_EXPIRE_MS = 1_000 * 3600 * 24; // 1day

export const caches: CacheStorage = {
  delete: async (cacheName: string): Promise<boolean> => {
    const kv = await Deno.openKv();

    for await (
      const entry of kv.list({ prefix: [NAMESPACE, cacheName] })
    ) {
      await kv.delete(entry.key);
    }

    return true;
  },
  has: (_cacheName: string): Promise<boolean> => {
    throw new Error("Not Implemented");
  },
  keys: (): Promise<string[]> => {
    throw new Error("Not Implemented");
  },
  match: (
    _request: URL | RequestInfo,
    _options?: MultiCacheQueryOptions | undefined,
  ): Promise<Response | undefined> => {
    throw new Error("Not Implemented");
  },
  open: async (cacheName: string): Promise<Cache> => {
    const kv = await Deno.openKv();

    const keyForMetadata = (sha?: string) => {
      const key = [NAMESPACE, cacheName, "metas"];

      if (typeof sha === "string") {
        key.push(sha);
      }

      return key;
    };

    const keyForBodyChunk = (
      etag?: string,
      chunk?: number,
    ) => {
      const key: Array<string | number> = [NAMESPACE, cacheName, "chunks"];

      if (typeof etag === "string") {
        key.push(etag);

        if (typeof chunk === "number") {
          key.push(chunk);
        }
      }

      return key;
    };

    const removeBodyChunks = async (meta: Metadata) => {
      const { chunks, etag } = meta.body ?? {};

      if (!chunks || !etag) return;

      let ok = true;
      for (let it = 0; it < chunks; it++) {
        const key = keyForBodyChunk(etag, it);

        const chunk = await kv.get<Chunk>(key);

        if (!chunk.value) continue;

        const res = await kv
          .atomic()
          .check(chunk)
          .set(key, chunk, { expireIn: SMALL_EXPIRE_MS })
          .commit();

        ok &&= res.ok;
      }

      if (!ok) {
        throw new Error(
          `Error while reducing expire rate for chunk ${keyForBodyChunk(etag)}`,
        );
      }
    };

    const remove = async (key: string[]) => {
      const metadata = await kv.get<Metadata>(key);
      await kv.delete(key);

      if (metadata.value) {
        await removeBodyChunks(metadata.value);
      }
    };

    const keyForRequest = async (request: RequestInfo | URL) => {
      return keyForMetadata(await requestURLSHA1(request));
    };

    return {
      /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/Cache/add) */
      add: (_request: RequestInfo | URL): Promise<void> => {
        throw new Error("Not Implemented");
      },
      /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/Cache/addAll) */
      addAll: (_requests: RequestInfo[]): Promise<void> => {
        throw new Error("Not Implemented");
      },
      /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/Cache/delete) */
      delete: async (
        request: RequestInfo | URL,
        options?: CacheQueryOptions,
      ): Promise<boolean> => {
        assertNoOptions(options);

        const key = await keyForRequest(request);
        await remove(key);

        return true;
      },
      /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/Cache/keys) */
      keys: (
        _request?: RequestInfo | URL,
        _options?: CacheQueryOptions,
      ): Promise<ReadonlyArray<Request>> => {
        throw new Error("Not Implemented");
      },
      /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/Cache/match) */
      match: async (
        request: RequestInfo | URL,
        options?: CacheQueryOptions,
      ): Promise<Response | undefined> => {
        assertNoOptions(options);

        const key = await keyForRequest(request);

        const { value: metadata } = await kv.get<Metadata>(key, {
          consistency: "eventual",
        });

        if (!metadata) return;

        const { body } = metadata;

        // Stream body from KV
        let iterator = 0;
        const MAX_KV_BATCH_SIZE = 10;
        const stream = body
          ? new ReadableStream({
            async pull(controller) {
              try {
                const len = Math.min(MAX_KV_BATCH_SIZE, body.chunks - iterator);

                if (len <= 0) return controller.close();

                const keys = new Array(len);
                for (let it = 0; it < len; it++) {
                  keys[it] = keyForBodyChunk(body.etag, it + iterator);
                }

                const chunks = await kv.getMany<Chunk[]>(keys, {
                  consistency: "eventual",
                });

                for (const { value } of chunks) {
                  controller.enqueue(value);
                }

                iterator += len;
              } catch (error) {
                controller.error(error);
              }
            },
          })
          : null;

        return new Response(stream, metadata);
      },
      /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/Cache/matchAll) */
      matchAll: (
        _request?: RequestInfo | URL,
        _options?: CacheQueryOptions,
      ): Promise<ReadonlyArray<Response>> => {
        throw new Error("Not Implemented");
      },
      /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/Cache/put) */
      put: async (
        request: RequestInfo | URL,
        response: Response,
      ): Promise<void> => {
        const req = new Request(request);

        assertCanBeCached(req, response);

        const metaKey = await keyForRequest(req);
        const oldMeta = await kv.get<Metadata>(metaKey);

        // Transform any stream into 64Kb KV stream
        const MAX_CHUNK_SIZE = 64512; // 64Kb
        const deflator = new TransformStream({
          transform(chunk, controller) {
            for (let it = 0; it < chunk.byteLength; it += MAX_CHUNK_SIZE) {
              controller.enqueue(chunk.slice(it, it + MAX_CHUNK_SIZE));
            }
          },
        });
        let accumulator = new Uint8Array();
        const inflator = new TransformStream({
          transform(chunk, controller) {
            if (
              accumulator.byteLength + chunk.byteLength > MAX_CHUNK_SIZE
            ) {
              controller.enqueue(accumulator);
              accumulator = new Uint8Array(chunk);
            } else {
              accumulator = new Uint8Array([
                ...accumulator,
                ...chunk,
              ]);
            }
          },
          flush(controller) {
            if (accumulator.byteLength > 0) {
              controller.enqueue(accumulator);
            }
          },
        });

        response.body?.pipeThrough(deflator).pipeThrough(inflator);

        // Orphaned chunks to remove after metadata change
        let orphaned = oldMeta.value;
        const newMeta: Metadata = {
          status: response.status,
          headers: [...response.headers.entries()],
          body: response.body && {
            etag: crypto.randomUUID(),
            chunks: 0,
          },
        };

        try {
          // Save each file chunk
          // Note that chunks expiration should be higher than metadata
          // to avoid reading a file with missing chunks
          const reader = inflator.readable.getReader();

          for (; newMeta.body && true; newMeta.body.chunks++) {
            const { value, done } = await reader.read();

            if (done) break;

            const chunkKey = keyForBodyChunk(
              newMeta.body.etag,
              newMeta.body.chunks,
            );
            const res = await kv.set(chunkKey, value, {
              expireIn: LARGE_EXPIRE_MS + SMALL_EXPIRE_MS,
            });

            if (!res.ok) {
              throw new Error("Error while saving chunk to KV");
            }
          }

          // Save file metadata
          const res = await kv.set(metaKey, newMeta, {
            expireIn: LARGE_EXPIRE_MS,
          });

          if (!res.ok) {
            throw new Error("Could not set our metadata");
          }
        } catch (error) {
          orphaned = newMeta;
          console.error(error);
        }

        if (orphaned) {
          await removeBodyChunks(orphaned);
        }
      },
    };
  },
};
