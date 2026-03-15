import { ActPort } from './port';
import { createRpcActService } from './rpc-client';

function createActService(): ActPort {
    return createRpcActService();
}

export const actService = createActService();
