import axios from 'axios';
import dotenv from 'dotenv';
dotenv.config();

export async function getMovieInfo(movieTitle) {
    const queryParam = movieTitle.toLowerCase();
    try {
        const response = await axios.get('https://www.doesthedogdie.com/dddsearch', {
            headers: {
                'Accept': 'application/json',
                'X-API-KEY': process.env.DTDD_API_KEY,
            },
            params: {
                q: queryParam,
            }
        });
        
        return response.data;
    } catch (error) {
        console.error('Error getting Does the Dog Die info:', error.response.data);
        throw error;
    }
}