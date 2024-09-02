import dotenv from 'dotenv';
dotenv.config();
import config from '../config.js';
import * as atproto from '@atproto/api';
const { BskyAgent, RichText } = atproto;

export async function syndicateToBluesky(altText, buffer) {  
    const agent = new BskyAgent({
        service: 'https://bsky.social'
    });

    await agent.login({
        identifier: process.env.BLUESKY_USERNAME,
        password: process.env.BLUESKY_PASSWORD
    });

    const text = config.bluesky.text;
    altText = config.bluesky.alttext + altText;
    altText = altText.trimStart();
    //TO-DO: trim at 1000 chars

    const uint8arr = new Uint8Array(buffer);
    const { width, height } = config.canvas.size;

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