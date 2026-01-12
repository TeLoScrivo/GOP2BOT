const { Client, GatewayIntentBits, SlashCommandBuilder, REST, Routes, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const axios = require('axios');
const express = require('express');

// --- KEEP ALIVE SERVER ---
const app = express();
app.get('/', (req, res) => res.send('Verification Bot is Online!'));
app.listen(3000, () => console.log('Heartbeat server listening on port 3000'));

// --- SETTINGS ---
const PROXY_LIST = ["roproxy.com", "rpro.xyz", "roproxy.org"];
let currentProxyIndex = 0;
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36';

function getBaseUrl() { return PROXY_LIST[currentProxyIndex]; }
function rotateProxy() { 
    currentProxyIndex = (currentProxyIndex + 1) % PROXY_LIST.length; 
    console.log(`🔄 Proxy rotated to: ${getBaseUrl()}`);
}

const client = new Client({ intents: [GatewayIntentBits.Guilds] });
const ALLOWED_ROLES = ['1431687501554122865', '1431687881537228920', '1431688034973253842'];

const gamepassData = [
    { id: "1317302770", badgeTransferred: "1044208440593825", badgeReceived: "1423790028372355" }, 
    { id: "1319281447", badgeTransferred: null, badgeReceived: "2682927946891818" }, 
    { id: "1319637202", badgeTransferred: null, badgeReceived: "515869433237717" }, 
    { id: "1317780636", badgeTransferred: "4067753590927656", badgeReceived: "928387627309465" }, 
    { id: "1319589316", badgeTransferred: null, badgeReceived: "1221002969029722" }, 
    { id: "1319181531", badgeTransferred: null, badgeReceived: "3844278365519513" }, 
    { id: "1317842605", badgeTransferred: "3775357549139366", badgeReceived: "3326327003084123" }, 
    { id: "1317694753", badgeTransferred: "3654241705476762", badgeReceived: "3620554434555932" }, 
    { id: "1317660739", badgeTransferred: "1467004649512857", badgeReceived: "3160530080251368" }, 
    { id: "1351190968", badgeTransferred: null, badgeReceived: "3103251786338074" }, 
    { id: "1317710701", badgeTransferred: "322662560849148", badgeReceived: "3599422601824686" }, 
    { id: "1317618664", badgeTransferred: null, badgeReceived: "475990389311426" }, 
    { id: "1317980628", badgeTransferred: "1955785257394848", badgeReceived: "698477613282187" } 
];

// --- HELPER FETCH ---
async function fetchWithRetry(url, method = 'GET', data = null) {
    for (let i = 0; i < PROXY_LIST.length; i++) {
        try {
            const config = {
                method,
                url: url.replace('roblox.com', getBaseUrl()),
                headers: { 'User-Agent': USER_AGENT, 'Content-Type': 'application/json' },
                timeout: 8000
            };
            if (data) config.data = data;
            return await axios(config);
        } catch (e) { rotateProxy(); }
    }
    throw new Error("All proxies failed");
}

async function loadPassNames() {
    console.log("Fetching GamePass names... please wait.");
    // We use a simple loop here to ensure we don't spam the proxy too fast at boot
    for (let pass of gamepassData) {
        try {
            const res = await fetchWithRetry(`https://economy.roblox.com/v1/game-passes/${pass.id}/product-info`);
            pass.name = res.data.Name;
            console.log(`Loaded: ${pass.name}`);
        } catch (e) { 
            pass.name = "Unknown Bundle"; 
        }
    }
}

async function performCheck(interaction, robloxId) {
    try {
        let username = "Unknown", joinDate = "Unknown", isPublic = false, avatarUrl = "";

        // Get User Basic Info
        try {
            const res = await fetchWithRetry(`https://users.roblox.com/v1/users/${robloxId}`);
            username = res.data.displayName || res.data.name;
            joinDate = new Date(res.data.created).toLocaleDateString();
        } catch (e) {}

        // Get Inventory Visibility
        try {
            const res = await fetchWithRetry(`https://inventory.roblox.com/v1/users/${robloxId}/can-view-inventory`);
            isPublic = res.data.canView;
        } catch (e) {}

        // Get Avatar
        try {
            const res = await fetchWithRetry(`https://thumbnails.roblox.com/v1/users/avatar?userIds=${robloxId}&size=420x420&format=Png`);
            avatarUrl = res.data.data[0].imageUrl;
        } catch (e) {}

        let ownedCount = 0;
        let passList = "";

        for (const pass of gamepassData) {
            let ownsPass = false;
            if (isPublic) {
                try {
                    const res = await fetchWithRetry(`https://inventory.roblox.com/v1/users/${robloxId}/items/GamePass/${pass.id}`);
                    ownsPass = res.data.data && res.data.data.length > 0;
                } catch (e) {}
            }
            
            let ownsBadge = false;
            const bId = pass.badgeTransferred || pass.badgeReceived;
            if (bId) {
                try {
                    const res = await fetchWithRetry(`https://badges.roblox.com/v1/users/${robloxId}/badges/awarded-dates?badgeIds=${bId}`);
                    ownsBadge = res.data.data && res.data.data.length > 0;
                } catch (e) {}
            }

            const hasAny = ownsPass || ownsBadge;
            if (hasAny) ownedCount++;
            passList += `${hasAny ? "✅" : "❌"} **${pass.name || "Unknown Pass"}**\n`;
        }

        const embed = new EmbedBuilder()
            .setTitle(`Verification: ${username}`)
            .setThumbnail(avatarUrl)
            .setColor(isPublic ? 0x2ecc71 : 0xe74c3c)
            .setDescription(`📅 **Joined:** ${joinDate}\n🔓 **Inventory:** ${isPublic ? "Public" : "Private"}\n\n**Ownership (${ownedCount}/${gamepassData.length})**\n${passList}`)
            .setTimestamp();

        await interaction.editReply({ embeds: [embed] });
    } catch (err) {
        await interaction.editReply("❌ Critical error fetching Roblox data.");
    }
}

// --- COMMAND REGISTRATION ---
const slashCmds = [
    new SlashCommandBuilder().setName('checkuser').setDescription('Check Roblox user').addStringOption(o => o.setName('target').setDescription('Username or ID').setRequired(true)),
    new SlashCommandBuilder().setName('checkdiscorduser').setDescription('Check member').addUserOption(o => o.setName('member').setDescription('Member').setRequired(true))
].map(c => c.toJSON());

client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;
    const hasRole = interaction.member.roles.cache.some(r => ALLOWED_ROLES.includes(r.id));
    if (!hasRole && !interaction.member.permissions.has(PermissionFlagsBits.Administrator)) return interaction.reply({ content: "❌ No permission.", ephemeral: true });

    await interaction.deferReply();

    if (interaction.commandName === 'checkuser') {
        const target = interaction.options.getString('target');
        let userId = target;
        if (isNaN(target)) {
            try {
                const res = await fetchWithRetry(`https://users.roblox.com/v1/usernames/users`, 'POST', { usernames: [target], excludeBannedUsers: false });
                if (res.data.data[0]) userId = res.data.data[0].id;
                else return interaction.editReply("❌ User not found.");
            } catch (e) { return interaction.editReply("❌ Proxy error while finding user."); }
        }
        await performCheck(interaction, userId);
    }
});

// --- STARTUP LOGIC ---
(async () => {
    try {
        // We load names FIRST. The bot won't even try to log in until names are ready.
        await loadPassNames();
        
        const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
        await rest.put(Routes.applicationCommands(process.env.CLIENT_ID), { body: slashCmds });
        
        client.login(process.env.DISCORD_TOKEN);
        console.log("🚀 Bot is fully loaded and names are cached!");
    } catch (e) {
        console.error("Startup failed:", e);
    }
})();
