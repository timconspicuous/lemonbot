import { createCanvas, loadImage, registerFont } from 'canvas';
import { promises as fs } from 'fs';
import path from 'path';
import configManager from '../config/configManager.js';
const fontsDirectory = 'assets/fonts';

await registerAllFonts(fontsDirectory);

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
    } = configManager.getAll().canvas;

    const weekday = weekdays.string;
    const icons = new Array(weekday.length);

    function drawText(ctx, text, x, y, fontSize, color = fontcolor) {
        ctx.font = `${fontSize}px ${font}`;
        ctx.fillStyle = color;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, x, y);
    }

    function fitTextToDimensions(ctx, text, maxWidth, maxHeight, initialFontSize) {
        let words = text.split(" ");
        let fontSize = initialFontSize;

        // Measure the text width and estimated height
        const measureText = (text, size) => {
            ctx.font = `${size}px ${font}`;
            const metrics = ctx.measureText(text);
            return metrics.width;
        };

        // Loop to decrement font size until it fits within the given width and height
        while (fontSize > 0) {
            const maxLines = Math.floor(maxHeight / fontSize);
            let lines = [];
            let currentLine = "";

            for (let word of words) {
                let testLine = currentLine ? `${currentLine} ${word}` : word;
                if (measureText(testLine, fontSize) <= maxWidth) {
                    currentLine = testLine;
                } else {
                    if (currentLine) lines.push(currentLine);
                    currentLine = word;
                }
            }
            if (currentLine) lines.push(currentLine);
            if (lines.length <= Math.floor(maxHeight / fontSize)) {
                return {fittedText: lines, fittedSize: fontSize};  
            }
            fontSize--;
        }
        return {fittedText: [text], fittedSize: fontSize};
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
                const {fittedText, fittedSize} = fitTextToDimensions(ctx, event.summary, entries.maxWidth, entries.maxHeight, entries.size);
                for (let j = 0; j < fittedText.length; j++) {
                    let offset = (fittedText.length % 2 === 0) ? ((fittedText.length / 2) + 0.5) * fittedSize : Math.floor(fittedText.length / 2) * fittedSize;
                    drawText(ctx, fittedText[j], entries.posX, entries.posY - offset + fittedSize * j + spacing * i, fittedSize);
                }
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
    const friday = new Date(weekRange.end);
    friday.setDate(friday.getDate() - 2); // Limit week until Friday if there are only five slots
    drawText(ctx, `${dateParser(weekRange.start, 'dd.mm.')} - ${dateParser(friday, "dd.mm.")}`, weekrange.posX, weekrange.posY, weekrange.size);

    return canvas.toBuffer('image/png');
}