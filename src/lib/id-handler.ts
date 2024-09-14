import { v4 as uuidv4 } from 'uuid';
import type { TempId, TempIdPrefix } from './types';

export const SUPER_GLOBULE_CONFIG = 'sup',
	SUB_GLOBULE_CONFIG = 'sub',
	GLOBULE_CONFIG = 'glb';

const PermittedPrefixes = [GLOBULE_CONFIG, SUB_GLOBULE_CONFIG, SUPER_GLOBULE_CONFIG];

export const isTempId = (id: string | TempId): id is TempId => {
	const prefix = id.slice(0, 3);
	return PermittedPrefixes.includes(prefix);
};

export const generateTempId = (idType: TempIdPrefix) => {
	return `${idType}_${uuidv4()}`;
};
