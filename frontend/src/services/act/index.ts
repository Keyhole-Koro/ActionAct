import { ActPort } from './port';
import { mockActService } from './mock';
import { createRpcActService } from './rpc-client';

function createActService(): ActPort {
    const useMocks = process.env.NEXT_PUBLIC_USE_MOCKS === 'true';

    if (useMocks) {
        console.log('Using mock Act service');
        return mockActService;
    }

    return createRpcActService();
}

export const actService = createActService();
