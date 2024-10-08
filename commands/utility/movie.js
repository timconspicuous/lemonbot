import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { getDTDDInfo } from '../../utils/movieUtils.js';

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

    const data = await getDTDDInfo(title);
    const { id,
        name,
        genre,
        releaseYear,
        tmdbId,
        imdbId,
        posterImage,
        overview,
    } = data.items[0];

    const embed = new EmbedBuilder()
        .setColor(0x0099FF)
        .setTitle(name)
        .addFields(
            { name: 'Info', value: `${genre.charAt(0).toUpperCase() + genre.slice(1)}, ${releaseYear}`, inline: false },
            { name: 'Plot', value: overview, inline: false },
            { name: 'Links', value: `[Letterboxd](https://www.letterboxd.com/tmdb/${tmdbId}) | [IMDb](https://www.imdb.com/title/${imdbId}) | [DoesTheDogDie](https://www.doesthedogdie.com/media/${id})`, inline: false }
        )
        .setThumbnail(`https://www.doesthedogdie.com/content/200/0/${posterImage}`)
        .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
}