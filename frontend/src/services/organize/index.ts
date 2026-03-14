import { OrganizePort } from './port';
import { mockOrganizeService } from './mock';

function createOrganizeService(): OrganizePort {
    const useMocks = process.env.NEXT_PUBLIC_USE_MOCKS === 'true';

    if (useMocks) {
        console.log('Using mock Organize service');
        return mockOrganizeService;
    }

    // Return Real Organize Service once implemented
    throw new Error('Real Organize service not yet implemented');
}

export const organizeService = createOrganizeService();
