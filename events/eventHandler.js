import configManager from '../config/configManager.js';
import { getStreams } from '../utils/twitchUtils.js';
import dotenv from 'dotenv';
dotenv.config();

export default function setupEventHandlers(client, emitter) {
    emitter.on('stream.online', (data) => handleStreamOnline(client, data));
    emitter.on('stream.offline', (data) => handleStreamOffline(client, data));
    // Set up other event handlers
}

async function handleStreamOnline(client, notification) {
    const broadcasterName = notification.event.broadcaster_user_name;
    const broadcasterId = notification.event.broadcaster_user_id;
    console.log(`${broadcasterName} has gone live`);

    try {
        const streamData = await getStreams(broadcasterId);
        console.log(streamData);
        const channel = await client.channels.fetch(process.env.DISCORD_CHANNEL_ID);
        if (channel) {
            await channel.send('tim has gone live beep boop');
        }
    } catch (error) {
        console.error('Error sending message:', error);
    }
}

async function handleStreamOffline(client, notification) {

}