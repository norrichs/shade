import { downloadTextFile } from '../util';

describe('downloadTextFile', () => {
	test('creates an anchor with download attr and clicks it', () => {
		const createObjectURL = jest.fn(() => 'blob:mock');
		const revokeObjectURL = jest.fn();
		// jsdom is not available; stub global URL methods.
		(global as unknown as Record<string, unknown>).URL = {
			createObjectURL,
			revokeObjectURL
		};

		const click = jest.fn();
		const anchor = {
			href: '',
			download: '',
			click,
			setAttribute: jest.fn()
		};
		const appendChildSpy = jest.fn();
		const removeChildSpy = jest.fn();

		// Stub global document.
		(global as unknown as Record<string, unknown>).document = {
			createElement: jest.fn((tag: string) => {
				if (tag === 'a') return anchor;
				return {};
			}),
			body: {
				appendChild: appendChildSpy,
				removeChild: removeChildSpy
			}
		};

		downloadTextFile('a,b\n1,2', 'map.csv', 'text/csv');

		expect(createObjectURL).toHaveBeenCalledTimes(1);
		expect(click).toHaveBeenCalledTimes(1);
		expect(anchor.download).toBe('map.csv');
		expect(anchor.href).toBe('blob:mock');
	});
});
