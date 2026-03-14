import { ActPort } from './port';
import { mockActService } from './mock';
import { createRpcActService } from './rpc-client';
import { env } from '@/lib/env';

function createActService(): ActPort {
    const useMocks = env.NEXT_PUBLIC_USE_MOCKS;

    if (useMocks) {
        console.log('Using mock Act service');
        return mockActService;
    }

    return createRpcActService();
}

export const actService = createActService();
