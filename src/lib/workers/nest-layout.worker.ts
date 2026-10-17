import { runNestRequest, type NestRequest } from './nest-layout-worker-core';

self.onmessage = (e: MessageEvent<NestRequest>) => {
	self.postMessage(runNestRequest(e.data));
};
