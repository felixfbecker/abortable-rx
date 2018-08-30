Object.assign(global, require('abort-controller'))

import { AssertionError } from 'assert'
import { assert } from 'chai'
import { Observable, of, Subject, Subscriber, throwError } from 'rxjs'
import { delay } from 'rxjs/operators'
import * as sinon from 'sinon'
import { concatMap, create, defer, forEach, mergeMap, switchMap, toPromise } from '.'

describe('Observable factories', () => {
    describe('create()', () => {
        it('should abort the passed AbortSignal when the returned Observable is unsubscribed from', () => {
            const subscribe = sinon.spy()
            const obs = create<number>(subscribe)
            assert.instanceOf(obs, Observable)
            sinon.assert.notCalled(subscribe)
            const onnext = sinon.spy()
            const onerror = sinon.spy()
            const oncomplete = sinon.spy()
            const subscription = obs.subscribe(onnext, onerror, oncomplete)
            sinon.assert.calledOnce(subscribe)
            sinon.assert.notCalled(onnext)
            const [subscriber, signal] = subscribe.args[0] as [Subscriber<number>, AbortSignal]
            assert.instanceOf(signal, AbortSignal)
            assert.isFalse(signal.aborted)
            const onabort = sinon.spy()
            signal.onabort = onabort
            subscriber.next(1)
            sinon.assert.calledOnce(onnext)
            sinon.assert.calledWith(onnext, 1)
            subscription.unsubscribe()
            sinon.assert.calledOnce(onabort)
            subscriber.error(new Error()) // Simulate error that might be thrown on abort
            sinon.assert.notCalled(onerror)
            sinon.assert.notCalled(oncomplete)
            assert.isTrue(signal.aborted)
        })
    })
    describe('defer()', () => {
        it('should abort the passed AbortSignal when the returned Observable is unsubscribed from', () => {
            const subject = new Subject<number>()
            const factory = sinon.spy(() => subject)
            const obs = defer<number>(factory)
            assert.instanceOf(obs, Observable)
            sinon.assert.notCalled(factory)
            const onnext = sinon.stub()
            const onerror = sinon.stub()
            const oncomplete = sinon.stub()
            const subscription = obs.subscribe(onnext, onerror, oncomplete)
            sinon.assert.calledOnce(factory)
            sinon.assert.notCalled(onnext)
            const [signal] = factory.args[0] as [AbortSignal]
            assert.instanceOf(signal, AbortSignal)
            assert.isFalse(signal.aborted)
            const onabort = sinon.stub()
            signal.onabort = onabort
            subject.next(1)
            sinon.assert.calledOnce(onnext)
            sinon.assert.calledWith(onnext, 1)
            subscription.unsubscribe()
            sinon.assert.calledOnce(onabort)
            subject.error(new Error()) // Simulate error that might be thrown on abort
            sinon.assert.notCalled(onerror)
            sinon.assert.notCalled(oncomplete)
            assert.isTrue(signal.aborted)
        })
    })
})

describe('Observable consumers', () => {
    describe('toPromise()', () => {
        it('should unsubscribe from the given Observable when the AbortSignal is aborted', async () => {
            const teardown = sinon.spy()
            const subscribe = sinon.spy((subscriber: Subscriber<number>) => teardown)
            const obs = new Observable<number>(subscribe)
            const abortController = new AbortController()
            const promise = toPromise(obs, abortController.signal)
            sinon.assert.notCalled(teardown)
            abortController.abort()
            sinon.assert.calledOnce(teardown)
            try {
                await promise
                throw new AssertionError({ message: 'Expected Promise to be rejected' })
            } catch (err) {
                assert.instanceOf(err, Error)
                assert.propertyVal(err, 'name', 'AbortError')
            }
        })
        it('should never subscribe to the Observable if the AbortSignal is already aborted', async () => {
            const subscribe = sinon.spy()
            const obs = new Observable<number>(subscribe)
            const abortController = new AbortController()
            abortController.abort()
            const promise = toPromise(obs, abortController.signal)
            sinon.assert.notCalled(subscribe)
            try {
                await promise
                throw new AssertionError({ message: 'Expected Promise to be rejected' })
            } catch (err) {
                assert.instanceOf(err, Error)
                assert.propertyVal(err, 'name', 'AbortError')
            }
        })
        it('should resolve with the last value emitted', async () => {
            const obs = of(1, 2, 3)
            const abortController = new AbortController()
            const value = await toPromise(obs, abortController.signal)
            assert.strictEqual(value, 3)
        })
    })
    describe('forEach()', () => {
        it('should unsubscribe from the given Observable when the AbortSignal is aborted', async () => {
            const teardown = sinon.spy()
            const subscribe = sinon.spy((subscriber: Subscriber<number>) => teardown)
            const obs = new Observable<number>(subscribe)
            const abortController = new AbortController()
            const onnext = sinon.spy()
            const promise = forEach(obs, onnext, abortController.signal)
            sinon.assert.notCalled(onnext)
            const [subscriber] = subscribe.args[0] as [Subscriber<number>]
            subscriber.next(1)
            assert.deepStrictEqual(onnext.args[0], [1])
            subscriber.next(2)
            assert.deepStrictEqual(onnext.args[1], [2])
            sinon.assert.notCalled(teardown)
            abortController.abort()
            sinon.assert.calledOnce(teardown)
            try {
                await promise
                throw new AssertionError({ message: 'Expected Promise to be rejected' })
            } catch (err) {
                assert.instanceOf(err, Error)
                assert.propertyVal(err, 'name', 'AbortError')
            }
        })
        it('should never subscribe to the Observable when the AbortSignal is already aborted', async () => {
            const subscribe = sinon.spy()
            const obs = new Observable<number>(subscribe)
            const abortController = new AbortController()
            abortController.abort()
            const onnext = sinon.spy()
            const promise = forEach(obs, onnext, abortController.signal)
            sinon.assert.notCalled(subscribe)
            sinon.assert.notCalled(onnext)
            try {
                await promise
                throw new AssertionError({ message: 'Expected Promise to be rejected' })
            } catch (err) {
                assert.instanceOf(err, Error)
                assert.propertyVal(err, 'name', 'AbortError')
            }
        })
        it('should resolve the Promise when the Observable completes', async () => {
            const obs = of(1, 2, 3)
            const abortController = new AbortController()
            const onnext = sinon.spy()
            await forEach(obs, onnext, abortController.signal)
            assert.deepStrictEqual(onnext.args, [[1], [2], [3]])
        })
        it('should reject the Promise when the Observable errors', async () => {
            const error = new Error()
            const obs = throwError(error)
            const abortController = new AbortController()
            try {
                await forEach(obs, () => undefined, abortController.signal)
                throw new AssertionError({ message: 'Expected Promise to be rejected' })
            } catch (err) {
                assert.strictEqual(err, error)
            }
        })
        it('should reject the Promise when the next function throws and unsubscribe the Observable', async () => {
            const error = new Error()
            const teardown = sinon.spy()
            const subscribe = sinon.spy((subscriber: Subscriber<number>) => teardown)
            const obs = new Observable<number>(subscribe).pipe(delay(1))
            const abortController = new AbortController()
            const promise = forEach(
                obs,
                () => {
                    throw error
                },
                abortController.signal
            )
            sinon.assert.notCalled(teardown)
            const [subscriber] = subscribe.args[0] as [Subscriber<number>]
            subscriber.next(1)
            try {
                await promise
                throw new AssertionError({ message: 'Expected Promise to be rejected' })
            } catch (err) {
                assert.strictEqual(err, error)
            }
            sinon.assert.calledOnce(teardown)
        })
    })
})

describe('Observable operators', () => {
    describe('switchMap()', () => {
        it('should abort the passed AbortSignal when the source emits a new item', () => {
            const source = new Subject<string>()
            const project = sinon.spy(() => new Subject<string>())
            const obs = source.pipe(switchMap(project))
            sinon.assert.notCalled(project)
            const onnext = sinon.spy()
            const onerror = sinon.spy()
            const oncomplete = sinon.spy()
            obs.subscribe(onnext, onerror, oncomplete)
            source.next('a')
            sinon.assert.calledOnce(project)
            const [value, index, signal] = project.args[0] as [string, number, AbortSignal]
            assert.strictEqual(value, 'a')
            assert.strictEqual(index, 0)
            assert.instanceOf(signal, AbortSignal)
            assert.isFalse(signal.aborted)
            const onabort = sinon.spy()
            signal.onabort = onabort
            source.next('b')
            sinon.assert.calledOnce(onabort)
            assert.isTrue(signal.aborted)
            const returnedSubject = project.returnValues[0] as Subject<string>
            returnedSubject.next('a1')
            sinon.assert.notCalled(onnext)
            returnedSubject.error(new Error()) // Simulate error that might be thrown on abort
            sinon.assert.notCalled(onerror)
            sinon.assert.notCalled(oncomplete)
        })
    })
    for (const [name, operator] of new Map([['concatMap()', concatMap], ['mergeMap()', mergeMap]])) {
        describe(name, () => {
            it('should abort the passed AbortSignal when the returned Observable is unsubscribed from', () => {
                const source = new Subject<string>()
                const project = sinon.spy(() => new Subject<string>())
                const obs = source.pipe(operator(project))
                sinon.assert.notCalled(project)
                const onnext = sinon.spy()
                const onerror = sinon.spy()
                const oncomplete = sinon.spy()
                const subscription = obs.subscribe(onnext, onerror, oncomplete)
                source.next('a')
                sinon.assert.calledOnce(project)
                const [value, index, signal] = project.args[0] as [string, number, AbortSignal]
                assert.strictEqual(value, 'a')
                assert.strictEqual(index, 0)
                assert.instanceOf(signal, AbortSignal)
                assert.isFalse(signal.aborted)
                const onabort = sinon.spy()
                signal.onabort = onabort
                subscription.unsubscribe()
                sinon.assert.calledOnce(onabort)
                assert.isTrue(signal.aborted)
                const returnedSubject = project.returnValues[0] as Subject<string>
                returnedSubject.next('a1')
                sinon.assert.notCalled(onnext)
                returnedSubject.error(new Error()) // Simulate error that might be thrown on abort
                sinon.assert.notCalled(onerror)
                sinon.assert.notCalled(oncomplete)
            })
        })
    }
})
