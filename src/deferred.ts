export class Deferred<R> {
  promise: Promise<R>;
  resolve!: (value: R | PromiseLike<R>) => void;
  reject!: (reason?: unknown) => void;

  constructor() {
    this.promise = new Promise((resolve, reject) => {
      this.resolve = resolve;
      this.reject = reject;
    });
  }
}
