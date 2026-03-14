import { ActPort } from './port';
import { mockActService } from './mock';

function createActService(): ActPort {
    const useMocks = process.env.NEXT_PUBLIC_USE_MOCKS === 'true';

    if (useMocks) {
        console.log('Using mock Act service');
        return mockActService;
    }

    throw new Error('Real Act service not yet implemented');
}

export const actService = createActService();
