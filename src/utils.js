import { readFileSync } from 'node:fs';
import { extname, resolve } from 'node:path';
import crypto from 'node:crypto';
import yaml from 'js-yaml';

export function parseBoolean(value, fallback = false) {
    if (value === undefined || value === null) return fallback;
    if (typeof value === 'boolean') return value;
    const normalized = String(value).trim().toLowerCase();
    if (['true', '1', 'yes', 'y', 'on'].includes(normalized)) return true;
    if (['false', '0', 'no', 'n', 'off'].includes(normalized)) return false;
    return fallback;
}

export function parseNumber(value, fallback) {
    if (value === undefined || value === null || value === '') return fallback;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
}

export function parseInteger(value, fallback) {
    if (value === undefined || value === null || value === '') return fallback;
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : fallback;
}

export function readConfigFile(filePath) {
    const raw = readFileSync(filePath, 'utf-8');
    const ext = extname(filePath).toLowerCase();
    if (ext === '.json') {
        return JSON.parse(raw);
    }
    return yaml.load(raw);
}

export function resolvePath(baseDir, targetPath) {
    if (!targetPath) return null;
    return resolve(baseDir, targetPath);
}

export function generateId(prefix = 'id') {
    const id = crypto.randomUUID();
    return `${prefix}_${id}`;
}

export function nowSeconds() {
    return Math.floor(Date.now() / 1000);
}

export function countTokens(input, strategy = 'chars') {
    if (!input) return 0;
    const text = String(input);
    if (strategy === 'words') {
        const trimmed = text.trim();
        if (!trimmed) return 0;
        return trimmed.split(/\s+/).length;
    }
    return text.length;
}

export function combineTokens(values, strategy) {
    if (!values) return 0;
    if (Array.isArray(values)) {
        return values.reduce((sum, value) => sum + countTokens(value, strategy), 0);
    }
    return countTokens(values, strategy);
}

export function toArray(value) {
    if (value === undefined || value === null) return [];
    return Array.isArray(value) ? value : [value];
}

export function safeJsonParse(value) {
    if (typeof value !== 'string') return null;
    try {
        return JSON.parse(value);
    } catch {
        return null;
    }
}

export function normalizeHeaderValue(value) {
    if (Array.isArray(value)) return value[0];
    return value;
}

export function sanitizeModelName(name) {
    if (!name) return '';
    return String(name).trim();
}
