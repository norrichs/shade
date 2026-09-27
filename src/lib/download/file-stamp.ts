const pad = (n: number) => String(n).padStart(2, '0');

/** `${name || 'untitled'} - YYYY-MM-DD HH.mm.ss` in local time, without `/`, `:` or `\` (unsafe in filenames). */
export const fileStamp = (name: string | undefined, now: Date = new Date()): string => {
	const base = (name ?? '').trim().replace(/[/:\\]/g, '-') || 'untitled';
	const date = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
	const time = `${pad(now.getHours())}.${pad(now.getMinutes())}.${pad(now.getSeconds())}`;
	return `${base} - ${date} ${time}`;
};
