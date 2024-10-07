import axios from 'axios';
import { load } from "jsr:@std/dotenv";

await load({ export: true });

// Does the Dog Die
export async function DDTDSearch(movieTitle) {
    const queryParam = movieTitle.toLowerCase();
    try {
        const response = await axios.get('https://www.doesthedogdie.com/dddsearch', {
            headers: {
                'Accept': 'application/json',
                'X-API-KEY': Deno.env.get("DTDD_API_KEY"),
            },
            params: {
                q: queryParam,
            }
        });

        return response.data;
    } catch (error) {
        console.error('Error getting Does the Dog Die data:', error.response.data);
        throw error;
    }
}

export async function DDTDMedia(itemId) {
    try {
        const response = await axios.get(`https://www.doesthedogdie.com/media/${itemId}`, {
            headers: {
                'Accept': 'application/json',
                'X-API-KEY': Deno.env.get("DTDD_API_KEY"),
            }
        });

        return response.data;
    } catch (error) {
        console.error('Error getting Does the Dog Die data:', error.response.data);
        throw error;
    }
}

export function getTriggers(data) {
    const uniqueCategories = new Set();
    let triggerCount = 0;

    // Iterate over topicItemStats
    data.topicItemStats.forEach((item) => {
        if (item.yesSum > item.noSum) {
            uniqueCategories.add(item.topic.TopicCategory.name);
            triggerCount++;
        }
    });

    return { categories: Array.from(uniqueCategories), triggerCount };
}

// Open Movie Database
export async function OMDbSearch(imdbId = null, title = null) {
    try {
        const response = await axios.get(`https://www.omdbapi.com/`, {
            params: {
                apikey: Deno.env.get("OMDB_API_KEY"),
                i: imdbId,
                t: title,
            }
        })

        return response.data;
    } catch (error) {
        console.error('Error getting Open Movie Database data:', error.response.data);
        throw error;
    }
}