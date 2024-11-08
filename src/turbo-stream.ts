import { flatten } from "./flatten.js";
import { unflatten } from "./unflatten.js";
import {
  Deferred,
  TYPE_DONE,
  TYPE_ERROR,
  TYPE_PREVIOUS_RESOLVED,
  TYPE_PROMISE,
  TYPE_STREAM,
  createLineSplittingTransform,
  type DecodePlugin,
  type EncodePlugin,
  type ThisDecode,
  type ThisEncode,
} from "./utils.js";

export type { DecodePlugin, EncodePlugin };

export async function decode(
  readable: ReadableStream<Uint8Array>,
  options?: { plugins?: DecodePlugin[] }
) {
  const { plugins } = options ?? {};

  const done = new Deferred<void>();
  const reader = readable
    .pipeThrough(createLineSplittingTransform())
    .getReader();

  const decoder: ThisDecode = {
    values: [],
    hydrated: [],
    deferred: {},
    streams: {},
    plugins,
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

async function decodeInitial(
  this: ThisDecode,
  reader: ReadableStreamDefaultReader<string>
) {
  const read = await reader.read();
  if (!read.value) {
    throw new SyntaxError();
  }

  let line: unknown;
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
      case TYPE_PROMISE: {
        const isError = line[1] === TYPE_ERROR;
        const startIndex = isError ? 2 : 1;
        const colonIndex = line.indexOf(":");
        const deferredId = Number(line.slice(startIndex, colonIndex));
        const deferred = this.deferred[deferredId];
        if (!deferred) {
          throw new Error(`Deferred ID ${deferredId} not found in stream`);
        }
        const lineData = line.slice(colonIndex + 1);
        let jsonLine: unknown;
        try {
          jsonLine = JSON.parse(lineData);
        } catch (reason) {
          throw new SyntaxError();
        }

        const value = unflatten.call(this, jsonLine);
        if (isError) {
          deferred.reject(value);
        } else {
          deferred.resolve(value);
        }

        break;
      }

      case TYPE_STREAM: {
        const isError = line[1] === TYPE_ERROR;
        const isDone = line[1] === TYPE_DONE;
        const startIndex = isError || isDone ? 2 : 1;
        const colonIndex = line.indexOf(":");
        const streamId = Number(line.slice(startIndex, colonIndex));
        const stream = this.streams[streamId];
        if (!stream) {
          throw new Error(`ReadableStream ID ${streamId} not found in stream`);
        }
        if (isDone) {
          stream.close();
          break;
        }
        const lineData = line.slice(colonIndex + 1);
        let jsonLine: unknown;
        try {
          jsonLine = JSON.parse(lineData);
        } catch (reason) {
          throw new SyntaxError();
        }

        const value = unflatten.call(this, jsonLine);
        if (isError) {
          stream.error(value);
        } else {
          stream.enqueue(value);
        }

        break;
      }
      default:
        throw new SyntaxError();
    }
    read = await reader.read();
  }
}

export function encode(
  input: unknown,
  options?: {
    plugins?: EncodePlugin[];
    postPlugins?: EncodePlugin[];
    signal?: AbortSignal;
  }
) {
  const { plugins, postPlugins, signal } = options ?? {};

  const encoder: ThisEncode = {
    deferred: {},
    streams: {},
    index: 0,
    indices: new Map(),
    stringified: [],
    plugins,
    postPlugins,
    signal,
  };
  const textEncoder = new TextEncoder();
  let lastSentIndex = 0;
  const readable = new ReadableStream<Uint8Array>({
    async start(controller) {
      const id = flatten.call(encoder, input);
      if (Array.isArray(id)) {
        throw new Error("This should never happen");
      }
      if (id < 0) {
        controller.enqueue(textEncoder.encode(`${id}\n`));
      } else {
        controller.enqueue(
          textEncoder.encode(`[${encoder.stringified.join(",")}]\n`)
        );
        lastSentIndex = encoder.stringified.length - 1;
      }

      const seenPromises = new WeakSet<Promise<unknown>>();
      if (
        Object.keys(encoder.deferred).length ||
        Object.keys(encoder.streams).length
      ) {
        let raceDone!: () => void;
        const racePromise = new Promise<never>((resolve, reject) => {
          raceDone = resolve as () => void;
          if (signal) {
            const rejectPromise = () =>
              reject(signal.reason || new Error("Signal was aborted."));
            if (signal.aborted) {
              rejectPromise();
            } else {
              signal.addEventListener("abort", (event) => {
                rejectPromise();
              });
            }
          }
        });

        while (
          Object.keys(encoder.deferred).length > 0 ||
          Object.keys(encoder.streams).length > 0
        ) {
          for (const [deferredId, deferred] of Object.entries(
            encoder.deferred
          )) {
            if (seenPromises.has(deferred)) continue;
            seenPromises.add(
              // biome-ignore lint/suspicious/noAssignInExpressions: <explanation>
              (encoder.deferred[Number(deferredId)] = Promise.race([
                racePromise,
                deferred,
              ])
                .then(
                  (resolved) => {
                    const id = flatten.call(encoder, resolved);
                    if (Array.isArray(id)) {
                      controller.enqueue(
                        textEncoder.encode(
                          `${TYPE_PROMISE}${deferredId}:[["${TYPE_PREVIOUS_RESOLVED}",${id[0]}]]\n`
                        )
                      );
                      encoder.index++;
                      lastSentIndex++;
                    } else if (id < 0) {
                      controller.enqueue(
                        textEncoder.encode(
                          `${TYPE_PROMISE}${deferredId}:${id}\n`
                        )
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
                    if (
                      !reason ||
                      typeof reason !== "object" ||
                      !(reason instanceof Error)
                    ) {
                      reason = new Error("An unknown error occurred");
                    }

                    const id = flatten.call(encoder, reason);
                    if (Array.isArray(id)) {
                      controller.enqueue(
                        textEncoder.encode(
                          `${TYPE_PROMISE}${TYPE_ERROR}${deferredId}:[["${TYPE_PREVIOUS_RESOLVED}",${id[0]}]]\n`
                        )
                      );
                      encoder.index++;
                      lastSentIndex++;
                    } else if (id < 0) {
                      controller.enqueue(
                        textEncoder.encode(
                          `${TYPE_PROMISE}${TYPE_ERROR}${deferredId}:${id}\n`
                        )
                      );
                    } else {
                      const values = encoder.stringified
                        .slice(lastSentIndex + 1)
                        .join(",");
                      controller.enqueue(
                        textEncoder.encode(
                          `${TYPE_PROMISE}${TYPE_ERROR}${deferredId}:[${values}]\n`
                        )
                      );
                      lastSentIndex = encoder.stringified.length - 1;
                    }
                  }
                )
                .finally(() => {
                  delete encoder.deferred[Number(deferredId)];
                }))
            );
          }
          for (const [streamId, stream] of Object.entries(encoder.streams)) {
            if (stream.finish) continue;
            const { resolve, promise } = new Deferred<void>();
            stream.finish = promise;
            promise.finally(() => {
              delete encoder.streams[Number(streamId)];
            });
            const reader = stream.getReader();
            consumeChunk();
            function consumeChunk() {
              reader
                .read()
                .then(({ done, value }) => {
                  if (signal?.aborted) {
                    throw signal.reason || new Error("Signal was aborted.");
                  }
                  if (done) {
                    controller.enqueue(
                      textEncoder.encode(
                        `${TYPE_STREAM}${TYPE_DONE}${streamId}:[]\n`
                      )
                    );

                    resolve();
                  } else {
                    const id = flatten.call(encoder, value);
                    if (Array.isArray(id)) {
                      controller.enqueue(
                        textEncoder.encode(
                          `${TYPE_STREAM}${streamId}:[["${TYPE_PREVIOUS_RESOLVED}",${id[0]}]]\n`
                        )
                      );
                      encoder.index++;
                      lastSentIndex++;
                    } else if (id < 0) {
                      controller.enqueue(
                        textEncoder.encode(`${TYPE_STREAM}${streamId}:${id}\n`)
                      );
                    } else {
                      const values = encoder.stringified
                        .slice(lastSentIndex + 1)
                        .join(",");
                      controller.enqueue(
                        textEncoder.encode(
                          `${TYPE_STREAM}${streamId}:[${values}]\n`
                        )
                      );
                      lastSentIndex = encoder.stringified.length - 1;
                    }
                    return consumeChunk();
                  }
                })
                .catch((reason) => {
                  if (
                    !reason ||
                    typeof reason !== "object" ||
                    !(reason instanceof Error)
                  ) {
                    reason = new Error("An unknown error occurred");
                  }

                  const id = flatten.call(encoder, reason);
                  if (Array.isArray(id)) {
                    controller.enqueue(
                      textEncoder.encode(
                        `${TYPE_STREAM}${TYPE_ERROR}${streamId}:[["${TYPE_PREVIOUS_RESOLVED}",${id[0]}]]\n`
                      )
                    );
                    encoder.index++;
                    lastSentIndex++;
                  } else if (id < 0) {
                    controller.enqueue(
                      textEncoder.encode(
                        `${TYPE_STREAM}${TYPE_ERROR}${streamId}:[${id}]\n`
                      )
                    );
                  } else {
                    const values = encoder.stringified
                      .slice(lastSentIndex + 1)
                      .join(",");
                    controller.enqueue(
                      textEncoder.encode(
                        `${TYPE_STREAM}${TYPE_ERROR}${streamId}:[${values}]\n`
                      )
                    );
                    lastSentIndex = encoder.stringified.length - 1;
                  }
                  resolve();
                });
            }
          }
          await Promise.race(
            Object.values(encoder.deferred).concat(
              Object.values(encoder.streams)
                .map((stream) => stream.finish)
                .filter((x) => !!x)
            )
          );
        }

        raceDone();
      }
      await Promise.all(Object.values(encoder.deferred));

      controller.close();
    },
  });

  return readable;
}
