import { EmbedBuilder } from 'discord.js';
import configManager from '../config/configManager.js';
import { getTwitchUser, getChannelInformation, getStreams, searchTwitchCategories } from '../utils/twitchUtils.js';
import storage from 'node-persist';
import dotenv from 'dotenv';
dotenv.config();

await storage.initSync();

export default function setupEventHandlers(client, emitter) {
    emitter.on('stream.online', (data) => handleStreamOnline(client, data));
    emitter.on('stream.offline', (data) => handleStreamOffline(client, data));
    // Set up other event handlers
}

async function handleStreamOnline(client, notification) {
    const broadcasterName = notification.event.broadcaster_user_name;
    const broadcasterId = notification.event.broadcaster_user_id;
    console.log(`${broadcasterName} has gone live`);

    function removeSizeSuffix(url) {
        // Regex to match the pattern "-digitsxdigits" (e.g., -52x72) before the file extension
        return url.replace(/-\d+x\d+(?=\.\w+$)/, '');
    }

    try {
        const [streamData, channel] = await Promise.all([
            getStreams(broadcasterId),
            client.channels.fetch(process.env.DISCORD_CHANNEL_ID),
        ]);
        const gameName = streamData.game_name;
        const [userData, categoryData] = await Promise.all([
            getTwitchUser(broadcasterId, null),
            searchTwitchCategories(gameName),
        ]);
        const streamTitle = streamData.title;
        const thumbnail = streamData.thumbnail_url.replace('{width}', 1280).replace('{height}', 720);
        const profilePic = userData.profile_image_url;
        const boxArt = removeSizeSuffix(categoryData.box_art_url);

        const embed = new EmbedBuilder()
            .setColor(0x6441A5)
            .setTitle(streamTitle)
            .setURL(`https://www.twitch.tv/${broadcasterName}`)
            .setAuthor({ name: broadcasterName, iconURL: profilePic, url: `https://www.twitch.tv/${broadcasterName}` })
            .setDescription(`${broadcasterName} is now live on Twitch!`)
            .addFields(
                { name: 'Playing', value: gameName },
            )
            .setThumbnail(boxArt)
            .setImage(thumbnail)
            .setTimestamp()
            .setFooter({ text: 'Twitch', iconURL: 'https://images-ext-1.discordapp.net/external/q5lmj_2DOGYHbmJBO9Ic5Yg6o4Sgt8nQc8n7x_BT1rI/https/sapph.xyz/images/socials/sapphire_twitch.png' });

        if (channel) {
            const message = await channel.send({
                content: configManager.get('eventSub.streamOnlineNotification'),
                embeds: [embed],
            });
            await storage.setItem('streamNotification', message.id);
        }
    } catch (error) {
        console.error('Error sending message:', error);
    }
}

async function handleStreamOffline(client, notification) {
    const broadcasterName = notification.event.broadcaster_user_name;
    const broadcasterId = notification.event.broadcaster_user_id;
    console.log(`${broadcasterName} has gone offline`);

    const [messageId, channel] = await Promise.all([
        storage.getItem('streamNotification'),
        client.channels.fetch(process.env.DISCORD_CHANNEL_ID),
    ]);
    const [message, userData, channelInfo] = await Promise.all([
        channel.messages.fetch(messageId),
        getTwitchUser(broadcasterId, null),
        getChannelInformation(broadcasterId),
    ]);
    const gameName = channelInfo.game_name;
    const profilePic = userData.profile_image_url;

    const embed = new EmbedBuilder()
        .setColor(0x6441A5)
        .setTitle(`${broadcasterName} is currently offine`)
        .setAuthor({ name: broadcasterName, iconURL: profilePic, url: `https://www.twitch.tv/${broadcasterName}` })
        .setDescription(`${broadcasterName}'s stream has ended for today.`)
        .addFields(
            { name: 'Today we played:', value: gameName },
        )
        .setTimestamp()
        .setFooter({ text: 'Twitch', iconURL: 'https://images-ext-1.discordapp.net/external/q5lmj_2DOGYHbmJBO9Ic5Yg6o4Sgt8nQc8n7x_BT1rI/https/sapph.xyz/images/socials/sapphire_twitch.png' });

    await message.edit({
        content: configManager.get('eventSub.streamOfflineNotification'),
        embeds: [embed],
    });
}