import fetch from 'node-fetch';
import ical from 'ical';
import dotenv from 'dotenv';
dotenv.config();
import config from '../config.js';

// Function to get the start and end of the week for a given date
function getWeekRange(date) {
    const currentDate = new Date(date);
    const dayOfWeek = currentDate.getDay();
    const diff = currentDate.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1); // Adjust when day is Sunday
  
    const monday = new Date(currentDate.setDate(diff));
    monday.setHours(0, 0, 0, 0);
    const friday = new Date(monday);
    friday.setDate(friday.getDate() + 4);
    friday.setHours(23, 59, 0, 0);
  
    return {
        start: monday,
        end: friday
    };
}

// Function to fetch and parse iCalendar data from a URL
export async function fetchCalendar(date = new Date()) {
    const weekRange = getWeekRange(date);
    try {
        const response = await fetch(process.env.ICAL);
        if (!response.ok) {
            throw new Error(`Failed to fetch calendar data: ${response.statusText}`);
        }

        const icsData = await response.text();
        let events = ical.parseICS(icsData);

        const timezoneMatch = icsData.match(/X-WR-TIMEZONE:(.*)/);
        const timezone = config.timezone || timezoneMatch[1];

        // Filter and sort events
        const eventsArray = filterEventsByWeek(events, weekRange);
        eventsArray.sort(([, eventA], [, eventB]) => eventA.start.getTime() - eventB.start.getTime());

        events = Object.fromEntries(eventsArray);

        return {weekRange, timezone, events};
    } catch (error) {
        throw error;
    }
}

export function filterEventsByLocation(events, filterArr) {
    let filteredEvents = {};
    for (const key in events) {
        const event = events[key];
        if (filterArr && filterArr.includes(event.location)) {
            filteredEvents[key] = event;
        }
    }
    return filteredEvents;
}

export function filterEventsByWeek(events, weekRange) {
    // Attention: this can take in an object or an array, but will always return an array.
    // The ternary operator is for two types of input: iCalendar events and Twitch schedule.
    const eventsArray = (typeof events === 'object') ? Object.entries(events) : events;
    const filteredEventsArray = eventsArray.filter(([, event]) => {
        const eventStart = event.start || new Date(event.start_time);
        return eventStart >= weekRange.start && eventStart <= weekRange.end;
    });
    return filteredEventsArray;
}