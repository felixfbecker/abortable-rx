# abortable-rx

[![npm](https://img.shields.io/npm/v/abortable-rx.svg)](https://www.npmjs.com/package/abortable-rx)
[![build](https://travis-ci.org/felixfbecker/abortable-rx.svg?branch=master)](https://travis-ci.org/felixfbecker/abortable-rx)
[![codecov](https://codecov.io/gh/felixfbecker/abortable-rx/branch/master/graph/badge.svg)](https://codecov.io/gh/felixfbecker/abortable-rx)
[![dependencies](https://david-dm.org/felixfbecker/abortable-rx.svg)](https://david-dm.org/felixfbecker/abortable-rx)
[![license](https://img.shields.io/npm/l/abortable-rx.svg)](https://github.com/felixfbecker/abortable-rx/blob/master/LICENSE.txt)
[![code style: prettier](https://img.shields.io/badge/code_style-prettier-ff69b4.svg)](https://github.com/prettier/prettier)
[![semantic-release](https://img.shields.io/badge/%20%20%F0%9F%93%A6%F0%9F%9A%80-semantic--release-e10079.svg)](https://github.com/semantic-release/semantic-release)

Drop-in replacements for RxJS Observable methods and operators that work with [`AbortSignal`](https://developer.mozilla.org/en-US/docs/Web/API/AbortSignal).
Enables easy interop between Observable code and Promise-returning functions, without losing the cancellation capabilities of RxJS.

## Why?

Some operations are imperative by nature and easier to express in imperative code with async/await.
Expressing these operations that need control flow with functional RxJS operators or Subjects results in unreadable and unmaintainable code.
In addition, it is confusing to have async functions that only have one or no result, but return an Observable, as it is unclear how many times it will emit.
RxJS has great interop with Promises, however, it doesn't provide an easy mechanism to propagate cancellation to promise-returning functions like the native `fetch` API.
This micro library provides that mechanism.

## Installation

```
npm install abortable-rx
```

## Included

### Observable factories

- `defer<T>(factory: (signal: AbortSignal) => ObservableInput<T>): Observable<T>`  
  Easiest way to wrap an abortable async function into a Promise. The factory is called every time the Observable is subscribed to, and the AbortSignal is aborted on unsubscription.
- `create<T>(subscribe?: (subscriber: Subscriber<T>, signal: AbortSignal) => TeardownLogic): Observable<T>`
  Creates an Observable just like RxJS `create`, but exposes an AbortSignal in addition to the subscriber

### Observable consumers

- `toPromise<T>(observable: Observable<T>, signal?: AbortSignal): Promise<T>`
  Returns a Promise that resolves with the last emission of the given Observable, rejects if the Observable errors or rejects with an `AbortError` when the AbortSignal is aborted.
- `forEach<T>(source: Observable<T>, next: (value: T) => void, signal?: AbortSignal): Promise<void>`
  Calls `next` for every emission and returns a Promise that resolves when the Observable completed, rejects if the Observable errors or rejects with an `AbortError` when the AbortSignal is aborted.

### Observable operators

- `switchMap<T, R>(project: (value: T, index: number, abortSignal: AbortSignal) => ObservableInput<R>): OperatorFunction<T, R>`
  Like RxJS `switchMap`, but passes an AbortSignal that is aborted when the source emits another element.
- `concatMap<T, R>(project: (value: T, index: number, abortSignal: AbortSignal) => ObservableInput<R>): OperatorFunction<T, R>`
  Like RxJS `concatMap`, but passes an AbortSignal that is aborted when the returned Observable is unsubscribed from.
- `mergeMap<T, R>(project: (value: T, index: number, abortSignal: AbortSignal) => ObservableInput<R>): OperatorFunction<T, R>`
  Like RxJS `mergeMap`, but passes an AbortSignal that is aborted when the returned Observable is unsubscribed from.

📖 [Full API documentation](https://unpkg.com/abortable-rx/docs/)

## Handling AbortError

`forEach` and `toPromise` will reject the Promise with an `Error` if the signal is aborted.
This is so calling code does not continue execution and gets a chance to cleanup with `finally`.
You can handle this error (usually at the top level) by checking if `error.name === 'AbortError'` in a `catch` block.

If the functions you pass to `defer`, `switchMap`, etc. throw `AbortError`, you don't have to worry about catching it.
The Promises are always converted to Observables internally, and that Observable is always unsubscribed from _first_, _then_ the AbortSignal is aborted.
After an Observable is unsubscribed from, all further emissions or errors are ignored, so you don't have to worry about the error terminating your Observable chain.

## Example

### Using `fetch` inside `switchMap`

```ts
import { fromEvent } from 'rxjs'
import { switchMap } from 'abortable-rx/operators'

fromEvent(input, 'value')
  .pipe(switchMap(async (event, i, signal) => {
    const resp = await fetch(`api/suggestions?value=${event.target.value}`, { signal })
    if (!resp.ok) {
      throw new Error(resp.statusText)
    }
    return await resp.json()
  })
  .subscribe(displaySuggestions)
```

### Using `toPromise` to wait for an event to happen once

```ts
import { toPromise } from 'abortable-rx'

class ClientConnection {
  private events: Observable<Event>

  async sync(signal?: AbortSignal): Promise<void> {
    await this.scheduleSync('immediately', signal)
    const stream = this.events.pipe(
      filter(event => event.type === 'SYNC_COMPLETED'),
      take(1)
    )
    await toPromise(stream, signal)
  }
}
```

### Polling

```ts
import { fromEvent } from 'rxjs'
import { switchMap } from 'rxjs/operators'
import { defer } from 'abortable-rx'

fromEvent(repoDropdown, 'change')
  .pipe(switchMap(event =>
    concat(
      ['Loading...'],
      defer(async signal => {
        while (true) {
          const resp = await fetch(`api/repo/${event.target.value}`, { signal })
          if (!resp.ok) {
            throw new Error(resp.statusText)
          }
          const repo = await resp.json()
          if (repo.cloneInProgress) {
            await new Promise(resolve => setTimeout(resolve, 1000))
            continue
          }
          return repo.filesCount
        }
      })
    )
  }))
  .subscribe(content => {
    fileCount.textContent = content
  })
```

## Support

`AbortSignal` is supported by all modern browsers, but there is a [polyfill](https://www.npmjs.com/package/abort-controller) available if you need it.
