# Turbo Stream <br> [![turbo-stream's badge](https://deno.bundlejs.com/?q=turbo-stream&badge=detailed)](https://bundlejs.com/?q=turbo-stream)

A streaming data transport format that aims to support built-in features such as Promises, Dates, RegExps, Maps, Sets and more.

Decode runtime size: [![turbo-stream's badge](https://deno.bundlejs.com/badge?q=turbo-stream&badge=detailed&treeshake=%5B%7B+decode+%7D%5D)](https://bundlejs.com/?q=turbo-stream&treeshake=%5B%7B+decode+%7D%5D)

## Installation

```bash
npm install turbo-stream
```

## Usage

```js
import { decode, encode } from "turbo-stream";

const encodedStream = encode(Promise.resolve(42));
const decoded = await decode(encodedStream);
console.log(decoded); // 42
```

## Benchmarks

Run them yourself with `pnpm bench`

```
• realistic payload
------------------------------------------- -------------------------------
JSON                           2.80 µs/iter   2.71 µs █▆                   
                        (2.59 µs … 5.61 µs)   5.55 µs ██                   
                    (  2.91 kb …   2.91 kb)   2.91 kb ██▁▂▁▁▁▁▁▂▁▁▁▁▁▁▁▁▁▁▂
turbo encode                  16.71 µs/iter  16.47 µs  █                   
                      (16.04 µs … 19.47 µs)  18.38 µs ███                  
                    (  2.80 kb …   2.81 kb)   2.80 kb ██████▁▁▁▁▁▁▁▁▁▁▁▁▁▁█
turbo full                    35.30 µs/iter  36.33 µs  █                   
                     (31.38 µs … 202.79 µs)  52.50 µs  █▃  ▄               
                    (  2.47 kb … 454.32 kb) 104.44 kb ▂██▃▅█▂▂▂▂▁▁▁▁▁▁▁▁▁▁▁

                             ┌                                            ┐
                             ┬  ╷
                        JSON │──┤
                             ┴  ╵
                                         ┌┬╷
                turbo encode             ││┤
                                         └┴╵
                                                       ╷┌─┬┐              ╷
                  turbo full                           ├┤ │├──────────────┤
                                                       ╵└─┴┘              ╵
                             └                                            ┘
                             2.59 µs           27.55 µs            52.50 µs

summary
  turbo encode
   5.97x slower than JSON
   2.11x faster than turbo full
```

## Legacy

Shout out to Rich Harris and his https://github.com/rich-harris/devalue project. Devalue has heavily influenced this project and portions of the original code was directly lifted from it. I highly recommend checking it out if you need something more cusomizable or without streaming support. This new version has been re-written from the ground up and no longer resembles devalue.
