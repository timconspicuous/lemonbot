import axios from 'axios';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const TWITCH_AUTH_URL = 'https://id.twitch.tv/oauth2/authorize';
const TWITCH_TOKEN_URL = 'https://id.twitch.tv/oauth2/token';
const REDIRECT_URI = 'http://localhost:3000/callback';

function updateEnv(accessToken, refreshToken) {
    const envPath = path.resolve(__dirname, '..', '.env');
    const envContent = fs.readFileSync(envPath, 'utf8');
    const updatedContent = envContent
        .replace(/^TWITCH_ACCESS_TOKEN=.*$/m, `TWITCH_ACCESS_TOKEN=${accessToken}`)
        .replace(/^TWITCH_REFRESH_TOKEN=.*$/m, `TWITCH_REFRESH_TOKEN=${refreshToken}`);
    fs.writeFileSync(envPath, updatedContent);

    // Update process.env with new values
    process.env.TWITCH_ACCESS_TOKEN = accessToken;
    process.env.TWITCH_REFRESH_TOKEN = refreshToken;
}

export function setupTwitchAuth(app) {
    app.get('/login', (req, res) => {
        const authUrl = `${TWITCH_AUTH_URL}?client_id=${process.env.TWITCH_CLIENT_ID}&redirect_uri=${REDIRECT_URI}&response_type=code&scope=channel:manage:schedule`;
        res.redirect(authUrl);
    });

    app.get('/callback', async (req, res) => {
        const { code } = req.query;

        try {
            const response = await axios.post(TWITCH_TOKEN_URL, null, {
                params: {
                    client_id: process.env.TWITCH_CLIENT_ID,
                    client_secret: process.env.TWITCH_CLIENT_SECRET,
                    code,
                    grant_type: 'authorization_code',
                    redirect_uri: REDIRECT_URI
                }
            });

            const { access_token, refresh_token } = response.data;
            updateEnv(access_token, refresh_token);
            res.send('Authentication successful! You can close this window.');
        } catch (error) {
            console.error('Error exchanging code for token:', error);
            res.status(500).send('Authentication failed');
        }
    });
}

export async function getTwitchOAuthToken() {
    try {
        const response = await axios.post(TWITCH_TOKEN_URL, null, {
            params: {
                client_id: process.env.TWITCH_CLIENT_ID,
                client_secret: process.env.TWITCH_CLIENT_SECRET,
                grant_type: 'client_credentials'
            }
        });

        return response.data.access_token;
    } catch (error) {
        console.error('Error getting Twitch OAuth token:', error);
        throw error;
    }
}

export async function createScheduleSegment(broadcasterId, startTime, duration, title) {
    try {
        const response = await axios.post('https://api.twitch.tv/helix/schedule/segment', {
            broadcaster_id: broadcasterId,
            start_time: startTime,
            duration: duration,
            title: title,
            category_id: '0',
            is_recurring: false
        }, {
            headers: {
                'Client-ID': process.env.TWITCH_CLIENT_ID,
                'Authorization': `Bearer ${process.env.TWITCH_ACCESS_TOKEN}`,
                'Content-Type': 'application/json'
            }
        });

        return response.data;
    } catch (error) {
        console.error('Error creating schedule segment:', error);
        throw error;
    }
}