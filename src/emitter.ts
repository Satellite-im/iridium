export type EmitterCallback<T> = (event: T) => void;

export class Emitter<T> {
  store: { [key: string]: any[] };

  constructor() {
    this.store = Object.create(null);
  }

  on(event: string, cb: EmitterCallback<T>) {
    return this.event(event).push(cb);
  }

  off(event: string, cb: EmitterCallback<T> | false = false) {
    const stack = this.event(event);
    if (cb === false) {
      return stack.splice(0, stack.length);
    }

    return stack.splice(stack.indexOf(cb) >>> 0, 1);
  }

  emit(event: string, data: T, isAsync = false) {
    const result = [
      ...this.event(event).map((cb) => cb(data)),
      ...this.event('*').map((cb) =>
        cb(Object.assign(data, { channel: event }))
      ),
    ];
    return isAsync ? Promise.all(result) : result;
  }

  event(named: string) {
    if (!this.store[named]) {
      this.store[named] = [];
    }
    return this.store[named];
  }

  size() {
    return Array.from(Object.values(this.store), (s) => s.length).reduce(
      (a, b) => a + b,
      0
    );
  }
}
export default Emitter;
