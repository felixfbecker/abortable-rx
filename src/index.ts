import { from, Observable, ObservableInput, OperatorFunction, Subscriber, Subscription, TeardownLogic } from 'rxjs'
import { concatMap as rxConcatMap, mergeMap as rxMergeMap, switchMap as rxSwitchMap } from 'rxjs/operators'

export const create = <T>(
    subscribe?: (subscriber: Subscriber<T>, signal: AbortSignal) => TeardownLogic
): Observable<T> =>
    new Observable<T>(subscriber => {
        const abortController = new AbortController()
        const subscription = new Subscription()
        const teardown = subscribe && subscribe(subscriber, abortController.signal)
        subscription.add(teardown)
        subscription.add(() => abortController.abort())
        return subscription
    })

export const defer = <T>(factory: (signal: AbortSignal) => ObservableInput<T>): Observable<T> =>
    create((subscriber, signal) => from(factory(signal)).subscribe(subscriber))

export const toPromise = <T>(observable: Observable<T>, signal?: AbortSignal): Promise<T> =>
    new Promise((resolve, reject) => {
        let value: T
        const subscription = observable.subscribe(
            val => {
                value = val
            },
            reject,
            () => {
                resolve(value)
            }
        )
        if (signal) {
            signal.addEventListener('abort', () => {
                subscription.unsubscribe()
                const error = new Error('Aborted')
                error.name = 'AbortError'
                reject(error)
            })
        }
    })

export const forEach = <T>(source: Observable<T>, next: (value: T) => void, signal?: AbortSignal): Promise<void> =>
    new Promise<void>((resolve, reject) => {
        // Must be declared in a separate statement to avoid a RefernceError when
        // accessing subscription below in the closure due to Temporal Dead Zone.
        let subscription: Subscription
        subscription = source.subscribe(
            value => {
                try {
                    next(value)
                } catch (err) {
                    reject(err)
                    if (subscription) {
                        subscription.unsubscribe()
                    }
                }
            },
            reject,
            resolve
        )
        if (signal) {
            signal.addEventListener('abort', () => {
                subscription.unsubscribe()
                const error = new Error('Aborted')
                error.name = 'AbortError'
                reject(error)
            })
        }
    })

export const switchMap = <T, R>(
    project: (value: T, index: number, abortSignal: AbortSignal) => ObservableInput<R>
): OperatorFunction<T, R> => source =>
    source.pipe(rxSwitchMap((value, index) => defer(abortSignal => project(value, index, abortSignal))))

export const concatMap = <T, R>(
    project: (value: T, index: number, abortSignal: AbortSignal) => ObservableInput<R>
): OperatorFunction<T, R> => source =>
    source.pipe(rxConcatMap((value, index) => defer(abortSignal => project(value, index, abortSignal))))

export const mergeMap = <T, R>(
    project: (value: T, index: number, abortSignal: AbortSignal) => ObservableInput<R>
): OperatorFunction<T, R> => source =>
    source.pipe(rxMergeMap((value, index) => defer(abortSignal => project(value, index, abortSignal))))
