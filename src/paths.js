import { homedir } from 'node:os';
import { resolve } from 'node:path';

const DEFAULT_PID_FILENAME = 'llm-debugger.pid';
const DEFAULT_DIRNAME = '.llm-debugger';

export function getPidFilePath() {
    const fromEnv = process.env.LLM_DEBUGGER_PID || process.env.PID_FILE;
    if (fromEnv) {
        return resolve(fromEnv);
    }
    return resolve(homedir(), DEFAULT_DIRNAME, DEFAULT_PID_FILENAME);
}

export function getDefaultConfigPath(cwd = process.cwd()) {
    return resolve(cwd, 'config.yaml');
}
