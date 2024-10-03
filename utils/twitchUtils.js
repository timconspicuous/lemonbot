import axios from 'axios';
import configManager from '../config/configManager.js';
import { filterEventsByLocation, filterEventsByWeek } from './calendarUtils.js';
import crypto from 'node:crypto';
import { Buffer } from "node:buffer";
import { load } from "jsr:@std/dotenv";

await load({ export: true });

const TWITCH_AUTH_URL = 'https://id.twitch.tv/oauth2/authorize';
const TWITCH_TOKEN_URL = 'https://id.twitch.tv/oauth2/token';
const REDIRECT_URI = 'http://localhost:3000/callback';
if (!Deno.env.get("BROADCASTER_ID")) {
    try {
        const user = await getTwitchUser(null, Deno.env.get("LOGIN_NAME"));
        Deno.env.set("BROADCASTER_ID", user.id);
    } catch (error) {
        console.error('Error establishing Broadcaster ID:', error);
        throw error;
    }
}

export function setupTwitchAuth(app) {
    app.get('/login', (_req, res) => {
        const authUrl = `${TWITCH_AUTH_URL}?client_id=${Deno.env.get("TWITCH_CLIENT_ID")}&redirect_uri=${REDIRECT_URI}&response_type=code&scope=channel:manage:schedule`;
        res.redirect(authUrl);
    });

    app.get('/callback', async (req, res) => {
        const { code } = req.query;

        try {
            const response = await axios.post(TWITCH_TOKEN_URL, null, {
                params: {
                    client_id: Deno.env.get("TWITCH_CLIENT_ID"),
                    client_secret: Deno.env.get("TWITCH_CLIENT_SECRET"),
                    code,
                    grant_type: 'authorization_code',
                    redirect_uri: REDIRECT_URI,
                }
            });

            const { access_token, refresh_token } = response.data;
            Deno.env.set("TWITCH_ACCESS_TOKEN", access_token);
            Deno.env.set("TWITCH_REFRESH_TOKEN", refresh_token);
            res.send('Authentication successful! You can close this window.');
        } catch (error) {
            console.error('Error exchanging code for token:', error);
            res.status(500).send('Authentication failed');
        }
    });
}

async function refreshAccessToken() {
    try {
        const response = await axios.post(TWITCH_TOKEN_URL, null, {
            params: {
                client_id: Deno.env.get("TWITCH_CLIENT_ID"),
                client_secret: Deno.env.get("TWITCH_CLIENT_SECRET"),
                refresh_token: Deno.env.get("TWITCH_REFRESH_TOKEN"),
                grant_type: 'refresh_token',
            }
        });

        const { access_token, refresh_token } = response.data;
        Deno.env.set("TWITCH_ACCESS_TOKEN", access_token);
        Deno.env.set("TWITCH_REFRESH_TOKEN", refresh_token);

        return access_token;
    } catch (error) {
        console.error('Error refreshing access token:', error.response ? error.response.data : error.message);
        throw new Error('Failed to refresh access token');
    }
}

async function twitchApiWrapper(apiCall) {
    try {
        return await apiCall();
    } catch (error) {
        if (error.response && error.response.status === 401) {
            console.log('Access token expired. Refreshing...');
            await refreshAccessToken();
            return await apiCall();
        }
        throw error;
    }
}

async function getTwitchOAuthToken() {
    try {
        const response = await axios.post(TWITCH_TOKEN_URL, null, {
            params: {
                client_id: Deno.env.get("TWITCH_CLIENT_ID"),
                client_secret: Deno.env.get("TWITCH_CLIENT_SECRET"),
                grant_type: 'client_credentials',
            }
        });

        return response.data.access_token;
    } catch (error) {
        console.error('Error getting Twitch OAuth token:', error);
        throw error;
    }
}

export async function getTwitchUser(id, login) {
    if (!id && !login) {
        throw new Error('At least one of id or login must be provided');
    }
    try {
        const accessToken = await getTwitchOAuthToken();
        const params = {};
        if (id) params.id = id;
        if (login) params.login = login;
        const response = await axios.get('https://api.twitch.tv/helix/users', {
            headers: {
                'Client-ID': Deno.env.get("TWITCH_CLIENT_ID"),
                'Authorization': `Bearer ${accessToken}`,
            },
            params: params,
        });

        return response.data.data[0];
    } catch (error) {
        console.error('Error getting Twitch user:', error);
        throw error;
    }
}

export async function getChannelInformation(broadcasterId = Deno.env.get("BROADCASTER_ID")) {
    try {
        const accessToken = await getTwitchOAuthToken();
        const response = await axios.get('https://api.twitch.tv/helix/channels', {
            headers: {
                'Client-ID': Deno.env.get("TWITCH_CLIENT_ID"),
                'Authorization': `Bearer ${accessToken}`,
            },
            params: {
                broadcaster_id: broadcasterId,
            }
        });

        return response.data.data[0];
    } catch (error) {
        console.error('Error getting Twitch channel information:', error);
        throw error;
    }
}

export async function getStreams(broadcasterId = Deno.env.get("BROADCASTER_ID")) {
    try {
        const accessToken = await getTwitchOAuthToken();
        const response = await axios.get('https://api.twitch.tv/helix/streams', {
            headers: {
                'Client-ID': Deno.env.get("TWITCH_CLIENT_ID"),
                'Authorization': `Bearer ${accessToken}`,
            },
            params: {
                user_id: broadcasterId,
            }
        });

        return response.data.data[0];
    } catch (error) {
        console.error('Error getting Twitch streams:', error);
        throw error;
    }
}

export async function searchTwitchCategories(name) {
    try {
        const accessToken = await getTwitchOAuthToken();
        const response = await axios.get('https://api.twitch.tv/helix/search/categories', {
            headers: {
                'Client-ID': Deno.env.get("TWITCH_CLIENT_ID"),
                'Authorization': `Bearer ${accessToken}`,
            },
            params: {
                query: name,
            }
        });
        if (response.data.data == []) {
            console.warn('Twitch category not found, verify input name.')
        }

        return response.data.data[0];
    } catch (error) {
        console.error('Error getting Twitch category:', error.response.data);
        throw error;
    }
}

async function getChannelSchedule() {
    try {
        const accessToken = await getTwitchOAuthToken();
        const response = await axios.get('https://api.twitch.tv/helix/schedule', {
            headers: {
                'Client-ID': Deno.env.get("TWITCH_CLIENT_ID"),
                'Authorization': `Bearer ${accessToken}`,
            },
            params: {
                broadcaster_id: Deno.env.get("BROADCASTER_ID"),
            }
        });

        return response.data.data;
    } catch (error) {
        if (error.response && error.response.status === 404) {
            console.warn('No preexisting schedule:', error.response.data);
        } else {
            console.error('Error getting schedule:', error.response.data);
            throw error;
        }
    }
}

function createScheduleSegment(segmentData) {
    return twitchApiWrapper(async () => {
        const response = await axios.post('https://api.twitch.tv/helix/schedule/segment', segmentData, {
            headers: {
                'Client-Id': Deno.env.get("TWITCH_CLIENT_ID"),
                'Authorization': `Bearer ${Deno.env.get("TWITCH_ACCESS_TOKEN")}`,
                'Content-Type': 'application/json',
            },
            params: {
                broadcaster_id: Deno.env.get("BROADCASTER_ID"),
            }
        });

        return response.data;
    });
}

function deleteScheduleSegment(streamId) {
    return twitchApiWrapper(async () => {
        const response = await axios.delete('https://api.twitch.tv/helix/schedule/segment', {
            headers: {
                'Client-Id': Deno.env.get("TWITCH_CLIENT_ID"),
                'Authorization': `Bearer ${Deno.env.get("TWITCH_ACCESS_TOKEN")}`,
            },
            params: {
                broadcaster_id: Deno.env.get("BROADCASTER_ID"),
                id: streamId,
            }
        });

        return response.data;
    });
}


async function createSegmentRequestBody(event) {
    let duration = event.end.getTime() - event.start.getTime();
    duration = Math.floor(duration / 60000);
    duration = Math.max(30, Math.min(duration, 1380));
    let category;
    try {
        category = await searchTwitchCategories(event.summary);
    } catch (error) {
        throw error;
    }

    const body = {
        'start_time': event.start.toISOString(),
        'timezone': configManager.get('timezone'),
        'is_recurring': configManager.get('twitch.isRecurring'),
        'duration': duration.toString(),
        'category_id': (category && category.id) ? category.id : null,
    }
    if (configManager.get('twitch.streamTitleFromEvent')) {
        body.title = event.description;
    }

    return body;
}

export async function updateChannelSchedule(events, weekRange) {
    const filteredEvents = filterEventsByLocation(events, ['Twitch']);
    try {
        const twitchSchedule = await getChannelSchedule();
        const twitchScheduleArr = (twitchSchedule && twitchSchedule.segments) ? filterEventsByWeek(twitchSchedule.segments, weekRange, true) : [];

        for (const [_, event] of twitchScheduleArr) {
            await deleteScheduleSegment(event.id);
        }

        const eventsArr = filterEventsByWeek(filteredEvents, weekRange, true);
        const futureEvents = Object.fromEntries(eventsArr);
        for (const key in futureEvents) {
            const event = futureEvents[key];
            const requestBody = await createSegmentRequestBody(event);
            await createScheduleSegment(requestBody);
        }
    } catch (error) {
        console.error('Error updating Twitch schedule:', error);
        throw error; // Rethrow the error to be caught by the caller
    }
}

// Webhook
const HMAC_PREFIX = 'sha256=';

export function verifyTwitchSignature(secret, message, twitchSignature) {
    const hmac = HMAC_PREFIX + getHmac(secret, message);
    return crypto.timingSafeEqual(Buffer.from(hmac), Buffer.from(twitchSignature));
}

function getHmac(secret, message) {
    return crypto.createHmac('sha256', secret)
        .update(message)
        .digest('hex');
}

export async function subscribeToTwitchEvents(broadcasterId, eventType) {
    const url = 'https://api.twitch.tv/helix/eventsub/subscriptions';
    const { ngrokUrl } = await import('../bot.js');
    const data = {
        type: eventType,
        version: '1',
        condition: { broadcaster_user_id: broadcasterId },
        transport: {
            method: 'webhook',
            callback: `${ngrokUrl}/webhook`,
            secret: Deno.env.get("WEBHOOK_SECRET"),
        }
    };
    try {
        const accessToken = await getTwitchOAuthToken();
        const response = await axios.post(url, data, {
            headers: {
                'Client-ID': Deno.env.get("TWITCH_CLIENT_ID"),
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
            }
        });
        console.log(`Subscribed to ${eventType} for broadcaster ${broadcasterId}`);
        return response.data;
    } catch (error) {
        console.error('Error subscribing to Twitch EventSub event:', error);
        throw error;
    }
}

export async function unsubscribeFromAllTwitchEvents() {
    const url = 'https://api.twitch.tv/helix/eventsub/subscriptions';
    try {
        const accessToken = await getTwitchOAuthToken();
        const existingSubscriptions = await axios.get(url, {
            headers: {
                'Client-ID': Deno.env.get("TWITCH_CLIENT_ID"),
                'Authorization': `Bearer ${accessToken}`,
            }
        });
        let actionsTaken = 0;
        for (const key in existingSubscriptions.data.data) {
            const subscription = existingSubscriptions.data.data[key];
            await axios.delete(url, {
                headers: {
                    'Client-ID': Deno.env.get("TWITCH_CLIENT_ID"),
                    'Authorization': `Bearer ${accessToken}`,
                },
                params: {
                    id: subscription.id,
                }
            });
            actionsTaken++;
        }
        console.log(`Deleted ${actionsTaken} preexisting EventSub subscriptions.`);
    } catch (error) {
        console.error('Error deleting Twitch EventSub subscriptions:', error);
        throw error;
    }
}