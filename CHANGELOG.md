# Changelog

## [3.1.0](https://github.com/jacob-ebey/turbo-stream/compare/v3.0.1...v3.1.0) (2025-02-07)


### Features

* allow for custom error redaction ([#68](https://github.com/jacob-ebey/turbo-stream/issues/68)) ([e128d83](https://github.com/jacob-ebey/turbo-stream/commit/e128d83b991865f443448f117374814f6fdc9ad5))

## [3.0.1](https://github.com/jacob-ebey/turbo-stream/compare/v3.0.0...v3.0.1) (2025-02-05)


### Bug Fixes

* reset subMode state ([#65](https://github.com/jacob-ebey/turbo-stream/issues/65)) ([7088bb7](https://github.com/jacob-ebey/turbo-stream/commit/7088bb782e9391617026e24f4901e685357b0ac0))

## [3.0.0](https://github.com/jacob-ebey/turbo-stream/compare/v2.4.1...v3.0.0) (2025-02-04)


### ⚠ BREAKING CHANGES

* new encoding format ([#59](https://github.com/jacob-ebey/turbo-stream/issues/59))

### Features

* new encoding format ([#59](https://github.com/jacob-ebey/turbo-stream/issues/59)) ([2bf9709](https://github.com/jacob-ebey/turbo-stream/commit/2bf9709532487873a2ce093ce0b7fd8e921391ae))

## [2.4.1](https://github.com/jacob-ebey/turbo-stream/compare/v2.4.0...v2.4.1) (2024-09-11)


### Bug Fixes

* address memory leak caused by too many event listeners on AbortSignal ([#49](https://github.com/jacob-ebey/turbo-stream/issues/49)) ([628504e](https://github.com/jacob-ebey/turbo-stream/commit/628504e1b344b6f6e5fdcfb0258524a518c13505))

## [2.4.0](https://github.com/jacob-ebey/turbo-stream/compare/v2.3.0...v2.4.0) (2024-08-17)


### Features

* add `postPlugins` for encode to handle any values that can not be handled natively or by other plugins ([#47](https://github.com/jacob-ebey/turbo-stream/issues/47)) ([5fc83c8](https://github.com/jacob-ebey/turbo-stream/commit/5fc83c8bb32407ec44767e55f6cecb950dc5b0e1))

## [2.3.0](https://github.com/jacob-ebey/turbo-stream/compare/v2.2.3...v2.3.0) (2024-08-12)


### Features

* maintain property order ([#45](https://github.com/jacob-ebey/turbo-stream/issues/45)) ([f0f1537](https://github.com/jacob-ebey/turbo-stream/commit/f0f1537315bd25793ad8ebc749e95c7ad2dd1fa4))

## [2.2.3](https://github.com/jacob-ebey/turbo-stream/compare/v2.2.2...v2.2.3) (2024-08-11)


### Bug Fixes

* push one value at a time to avoid stack overflows ([#43](https://github.com/jacob-ebey/turbo-stream/issues/43)) ([88c51a7](https://github.com/jacob-ebey/turbo-stream/commit/88c51a7f4a1803c12570bf325fdfc8ec9578e3f5))

## [2.2.2](https://github.com/jacob-ebey/turbo-stream/compare/v2.2.1...v2.2.2) (2024-08-10)


### Bug Fixes

* support "infinitely" large payloads ([#41](https://github.com/jacob-ebey/turbo-stream/issues/41)) ([8b602a3](https://github.com/jacob-ebey/turbo-stream/commit/8b602a33f15a914bba833123a32fcc6001ce846a))

## [2.2.1](https://github.com/jacob-ebey/turbo-stream/compare/v2.2.0...v2.2.1) (2024-08-09)


### Bug Fixes

* encoding of previously-used values ([#38](https://github.com/jacob-ebey/turbo-stream/issues/38)) ([84520be](https://github.com/jacob-ebey/turbo-stream/commit/84520be9a84223ee74dc49e32f3c5fe047c5eb78))

## [2.2.0](https://github.com/jacob-ebey/turbo-stream/compare/v2.1.0...v2.2.0) (2024-06-04)


### Features

* allow plugins to custom encode functions ([#34](https://github.com/jacob-ebey/turbo-stream/issues/34)) ([6bd197a](https://github.com/jacob-ebey/turbo-stream/commit/6bd197a258fa188c8ea4f8232531bf10f56c5d8d))

## [2.1.0](https://github.com/jacob-ebey/turbo-stream/compare/v2.0.1...v2.1.0) (2024-05-30)


### Features

* support pre resolved / rejected promises ([#32](https://github.com/jacob-ebey/turbo-stream/issues/32)) ([3f15f99](https://github.com/jacob-ebey/turbo-stream/commit/3f15f9917222878b8b8df6bcc687e2d2d63ccfd2))


### Bug Fixes

* support empty Map and Set ([#26](https://github.com/jacob-ebey/turbo-stream/issues/26)) ([#27](https://github.com/jacob-ebey/turbo-stream/issues/27)) ([fe156fe](https://github.com/jacob-ebey/turbo-stream/commit/fe156fe61612d968abe60448f0882e1490354278))

## [2.0.1](https://github.com/jacob-ebey/turbo-stream/compare/v2.0.0...v2.0.1) (2024-04-29)


### Bug Fixes

* subsequent null and undefined encoding failure ([#24](https://github.com/jacob-ebey/turbo-stream/issues/24)) ([47adfe1](https://github.com/jacob-ebey/turbo-stream/commit/47adfe1ad73b0486045bec338cc7405605bf645f))

## [2.0.0](https://github.com/jacob-ebey/turbo-stream/compare/v1.2.1...v2.0.0) (2024-03-06)


### ⚠ BREAKING CHANGES

* add abort signal ([#21](https://github.com/jacob-ebey/turbo-stream/issues/21))

### Features

* add abort signal ([#21](https://github.com/jacob-ebey/turbo-stream/issues/21)) ([34441a1](https://github.com/jacob-ebey/turbo-stream/commit/34441a1f6c405e9e27f3538764e45072e06fd6bf))

## [1.2.1](https://github.com/jacob-ebey/turbo-stream/compare/v1.2.0...v1.2.1) (2024-02-15)


### Bug Fixes

* plugin recursive loop ([#18](https://github.com/jacob-ebey/turbo-stream/issues/18)) ([dd5698b](https://github.com/jacob-ebey/turbo-stream/pull/18/commits/dd5698b15250a14cfd503d7948e26d562d7933d0))

## [1.2.0](https://github.com/jacob-ebey/turbo-stream/compare/v1.1.1...v1.2.0) (2023-11-01)


### Features

* make the module CJS + ESM ([#16](https://github.com/jacob-ebey/turbo-stream/issues/16)) ([96cb9ec](https://github.com/jacob-ebey/turbo-stream/commit/96cb9ec95a9ad62deda9117a22edf73db4408359))

## [1.1.1](https://github.com/jacob-ebey/turbo-stream/compare/v1.1.0...v1.1.1) (2023-11-01)


### Bug Fixes

* export plugin types ([#14](https://github.com/jacob-ebey/turbo-stream/issues/14)) ([f70f04a](https://github.com/jacob-ebey/turbo-stream/commit/f70f04a51e0296b70589469fdb20a1415cf00923))
* flatten objects more ([f70f04a](https://github.com/jacob-ebey/turbo-stream/commit/f70f04a51e0296b70589469fdb20a1415cf00923))

## [1.1.0](https://github.com/jacob-ebey/turbo-stream/compare/v1.0.4...v1.1.0) (2023-10-27)


### Features

* added plugin support ([#12](https://github.com/jacob-ebey/turbo-stream/issues/12)) ([49792ba](https://github.com/jacob-ebey/turbo-stream/commit/49792ba6161128f9f93bdc4237e9a0a59da1b5dd))

## [1.0.4](https://github.com/jacob-ebey/turbo-stream/compare/v1.0.3...v1.0.4) (2023-10-27)


### Bug Fixes

* add support for URL encoding and decoding ([#10](https://github.com/jacob-ebey/turbo-stream/issues/10)) ([acf9ae1](https://github.com/jacob-ebey/turbo-stream/commit/acf9ae1a2274a9289b4cf8962a9909e22abfbbe7))

## [1.0.3](https://github.com/jacob-ebey/turbo-stream/compare/v1.0.2...v1.0.3) (2023-10-26)


### Bug Fixes

* minify things a bit ([#8](https://github.com/jacob-ebey/turbo-stream/issues/8)) ([03c4861](https://github.com/jacob-ebey/turbo-stream/commit/03c4861c5713e26a5641cdd2d6db888711d3f963))

## [1.0.2](https://github.com/jacob-ebey/turbo-stream/compare/v1.0.1...v1.0.2) (2023-10-26)


### Bug Fixes

* add sideEffects: false to pkg json ([#6](https://github.com/jacob-ebey/turbo-stream/issues/6)) ([ad7b842](https://github.com/jacob-ebey/turbo-stream/commit/ad7b842fcfef7e002fec5e42124b48eeeb8113cf))

## [1.0.1](https://github.com/jacob-ebey/turbo-stream/compare/v1.0.0...v1.0.1) (2023-10-26)


### Features

* add release pipeline to the repository ([db40f74](https://github.com/jacob-ebey/turbo-stream/commit/db40f74585a5c412dbefbe97cda725b6718bb502))
* encode errors and promise rejections ([fa120e9](https://github.com/jacob-ebey/turbo-stream/commit/fa120e9e4f6828b5ff3ad909064d2ae43e95f32a))
* minify things ([1db51bf](https://github.com/jacob-ebey/turbo-stream/commit/1db51bf8ecf3e854fd5b49b1afe44627a965bdac))
* support null prototype objects ([27b3ece](https://github.com/jacob-ebey/turbo-stream/commit/27b3ece14d8f58c56b44a187851848f716de3876))


### Bug Fixes

* add repository to package.json ([#4](https://github.com/jacob-ebey/turbo-stream/issues/4)) ([9ae3518](https://github.com/jacob-ebey/turbo-stream/commit/9ae35180da01025e6dbaf1d3e16d1c10cc9ab043))


### Miscellaneous Chores

* release 1.0.0 ([ba652c6](https://github.com/jacob-ebey/turbo-stream/commit/ba652c6d91fdaa1c3cbc1c06800703c308fe77a4))
* release 1.0.1 ([053108a](https://github.com/jacob-ebey/turbo-stream/commit/053108a6e02f1263b0c580f572c082758451a9f9))

## 1.0.0 (2023-10-26)

Welcome to turbo-stream, a streaming data transport format that aims to support built-in features such as Promises, Dates, RegExps, Maps, Sets and more.

Shout out to Rich Harris and his https://github.com/rich-harris/devalue project. Devalue has heavily influenced this project and portions
of the code have been directly lifted from it. I highly recommend checking it out if you need something more cusomizable or without streaming support.

### Features

* initial release
