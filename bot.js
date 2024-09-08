import { Client, Collection, Events, GatewayIntentBits } from 'discord.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import express from 'express';
import dotenv from 'dotenv';
import { setupTwitchAuth } from './utils/twitchUtils.js';
dotenv.config();

const app = express();
const port = 3000;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const client = new Client({ intents: [GatewayIntentBits.Guilds] });
const token = process.env.TOKEN;

client.commands = new Collection();

const foldersPath = path.join(__dirname, 'commands');
const commandFolders = fs.readdirSync(foldersPath);

for (const folder of commandFolders) {
    const commandsPath = path.join(foldersPath, folder);
    const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

    for (const file of commandFiles) {
        const filePath = path.join(commandsPath, file);

        // Dynamically import the command file as an ES6 module
        import(fileURLToPath(new URL(filePath, `file://${__dirname}/`)))
            .then(command => {
                // Set a new item in the Collection with the key as the command name and the value as the exported module
                if ('data' in command && 'execute' in command) {
                    client.commands.set(command.data.name, command);
                } else {
                    console.log(`[WARNING] The command at ${filePath} is missing a required "data" or "execute" property.`);
                }
            })
            .catch(error => {
                console.error(`[ERROR] Failed to load command at ${filePath}:`, error);
            });
    }
}

client.once(Events.ClientReady, readyClient => {
    console.log(`Ready! Logged in as ${readyClient.user.tag}`);
});

client.on(Events.InteractionCreate, async interaction => {
    if (interaction.isChatInputCommand()) {
        const command = client.commands.get(interaction.commandName);
        if (!command) return;

        try {
            if (interaction.commandName === 'schedule') {
                await interaction.deferReply();
                await command.execute(interaction);
            } else {
                await command.execute(interaction);
            }
        } catch (error) {
            console.error(error);
            if (interaction.deferred) {
                await interaction.editReply({ content: 'There was an error while executing this command!', ephemeral: true });
            } else {
                await interaction.reply({ content: 'There was an error while executing this command!', ephemeral: true });
            }
        }
    } else if (interaction.isAutocomplete()) {
        if (interaction.commandName === 'schedule') {
            const focusedOption = interaction.options.getFocused(true);
            if (focusedOption.name === 'week') {
                const choices = ['this', 'next', 'YYYY-MM-DD'];
                const filtered = choices.filter(choice =>
                    choice.toLowerCase().startsWith(focusedOption.value.toLowerCase())
                );
                await interaction.respond(
                    filtered.map(choice => ({ name: choice, value: choice }))
                );
            }
        }
    } else if (interaction.isMessageContextMenuCommand()) {
        const command = client.commands.get(interaction.commandName);
        if (!command) return;

        try {
            await command.execute(interaction);
        } catch (error) {
            console.error(error);
            await interaction.reply({ content: 'There was an error while executing this command!', ephemeral: true });
        }
    }
});

// TODO: set up logic so this only runs once when there are no
// tokens set or they have expired
//setupTwitchAuth(app);

// Middleware to parse JSON bodies
app.use(express.json());

// Serve static files from the 'public' directory
app.use(express.static('public'));

// Read config file
async function readConfig() {
    const configPath = path.join(__dirname, 'config.json');
    const configData = await fs.readFile(configPath, 'utf8');
    return JSON.parse(configData);
}

// Write config file
async function writeConfig(config) {
    const configPath = path.join(__dirname, 'config.json');
    await fs.writeFile(configPath, JSON.stringify(config, null, 2));
}

// GET route to configure.html
app.get('/', (req, res) => {
    res.redirect('/configure.html');
});

// GET route to fetch the current config
app.get('/api/config', async (req, res) => {
    try {
        const config = await readConfig();
        res.json(config);
    } catch (error) {
        res.status(500).json({ error: 'Failed to read config' });
    }
});

// POST route to update the config
app.post('/api/config', async (req, res) => {
    try {
        const newConfig = req.body;
        await writeConfig(newConfig);
        res.json({ message: 'Config updated successfully' });
    } catch (error) {
        res.status(500).json({ error: 'Failed to update config' });
    }
});

// POST route to reset the config to default
app.post('/api/config/reset', async (req, res) => {
    try {
        const defaultConfig = await readConfig(); // Assuming the file contains the default config
        await writeConfig(defaultConfig);
        res.json({ message: 'Config reset to default successfully' });
    } catch (error) {
        res.status(500).json({ error: 'Failed to reset config' });
    }
});

app.listen(port, () => {
    console.log(`App listening at http://localhost:${port}`);
    console.log(`Please visit http://localhost:${port}/login to authenticate with Twitch`);
});

client.login(token);