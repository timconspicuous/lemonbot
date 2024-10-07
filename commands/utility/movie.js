import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { DDTDSearch, DDTDMedia, getTriggers, OMDbSearch } from '../../utils/movieUtils.js';

export const data = new SlashCommandBuilder()
    .setName('movie')
    .setDescription('Get information about a movie')
    .addStringOption(option =>
        option.setName('title')
            .setDescription('The title of the movie')
            .setRequired(true));

export async function execute(interaction) {
    await interaction.deferReply();
    const title = interaction.options.getString('title');

    const data = await DDTDSearch(title);
    const { id,
        name,
        tmdbId,
        imdbId,
        overview,
    } = data.items[0];

    let triggerString;
    if (id) {
        const triggerData = await DDTDMedia(id);
        const { categories, triggerCount } = getTriggers(triggerData);
        triggerString = `Found ${triggerCount} potentially triggering events in the categories ${categories.join(", ")}.`;
    }
    let omdbData;
    if (imdbId) {
        omdbData = await OMDbSearch(imdbId, null);
    } else {
        omdbData = await OMDbSearch(null, title);
    }

    const embed = new EmbedBuilder()
        .setColor(0x0099FF)
        .setTitle(name)
        .addFields(
            { name: 'Year', value: omdbData.Year, inline: true },
            { name: 'Runtime', value: omdbData.Runtime, inline: true },
            { name: 'Genre', value: omdbData.Genre, inline: true },
            //{ name: 'Director', value: omdbData.Director, inline: true },
            { name: 'Plot', value: overview, inline: false },
            { name: 'Links', value: `[Letterboxd](https://www.letterboxd.com/tmdb/${tmdbId}) | [IMDb](https://www.imdb.com/title/${omdbData.imdbID}) | [DoesTheDogDie](https://www.doesthedogdie.com/media/${id})`, inline: false },
            { name: 'Triggers', value: triggerString, inline: false },
        )
        .setThumbnail(omdbData.Poster)
        .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
}