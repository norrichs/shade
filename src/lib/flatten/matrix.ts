type TransformMatrix = [
	[number, number, number],
	[number, number, number],
	[number, number, number]
];

type TransformConfig = {
	translateX?: number;
	translateY?: number;
	rotation?: number;
	scaleX?: number;
	scaleY?: number;
	skewX?: number;
	skewY?: number;
};

const multiplyMatrices = (matrixA: TransformMatrix, matrixB: TransformMatrix) => {
	const newMatrix: TransformMatrix = [
		[0, 0, 0],
		[0, 0, 0],
		[0, 0, 0]
	];

	for (let r = 0; r < 3; ++r) {
		for (let c = 0; c < 3; ++c) {
			newMatrix[r][c] = 0;

			for (let i = 0; i < 3; ++i) {
				newMatrix[r][c] += matrixA[r][i] * matrixB[i][c];
			}
		}
	}

	return newMatrix;
};

export const getTransformMatrix = (config: TransformConfig): TransformMatrix => {
	const translateX = config.translateX || 0;
	const translateY = config.translateY || 0;
	const rotation = config.rotation || 0;
	const scaleX = config.scaleX || 1;
	const scaleY = config.scaleY || 1;
	const skewX = config.skewX || 0;
	const skewY = config.skewY || 0;

	const translationMatrix: TransformMatrix = [
		[1, 0, translateX],
		[0, 1, translateY],
		[0, 0, 1]
	];
	const scalingMatrix: TransformMatrix = [
		[scaleX, 0, 0],
		[0, scaleY, 0],
		[0, 0, 1]
	];
	const rotationMatrix: TransformMatrix = [
		[Math.cos(rotation), -Math.sin(rotation), 0],
		[Math.sin(rotation), Math.cos(rotation), 0],
		[0, 0, 1]
	];

	const skewMatrix: TransformMatrix = [
		[1, Math.tan(skewX), 0],
		[Math.tan(skewY), 1, 0],
		[0, 0, 1]
	];

	const transformMatrix = multiplyMatrices(
		multiplyMatrices(multiplyMatrices(translationMatrix, scalingMatrix), rotationMatrix),
		skewMatrix
	);
	return transformMatrix;
};

export const parseTransformString = (str: string): TransformConfig => {
	const transforms = str
		.split('\n')
		.map((t) => {
			return t
				.replaceAll('\t', ' ')
				.replaceAll('(', ' ')
				.replaceAll(')', ' ')
				.split(' ')
				.filter((elem) => elem !== '')
				.map((elem, i) => {
					elem.trim();
					return i > 0 ? parseFloat(elem) : elem;
				});
		})
		.filter((elem) => elem.length > 0);

	const config: TransformConfig = {};
	const translate = transforms.find((arr) => arr[0] === 'translate');
	const rotate = transforms.find((arr) => arr[0] === 'rotate');
	const scale = transforms.find((arr) => arr[0] === 'scale');
	const skewX = transforms.find((arr) => arr[0] === 'skewX');
	console.debug('transforms', transforms);
	if (translate) {
        if (typeof translate[1] === 'number') {
			config.translateX = translate[1];
		}
		if (typeof translate[2] === 'number') {
			config.translateY = translate[2];
		}
	}
	if (rotate && typeof rotate[1] === 'number') {
		config.rotation = (rotate[1] * Math.PI) / 180;
	}
	if (scale) {
		if (typeof scale[1] === 'number') {
			config.scaleX = scale[1];
		}
		if (typeof scale[2] === 'number') {
			config.scaleY = scale[2];
		}
	}
	if (skewX && typeof skewX[1] === 'number') {
		config.skewX = (skewX[1] * Math.PI) / 180;
	}

	return config;
};
