import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const configPath = resolve(projectRoot, 'scripts/tracks-config.json');
const outputPath = resolve(projectRoot, 'assets/data/playcounts.json');
const tokenUrl = 'https://open.spotify.com/get_access_token?reason=transport&productType=web_player';
const queryUrl = 'https://api-partner.spotify.com/pathfinder/v1/query';
const queryHash = '46ae954ef2d2fe7732b4b2b4022157b3e18803572f94907e3163756c7c477032';
const userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const pageSize = 300;

async function fetchJson(url, options = {}) {
    const response = await fetch(url, options);
    if (!response.ok) {
        throw new Error(`HTTP ${response.status} ${response.statusText}`);
    }
    return response.json();
}

async function getAccessToken() {
    const tokenResponse = await fetchJson(tokenUrl, {
        headers: { 'User-Agent': userAgent },
    });

    if (typeof tokenResponse.accessToken !== 'string' || tokenResponse.accessToken.length === 0) {
        throw new Error('Spotify token response did not include an accessToken');
    }

    return tokenResponse.accessToken;
}

async function fetchAlbumTracks(albumId, accessToken) {
    const tracks = [];
    let offset = 0;

    while (true) {
        const params = new URLSearchParams({
            operationName: 'queryAlbumTracks',
            variables: JSON.stringify({
                uri: `spotify:album:${albumId}`,
                offset,
                limit: pageSize,
            }),
            extensions: JSON.stringify({
                persistedQuery: { version: 1, sha256Hash: queryHash },
            }),
        });

        const payload = await fetchJson(`${queryUrl}?${params}`, {
            headers: {
                Authorization: `Bearer ${accessToken}`,
                'User-Agent': userAgent,
            },
        });

        const page = payload?.data?.album?.tracks?.items;
        if (!Array.isArray(page)) {
            throw new Error('Spotify response did not include album track items');
        }

        tracks.push(...page);
        if (page.length < pageSize) break;
        offset += page.length;
    }

    return tracks;
}

function getTrackId(uri) {
    if (typeof uri !== 'string') return null;
    const match = uri.match(/^spotify:track:([A-Za-z0-9]+)$/);
    return match?.[1] ?? null;
}

async function main() {
    const config = JSON.parse(await readFile(configPath, 'utf8'));
    if (!Array.isArray(config)) {
        throw new Error('scripts/tracks-config.json must contain an array of releases');
    }

    // A token is required for every album request. If this fails, do not replace
    // the previously published counts with an empty or partial result.
    const accessToken = await getAccessToken();
    const tracks = {};

    for (const release of config) {
        if (typeof release?.albumId !== 'string' || release.albumId.length === 0) {
            console.error(`Skipping invalid release entry: ${release?.name ?? '(unnamed)'}`);
            continue;
        }

        try {
            const albumTracks = await fetchAlbumTracks(release.albumId, accessToken);
            for (const item of albumTracks) {
                const track = item?.track ?? item;
                const id = getTrackId(track?.uri);
                const playcount = Number(track?.playcount);
                if (!id || typeof track?.name !== 'string' || !Number.isSafeInteger(playcount) || playcount < 0) {
                    continue;
                }

                tracks[id] = { name: track.name, playcount };
            }
            console.log(`Loaded ${albumTracks.length} track(s): ${release.name ?? release.albumId}`);
        } catch (error) {
            console.error(`Could not load ${release.name ?? release.albumId}: ${error.message}`);
        }
    }

    await mkdir(dirname(outputPath), { recursive: true });
    await writeFile(outputPath, `${JSON.stringify({ updatedAt: new Date().toISOString(), tracks }, null, 2)}\n`, 'utf8');
    console.log(`Wrote ${Object.keys(tracks).length} track count(s) to assets/data/playcounts.json`);
    if (Object.keys(tracks).length !== config.length) {
    throw new Error(
        `Expected ${config.length} track counts, received ${Object.keys(tracks).length}`
    );
}
}

main().catch((error) => {
    console.error(`Playcount update failed: ${error.message}`);
    process.exitCode = 1;
});
