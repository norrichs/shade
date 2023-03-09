import { writable } from 'svelte/store';
import type { Subscriber, Unsubscriber } from 'svelte/store';

type WritableSubscription<T> = {subscribe: (this: void, run: Subscriber<T>, invalidate?: (value?: T) => void | undefined) => Unsubscriber;}

export function reducible<T, A>(state: T, reducer: (state: T, action: A) => T): [WritableSubscription<T>, (action: A) => void] {
	const { update, subscribe } = writable<T>(state);
	
	function dispatch(action: A) {
		update(state => reducer(state, action));
	}
	
	return [{	subscribe }, dispatch];
}
