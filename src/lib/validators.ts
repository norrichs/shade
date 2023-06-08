import type { CutoutConfig } from './cut-pattern';

export type Validity = {
	isValid: boolean;
	messages: string[];
};

export const validateCutoutConfig = (config: CutoutConfig): Validity => {
	const validity: Validity = { isValid: true, messages: [] };
	if (
		['each-facet', 'alternating-facet'].includes(config.tilePattern.type) &&
		config.holeConfigs.flat().some((hole) => hole.type === 'HoleConfigSquare')
	) {
		validity.isValid = false;
		validity.messages.push('hole pattern tiling is triangular, but some hole configs are square');
	}
	if (
		config.tilePattern.type === 'each-rectangle' &&
		config.holeConfigs.flat().some((hole) => hole.type === 'HoleConfigTriangle')
	) {
		validity.isValid = false;
		validity.messages.push(
			'hole pattern tiling is rectangular, but some hole configs are triangular'
		);
	}

	if (!validity.isValid) {
		validity.messages.forEach((message) => console.error(message));
	}

	return validity;
};
