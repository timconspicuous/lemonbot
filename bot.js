import { Client, Collection, Events, GatewayIntentBits } from "discord.js";
import express from "express";
import ngrok from "ngrok";
import {
    setupTwitchAuth,
    subscribeToTwitchEvents,
    unsubscribeFromAllTwitchEvents,
    verifyTwitchSignature,
} from "./utils/twitchUtils.js";
import { EventEmitter } from "node:events";
import setupEventHandlers from "./events/eventHandler.js";
import configManager from "./config/configManager.js";
import configRoutes from "./routes/configRoutes.js";
import { load } from "jsr:@std/dotenv";

await load({ export: true });

const app = express();
const port = 3000;

export let ngrokUrl;

const eventSubEmitter = new EventEmitter();

const client = new Client({ intents: [GatewayIntentBits.Guilds] });
const token = Deno.env.get("TOKEN");
client.commands = new Collection();
const commandsDir = new URL("commands", import.meta.url).pathname;

// Middleware for static files
app.use(express.static("public"));

// Middleware for JSON parsing, applied to all routes except /webhook
app.use((req, res, next) => {
    if (req.path === "/webhook") {
        next();
    } else {
        express.json()(req, res, next);
    }
});

// Routes
app.use(configRoutes);

// GET route to configure.html
app.get("/", (_req, res) => {
    res.redirect("/configure.html");
});

// Webhook to subscribe to Twitch EventSub
app.post("/webhook", express.raw({ type: "application/json" }), (req, res) => {
    const secret = Deno.env.get("WEBHOOK_SECRET");
    const message = req.headers["twitch-eventsub-message-id"] +
        req.headers["twitch-eventsub-message-timestamp"] +
        req.body;
    const twitchSignature = req.headers["twitch-eventsub-message-signature"];

    if (verifyTwitchSignature(secret, message, twitchSignature)) {
        console.log("Signatures match");

        let notification;
        try {
            notification = JSON.parse(req.body);
        } catch (error) {
            console.error("Error parsing webhook body:", error);
            return res.sendStatus(400);
        }

        const messageType = req.headers["twitch-eventsub-message-type"];

        if (messageType === "notification") {
            const subscriptionType = notification.subscription.type;
            eventSubEmitter.emit(subscriptionType, notification);
            res.sendStatus(204);
        } else if (messageType === "webhook_callback_verification") {
            res.status(200).send(notification.challenge);
        } else if (messageType === "revocation") {
            console.log(
                `${notification.subscription.type} notifications revoked!`,
            );
            console.log(`reason: ${notification.subscription.status}`);
            console.log(
                `condition: ${JSON.stringify(notification.subscription.condition, null, 4)
                }`,
            );
            res.sendStatus(204);
        } else {
            console.log(`Unknown message type: ${messageType}`);
            res.sendStatus(204);
        }
    } else {
        console.log("403 - Signatures didn't match.");
        res.sendStatus(403);
    }
});

async function loadCommands() {
    try {
        for await (const folder of Deno.readDir(commandsDir)) {
            if (!folder.isDirectory) continue;

            const categoryPath = new URL(`commands/${folder.name}`, import.meta.url).pathname;

            for await (const file of Deno.readDir(categoryPath)) {
                if (!file.isFile || !file.name.endsWith(".js")) continue;

                const filePath = new URL(`commands/${folder.name}/${file.name}`, import.meta.url).pathname;

                try {
                    const command = await import(filePath);
                    if ("data" in command && "execute" in command) {
                        client.commands.set(command.data.name, command);
                        // console.log(`Loaded command: ${command.data.name}`);
                    } else {
                        console.log(
                            `[WARNING] The command at ${filePath} is missing a required "data" or "execute" property.`,
                        );
                    }
                } catch (error) {
                    console.error(
                        `[ERROR] Failed to load command at ${filePath}:`,
                        error,
                    );
                }
            }
        }
    } catch (error) {
        console.error("Error loading commands:", error);
    }
}

client.once(Events.ClientReady, (readyClient) => {
    loadCommands();
    console.log(`Ready! Logged in as ${readyClient.user.tag}`);
    setupEventHandlers(client, eventSubEmitter);
});

client.on(Events.InteractionCreate, async (interaction) => {
    if (interaction.isChatInputCommand()) {
        const command = client.commands.get(interaction.commandName);
        if (!command) return;

        try {
            await command.execute(interaction);
        } catch (error) {
            console.error(error);
            if (interaction.deferred) {
                await interaction.editReply({
                    content: "There was an error while executing this command!",
                    ephemeral: true,
                });
            } else {
                await interaction.reply({
                    content: "There was an error while executing this command!",
                    ephemeral: true,
                });
            }
        }
    } else if (interaction.isAutocomplete()) {
        if (interaction.commandName === "schedule") {
            const focusedOption = interaction.options.getFocused(true);
            if (focusedOption.name === "week") {
                const choices = ["this", "next", "YYYY-MM-DD"];
                const filtered = choices.filter((choice) =>
                    choice.toLowerCase().startsWith(
                        focusedOption.value.toLowerCase(),
                    )
                );
                await interaction.respond(
                    filtered.map((choice) => ({ name: choice, value: choice })),
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
            await interaction.reply({
                content: "There was an error while executing this command!",
                ephemeral: true,
            });
        }
    }
});

function killExistingNgrok() {
    try {
        const _command = new Deno.Command("pkill", {
            args: ["-f", "ngrok"],
            stdout: "piped",
            stderr: "piped",
        });
    } catch (_error) {
        // It's okay if this fails, it might mean no ngrok process was running
    }
}

async function startNgrok() {
    killExistingNgrok();
    try {
        const url = await ngrok.connect({
            addr: port,
            authtoken: Deno.env.get("NGROK_AUTH_TOKEN"),
        });
        return url;
    } catch (error) {
        console.error('Error setting up ngrok:', error);
    }
}

async function main() {
    try {
        await configManager.init();
        app.listen(port, () => {
            console.log(
                `App listening at http://localhost:${port}, visit http://localhost:${port}/login to authenticate with Twitch.`,
            );
        });

        ngrokUrl = await startNgrok();
        console.log(`Please visit ${ngrokUrl} to access your server remotely.`);

        setupTwitchAuth(app); // TODO: add some conditions
        await client.login(token);

        // Subscribe to Twitch events
        await unsubscribeFromAllTwitchEvents();
        await Promise.all([
            subscribeToTwitchEvents(
                Deno.env.get("BROADCASTER_ID"),
                "stream.online",
            ),
            subscribeToTwitchEvents(
                Deno.env.get("BROADCASTER_ID"),
                "stream.offline",
            ),
        ]);
    } catch (error) {
        console.error("Failed to initialize:", error);
    }
}

main();
