import { Client, Collection, Events, GatewayIntentBits } from 'discord.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
dotenv.config();

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
                const updateOption = interaction.options.getBoolean('update') || false;
                await interaction.deferReply({ ephemeral: updateOption });
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
    }
});

client.login(token);