/**
 * Embeds the full saved config (the `SavedConfig` envelope from
 * `saved-config.ts`) in an exported SVG so the file can be loaded back into
 * the designer:
 *
 *   <svg ...>
 *     <metadata>
 *       <shades:config xmlns:shades="…" version="1" name="…" exported="…">
 *         <![CDATA[{ …SavedConfig JSON… }]]>
 *       </shades:config>
 *     </metadata>
 *     …drawing…
 *
 * `<metadata>` is never rendered, and cutters (LightBurn) ignore it. The
 * namespace keeps it clear of Inkscape/RDF metadata. Both functions work on
 * the serialized string so they run without a DOM.
 */

export const SHADES_NS = 'https://shades.local/ns/config/1';

/** Version of this embedding format (not of the SavedConfig envelope inside it). */
const EMBED_VERSION = '1';

export type EmbedMeta = {
	/** Saved-config name, when one is loaded. */
	name?: string;
	/** ISO timestamp of the export. */
	exportedAt: string;
};

const escapeAttr = (s: string) =>
	s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** CDATA cannot contain `]]>`; split it across two sections. */
const toCdata = (s: string) => `<![CDATA[${s.replace(/]]>/g, ']]]]><![CDATA[>')}]]>`;

export const embedConfigInSvg = (svgText: string, configJson: string, meta: EmbedMeta): string => {
	const attrs = [
		`xmlns:shades="${SHADES_NS}"`,
		`version="${EMBED_VERSION}"`,
		meta.name ? `name="${escapeAttr(meta.name)}"` : '',
		`exported="${escapeAttr(meta.exportedAt)}"`
	]
		.filter(Boolean)
		.join(' ');
	const block = `<metadata><shades:config ${attrs}>${toCdata(configJson)}</shades:config></metadata>`;

	const open = /<svg\b[^>]*?(\/?)>/.exec(svgText);
	if (!open) throw new Error('embedConfigInSvg: no <svg> root element');
	const end = open.index + open[0].length;
	if (open[1] === '/') {
		// Self-closing root: reopen it so it can hold the metadata.
		const head = svgText.slice(0, end).replace(/\s*\/>$/, '>');
		return `${head}${block}</svg>${svgText.slice(end)}`;
	}
	return `${svgText.slice(0, end)}${block}${svgText.slice(end)}`;
};

const decodeEntities = (s: string) =>
	s
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&quot;/g, '"')
		.replace(/&apos;/g, "'")
		.replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
		.replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
		.replace(/&amp;/g, '&');

export type ExtractResult =
	{ ok: true; configJson: string; name?: string } | { ok: false; error: string };

/**
 * Pull the embedded config JSON out of an SVG's text. Accepts the CDATA form
 * this module writes and plain entity-escaped text (what an editor that
 * re-serializes the file may produce). The namespace prefix may differ.
 */
export const extractConfigFromSvg = (svgText: string): ExtractResult => {
	const ns = SHADES_NS.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
	const re = new RegExp(
		`<([\\w.-]+):config\\b[^>]*xmlns:\\1="${ns}"[^>]*>([\\s\\S]*?)</\\1:config>`
	);
	const match = re.exec(svgText);
	if (!match) {
		return { ok: false, error: 'This SVG has no embedded Shades config.' };
	}
	// Concatenate CDATA sections verbatim; decode any text between them.
	let json = '';
	const body = match[2];
	const cdata = /<!\[CDATA\[([\s\S]*?)]]>/g;
	let last = 0;
	for (let m = cdata.exec(body); m; m = cdata.exec(body)) {
		json += decodeEntities(body.slice(last, m.index)) + m[1];
		last = m.index + m[0].length;
	}
	json = (json + decodeEntities(body.slice(last))).trim();
	try {
		JSON.parse(json);
	} catch {
		return { ok: false, error: 'The embedded Shades config is not valid JSON.' };
	}
	const nameAttr = /\sname="([^"]*)"/.exec(match[0].slice(0, match[0].indexOf('>')))?.[1];
	return nameAttr
		? { ok: true, configJson: json, name: decodeEntities(nameAttr) }
		: { ok: true, configJson: json };
};
