import { OrganizePort } from './port';
import { mockOrganizeService } from './mock';
import { env } from '@/lib/env';

function createOrganizeService(): OrganizePort {
    const useMocks = env.NEXT_PUBLIC_USE_MOCKS;

    if (useMocks) {
        console.log('Using mock Organize service');
        return mockOrganizeService;
    }

    // Return Real Organize Service once implemented
    throw new Error('Real Organize service not yet implemented');
}

export const organizeService = createOrganizeService();
