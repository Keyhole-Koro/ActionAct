import { ActPort } from './port';
import { mockActService } from './mock';
import { createRpcActService } from './rpc-client';
import { config } from '@/lib/config';

function createActService(): ActPort {
    const useMocks = config.useMocks;

    if (useMocks) {
        console.log('Using mock Act service');
        return mockActService;
    }

    return createRpcActService();
}

export const actService = createActService();
