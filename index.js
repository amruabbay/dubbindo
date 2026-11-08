const { addonBuilder, serveHTTP } = require("stremio-addon-sdk");
const axios = require("axios");

const OYEN_URL = "https://cloud-oyen.eu.org";

const manifest = {
    id: "id.cloudoyen.dubindo.auto",
    version: "1.0.0",
    name: "Cloud Oyen Dub Indo",
    description: "Streaming otomatis Film & Series Dubbing Indonesia dari Cloud Oyen",
    resources: ["stream"],
    types: ["movie", "series"],
    idPrefixes: ["tt"],
    catalogs: []
};

const builder = new addonBuilder(manifest);

function decodeGoIndexResponse(rawData) {
    if (typeof rawData === "object") return rawData;
    try {
        const match = rawData.match(/\("([^"]+)"\)/);
        let str = match ? match[1] : rawData;
        return JSON.parse(Buffer.from(str, "base64").toString("utf-8"));
    } catch (err) {
        try {
            const reversed = rawData.split("").reverse().join("");
            return JSON.parse(Buffer.from(reversed, "base64").toString("utf-8"));
        } catch (e) {
            return null;
        }
    }
}

async function getMetaFromImdb(type, imdbId) {
    try {
        const res = await axios.get(`https://v3-cinemeta.strem.io/meta/${type}/${imdbId}.json`);
        return res.data?.meta?.name || null;
    } catch (e) {
        return null;
    }
}

builder.defineStreamHandler(async ({ type, id }) => {
    const parts = id.split(":");
    const imdbId = parts[0];
    const season = parts[1] ? String(parts[1]).padStart(2, "0") : null;
    const episode = parts[2] ? String(parts[2]).padStart(2, "0") : null;

    const rawTitle = await getMetaFromImdb(type, imdbId);
    if (!rawTitle) return { streams: [] };

    const cleanWords = rawTitle
        .replace(/&/g, " ")
        .replace(/[^a-zA-Z0-9\s]/g, "")
        .split(/\s+/)
        .filter(w => w.length > 1);
    
    const searchQuery = cleanWords.slice(0, 3).join(" ");

    try {
        const response = await axios.post(
            `${OYEN_URL}/0:search`,
            new URLSearchParams({ q: searchQuery, page_token: "", page_index: 0 }).toString(),
            {
                headers: {
                    "Content-Type": "application/x-www-form-urlencoded",
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"
                }
            }
        );

        const parsed = decodeGoIndexResponse(response.data);
        const files = parsed?.data?.files || [];
        if (files.length === 0) return { streams: [] };

        let videoFiles = files.filter(f => f.name && f.name.match(/\.(mkv|mp4|avi)$/i));

        if (type === "series" && season && episode) {
            const epRegex = new RegExp(`S${season}E${episode}|E${episode}`, "i");
            videoFiles = videoFiles.filter(f => epRegex.test(f.name));
        }

        const streams = videoFiles.map(file => {
            const sizeGB = file.size ? (Number(file.size) / (1024 ** 3)).toFixed(2) + " GB" : "Unknown Size";
            const streamUrl = file.link 
                ? (file.link.startsWith("http") ? file.link : `${OYEN_URL}${file.link}`)
                : `${OYEN_URL}/0:/${encodeURIComponent(file.name)}`;

            return {
                name: "Cloud Oyen 🇮🇩",
                title: `${file.name}\n📦 ${sizeGB}`,
                url: streamUrl
            };
        });

        return { streams };
    } catch (error) {
        return { streams: [] };
    }
});

const port = process.env.PORT || 7000;
serveHTTP(builder.getInterface(), { port: port });
