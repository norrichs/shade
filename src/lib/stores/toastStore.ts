import { writable } from 'svelte/store';

export interface Toast {
	id: string;
	type: 'error' | 'warning' | 'info' | 'success';
	message: string;
	duration?: number; // ms, undefined = no auto-dismiss
	dismissible?: boolean;
}

function createToastStore() {
	const { subscribe, update } = writable<Toast[]>([]);

	let idCounter = 0;

	return {
		subscribe,

		add: (toast: Omit<Toast, 'id'>) => {
			const id = `toast-${++idCounter}`;
			const newToast: Toast = { id, ...toast };

			update((toasts) => [...toasts, newToast]);

			// Auto-dismiss if duration specified
			if (toast.duration) {
				setTimeout(() => {
					update((toasts) => toasts.filter((t) => t.id !== id));
				}, toast.duration);
			}

			return id;
		},

		remove: (id: string) => {
			update((toasts) => toasts.filter((t) => t.id !== id));
		},

		clear: () => {
			update(() => []);
		}
	};
}

export const toastStore = createToastStore();
