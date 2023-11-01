# Changelog

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
