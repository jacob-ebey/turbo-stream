import { TYPE_PROMISE } from "./constants.js";
import { unflatten, type ThisDecode } from "./decode.js";
import { Deferred } from "./deferred.js";
import { flatten, type ThisEncode } from "./encode.js";

export async function decode<T = unknown>(
  input: ReadableStream<Uint8Array>
): Promise<{ value: T; done: Promise<void> }> {
  const decoder = new Decoder(input);
  return decoder.decode() as Promise<{ value: T; done: Promise<void> }>;
}

class Decoder {
  private reader: ReadableStreamDefaultReader<Uint8Array>;
  private decoder: ThisDecode;
  constructor(input: ReadableStream<Uint8Array>) {
    this.reader = input.getReader();
    this.decoder = {
      deferred: {},
      hydrated: [],
      values: [],
    };
  }
  async decode(): Promise<{ value: unknown; done: Promise<void> }> {
    const iterator = makeTextFileLineIterator(this.reader);

    const read = await iterator.next();
    if (!read.value || read.done) throw new Error("Invalid input");
    const decoded = unflatten.call(this.decoder, JSON.parse(read.value));

    const done = (async () => {
      for await (const line of iterator) {
        let type = line[0];

        switch (type) {
          case TYPE_PROMISE:
            const colonIndex = line.indexOf(":");
            const deferredId = Number(line.slice(1, colonIndex));
            const lineData = line.slice(colonIndex + 1);
            const deferredResult = unflatten.call(
              this.decoder,
              JSON.parse(lineData)
            );
            this.decoder.deferred[deferredId].resolve(deferredResult);
            break;
          default:
            throw new Error("Invalid input");
        }
      }
    })();

    return { value: decoded, done };
  }
}

export function encode(input: unknown): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    async start(controller) {
      const textEncoder = new TextEncoder();
      const encoder: ThisEncode = {
        index: 0,
        indicies: new Map(),
        stringified: [],
        deferred: [],
      };

      const id = flatten.call(encoder, input);
      const encoded =
        id < 0 ? String(id) : "[" + encoder.stringified.join(",") + "]";
      controller.enqueue(textEncoder.encode(encoded + "\n"));

      let activeDeferred = 0;
      const done = new Deferred<void>();
      let alreadyDone = false;

      if (encoder.deferred.length === 0) {
        alreadyDone = true;
        done.resolve();
      } else {
        for (const [promiseId, promise] of encoder.deferred) {
          activeDeferred++;
          promise
            .then((value) => {
              const id = flatten.call(encoder, value);
              const encoded =
                id < 0
                  ? String(id)
                  : "[" + encoder.stringified.slice(id).join(",") + "]";
              controller.enqueue(
                textEncoder.encode(
                  `${TYPE_PROMISE}${promiseId}:` + encoded + "\n"
                )
              );

              activeDeferred--;
              if (activeDeferred === 0) {
                alreadyDone = true;
                done.resolve();
              }
            })
            .catch((reason) => {
              if (alreadyDone) return;
              alreadyDone = true;
              done.reject(reason);
            });
        }
      }

      await done.promise;
      controller.close();
    },
  });
}

async function* makeTextFileLineIterator(
  reader: ReadableStreamDefaultReader<Uint8Array>
): AsyncGenerator<string> {
  const decoder = new TextDecoder();
  let read = await reader.read();
  let chunk = read.value ? decoder.decode(read.value, { stream: true }) : "";

  let re = /\r\n|\n|\r/gm;
  let startIndex = 0;

  for (;;) {
    let result = re.exec(chunk);
    if (!result) {
      if (read.done) {
        break;
      }
      let remainder = chunk.slice(startIndex);
      read = await reader.read();
      chunk =
        remainder +
        (read.value ? decoder.decode(read.value, { stream: true }) : "");
      startIndex = re.lastIndex = 0;
      continue;
    }
    yield chunk.substring(startIndex, result.index);
    startIndex = re.lastIndex;
  }
  if (startIndex < chunk.length) {
    // last line didn't end in a newline char
    yield chunk.slice(startIndex);
  }
}
