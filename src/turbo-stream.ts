import { flatten } from "./flatten.js";
import { unflatten } from "./unflatten.js";
import {
  createLineSplittingTransform,
  Deferred,
  TYPE_PROMISE,
  type ThisDecode,
  type ThisEncode,
} from "./utils.js";

export async function decode(readable: ReadableStream<Uint8Array>) {
  const done = new Deferred<void>();
  const reader = readable
    .pipeThrough(createLineSplittingTransform())
    .getReader();

  const decoder: ThisDecode = {
    values: [],
    hydrated: [],
    deferred: {},
  };

  const decoded = await decodeInitial.call(decoder, reader);

  let donePromise = done.promise;
  if (decoded.done) {
    done.resolve();
  } else {
    donePromise = decodeDeferred
      .call(decoder, reader)
      .then(done.resolve)
      .catch((reason) => {
        for (const deferred of Object.values(decoder.deferred)) {
          deferred.reject(reason);
        }

        done.reject(reason);
      });
  }

  return {
    done: donePromise.then(() => reader.closed),
    value: decoded.value,
  };
}

class SyntaxError extends Error {
  name = "SyntaxError";
  constructor(message?: string) {
    super(message ?? `Invalid input`);
  }
}

async function decodeInitial(
  this: ThisDecode,
  reader: ReadableStreamDefaultReader<string>
) {
  const read = await reader.read();
  if (!read.value) {
    throw new SyntaxError();
  }

  let line;
  try {
    line = JSON.parse(read.value);
  } catch (reason) {
    throw new SyntaxError();
  }

  return {
    done: read.done,
    value: unflatten.call(this, line),
  };
}

async function decodeDeferred(
  this: ThisDecode,
  reader: ReadableStreamDefaultReader<string>
) {
  let read = await reader.read();
  while (!read.done) {
    if (!read.value) continue;
    const line = read.value;
    switch (line[0]) {
      case TYPE_PROMISE:
        const colonIndex = line.indexOf(":");
        const deferredId = Number(line.slice(1, colonIndex));
        const deferred = this.deferred[deferredId];
        if (!deferred) {
          throw new Error(`Deferred ID ${deferredId} not found in stream`);
        }
        const lineData = line.slice(colonIndex + 1);
        let jsonLine;
        try {
          jsonLine = JSON.parse(lineData);
        } catch (reason) {
          throw new SyntaxError();
        }
        const value = unflatten.call(this, jsonLine);
        deferred.resolve(value);
        break;
      // case TYPE_PROMISE_ERROR:
      //   // TODO: transport promise rejections
      //   break;
      default:
        throw new SyntaxError();
    }
    read = await reader.read();
  }
}

export function encode(input: unknown) {
  const encoder: ThisEncode = {
    deferred: {},
    index: 0,
    indicies: new Map(),
    stringified: [],
  };
  const textEncoder = new TextEncoder();
  let lastSentIndex = 0;
  const readable = new ReadableStream<Uint8Array>({
    async start(controller) {
      const id = flatten.call(encoder, await input);
      if (id < 0) {
        controller.enqueue(textEncoder.encode(`${id}\n`));
      } else {
        controller.enqueue(
          textEncoder.encode(`[${encoder.stringified.join(",")}]\n`)
        );
        lastSentIndex = encoder.stringified.length - 1;
      }

      const seenPromises = new WeakSet<Promise<unknown>>();
      while (Object.keys(encoder.deferred).length > 0) {
        for (const [deferredId, deferred] of Object.entries(encoder.deferred)) {
          if (seenPromises.has(deferred)) continue;
          seenPromises.add(
            (encoder.deferred[Number(deferredId)] = deferred
              .then(
                (resolved) => {
                  const id = flatten.call(encoder, resolved);
                  if (id < 0) {
                    controller.enqueue(
                      textEncoder.encode(`${TYPE_PROMISE}${deferredId}:${id}\n`)
                    );
                  } else {
                    const values = encoder.stringified
                      .slice(lastSentIndex + 1)
                      .join(",");
                    controller.enqueue(
                      textEncoder.encode(
                        `${TYPE_PROMISE}${deferredId}:[${values}]\n`
                      )
                    );
                    lastSentIndex = encoder.stringified.length - 1;
                  }
                },
                (reason) => {
                  // TODO: Encode and send errors
                  throw reason;
                }
              )
              .finally(() => {
                delete encoder.deferred[Number(deferredId)];
              }))
          );
        }
        await Promise.race(Object.values(encoder.deferred));
      }
      await Promise.all(Object.values(encoder.deferred));

      controller.close();
    },
  });

  return readable;
}
