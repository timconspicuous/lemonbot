import fs from 'fs/promises';
import { EventEmitter } from 'events';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class ConfigManager extends EventEmitter {
    constructor() {
        super();
        this.configPath = path.join(__dirname, 'current-config.json');
        this.defaultConfigPath = path.join(__dirname, 'default-config.json');
        this.config = null;
    }

    async init() {
        await this.ensureCurrentConfig();
        await this.loadConfig();
    }

    async ensureCurrentConfig() {
        try {
            await fs.access(this.configPath);
        } catch (error) {
            // If current-config.json doesn't exist, copy from default-config.json
            await fs.copyFile(this.defaultConfigPath, this.configPath);
        }
    }

    async loadConfig() {
        const data = await fs.readFile(this.configPath, 'utf8');
        this.config = JSON.parse(data);
        this.emit('configUpdated', this.config);
    }

    async saveConfig(newConfig) {
        await fs.writeFile(this.configPath, JSON.stringify(newConfig, null, 2));
        this.config = newConfig;
        this.emit('configUpdated', this.config);
    }

    async readDefaultConfig() {
        const data = await fs.readFile(this.defaultConfigPath, 'utf8');
        return JSON.parse(data);
    }

    async resetConfig() {
        await fs.copyFile(this.defaultConfigPath, this.configPath);
        await this.loadConfig();
        return this.config;
    }

    async updateConfig(partialConfig) {
        const updatedConfig = this.deepMerge(this.config, partialConfig);
        await this.saveConfig(updatedConfig);
        return this.config;
    }

    deepMerge(target, source) {
        const output = Object.assign({}, target);
        if (this.isObject(target) && this.isObject(source)) {
            Object.keys(source).forEach(key => {
                if (this.isObject(source[key])) {
                    if (!(key in target))
                        Object.assign(output, { [key]: source[key] });
                    else
                        output[key] = this.deepMerge(target[key], source[key]);
                } else {
                    Object.assign(output, { [key]: source[key] });
                }
            });
        }
        return output;
    }

    isObject(item) {
        return (item && typeof item === 'object' && !Array.isArray(item));
    }

    get(key) {
        if (!this.config) {
            throw new Error('Configuration not loaded. Call init() first.');
        }
        return key.split('.').reduce((o, i) => o?.[i], this.config);
    }

    getAll() {
        if (!this.config) {
            throw new Error('Configuration not loaded. Call init() first.');
        }
        return this.config;
    }
}

const configManager = new ConfigManager();

export default configManager;