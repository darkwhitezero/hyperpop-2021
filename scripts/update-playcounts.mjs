import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const configPath = resolve(projectRoot, 'scripts/tracks-config.json');
const outputPath = resolve(projectRoot, 'assets/data/playcounts.json');
const tokenUrl = 'https://open.spotify.com/get_access_token?reason=transport&productType=web_player';
const queryUrl = 'https://api-partner.spotify.com/pathfinder/v2/query';
const getTrackHash = '612585ae06ba435ad26369870deaae23b5c8800a256cd8a57e08eddc25a37294';
const userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

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

function findRequestedTrack(value, expectedUri) {
    if (!value || typeof value !== 'object') return null;

    if (
        value.uri === expectedUri
        && typeof value.name === 'string'
        && Number.isSafeInteger(Number(value.playcount))
    ) {
        return value;
    }

    for (const child of Object.values(value)) {
        const track = findRequestedTrack(child, expectedUri);
        if (track) return track;
    }

    return null;
}

async function fetchTrack(trackId, accessToken) {
    const expectedUri = `spotify:track:${trackId}`;
    const payload = await fetchJson(queryUrl, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
            Origin: 'https://open.spotify.com',
            Referer: 'https://open.spotify.com/',
            'User-Agent': userAgent,
        },
        body: JSON.stringify({
            operationName: 'getTrack',
            variables: { uri: expectedUri },
            extensions: {
                persistedQuery: { version: 1, sha256Hash: getTrackHash },
            },
        }),
    });

    if (Array.isArray(payload.errors) && payload.errors.length > 0) {
        throw new Error(payload.errors.map(({ message }) => message).join('; '));
    }

    const track = findRequestedTrack(payload.data, expectedUri);
    if (!track) {
        throw new Error('Spotify response did not include a valid playcount for the requested track');
    }

    return { name: track.name, playcount: Number(track.playcount) };
}

async function main() {
    const config = JSON.parse(await readFile(configPath, 'utf8'));
    if (!Array.isArray(config) || config.length === 0) {
        throw new Error('scripts/tracks-config.json must contain at least one track');
    }

    const trackIds = config.map((release) => release?.trackId);
    if (trackIds.some((trackId) => typeof trackId !== 'string' || !/^[A-Za-z0-9]{22}$/.test(trackId))) {
        throw new Error('Every release in scripts/tracks-config.json must have a valid trackId');
    }
    if (new Set(trackIds).size !== trackIds.length) {
        throw new Error('scripts/tracks-config.json contains duplicate trackId values');
    }

    // Do not overwrite published counts when Spotify cannot issue an access token.
    const accessToken = await getAccessToken();
    const tracks = {};
    const failures = [];

    for (const release of config) {
        try {
            tracks[release.trackId] = await fetchTrack(release.trackId, accessToken);
            console.log(`Loaded: ${release.name ?? release.trackId}`);
        } catch (error) {
            failures.push(`${release.name ?? release.trackId}: ${error.message}`);
            console.error(`Could not load ${release.name ?? release.trackId}: ${error.message}`);
        }
    }

    if (failures.length > 0 || Object.keys(tracks).length !== config.length) {
        throw new Error(
            `Expected ${config.length} track counts, received ${Object.keys(tracks).length}. ${failures.join(' | ')}`,
        );
    }

    await mkdir(dirname(outputPath), { recursive: true });
    await writeFile(outputPath, `${JSON.stringify({ updatedAt: new Date().toISOString(), tracks }, null, 2)}\n`, 'utf8');
    console.log(`Wrote ${Object.keys(tracks).length} track count(s) to assets/data/playcounts.json`);
}

main().catch((error) => {
    console.error(`Playcount update failed: ${error.message}`);
    process.exitCode = 1;
});
