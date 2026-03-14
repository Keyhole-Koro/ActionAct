import { OrganizePort } from './port';
import { mockOrganizeService } from './mock';
import { firestoreOrganizeService } from './firestore';
import { config } from '@/lib/config';

function createOrganizeService(): OrganizePort {
    const useMocks = config.useMocks;

    if (useMocks) {
        console.log('Using mock Organize service');
        return mockOrganizeService;
    }

    return firestoreOrganizeService;
}

export const organizeService = createOrganizeService();
