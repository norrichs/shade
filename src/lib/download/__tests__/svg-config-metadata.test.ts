import {
	SHADES_NS,
	embedConfigInSvg,
	extractConfigFromSvg
} from '#lib/download/svg-config-metadata.js';

const SVG =
	'<svg xmlns="http://www.w3.org/2000/svg" width="100mm" height="100mm" viewBox="0 0 100 100"><g><path d="M0 0L1 1"/></g></svg>';
const CONFIG = JSON.stringify({ type: 'SavedConfig', version: 3, label: 'a < b & "c"' });
const META = { name: 'Lamp', exportedAt: '2026-11-09T14:02:00.000Z' };

describe('embedConfigInSvg', () => {
	test('puts a namespaced config element inside <metadata> right after the root tag', () => {
		const out = embedConfigInSvg(SVG, CONFIG, META);
		expect(out.startsWith('<svg xmlns="http://www.w3.org/2000/svg" width="100mm"')).toBe(true);
		expect(out).toContain(`<metadata><shades:config xmlns:shades="${SHADES_NS}"`);
		expect(out.indexOf('<metadata>')).toBeLessThan(out.indexOf('<g>'));
		expect(out).toContain('name="Lamp"');
		expect(out).toContain('exported="2026-11-09T14:02:00.000Z"');
		// The drawing itself is untouched.
		expect(out).toContain('<g><path d="M0 0L1 1"/></g></svg>');
	});

	test('escapes attribute values', () => {
		const name = 'A "quoted" <name> & co';
		const out = embedConfigInSvg(SVG, CONFIG, { ...META, name });
		expect(out).toContain('name="A &quot;quoted&quot; &lt;name&gt; &amp; co"');
		expect(extractConfigFromSvg(out)).toMatchObject({ ok: true, name });
	});

	test('handles a self-closing root', () => {
		const out = embedConfigInSvg('<svg xmlns="http://www.w3.org/2000/svg"/>', CONFIG, META);
		expect(extractConfigFromSvg(out)).toMatchObject({ ok: true, configJson: CONFIG });
		expect(out.endsWith('</svg>')).toBe(true);
	});
});

describe('extractConfigFromSvg', () => {
	test('round-trips the config JSON exactly', () => {
		expect(extractConfigFromSvg(embedConfigInSvg(SVG, CONFIG, META))).toEqual({
			ok: true,
			configJson: CONFIG,
			name: 'Lamp'
		});
	});

	test('round-trips JSON that contains the CDATA terminator', () => {
		const tricky = JSON.stringify({ note: 'ends ]]> here ]]>' });
		const out = embedConfigInSvg(SVG, tricky, META);
		expect(extractConfigFromSvg(out)).toMatchObject({ ok: true, configJson: tricky });
	});

	test('reads entity-escaped text (an editor that rewrote the CDATA)', () => {
		const escaped = CONFIG.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
		const svg = `<svg><metadata><shades:config xmlns:shades="${SHADES_NS}" version="1">${escaped}</shades:config></metadata></svg>`;
		expect(extractConfigFromSvg(svg)).toEqual({ ok: true, configJson: CONFIG });
	});

	test('reports an SVG without embedded config', () => {
		const result = extractConfigFromSvg(SVG);
		expect(result.ok).toBe(false);
	});

	test('reports embedded text that is not JSON', () => {
		const svg = `<svg><metadata><shades:config xmlns:shades="${SHADES_NS}"><![CDATA[not json]]></shades:config></metadata></svg>`;
		expect(extractConfigFromSvg(svg).ok).toBe(false);
	});
});
