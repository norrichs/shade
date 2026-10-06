/**
 * Sends happen in call order. When a config needs assets loaded first, later
 * sends chain behind it so a request that needs no loading can't overtake an
 * earlier one. With nothing queued and nothing to load, `send` runs
 * synchronously. `ensure` must never reject.
 */
export function createOrderedSender<C>(ensure: (config: C) => Promise<void> | undefined) {
	let queue: Promise<void> | null = null;

	const track = (job: Promise<void>) => {
		queue = job;
		const clear = () => {
			if (queue === job) queue = null;
		};
		// Clear on rejection too (a throwing send must not wedge the queue). The
		// returned promise is handled here, so nothing escapes as unhandled.
		void job.then(clear, clear);
	};

	return (config: C, send: () => void): void => {
		if (!queue) {
			const ready = ensure(config);
			if (!ready) {
				send();
				return;
			}
			track(ready.then(send));
			return;
		}
		track(
			queue
				.catch(() => {})
				.then(() => ensure(config))
				.then(send)
		);
	};
}
