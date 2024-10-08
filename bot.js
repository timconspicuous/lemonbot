import { Client, Collection, Events, GatewayIntentBits } from 'discord.js';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import express from 'express';
import ngrok from 'ngrok';
import dotenv from 'dotenv';
import { setupTwitchAuth, subscribeToTwitchEvents, unsubscribeFromAllTwitchEvents, verifyTwitchSignature } from './utils/twitchUtils.js';
import { EventEmitter } from 'events';
import setupEventHandlers from './events/eventHandler.js';
import configManager from './config/configManager.js';
import configRoutes from './routes/configRoutes.js';
dotenv.config();

const app = express();
const port = 3000;

export let ngrokUrl;

const eventSubEmitter = new EventEmitter();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const client = new Client({ intents: [GatewayIntentBits.Guilds] });
const token = process.env.TOKEN;
client.commands = new Collection();
const foldersPath = path.join(__dirname, 'commands');

// Middleware for static files
app.use(express.static('public'));

// Middleware for JSON parsing, applied to all routes except /webhook
app.use((req, res, next) => {
    if (req.path === '/webhook') {
        next();
    } else {
        express.json()(req, res, next);
    }
});

// Routes
app.use(configRoutes);

// GET route to configure.html
app.get('/', (req, res) => {
    res.redirect('/configure.html');
});

// Webhook to subscribe to Twitch EventSub
app.post('/webhook', express.raw({ type: 'application/json' }), (req, res) => {
    const secret = process.env.WEBHOOK_SECRET;
    const message = req.headers['twitch-eventsub-message-id'] +
        req.headers['twitch-eventsub-message-timestamp'] +
        req.body;
    const twitchSignature = req.headers['twitch-eventsub-message-signature'];

    if (verifyTwitchSignature(secret, message, twitchSignature)) {
        console.log("Signatures match");

        let notification;
        try {
            notification = JSON.parse(req.body);
        } catch (error) {
            console.error('Error parsing webhook body:', error);
            return res.sendStatus(400);
        }

        const messageType = req.headers['twitch-eventsub-message-type'];

        if (messageType === 'notification') {
            const subscriptionType = notification.subscription.type;
            eventSubEmitter.emit(subscriptionType, notification);
            res.sendStatus(204);
        } else if (messageType === 'webhook_callback_verification') {
            res.status(200).send(notification.challenge);
        } else if (messageType === 'revocation') {
            console.log(`${notification.subscription.type} notifications revoked!`);
            console.log(`reason: ${notification.subscription.status}`);
            console.log(`condition: ${JSON.stringify(notification.subscription.condition, null, 4)}`);
            res.sendStatus(204);
        } else {
            console.log(`Unknown message type: ${messageType}`);
            res.sendStatus(204);
        }
    } else {
        console.log('403 - Signatures didn\'t match.');
        res.sendStatus(403);
    }
});

async function loadCommands() {
    try {
        const commandFolders = await fs.readdir(foldersPath);

        for (const folder of commandFolders) {
            const commandsPath = path.join(foldersPath, folder);
            const commandFiles = (await fs.readdir(commandsPath)).filter(file => file.endsWith('.js'));

            for (const file of commandFiles) {
                const filePath = path.join(commandsPath, file);

                try {
                    const command = await import(fileURLToPath(new URL(filePath, `file://${__dirname}/`)));
                    if ('data' in command && 'execute' in command) {
                        client.commands.set(command.data.name, command);
                    } else {
                        console.log(`[WARNING] The command at ${filePath} is missing a required "data" or "execute" property.`);
                    }
                } catch (error) {
                    console.error(`[ERROR] Failed to load command at ${filePath}:`, error);
                }
            }
        }
    } catch (error) {
        console.error('Error loading commands:', error);
    }
}

client.once(Events.ClientReady, readyClient => {
    loadCommands();
    console.log(`Ready! Logged in as ${readyClient.user.tag}`);
    setupEventHandlers(client, eventSubEmitter);
});

client.on(Events.InteractionCreate, async interaction => {
    if (interaction.isChatInputCommand()) {
        const command = client.commands.get(interaction.commandName);
        if (!command) return;

        try {
            if (interaction.commandName === 'schedule') {
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

async function startNgrok() {
    try {
        const url = await ngrok.connect({
            addr: port,
            authtoken: process.env.NGROK_AUTH_TOKEN,
        });
        return url;
    } catch (error) {
        console.error('Error setting up ngrok:', error);
        process.exit(1);
    }
}

async function main() {
    try {
        await configManager.init();
        app.listen(port, () => {
            console.log(`App listening at http://localhost:${port}, visit http://localhost:${port}/login to authenticate with Twitch.`);
        });

        ngrokUrl = await startNgrok();
        console.log(`Please visit ${ngrokUrl} to access your server remotely.`);

        await setupTwitchAuth(app); // TODO: add some conditions
        await client.login(token);

        // Subscribe to Twitch events
        await unsubscribeFromAllTwitchEvents();
        await Promise.all([
            subscribeToTwitchEvents(process.env.BROADCASTER_ID, 'stream.online'),
            subscribeToTwitchEvents(process.env.BROADCASTER_ID, 'stream.offline')
        ]);
    } catch (error) {
        console.error('Failed to initialize:', error);
    }
}

main();