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
		void job.then(() => {
			if (queue === job) queue = null;
		});
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
		track(queue.then(() => ensure(config)).then(send));
	};
}
