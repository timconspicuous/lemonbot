import { createCanvas, loadImage, registerFont } from 'canvas';
import { promises as fs } from 'fs';
import path from 'path';
import config from '../config.js';
const fontsDirectory = 'assets/fonts';

async function registerAllFonts(directory) {
  try {
    // Read all files in the directory
    const files = await fs.readdir(directory);

    files.forEach(file => {
      // Only process .ttf files
      if (path.extname(file).toLowerCase() === '.ttf') {
        const fontPath = path.join(directory, file);
        const fontFamily = path.basename(file, '.ttf'); // Use the file name as family name
        registerFont(fontPath, { family: fontFamily });

        console.log(`Registered font: ${fontFamily} from ${fontPath}`);
      }
    });
  } catch (error) {
    console.error(`Error registering fonts: ${error.message}`);
  }
}

function dateParser(date, argument) {
    if (argument === "dd.mm.") {
        const day = String(date.getDate()).padStart(2, '0');
        const month = String(date.getMonth() + 1).padStart(2, '0');
        return `${day}.${month}.`;
    }
    else if (argument === "am/pm") {
        let hours = date.getHours();
        const ampm = hours >= 12 ? 'PM' : 'AM';
        hours = hours % 12;
        hours = hours ? hours : 12;
        return `${hours}${ampm}`;
    }
    else {
        throw new Error('Invalid argument');
    }
}

export async function generateCanvas(weekRange, events) {
    await registerAllFonts(fontsDirectory);
    
    const {
        weekdays,
        container,
        spacing,
        size,
        fontcolor,
        font,
        entries,
        time,
        entrycolors,
        assets,
        title,
        weekrange
    } = config.canvas;

    const weekday = weekdays.string;
    const icons = new Array(weekday.length);

    function drawText(ctx, text, x, y, fontSize, color = fontcolor) {
        ctx.font = `${fontSize} ${font}`;
        ctx.fillStyle = color;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, x, y);
    }
    
    const canvas = createCanvas(size.width, size.height);
    const ctx = canvas.getContext('2d');

    function drawContainer(fillstyle, increment) {
        ctx.fillStyle = fillstyle;
        ctx.fillRect(container.posX, container.posY + spacing * increment, container.width, container.height);
    }

    for (let i = 0; i < weekday.length; i++) {
        let eventDrawn = false;
        for (const key in events) {
            const event = events[key];
            if (event.start.getDay() === i + 1 && event.type === 'VEVENT') {
                // Draw container
                if (event.location === 'Twitch') {
                    drawContainer(entrycolors.twitch, i);
                    icons[i] = 'Twitch';
                } else if (event.location === 'Discord') {
                    drawContainer(entrycolors.discord, i);
                    icons[i] = 'Discord';
                } else {
                    drawContainer(entrycolors.none, i);
                }
                // Draw entries text
                drawText(ctx, event.summary, entries.posX, entries.posY + spacing * i, entries.size);
                // Draw time text
                drawText(ctx, dateParser(event.start, 'am/pm'), time.posX, time.posY + spacing * i, time.size);
                eventDrawn = true;
                break;
            }
        }
        if (!eventDrawn) {
            drawContainer(entrycolors.none, i);
            drawText(ctx, '—', entries.posX, entries.posY + spacing * i, entries.size);
        }
        // Draw weekday text
        drawText(ctx, weekday[i], weekdays.posX, weekdays.posY + spacing * i, weekdays.size);
    }

    // Overlay image
    const overlayImage = await loadImage('assets/' + assets.overlay);
    ctx.drawImage(overlayImage, 0, 0);

    // Add icons
    const twitchIcon = await loadImage('assets/' + assets.twitchicon);
    const discordIcon = await loadImage('assets/' + assets.discordicon);
    for (let i = 0; i < icons.length; i++) {
        if (icons[i] === 'Twitch') {
            ctx.drawImage(twitchIcon, container.posX - 15, container.posY - 15 + spacing * i);
        } else if (icons[i] === 'Discord') {
            ctx.drawImage(discordIcon, container.posX - 15, container.posY - 15 + spacing * i);
        }
    }

    // Add title
    drawText(ctx, title.string, title.posX, title.posY, title.size);

    // Add weekrange
    drawText(ctx, `${dateParser(weekRange.start, "dd.mm.")} - ${dateParser(weekRange.end, "dd.mm.")}`, weekrange.posX, weekrange.posY, weekrange.size);

    return canvas.toBuffer('image/png');
}