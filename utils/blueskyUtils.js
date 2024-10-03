import configManager from '../config/configManager.js';
import * as atproto from '@atproto/api';
const { BskyAgent, RichText } = atproto;
import { load } from "jsr:@std/dotenv";

await load({ export: true });

export async function syndicateToBluesky(altText, buffer) {  
    const agent = new BskyAgent({
        service: 'https://bsky.social'
    });

    await agent.login({
        identifier: Deno.env.get("BLUESKY_USERNAME"),
        password: Deno.env.get("BLUESKY_PASSWORD")
    });

    const text = configManager.get('bluesky.text');
    altText = configManager.get('bluesky.alttext') + altText;
    altText = altText.trimStart();
    if (altText.length > 1000) {
        altText = altText.slice(0, 1000 - 3) + '...';
    }

    const uint8arr = new Uint8Array(buffer);
    const { width, height } = configManager.get('canvas.size');

    const rt = new RichText({ text: text });
    await rt.detectFacets(agent);

    const postJSON = {
        text: rt.text,
        facets: rt.facets,
        embed: {
            $type: 'app.bsky.embed.images',
            images: [
            {
                alt: altText,
                aspectRatio: {width, height}
            }],
        },
        createdAt: new Date().toISOString()
    }
    
    try {
        const { data } = await agent.uploadBlob(uint8arr, {encoding: 'image/png'});
        postJSON.embed.images[0].image = data.blob;
    } catch(error) {
        console.error('Error uploading file: ', error);
    }
  
    try {
        await agent.post(postJSON);
    } catch(error) {
        console.error('Error submitting post: ', error);
    }
}