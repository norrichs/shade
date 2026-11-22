import { collectBandNotices, createBandNoticeNotifier } from '../band-notice';

const result = (...notices: (string | undefined)[]) => ({
	projectionCutPattern: { tubes: [{ bands: notices.map((notice) => ({ notice })) }] }
});

describe('band notices', () => {
	it('collects distinct notices across results', () => {
		expect(collectBandNotices([result('a', undefined, 'a'), undefined, result('b')])).toEqual([
			'a',
			'b'
		]);
	});

	it('keeps one toast in step with the notices', () => {
		const add = jest.fn(() => 'id');
		const remove = jest.fn();
		const notify = createBandNoticeNotifier({ add, remove });
		notify(['a']);
		notify(['a']);
		expect(add).toHaveBeenCalledTimes(1);
		notify([]);
		expect(remove).toHaveBeenCalledWith('id');
	});
});
