/**
 * Compose the self-tag label lines. When `externalTagEnabled` is true and a
 * `groupCode` exists, the group code is appended to the address, space-joined
 * on a single line (e.g. "t0/b1 0003"). Otherwise the address is returned
 * unchanged. Group codes only exist in end-connection mode (WS-B); in tube
 * order mode `groupCode` is undefined and the address is returned as-is.
 */
export const buildSelfTagLines = (
	addressString: string,
	groupCode: string | undefined,
	externalTagEnabled: boolean
): string[] => {
	if (externalTagEnabled && groupCode !== undefined) {
		return [`${addressString} ${groupCode}`];
	}
	return [addressString];
};
