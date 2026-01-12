const { Client, GatewayIntentBits, SlashCommandBuilder, REST, Routes, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const axios = require('axios');
const express = require('express');

const app = express();
app.get('/', (req, res) => res.send('Bot Active'));
app.listen(3000);

// --- SETTINGS ---
// REPLACE THIS with your new Private Proxy URL from Render
const PROXY_LIST = ["your-private-proxy.onrender.com"]; 
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';

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

// --- POWERFUL FETCH WITH RETRY ---
async function fetchWithRetry(url, method = 'GET', data = null, retries = 3) {
    const proxyUrl = url.replace('roblox.com', PROXY_LIST[0]);
    
    for (let i = 0; i < retries; i++) {
        try {
            const res = await axios({
                method,
                url: proxyUrl,
                headers: { 'User-Agent': USER_AGENT },
                data,
                timeout: 10000
            });
            return res;
        } catch (e) {
            if (i === retries - 1) throw e;
            // Wait 1 second before retrying
            await new Promise(r => setTimeout(r, 1000));
        }
    }
}

async function loadPassNames() {
    console.log("Caching names...");
    for (let pass of gamepassData) {
        try {
            const res = await fetchWithRetry(`https://economy.roblox.com/v1/game-passes/${pass.id}/product-info`);
            pass.name = res.data.Name;
            console.log(`✅ Cached: ${pass.name}`);
        } catch (e) {
            pass.name = "Unknown Bundle";
            console.log(`❌ Failed name for ${pass.id}`);
        }
    }
}

async function performCheck(interaction, robloxId) {
    try {
        let username = "Unknown", joinDate = "Unknown", isPublic = false, avatarUrl = "";

        // Get basic info
        try {
            const uRes = await fetchWithRetry(`https://users.roblox.com/v1/users/${robloxId}`);
            username = uRes.data.displayName || uRes.data.name;
            joinDate = new Date(uRes.data.created).toLocaleDateString();
        } catch (e) {}

        // Get inventory visibility
        try {
            const iRes = await fetchWithRetry(`https://inventory.roblox.com/v1/users/${robloxId}/can-view-inventory`);
            isPublic = iRes.data.canView;
        } catch (e) {}

        // Get Avatar
        try {
            const tRes = await fetchWithRetry(`https://thumbnails.roblox.com/v1/users/avatar?userIds=${robloxId}&size=420x420&format=Png`);
            avatarUrl = tRes.data.data[0].imageUrl;
        } catch (e) {}

        let ownedCount = 0;
        let passList = "";

        // Check ownership
        for (const pass of gamepassData) {
            let owns = false;

            // 1. Check Badges First (Most reliable)
            const bId = pass.badgeTransferred || pass.badgeReceived;
            if (bId) {
                try {
                    const bRes = await fetchWithRetry(`https://badges.roblox.com/v1/users/${robloxId}/badges/awarded-dates?badgeIds=${bId}`);
                    if (bRes.data.data && bRes.data.data.length > 0) owns = true;
                } catch (e) {}
            }

            // 2. Check Gamepass (If inventory public and badge check failed)
            if (!owns && isPublic) {
                try {
                    const gRes = await fetchWithRetry(`https://inventory.roblox.com/v1/users/${robloxId}/items/GamePass/${pass.id}`);
                    if (gRes.data.data && gRes.data.data.length > 0) owns = true;
                } catch (e) {}
            }

            if (owns) ownedCount++;
            passList += `${owns ? "✅" : "❌"} **${pass.name}**\n`;
        }

        const embed = new EmbedBuilder()
            .setTitle(`Verification: ${username}`)
            .setThumbnail(avatarUrl)
            .setColor(isPublic ? 0x2ecc71 : 0xe74c3c)
            .setDescription(`📅 **Joined:** ${joinDate}\n🔓 **Inventory:** ${isPublic ? "Public" : "Private"}\n\n**Ownership (${ownedCount}/${gamepassData.length})**\n${passList}`)
            .setTimestamp();

        await interaction.editReply({ embeds: [embed] });
    } catch (err) {
        await interaction.editReply("❌ Error fetching user data. The proxy might be waking up.");
    }
}

// --- SLASH COMMANDS ---
const slashCmds = [
    new SlashCommandBuilder().setName('checkuser').setDescription('Verify Roblox items').addStringOption(o => o.setName('target').setDescription('Username/ID').setRequired(true)),
    new SlashCommandBuilder().setName('checkdiscorduser').setDescription('Check member').addUserOption(o => o.setName('member').setDescription('Member').setRequired(true))
].map(c => c.toJSON());

client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;
    const hasRole = interaction.member.roles.cache.some(r => ALLOWED_ROLES.includes(r.id));
    if (!hasRole && !interaction.member.permissions.has(PermissionFlagsBits.Administrator)) return interaction.reply({ content: "Unauthorized.", ephemeral: true });

    await interaction.deferReply();

    if (interaction.commandName === 'checkuser') {
        const target = interaction.options.getString('target');
        let userId = target;
        if (isNaN(target)) {
            try {
                const res = await fetchWithRetry(`https://users.roblox.com/v1/usernames/users`, 'POST', { usernames: [target], excludeBannedUsers: false });
                if (res.data.data[0]) userId = res.data.data[0].id;
                else return interaction.editReply("❌ User not found.");
            } catch (e) { return interaction.editReply("❌ Proxy error. Please try again."); }
        }
        await performCheck(interaction, userId);
    }
});

(async () => {
    try {
        await loadPassNames();
        const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
        await rest.put(Routes.applicationCommands(process.env.CLIENT_ID), { body: slashCmds });
        client.login(process.env.DISCORD_TOKEN);
        console.log("🚀 Bot is Online & Ready!");
    } catch (e) { console.error(e); }
})();
