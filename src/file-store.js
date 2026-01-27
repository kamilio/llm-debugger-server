import { generateId, nowSeconds } from './utils.js';

export class FileStore {
    constructor() {
        this.files = new Map();
    }

    create({ filename, purpose, buffer, mimeType }) {
        const id = generateId('file');
        const created_at = nowSeconds();
        const bytes = buffer ? buffer.length : 0;
        const record = {
            id,
            object: 'file',
            bytes,
            created_at,
            filename: filename || 'file',
            purpose: purpose || 'unknown',
            mimeType,
            buffer,
        };
        this.files.set(id, record);
        return record;
    }

    list() {
        return Array.from(this.files.values()).map((file) => ({
            id: file.id,
            object: 'file',
            bytes: file.bytes,
            created_at: file.created_at,
            filename: file.filename,
            purpose: file.purpose,
        }));
    }

    get(id) {
        const file = this.files.get(id);
        if (!file) return null;
        return {
            id: file.id,
            object: 'file',
            bytes: file.bytes,
            created_at: file.created_at,
            filename: file.filename,
            purpose: file.purpose,
        };
    }

    delete(id) {
        const existed = this.files.delete(id);
        return { id, object: 'file', deleted: existed };
    }
}
