import { OrganizePort } from './port';
import { mockOrganizeService } from './mock';
import { config } from '@/lib/config';

const unimplementedOrganizeService: OrganizePort = {
    subscribeTree: () => () => undefined,
    renameNode: async () => {
        throw new Error('Real Organize service not yet implemented');
    },
    deleteNode: async () => {
        throw new Error('Real Organize service not yet implemented');
    },
    moveNode: async () => {
        throw new Error('Real Organize service not yet implemented');
    },
};

function createOrganizeService(): OrganizePort {
    const useMocks = config.useMocks;

    if (useMocks) {
        console.log('Using mock Organize service');
        return mockOrganizeService;
    }

    return unimplementedOrganizeService;
}

export const organizeService = createOrganizeService();
