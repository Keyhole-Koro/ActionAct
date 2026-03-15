import { OrganizePort } from './port';
import { firestoreOrganizeService } from './firestore';

function createOrganizeService(): OrganizePort {
    return firestoreOrganizeService;
}

export const organizeService = createOrganizeService();
