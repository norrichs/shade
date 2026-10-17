import { v4 as uuidv4 } from 'uuid';
import type { TempIdPrefix } from './types';

export const SUPER_GLOBULE_CONFIG = 'sup',
	GLOBULE_CONFIG = 'glb';

export const generateTempId = (idType: TempIdPrefix) => {
	return `${idType}_${uuidv4()}`;
};
