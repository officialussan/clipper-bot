require('dotenv').config();
const fs = require('fs');
const path = require('path');
const {
  Client,
  GatewayIntentBits,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  StringSelectMenuBuilder,
  Events,
  ChannelType,
  PermissionsBitField,
  PermissionFlagsBits,
  EmbedBuilder,
  Status
} = require('discord.js');

const { MongoClient } = require('mongodb');

const express = require('express');
const axios = require('axios');

// Express App Setup
const app = express();



const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.DirectMessages
  ]
});

const PORT = process.env.PORT
const CLIENT_ID = process.env.DISCORD_CLIENT_ID;
const CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET;
const REDIRECT_URI = process.env.REDIRECT_URI; // Update this variable in Railway (see Step 3);
const VERIFIED_ROLE_ID = process.env.VERIFIED_ROLE_ID;
const CLIPPER_ROLE_ID = process.env.CLIPPER_ROLE_ID;
const STAFF_ROLE_ID = process.env.STAFF_ROLE_ID;
const PROXY_STAFF_ROLE_ID = process.env.PROXY_STAFF_ROLE_ID;
const TICKET_CATEGORY_ID = process.env.TICKET_CATEGORY_ID;
const CONNECT_ACCOUNTS_CHANNEL_ID = process.env.CONNECT_ACCOUNTS_CHANNEL_ID;
const VERIFY_DEMOGRAPHICS_CHANNEL_ID = process.env.VERIFY_DEMOGRAPHICS_CHANNEL_ID;
const TICKET_LOG_CHANNEL_ID = process.env.TICKET_LOG_CHANNEL_ID;
const DEMOGRAPHICS_STAFF_CHANNEL_ID = process.env.DEMOGRAPHICS_STAFF_CHANNEL_ID;
const DEMOGRAPHICS_UPLOAD_CATEGORY_ID = process.env.DEMOGRAPHICS_UPLOAD_CATEGORY_ID;
const PAYMENT_STAFF_CHANNEL_ID = process.env.PAYMENT_STAFF_CHANNEL_ID;
const LEADERBOARD_CHANNEL_ID = '1495692728431018015';
const LEADERBOARD_MESSAGE_ID = '1508380113056567417';
const MONSTERLAB_API_KEY = process.env.MONSTERLAB_API_KEY;
const PRICE_PER_PROXY = 7;
const FINISHED_CAMPAIGNS_CATEGORY_ID = '1520064994274709747';
const STAFF_CONTROL_CHANNEL_ID = "1521116369909710889";

const clean = (str) =>
  str.replace(/[`*_|~]/g, '').trim();

const toSafeChannelName = (name) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 20);

const SUPPORTED_COUNTRIES = [
  'United States',
  'United Kingdom',
  'Canada',
  'Australia',
  'Germany',
  'France',
  'Nigeria'
];

const ticketCooldowns = new Map();
const claimedTickets = new Map();

const dataFilePath =
  process.env.DATA_FILE_PATH || path.join(__dirname, 'data.json');

const CAMPAIGNS = {
  elephant: {
    id: 'elephant',
    name: '<:tr:1505143223507750973> Elephant Clipping Campaign',
    allowedPlatforms: ['tiktok', 'instagram', 'youtube'],
    payoutThreshold: 25000,
    weeklyBudget: 2000,
    startDate: '2026-06-29',
    ratePerMillion: 300,
    viewCap: 5000000,
    panelChannelId:'1492239981308018698',
    panelMessageId:'1522950418747887626',
    staffChannelId: process.env.N30N_STAFF_CHANNEL_ID,
    roleId: process.env.N3ON_ROLE_ID,
    entryChannelId: process.env.N3ON_ENTRY_CHANNEL_ID,
    source: 'monsterlab',
    monsterCampaignId: "fbFMAJpxpQkZ0Honf7z4",
    status: 'active',
    
    panelText: `# <a:fire1:1504871649491554487> **Earn Money Posting Clips – Elephant Clipping Campaign**

Earn money by posting high-retention clips and edits from Elephant content across short-form platforms. Your goal is simple: create engaging clips, generate views, and grow your pages while earning from performance.

All you have to do is **register for the campaign below** and follow the guidelines to start earning.

## <a:chart1:1504773558415523931> Campaign Overview

• **Content:** You can only post content from the <#1521232893370826802>

• **Platforms:** <:tiktok1:1504871476485029979> TikTok, <:ig1:1504871708664922162> Instagram Reels & <:ytshort:1504774704123220099> YouTube Shorts

• **Requirement:** All uploaded videos must follow the campaign rules → <#1492248546156609778>

• **Editing Style:** Deliver value, maintain strong retention, and present SWA positively.

• **Campaign Goal:** Post informative clips from prominent conservative figures. Focus on politics, policy, and social issues.

• **Strict Rule:** Low-quality, spam, or misleading edits may result in removal from the campaign.

## <a:Cash1:1504871843419521115> Payment Details

> **Campaign Budget:** $2,000 per week  
> **Rate:** $300 per 1M eligible views  
> **Eligible Views:** Tier 1 countries only  
> **Payout Schedule:** Weekly  
> **Payment Method:** Crypto
> **Minimum Payout:** $10

## <a:arrow1:1504776324051374130> Join the Campaign

Click the button below to start clipping and earning.`

  },

  crowder: {
    id: 'crowder',
    name: '<:SC:1505154364229156954> Steven Crowder Clipping Campaign',
    allowedPlatforms: ['tiktok', 'instagram', 'youtube'],
    payoutThreshold: 35000,
    weeklyBudget: 2100,
    startDate: '2026-04-28',
    ratePerMillion: 300,
    viewCap: 7000000,
    panelChannelId:'1521565850505838672',
    panelMessageId:'1521819135464702013',
    staffChannelId: process.env.CROWDER_STAFF_CHANNEL_ID,
    roleId: process.env.CROWDER_ROLE_ID,
    entryChannelId: process.env.CROWDER_ENTRY_CHANNEL_ID,
    source: 'monsterlab',
    monsterCampaignId: "Qgl6rzYPcDIVxqZ23kXI",
    status: 'active',

    panelText: `
# <a:fire1:1504871649491554487> Earn Money Posting Clips – Steven Crowder Clipping Campaign

Earn money by posting high-retention clips and edits from Steven Crowder content across short-form platforms. Your goal is simple: Create engaging content, generate views, grow your pages, and earn based on performance.

All you have to do is **register for the campaign below** and follow the guidelines to start earning.

## <a:chart1:1504773558415523931> Campaign Overview

• **Content:** Clips and edits from official Steven Crowder content focused primarily on Steven Crowder

• **Platforms:** <:tiktok1:1504871476485029979> TikTok, <:ig1:1504871708664922162> Instagram Reels & <:ytshort:1504774704123220099> YouTube Shorts

• **Requirement:** All uploads must follow the official campaign rules → <#1492184654864842963>

• **Editing Style:** Strong hooks, high retention, clear context, and clean presentation

• **Campaign Goal:** Create engaging clips around Crowder’s commentary, debates, reactions, and discussion moments

• **Content Standard:** Low-quality, spam, misleading, or heavily manipulated edits may result in removal from the campaign

• **Submission Rule:** Only videos posted within the last 24 hours are eligible for submission. Views begin counting only after submission is approved.

## <a:Cash1:1504871843419521115> Payment Details

> **Campaign Budget:** $2,100 per week
> **Rate:** $300 per 1M eligible views
> **Eligible Traffic:** Tier 1 countries only
> **Payout Schedule:** Weekly
> **Payment Method:** Crypto
> **Minimum Payout:** $10

## <a:arrow1:1504776324051374130> Join the Campaign

Click the button below to start clipping and earning.`
  }
};

function loadData() {
  if (!fs.existsSync(dataFilePath)) {
    fs.writeFileSync(
      dataFilePath,
      JSON.stringify({
        users: {},
        applications: {},
        campaignAccountRequests: {},
        clips: {}
      }, null, 2)
    );
  }

  const raw = JSON.parse(fs.readFileSync(dataFilePath, 'utf8'));

  if (!raw.users) raw.users = {};
  if (!raw.applications) raw.applications = {};
  if (!raw.campaignAccountRequests) raw.campaignAccountRequests = {};
  if (!raw.clips) raw.clips = {};
  if (!raw.campaignStatus) raw.campaignStatus = {};

  return raw;
}

function saveData(data) {
  fs.writeFileSync(dataFilePath, JSON.stringify(data, null, 2));
}

async function submitClipToMonsterLab(
  campaignId,
  clipUrl,
  label,
  notes = ''
) {

  try {

    const response = await fetch(
      'https://monsterlab.io/api/clips/submit',
      {
        method: 'POST',
        headers: {
          Authorization: `ApiKey ${process.env.MONSTERLAB_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          url: clipUrl,
          campaignId,
          label,
          notes
        })
      }
    );

    const result = await response.json();

    return result;

  } catch (err) {

    console.error(err);

    return {
      success: false,
      error: err.message
    };
  }
}

function ensureUser(data, member) {

    if (!data.users) data.users = {};

    const id = member.id;

    if (!data.users[id]) {

        data.users[id] = {

            discordId: id,
            username: member.user.username,
            discordUsername: member.user.username,
            displayName: member.displayName,
            tag: member.user.tag,
            avatar: member.user.displayAvatarURL(),

            stats: {},
            campaigns: [],
            campaignAccounts: {}

        };

    }

    const user = data.users[id];

    // Always refresh these
    user.username = member.user.username;
    user.discordUsername = member.user.username;
    user.displayName = member.displayName;
    user.tag = member.user.tag;
    user.avatar = member.user.displayAvatarURL();

    return user;

}

function isAdmin(member) {
  return member.permissions.has(PermissionsBitField.Flags.Administrator);
}

function formatPlatform(p) {
  return {
    tiktok: 'TikTok',
    instagram: 'Instagram',
    youtube: 'YouTube',
    facebook: 'Facebook'
  }[p] || p;
}

function normalizeUsername(u) {
  return String(u).trim().replace(/^@+/, '');
}
function normalizeSocialKey(platform, username) {
  return `${platform}:${normalizeUsername(username).toLowerCase()}`;
}

function ensureUserSocials(data, userId) {
  if (!data.users[userId]) return;
  if (!data.users[userId].socials) {
    data.users[userId].socials = [];
  }
}
function makeApplicationId() {
  return `app_${Date.now()}_${Math.floor(Math.random() * 100000)}`;
}

function getCampaignCycle() {

    const now = new Date();

    // Monday 7AM UTC epoch
    const epoch = Date.UTC(2025, 0, 6, 7, 0, 0); // Monday Jan 6 2025 07:00 UTC

    const diff =
        now.getTime() - epoch;

    return Math.floor(
        diff / (7 * 24 * 60 * 60 * 1000)
    );

}

function getStatusLabel(status) {
  return {
    pending: 'Pending',
    waiting_confirm: 'Waiting for user confirmation',
    verifying: 'Verifying',
    approved: 'Approved',
    rejected: 'Rejected'
  }[status] || status;
}

function validateAccountSubmission(userId, campaignId, platform, username) {
  const data = loadData();
  const currentKey = normalizeSocialKey(platform, username);

  // 1. FIND ANY EXISTING ACTIVE OR PENDING REQUEST FOR THIS EXACT HANDLE
  const conflictingRequest = Object.values(data.campaignAccountRequests || {}).find(
    req => normalizeSocialKey(req.platform, req.username) === currentKey && req.status !== 'rejected'
  );

  if (conflictingRequest) {
    // Rule A: The handle is already taken by a DIFFERENT creator
    if (conflictingRequest.userId !== userId) {
      return { 
        isValid: false, 
        message: `❌ The account **@${username}** has already been registered by another creator.` 
      };
    } 
    // Rule B: The CURRENT user is trying to register the exact same handle again
    else {
      return { 
        isValid: false, 
        message: `❌ You have already linked or submitted a pending request for **@${username}**!` 
      };
    }
  }

  // ✅ SUCCESS: No duplicate handles found! 
  // The user is completely free to add multiple accounts for the same campaign and platform.
  return { isValid: true };
}

function validateClipSubmission(videoUrl) {
  const data = loadData();
  
  // Clean URL to remove tracking metrics (e.g., "?is_from_webapp=1")
  const cleanUrl = String(videoUrl).split('?')[0].trim().toLowerCase();

  // Check if this video base-url exists anywhere inside your clips dataset
  const clipExists = Object.values(data.clips || {}).some(clip => {
    const existingCleanUrl = String(clip.videoUrl || clip.url).split('?')[0].trim().toLowerCase();
    return existingCleanUrl === cleanUrl;
  });

  if (clipExists) {
    return { isValid: false, message: "❌ This video link has already been submitted to our system!" };
  }

  return { isValid: true };
}

async function archiveFinishedCampaigns(client) {

  const data = loadData();

  if (!data.campaignStatus) return;

  for (const campaignId of Object.keys(data.campaignStatus)) {

    const status = data.campaignStatus[campaignId];

    if (status.status !== 'finished') continue;

    if (status.archived) continue;

    if (!status.finishedAt) continue;

    const hoursPassed =
      (Date.now() - status.finishedAt) /
      (1000 * 60 * 60);

    if (hoursPassed < 24) continue;

    const campaign = CAMPAIGNS[campaignId];

    if (!campaign) continue;

    const guild =
      client.guilds.cache.first();

    if (!guild) continue;

    const channel =
      guild.channels.cache.get(
        campaign.panelChannelId
      );

    if (!channel) continue;

    try {

      // Move channel
      await channel.setParent(
        FINISHED_CAMPAIGNS_CATEGORY_ID
      );

      // Hide from everyone
      await channel.permissionOverwrites.edit(
        guild.roles.everyone,
        {
          ViewChannel: false
        }
      );

      // Allow staff
      await channel.permissionOverwrites.edit(
        STAFF_ROLE_ID,
        {
          ViewChannel: true,
          SendMessages: true,
          ReadMessageHistory: true
        }
      );

      // Rename channel
      if (!channel.name.startsWith("closed-")) {

        await channel.setName(
          `closed-${channel.name}`
        );

      }

      status.archived = true;

      saveData(data);

      console.log(
        `${campaign.name} archived successfully.`
      );

    } catch (err) {

      console.error(err);

    }

  }

}

function renderClipStaffContent(clip) {
  return (
    `📥 **New Clip Submission**\n\n` +
    `**User:** <@${clip.userId}>\n` +
    `**Campaign:** ${clip.campaignName}\n` +
    `**Platform:** ${formatPlatform(clip.platform)}\n` +
    `**Username:** @${clip.username}\n` +
    `**Link:** ${clip.videoUrl || clip.url}\n` +
    `**Status:** ${clip.status}\n` +
    `${clip.views ? `**Views:** ${formatNumber(clip.views)}\n` : ''}` +
    `${clip.moneyMade ? `**Payout:** $${formatNumber(clip.moneyMade)}\n` : ''}`
  );
}

function buildClipStaffButtons(clip) {

    const row = new ActionRowBuilder();

    if (clip.status === "pending") {

        row.addComponents(

            new ButtonBuilder()
                .setCustomId(`clip_approve:${clip.id}`)
                .setLabel("Approve")
                .setEmoji("✅")
                .setStyle(ButtonStyle.Success),

            new ButtonBuilder()
                .setCustomId(`clip_reject:${clip.id}`)
                .setLabel("Reject")
                .setEmoji("❌")
                .setStyle(ButtonStyle.Danger)

        );

    }

    else if (clip.status === "approved") {

        row.addComponents(

            new ButtonBuilder()
                .setCustomId(`clip_reject:${clip.id}`)
                .setLabel("Reject")
                .setEmoji("❌")
                .setStyle(ButtonStyle.Danger),

            new ButtonBuilder()
                .setCustomId(`update_views:${clip.id}`)
                .setLabel("Update Views")
                .setEmoji("📈")
                .setStyle(ButtonStyle.Primary)

        );

    }

    else if (clip.status === "rejected") {

        row.addComponents(

            new ButtonBuilder()
                .setCustomId(`restore_clip:${clip.id}`)
                .setLabel("Restore")
                .setEmoji("♻️")
                .setStyle(ButtonStyle.Success)

        );

    }

    return [row];

}

function renderClipStaffContent(clip) {
  return `📥 **New Clip Submission**

**User:** <@${clip.userId}>
**Campaign:** ${clip.campaignName}
**Platform:** ${formatPlatform(clip.platform)}
**Username:** @${clip.username}
**Link:** ${clip.videoUrl}
**Status:** ${clip.status}
${clip.views ? `**Views:** ${formatNumber(clip.views)}\n` : ''}${clip.moneyMade ? `**Payout:** $${clip.moneyMade}\n` : ''}`;
}

function buildStaffButtons(id, status) {
  if (status === 'pending') {
    return [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`staff_send_code:${id}`)
          .setLabel('Send Code')
          .setStyle(ButtonStyle.Primary)
      )
    ];
  }

  if (status === 'waiting_confirm') {
    return [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`wait:${id}`)
          .setLabel('Waiting')
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(true)
      )
    ];
  }

  if (status === 'verifying') {
    return [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`staff_accept:${id}`)
          .setLabel('Accept')
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId(`staff_reject:${id}`)
          .setLabel('Reject')
          .setStyle(ButtonStyle.Danger)
      )
    ];
  }

  return [];
}

function cleanDropdownLabel(text) {
  return String(text)
    .replace(/<a?:\w+:\d+>/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 100);
}

async function sendStaffPayoutDashboard(guild, userId) {
  const data = loadData();
  const userRecord = data.users?.[userId];
  if (!userRecord) return;

  // Calculate live totals dynamically from approved clips
  const approvedClips = Object.values(data.clips || {}).filter(
    clip => clip.userId === userId && clip.status === 'approved'
  );
  
  const liveTotalEarned = approvedClips.reduce((sum, clip) => sum + (Number(clip.moneyMade) || 0), 0);
  if (liveTotalEarned <= 0) return; // Skip if they haven't earned anything yet

  let paymentLabel = 'No ID Provided';
  if (userRecord.paymentDetails?.exchange) {
    const exchangeName = userRecord.paymentDetails.exchange.charAt(0).toUpperCase() + userRecord.paymentDetails.exchange.slice(1);
    paymentLabel = `**${exchangeName} ID:** \`${userRecord.paymentDetails.paymentId}\``;
  }

  const embed = new EmbedBuilder()
    .setColor(0xF1C40F) // Processing Gold
    .setTitle('💸 Pending Payout Processing')
    .setDescription(
      `👤 **Creator:** <@${userId}>\n` +
      `💳 **Payment Method:** ${paymentLabel}\n` +
      `💰 **Total Outstanding Amount:** $${formatNumber(liveTotalEarned)}\n\n` +
      `*Verify the wallet details on your exchange platform, execute the payment, then use the controls below to update the user's dashboard entry status.*`
    )
    .setFooter({ text: `User ID: ${userId}` })
    .setTimestamp();

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`staff_payout_paid:${userId}`)
      .setLabel('Mark as Paid')
      .setStyle(ButtonStyle.Success)
      .setEmoji('✅'),
    new ButtonBuilder()
      .setCustomId(`staff_payout_error:${userId}`)
      .setLabel('Flag Error')
      .setStyle(ButtonStyle.Danger)
      .setEmoji('⚠️')
  );

  // Uses your exact environmental configuration constant
  const staffChannel = guild.channels.cache.get(PAYMENT_STAFF_CHANNEL_ID);
  if (staffChannel) {
    await staffChannel.send({ embeds: [embed], components: [row] });
  } else {
    console.log(`❌ Payout processing failed: Channel with ID ${PAYMENT_STAFF_CHANNEL_ID} not found.`);
  }
}

async function updateStaffMessage(guild, app) {
  const ch = guild.channels.cache.get(app.staffChannelId);
  if (!ch) return;

  try {
    const msg = await ch.messages.fetch(app.staffMessageId);
    await msg.edit({
      content: renderStaffContent(app),
      components: buildStaffButtons(app.id, app.status)
    });
  } catch (error) {
    console.log('Could not update staff message:', error.message);
  }
}

function formatNumber(num) {
  const n = Number(num) || 0;

  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return `${n}`;
}

function getLeaderboardUsers(data) {
  const users = Object.values(data.users || {});

  return users
    .map(user => {
      const userClips = Object.values(data.clips || {}).filter(
        clip => clip.userId === user.discordId && clip.status === 'approved'
      );

      const totalViews = userClips.reduce(
        (sum, clip) => sum + (Number(clip.views) || 0),
        0
      );

      const moneyMade = userClips.reduce(
        (sum, clip) => sum + (Number(clip.moneyMade) || 0),
        0
      );

      return {
        ...user,
        leaderboardViews: totalViews,
        leaderboardMoney: moneyMade
      };
    })
    .sort((a, b) => b.leaderboardViews - a.leaderboardViews);
}

function buildLeaderboardEmbed(guild, data, page = 1, perPage = 10) {
  // 1. MAP & AGGREGATE VIEWS FOR EVERY USER
  const sortedUsers = Object.entries(data.users || {})
    .map(([userId, userRecord]) => {
      const approvedClips = Object.values(data.clips || {}).filter(
        clip => clip.userId === userId && clip.status === 'approved'
      );

      const liveTotalViews = approvedClips.reduce(
        (sum, clip) => sum + (Number(clip.views) || 0),
        0
      );

      const finalName =
          userRecord.displayName ||
          userRecord.discordUsername ||
          userRecord.username ||
          userRecord.tag ||
          `User-${userId.slice(-4)}`;

      return {
        userId,
        username: finalName,
        totalViews: liveTotalViews,
        hideFromLeaderboard: userRecord.hideFromLeaderboard
      };
    })
    // 2. FILTER OUT USERS WITH 0 VIEWS AND SORT HIGHEST TO LOWEST
    .filter(user => user.totalViews > 0)
    .sort((a, b) => b.totalViews - a.totalViews);

  // 3. PAGINATION MATH
  const totalPages = Math.max(1, Math.ceil(sortedUsers.length / perPage));
  const currentPage = Math.min(page, totalPages);
  const startIdx = (currentPage - 1) * perPage;
  const pageUsers = sortedUsers.slice(startIdx, startIdx + perPage);

  // 4. BUILD THE EMBED STRINGS
  let leaderboardText = '';
  if (pageUsers.length === 0) {
    leaderboardText = '*No clippers on the leaderboard yet!*';
  } else {
    pageUsers.forEach((user, index) => {
      const overallRank = startIdx + index + 1;
      let medal = '🏅';
      if (overallRank === 1) medal = '🥇';
      if (overallRank === 2) medal = '🥈';
      if (overallRank === 3) medal = '🥉';

      const displayName = user.hideFromLeaderboard ? '*Hidden*' : user.username;
      leaderboardText += `${medal} **${displayName}**: ${formatNumber(user.totalViews)} Views\n`;
    });
  }

  const embed = new EmbedBuilder()
    .setColor(0x7ED957)
    .setTitle('🎬 Creators Elite <a:rgem:1506235676276953190>')
    .setDescription(`### Top Clippers All Time <a:chart1:1504773558415523931>\n\n${leaderboardText}\n\n<:whiteCE:1504904179905200148> Powered by Creators Elite`)
    .setFooter({ text: `Page ${currentPage} / ${totalPages}` });

  return { embed, totalPages };
}

function buildLeaderboardButtons(page, totalPages) {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`leaderboard_prev:${page}`)
        .setLabel('Previous')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(page <= 1),

      new ButtonBuilder()
        .setCustomId(`leaderboard_next:${page}`)
        .setLabel('Next')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(page >= totalPages)
    )
  ];
}

function getUserRank(data, userId) {
  const sortedUsers = Object.entries(data.users || {})
    .map(([id, userRecord]) => {
      const liveTotalViews = Object.values(data.clips || {}).filter(
        clip => clip.userId === id && clip.status === 'approved'
      ).reduce((sum, clip) => sum + (Number(clip.views) || 0), 0);

      return { id, totalViews: liveTotalViews };
    })
    .filter(user => user.totalViews > 0)
    .sort((a, b) => b.totalViews - a.totalViews);

  const rankIndex = sortedUsers.findIndex(u => u.id === userId);
  return rankIndex !== -1 ? rankIndex + 1 : null;
}

function ensureCampaignStats(userRecord, campaignId) {
  if (!userRecord.campaignStats) {
    userRecord.campaignStats = {};
  }

  if (!userRecord.campaignStats[campaignId]) {
    userRecord.campaignStats[campaignId] = {
      videosPosted: 0,
      videosApproved: 0,
      videosRejected: 0,
      totalViews: 0,
      moneyMade: 0
    };
  }

  return userRecord.campaignStats[campaignId];
}

function buildCampaignStatsEmbed(data, userRecord, campaignId, campaignName) {
  const campaign = CAMPAIGNS[campaignId];

  if (!campaign) {
    return new EmbedBuilder()
      .setColor(0xff0000)
      .setDescription('❌ Campaign not found. Please rejoin the campaign or contact staff.');
  }

  const currentCycle = getCampaignCycle(campaign.startDate);
  const payoutThreshold = campaign?.payoutThreshold || 100000;

  const userClips = Object.values(data.clips || {}).filter(clip =>
    clip.userId === userRecord.discordId &&
    clip.campaignId === campaignId &&
    clip.cycle === currentCycle
  );

  const approvedClips = userClips.filter(c => c.status === 'approved');
  const rejectedClips = userClips.filter(c => c.status === 'rejected');
  const pendingClips = userClips.filter(c => c.status === 'pending');

  const totalViews = approvedClips.reduce((sum, c) => sum + (Number(c.views) || 0), 0);
  const moneyMade = approvedClips.reduce((sum, c) => sum + (Number(c.moneyMade) || 0), 0);

  const viewsNeeded = Math.max(payoutThreshold - totalViews, 0);

  const payoutText =
    totalViews >= payoutThreshold
      ? `Eligible for payout.\n**Money Made:** $${formatNumber(moneyMade)}`
      : `Need **${formatNumber(viewsNeeded)}** more views`;

  return new EmbedBuilder()
    .setColor(0x7ED957)
    .setDescription(
      `<a:chart1:1504773558415523931> **Campaign Stats - ${campaignName}**\n\n` +
      `<a:rocket1:1504872045849346140> **Total Views**\n${formatNumber(totalViews)}\n\n` +
      `<a:Cash1:1504871843419521115> **Payout Target: ${formatNumber(payoutThreshold)} Views**\n${payoutText}\n\n` +
      `<:approve1:1508373907411963955> **Approved Videos**\n${approvedClips.length}\n\n` +
      `<a:dot1:1508433228669780029> **Pending Videos**\n${pendingClips.length}\n\n` +
      `<:reject1:1508373970259546162> **Rejected Videos**\n${rejectedClips.length}\n\n` +
      `🎞️ **View Your Clips**\nClick the button below to check the clips submitted for this campaign.`
    )
    .setFooter({ text: `Last update | ${new Date().toLocaleString()}` });
}
 
function makeSocialRequestId() {
  return `social_${Date.now()}_${Math.floor(Math.random() * 100000)}`;
}

function renderSocialStaffContent(request) {
  // Pass the raw input username through your normalizeUsername function to strip spaces and '@'
  const cleanUsername = normalizeUsername(request.username);
  const platform = String(request.platform).toLowerCase();
  
  // 1. Map out the clickable web link for each platform
  let profileUrl = '';
  if (platform === 'instagram') {
    profileUrl = `https://www.instagram.com/${cleanUsername}`;
  } else if (platform === 'tiktok') {
    profileUrl = `https://www.tiktok.com/@${cleanUsername}`;
  } else if (platform === 'youtube') {
    profileUrl = `https://www.youtube.com/@${cleanUsername}`;
  } else {
    profileUrl = `Platform Link Formatting Error`;
  }

  // 2. Format the message for the staff channel with a markdown link [Text](URL)
  return (
    `📩 **Campaign Account Verification Request**\n\n` +
    `👤 **User:** <@${request.userId}>\n` +
    `🎬 **Campaign:** **${request.campaignName || 'Unknown Campaign'}**\n` +
    `🌐 **Platform:** ${formatPlatform(request.platform)}\n` +
    `🆔 **Username Link:** [@${cleanUsername}](${profileUrl})\n` + // Becomes a blue clickable hyperlink!
    `⏳ **Status:** \`${request.status.toUpperCase()}\``
  );
}

function buildSocialStaffButtons(id, status) {
  if (status === 'pending') {
    return [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`social_staff_send_code:${id}`)
          .setLabel('Send Code')
          .setStyle(ButtonStyle.Primary)
      )
    ];
  }

  if (status === 'waiting_confirm') {
    return [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`social_wait:${id}`)
          .setLabel('Waiting')
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(true)
      )
    ];
  }

  

  if (status === 'verifying') {
    return [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`social_staff_accept:${id}`)
          .setLabel('Accept')
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId(`social_staff_reject:${id}`)
          .setLabel('Reject')
          .setStyle(ButtonStyle.Danger)
      )
    ];
  }

  return [];
}

console.log(process.env.MONSTERLAB_API_KEY);

function getCampaignPeriod() {

    const cycle = getCampaignCycle();

    const epoch =
        new Date(Date.UTC(2025, 0, 6, 7, 0, 0));

    const periodStart =
        new Date(epoch);

    periodStart.setUTCDate(
        periodStart.getUTCDate() + cycle * 7
    );

    const periodEnd =
        new Date(periodStart);

    periodEnd.setUTCDate(
        periodEnd.getUTCDate() + 7
    );

    return {
        periodStart,
        periodEnd
    };

}

function formatDateShort(date) {
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric'
  });
}

function getCampaignTotals(data, campaignId) {
  const campaign = CAMPAIGNS[campaignId];

  if (!campaign) {
      return {
          users: 0,
          videos: 0,
          views: 0,
          payout: 0
      };
  }

  const currentCycle = getCampaignCycle();
  const users = Object.values(data.users || {}).filter(user =>
    user.campaigns?.includes(campaignId)
  ).length;

  const clips = Object.values(data.clips || {}).filter(clip =>
      clip.campaignId === campaignId &&
      clip.status === 'approved' &&
      (
          !currentCycle ||
          (currentCycle === null || clip.cycle === currentCycle)
      )
  );

  const videos = clips.length;

  const views = clips.reduce(
    (sum, clip) => sum + (Number(clip.views) || 0),
    0
  );

  const payout = clips.reduce(
    (sum, clip) => sum + (Number(clip.moneyMade) || 0),
    0
  );

  return { users, videos, views, payout };
}

function buildCampaignStatusEmbed(campaign, data) {
  const { periodStart, periodEnd } = getCampaignPeriod(campaign.startDate);
  const totals = getCampaignTotals(data, campaign.id);

  const cappedPayout = Math.min(
    totals.payout || 0,
    campaign.weeklyBudget || 0
  );

  const remaining = Math.max(
    (campaign.weeklyBudget || 0) - cappedPayout,
    0
  );

  const fulfilledPercent = campaign.weeklyBudget
    ? Math.min((cappedPayout / campaign.weeklyBudget) * 100, 100)
    : 0;

  return new EmbedBuilder()
    .setColor(0x7ED957)
    .setTitle(campaign.name)
    .setDescription(
      `<a:redalert:1504777207648620595> **Campaign Status**\n` +
      `**Status:** Active\n\n` +

      `📅 **Campaign Period**\n` +
      `${formatDateShort(periodStart)} - ${formatDateShort(periodEnd)}\n\n` +

      `<a:rocket1:1504872045849346140> **Performance Metrics**\n` +
      `**Users:** ${totals.users}\n` +
      `**Videos:** ${totals.videos}\n` +
      `**Views:** ${formatNumber(totals.views)}\n\n` +

      `<a:Cash1:1504871843419521115> **Payout & Budget**\n` +
      `**Budget:** $${formatNumber(campaign.weeklyBudget)} / week\n` +
      `**Remaining:** $${formatNumber(remaining)}\n` +
      `**Payout:** $${formatNumber(cappedPayout)} (${fulfilledPercent.toFixed(1)}%)\n\n` +

      `<a:warning:1504774411280973864> Once we hit the **${formatNumber(campaign.viewCap)} view cap**, any views after that won't be paid, so post early to secure your payout.\n\n` +
      `<:whiteCE:1504904179905200148> Powered by Creators Elite | ${new Date().toLocaleString()}`
  );
}

function makeClipId() {
  return `clip_${Date.now()}_${Math.floor(Math.random() * 100000)}`;
}

function isValidUrl(value) {
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
}

function getUserCampaignClips(data, userId, campaignId) {
  if (!data.clips) data.clips = {};

  return Object.values(data.clips).filter(
    clip => clip.userId === userId && clip.campaignId === campaignId
  );
}

function renderCampaignAccounts(userRecord, campaignId) {
  const campaignStats = userRecord.campaignStats?.[campaignId] || {};
  const platforms = Object.keys(campaignStats);

  if (platforms.length === 0) {
    return 'No campaign accounts set yet.';
  }

  return platforms.map(platform => {
    const acc = campaignStats[platform];
    return `• **${formatPlatform(platform)}** — @${acc.username || 'unknown'}`;
  }).join('\n');
}

async function sendTicketLog(guild, {
  user,
  ticketName,
  action,
  panel = 'Support',
  color = 0x57F287
}) {
  const logChannel = guild.channels.cache.get(TICKET_LOG_CHANNEL_ID);
  if (!logChannel) return;

  const embed = new EmbedBuilder()
    .setColor(color)
    .setAuthor({
      name: user.tag,
      iconURL: user.displayAvatarURL()
    })
    .setDescription(
      `## Logged Info\n` +
      `Ticket: ${ticketName}\n` +
      `Action: ${action}\n` +
      `## Panel\n` +
      `${panel}`
    );

  await logChannel.send({ embeds: [embed] }).catch(() => {});
}

function ensureCampaignPlatformStats(userRecord, campaignId, platform, username = '') {
  if (!userRecord.campaignStats) {
    userRecord.campaignStats = {};
  }

  if (!userRecord.campaignStats[campaignId]) {
    userRecord.campaignStats[campaignId] = {};
  }

  if (!userRecord.campaignStats[campaignId][platform]) {
    userRecord.campaignStats[campaignId][platform] = {
      username,
      videosPosted: 0,
      videosApproved: 0,
      videosRejected: 0,
      totalViews: 0,
      moneyMade: 0
    };
  }

  if (username && !userRecord.campaignStats[campaignId][platform].username) {
    userRecord.campaignStats[campaignId][platform].username = username;
  }

  return userRecord.campaignStats[campaignId][platform];
}

function buildCampaignPanelButtons(campaign, data) {
  const totals = getCampaignTotals(data, campaign.id);

  const fulfilledPercent = campaign.weeklyBudget
    ? Math.min((totals.payout / campaign.weeklyBudget) * 100, 100).toFixed(1)
    : '0.0';

  const campaignState =
    data.campaignStatus?.[campaign.id];

  const isFinished =
    data.campaignStatus?.[campaign.id]?.status === 'finished' ||
    campaign.status === 'finished';

  console.log('campaignPayout', totals.payout);

  const components = [
    new ButtonBuilder()
      .setCustomId(`join_campaign:${campaign.id}`)
      .setLabel("Join Campaign")
      .setEmoji("<a:flyin:1506234392920723546>")
      .setStyle(ButtonStyle.Success)
      .setDisabled(isFinished),

    new ButtonBuilder()
      .setCustomId(`campaign_status:${campaign.id}`)
      .setLabel(isFinished ? "Campaign Finished" : "Campaign Status")
      .setEmoji(isFinished ? "🏁" : "<a:chart1:1504773558415523931>")
      .setStyle(isFinished ? ButtonStyle.Secondary : ButtonStyle.Primary),

    new ButtonBuilder()
      .setCustomId(`campaign_fulfilled:${campaign.id}`)
      .setLabel(`Fulfilled: ${fulfilledPercent}%`)
      .setEmoji("<a:Loadin:1506234461459714100>")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(true)
  ];

  const row = new ActionRowBuilder().addComponents(
    ...components
  );

  return [row];
}

async function createStaffCampaignPanel(campaign) {

    const channel = client.channels.cache.get(STAFF_CONTROL_CHANNEL_ID);

    if (!channel) return;

    const row = new ActionRowBuilder().addComponents(

        new ButtonBuilder()
            .setCustomId(`finish_campaign:${campaign.id}`)
            .setLabel("Finish Campaign")
            .setEmoji("🏁")
            .setStyle(ButtonStyle.Danger),

        new ButtonBuilder()
            .setCustomId(`reopen_campaign:${campaign.id}`)
            .setLabel("Reopen Campaign")
            .setEmoji("🔄")
            .setStyle(ButtonStyle.Success)

    );

    await channel.send({
        content:
`## ${campaign.name}

Staff Controls

Only moderators should use these buttons.`,
        components: [row]
    });

}

async function updateCampaignPanelMessage(guild, campaignId) {
  const campaign = CAMPAIGNS[campaignId];

  console.log('Updating campaign panel...');
  console.log(campaign.panelChannelId);
  console.log(campaign.panelMessageId);

  const channel = guild.channels.cache.get(
    campaign.panelChannelId
  );

  if (!channel) {
    console.log('Panel channel not found');
    return;
  }

  const msg = await channel.messages
    .fetch(campaign.panelMessageId)
    .catch(() => null);

  if (!msg) {
    console.log('Panel message not found');
    return;
  }

  console.log('Panel message fetched');
  console.log('Editing panel...');

  const data = loadData();

  await msg.edit({
    content: campaign.panelText,
    components: buildCampaignPanelButtons(campaign, data)
  });
  
  console.log('Panel updated successfully');

}

async function updateLeaderboardMessage(guild) {
  console.log('🔄 Triggering automated leaderboard edit...');

  const channel = guild.channels.cache.get(LEADERBOARD_CHANNEL_ID);
  if (!channel) return;

  const msg = await channel.messages
    .fetch(LEADERBOARD_MESSAGE_ID)
    .catch(() => null);

  if (!msg) return;

  const data = loadData();

  for (const member of guild.members.cache.values()) {

      if (!data.users?.[member.id]) continue;

      data.users[member.id].displayName = member.displayName;
      data.users[member.id].discordUsername = member.user.username;
      data.users[member.id].username = member.user.username;
      data.users[member.id].tag = member.user.tag;

  }

  saveData(data);

  // FIX: Pass guild as the very first argument here!
  const { embed, totalPages } = buildLeaderboardEmbed(guild, data, 1); 

  await msg.edit({
    embeds: [embed],
    components: buildLeaderboardButtons(1, totalPages)
  });
}

function extractLinksFromText(text) {
  return String(text)
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean);
}

function ensureCampaignAccount(userRecord, campaignId, platform, username) {
  if (!userRecord.campaignAccounts) {
    userRecord.campaignAccounts = {};
  }

  if (!userRecord.campaignAccounts[campaignId]) {
    userRecord.campaignAccounts[campaignId] = {};
  }

  userRecord.campaignAccounts[campaignId][platform] = {
    username
  };

  return userRecord.campaignAccounts[campaignId][platform];
}

function getCampaignPlatformsForUser(userRecord, campaignId) {
  const campaignStats = userRecord.campaignStats?.[campaignId] || {};
  return Object.keys(campaignStats).filter(platform => campaignStats[platform]);
}

function ensureCampaignAccount(userRecord, campaignId, platform, username = '') {
  if (!userRecord.campaignAccounts) {
    userRecord.campaignAccounts = {};
  }

  if (!userRecord.campaignAccounts[campaignId]) {
    userRecord.campaignAccounts[campaignId] = {};
  }

  if (!userRecord.campaignAccounts[campaignId][platform]) {
    userRecord.campaignAccounts[campaignId][platform] = {
      username,
      verified: false,
      bioCode: null,
      addedAt: new Date().toISOString()
    };
  }

  if (username) {
    userRecord.campaignAccounts[campaignId][platform].username = username;
  }

  return userRecord.campaignAccounts[campaignId][platform];
}

function ensureCampaignPlatformStats(userRecord, campaignId, platform, username = '') {
  if (!userRecord.campaignStats) {
    userRecord.campaignStats = {};
  }

  if (!userRecord.campaignStats[campaignId]) {
    userRecord.campaignStats[campaignId] = {};
  }

  if (!userRecord.campaignStats[campaignId][platform]) {
    userRecord.campaignStats[campaignId][platform] = {
      username,
      videosPosted: 0,
      videosApproved: 0,
      videosRejected: 0,
      totalViews: 0,
      moneyMade: 0
    };
  }

  if (username) {
    userRecord.campaignStats[campaignId][platform].username = username;
  }

  return userRecord.campaignStats[campaignId][platform];
}

function renderCampaignAssignedAccounts(userRecord, campaignId) {
  const accounts = userRecord.campaignAccounts?.[campaignId] || {};
  const platforms = Object.keys(accounts);

  if (platforms.length === 0) {
    return 'No campaign accounts assigned yet.';
  }

  return platforms.map(platform => {
    const acc = accounts[platform];
    const verifiedText = acc.verified ? '✅ Verified' : '⏳ Pending';
    return `• **${formatPlatform(platform)}** — @${acc.username} (${verifiedText})`;
  }).join('\n');
}

function makeCampaignAccountRequestId() {
  return `car_${Date.now()}_${Math.floor(Math.random() * 100000)}`;
}

function renderCampaignAccountStaffContent(request) {
  // Pass the raw input username through your normalizeUsername function to strip spaces and '@'
  const cleanUsername = normalizeUsername(request.username);
  const platform = String(request.platform).toLowerCase();
  
  // 1. Map out the clickable web link for each platform
  let profileUrl = '';
  if (platform === 'instagram') {
    profileUrl = `https://www.instagram.com/${cleanUsername}`;
  } else if (platform === 'tiktok') {
    profileUrl = `https://www.tiktok.com/@${cleanUsername}`;
  } else if (platform === 'youtube') {
    profileUrl = `https://www.youtube.com/@${cleanUsername}`;
  } else {
    profileUrl = `Platform Link Formatting Error`;
  }

  // 2. Format the message for the staff channel with a markdown link [Text](URL)
  return (
    `📩 **Campaign Account Verification Request**\n\n` +
    `👤 **User:** <@${request.userId}>\n` +
    `🎬 **Campaign:** **${request.campaignName || 'Unknown Campaign'}**\n` +
    `🌐 **Platform:** ${formatPlatform(request.platform)}\n` +
    `🆔 **Username Link:** [@${cleanUsername}](${profileUrl})\n` + // Becomes a blue clickable hyperlink!
    `⏳ **Status:** \`${request.status.toUpperCase()}\``
  );
}

function buildCampaignAccountStaffButtons(id, status) {
  if (status === 'pending') {
    return [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`campaign_staff_send_code:${id}`)
          .setLabel('Send Code')
          .setStyle(ButtonStyle.Primary)
      )
    ];
  }

  if (status === 'waiting_confirm') {
    return [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`campaign_wait:${id}`)
          .setLabel('Waiting')
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(true)
      )
    ];
  }

  if (status === 'verifying') {
    return [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`campaign_staff_accept:${id}`)
          .setLabel('Accept')
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId(`campaign_staff_reject:${id}`)
          .setLabel('Reject')
          .setStyle(ButtonStyle.Danger)
      )
    ];
  }

  return [];
}

async function updateCampaignAccountStaffMessage(guild, request) {
  const campaign = CAMPAIGNS[request.campaignId];
  if (!campaign) return;

  const ch = guild.channels.cache.get(campaign.staffChannelId);
  if (!ch || !request.staffMessageId) return;

  try {
    const msg = await ch.messages.fetch(request.staffMessageId);
    await msg.edit({
      content: renderCampaignAccountStaffContent(request),
      components: buildCampaignAccountStaffButtons(request.id, request.status)
    });
  } catch (error) {
    console.log('Could not update campaign account staff message:', error.message);
  }
}

function makeClipId() {
  return `clip_${Date.now()}_${Math.floor(Math.random() * 100000)}`;
}

function isValidUrl(value) {
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
}

function extractLinksFromText(text) {
  return String(text)
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean);
}

function getUserCampaignClips(data, userId, campaignId) {
  if (!data.clips) data.clips = {};

  return Object.values(data.clips).filter(
    clip => clip.userId === userId && clip.campaignId === campaignId
  );
}

async function getTikTokViews(url) {
  const res = await axios.get(
    `https://www.tikwm.com/api/?url=${encodeURIComponent(url)}`,
    { timeout: 15000 }
  );

  return Number(res.data?.data?.play_count || 0);
}

function getYouTubeVideoId(url) {
  const match = url.match(/(?:shorts\/|watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
  return match ? match[1] : null;
}

async function getYouTubeViews(url) {
  const videoId = getYouTubeVideoId(url);
  if (!videoId) return 0;

  const res = await axios.get('https://www.googleapis.com/youtube/v3/videos', {
    timeout: 15000,
    params: {
      part: 'statistics',
      id: videoId,
      key: process.env.YOUTUBE_API_KEY
    }
  });

  return Number(res.data?.items?.[0]?.statistics?.viewCount || 0);
}

async function fetchClipViews(clip) {
  if (clip.platform === 'tiktok') return await getTikTokViews(clip.url);
  if (clip.platform === 'youtube') return await getYouTubeViews(clip.url);
  return clip.rawViews || 0;
}

let trackingRunning = false;

async function autoTrackClipViews() {
  if (trackingRunning) return;
  trackingRunning = true;

  try {
    const data = loadData();

    // 1. Reset cumulative user counts before aggregating
    for (const user of Object.values(data.users || {})) {
      if (user.stats) {
        user.stats.totalViews = 0;
        user.stats.moneyMade = 0;
      }
      
      if (user.campaignStats) {
        for (const campaignId of Object.keys(user.campaignStats)) {
          for (const platform of Object.keys(user.campaignStats[campaignId])) {
            user.campaignStats[campaignId][platform].totalViews = 0;
            user.campaignStats[campaignId][platform].moneyMade = 0;
          }
        }
      }
    }

    // 2. Loop through all clips
    for (const [clipId, clip] of Object.entries(data.clips || {})) {
      // FIX: Skip ONLY rejected clips. This allows 'pending' and 'approved' to track!
      if (clip.status === 'rejected') continue; 
      if (!clip.url) continue;

      const lastChecked = clip.lastChecked || 0;
      
      // Fetch live views if 30 minutes have passed since last check
      if (Date.now() - lastChecked >= 30 * 60 * 1000) {
        try {
          const currentViews = await fetchClipViews(clip);
          const startingViews = clip.startingViews || 0;
          const earnedViews = Math.max(currentViews - startingViews, 0);

          clip.currentViews = currentViews;
          clip.views = earnedViews;
          clip.lastChecked = Date.now();
          clip.trackingError = null;

          const campaign = CAMPAIGNS[clip.campaignId];
          const rate = campaign?.ratePerMillion || 0;

          clip.moneyMade = (earnedViews / 1000000) * rate;

          data.clips[clipId] = clip;
        } catch (err) {
          clip.trackingError = err.message;
          clip.lastChecked = Date.now();
          data.clips[clipId] = clip;
        }
        
        // API rate limit delay
        await new Promise(resolve => setTimeout(resolve, 2000));
      }

      // 3. Accumulate data into user profiles ONLY if the clip is approved
      // This ensures stats/leaderboards don't show unapproved views!
      if (clip.status === 'approved') {
        const userId = clip.userId;
        if (data.users[userId]) {
          const userRecord = data.users[userId];
          
          // Add to global profile metrics
          userRecord.stats.totalViews += Number(clip.views) || 0;
          userRecord.stats.moneyMade += Number(clip.moneyMade) || 0;

          // Add to specific campaign platform metrics
          const platformStats = ensureCampaignPlatformStats(userRecord, clip.campaignId, clip.platform, clip.username);
          platformStats.totalViews += Number(clip.views) || 0;
          platformStats.moneyMade += Number(clip.moneyMade) || 0;
        }
      }
    }
  
    saveData(data);
    
    const guild = client.guilds.cache.first();
    if (guild) {
      // Direct update to your global leaderboard message every 30 mins
      await updateLeaderboardMessage(guild);

      // Still update platform specific campaign panels if needed
      for (const campaignId of Object.keys(CAMPAIGNS)) {
        await updateCampaignPanelMessage(guild, campaignId);
      }
    }

    console.log('✅ Auto tracking completed & Leaderboards updated!');
  } catch (err) {
    console.error('❌ Auto tracking failed:', err);
  } finally {
    trackingRunning = false;
  }
}

async function archiveFinishedCampaigns() {

    const data = loadData();

    if (!data.campaignStatus) return;

    const guild = client.guilds.cache.first();

    if (!guild) return;

    for (const [campaignId, state] of Object.entries(data.campaignStatus)) {

        if (state.status !== "finished") continue;

        if (state.archived) continue;

        if (
            Date.now() - state.finishedAt <
            24 * 60 * 60 * 1000
        ) continue;

        const campaign =
            CAMPAIGNS[campaignId];

        if (!campaign) continue;

        try {

            const category =
                guild.channels.cache.get(
                    campaign.categoryId
                );

            if (!category) continue;

            let finishedCategory =
                guild.channels.cache.find(
                    c =>
                        c.type === ChannelType.GuildCategory &&
                        c.name === "📁 Finished Campaigns"
                );

            if (!finishedCategory) {

                finishedCategory =
                    await guild.channels.create({

                        name: "📁 Finished Campaigns",

                        type: ChannelType.GuildCategory

                    });

            }

            const channels =
                guild.channels.cache.filter(
                    c => c.parentId === category.id
                );

            for (const [, channel] of channels) {

                await channel.setParent(
                    finishedCategory.id
                );

                await channel.permissionOverwrites.edit(

                    guild.roles.everyone,

                    {
                        ViewChannel: false
                    }

                );

            }

            await category.delete().catch(() => {});

            state.archived = true;

            console.log(
                `${campaign.name} archived`
            );

        } catch (err) {

            console.error(err);

        }

    }

    saveData(data);

}

async function updateSocialStaffMessage(guild, request) {
  const ch = guild.channels.cache.get(process.env.SOCIAL_STAFF_CHANNEL_ID);
  if (!ch) return;

  try {
    const msg = await ch.messages.fetch(request.staffMessageId);
    await msg.edit({
      content: renderSocialStaffContent(request),
      components: buildSocialStaffButtons(request.id, request.status)
    });
  } catch (error) {
    console.log('Could not update social staff message:', error.message);
  }
}

client.once(Events.ClientReady, () => {
  console.log(`Online as ${client.user.tag}`);

  autoTrackClipViews();
  setInterval(autoTrackClipViews, 30 * 60 * 1000);

  archiveFinishedCampaigns();
  setInterval(archiveFinishedCampaigns, 5 * 60 * 1000);
});

client.on('messageCreate', async (message) => {
    console.log(`Received: ${message.content}`);

    if (message.author.bot) return;

    if (message.content !== '!cleanupchannels') return;

    console.log('Cleanup command received');

    await message.reply('Cleanup started...');
});

client.on(Events.MessageCreate, async message => {
  try {
    if (message.author.bot) return;
    if (!message.guild) return;

    console.log('MESSAGE RECEIVED:', message.content);

    if (message.content === '!monstertest') {
      console.log('monster test triggered');
        
      const response = await fetch(
        'https://monsterlab.io/api/account',
        {
          headers: {
            Authorization: `ApiKey ${MONSTERLAB_API_KEY}`
          }
        }
      );

      console.log('Status:', response.status);

      const text = await response.text();

      console.log('Response:', text);

      await message.reply('Check console for response.');
    }

    if (message.content === '!monstercampaigns') {
      const response = await fetch(
        'https://monsterlab.io/api/clips/campaigns',
        {
          method: 'GET',
          headers: {
            Authorization: `ApiKey ${process.env.MONSTERLAB_API_KEY}`
          }
        }
      );

      console.log('Status:', response.status);

      const text = await response.text();

      console.log(text);

      await message.reply('Check console for campaigns.');
    }

    if (message.content === '!monsterraw') {
      const response = await fetch(
        'https://monsterlab.io/api/clips/campaigns',
        {
          headers: {
            Authorization: `ApiKey ${process.env.MONSTERLAB_API_KEY}`
          }
        }
      );
 
      const data = await response.json();

      console.log(
        JSON.stringify(data, null, 2)
      );

      await message.reply('Printed campaign data to console.');
    }

    if (message.content.trim() === '!ding') {
      await message.reply('✅ Bot can read messages.');
      return;
    }
  
    if (message.content.trim().toLowerCase() === '!ticketpanel') {
      const embed = new EmbedBuilder()
        .setColor(0x57F287)
        .setTitle('<:whiteCE:1504904179905200148> Support Center')
        .setDescription(
          'Need help with campaigns, payments, submissions, or account issues?\n\nOpen a support ticket below.⬇️'
        );

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('open_ticket')
          .setLabel('Open Ticket')
          .setEmoji('✉️')
          .setStyle(ButtonStyle.Secondary)
      );

      await message.channel.send({
        embeds: [embed],
        components: [row]
      });

      return;
    }

    if (message.content.trim().toLowerCase() === '!proxypanel') {
      const embed = new EmbedBuilder()
        .setColor(0x57F287)
        .setTitle('<:whiteCE:1504904179905200148> Premium Residential Proxies')
        .setDescription(
          `Looking for clean, high-performance proxies for automated posting, scraping, or multi-accounting?\n\n` +
          `💰 **Pricing:** \`$${PRICE_PER_PROXY}\` per proxy\n` +
          `🌍 **Locations:** US, UK, DE, NG and more\n` +
          `🔥 **Optimization:** TikTok, Instagram, YouTube and automation workflows`
        )
        .setFooter({
          text: 'Creators Elite Proxy Network'
        });

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('buy_proxy_trigger')
          .setLabel('Buy Proxy')
          .setEmoji('🛒')
          .setStyle(ButtonStyle.Secondary)
      );

      await message.channel.send({
        embeds: [embed],
        components: [row]
      });
      
      return;
    }

    if (message.content === '!monstercampaigns') {

      const data = loadData();

      const campaigns =
        Object.values(data.monsterCampaigns || {});

      return message.reply(
        campaigns
          .map(c => c.name)
          .join('\n')
      );
    }

    if (message.content === '!leaderboard') {
      const data = loadData();
      const leaderboard = buildLeaderboardEmbed(data, 1, 10);

      await message.channel.send({
        embeds: [leaderboard.embed],
        components: buildLeaderboardButtons(leaderboard.page, leaderboard.totalPages)
      });

      return;
    }

    if (message.content.startsWith('!addviews')) {
      if (!isAdmin(message.member)) {
        await message.reply('❌ You must be an admin to use this command.');
        return;
      }

      const args = message.content.trim().split(/\s+/);
      const mentionedUser = message.mentions.users.first();
      const views = Number(args[2]);

      if (!mentionedUser || Number.isNaN(views)) {
        await message.reply('❌ Usage: `!addviews @user 50000`');
        return;
      }

      const member = await message.guild.members.fetch(mentionedUser.id).catch(() => null);
      if (!member) {
        await message.reply('❌ User not found in server.');
        return;
      }

      const data = loadData();
      const userRecord = ensureUser(data, member);
      userRecord.stats.totalViews += views;
      saveData(data);

      await message.reply(`✅ Added **${views}** views to <@${mentionedUser.id}>.`);
      return;
    }

    if (message.content.startsWith('!approveclip')) {
      if (!isAdmin(message.member)) {
        await message.reply('❌ You must be an admin to use this command.');
        return;
      }

      const args = message.content.trim().split(/\s+/);
      const mentionedUser = message.mentions.users.first();
      const views = Number(args[2]);
      const amount = Number(args[3]);

      if (!mentionedUser || Number.isNaN(views) || Number.isNaN(amount)) {
        await message.reply('❌ Usage: `!approveclip @user 50000 80`');
        return;
      }

      const member = await message.guild.members.fetch(mentionedUser.id).catch(() => null);
      if (!member) {
        await message.reply('❌ User not found in server.');
        return;
      }

      const data = loadData();
      const userRecord = ensureUser(data, member);

      userRecord.stats.videosPosted += 1;
      userRecord.stats.videosApproved += 1;
      userRecord.stats.totalViews += views;
      userRecord.stats.moneyMade += amount;

      saveData(data);

      await message.reply(
        `✅ Approved clip for <@${mentionedUser.id}>.\nViews added: **${views}**\nMoney added: **$${amount}**`
      );
      return;
    }

    if (message.content.startsWith('!rejectclip')) {
      if (!isAdmin(message.member)) {
        await message.reply('❌ You must be an admin to use this command.');
        return;
      }

      const mentionedUser = message.mentions.users.first();

      if (!mentionedUser) {
        await message.reply('❌ Usage: `!rejectclip @user`');
        return;
      }

      const member = await message.guild.members.fetch(mentionedUser.id).catch(() => null);
      if (!member) {
        await message.reply('❌ User not found in server.');
        return;
      }

      const data = loadData();
      const userRecord = ensureUser(data, member);

      userRecord.stats.videosPosted += 1;
      userRecord.stats.videosRejected += 1;

      saveData(data);

      await message.reply(`❌ Rejected clip for <@${mentionedUser.id}>.`);
      return;
    }

    if (message.content.trim() === '!demographicspanel') {
      const embed = new EmbedBuilder()
        .setColor(0x7ED957)
        .setTitle('🌍 Demographics Verification')
        .setDescription(
          `Upload your screen recording demographics proof.\n\n` +
          `Click below to begin.`
      );

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('demographics_start')
          .setLabel('Upload Demographics')
          .setEmoji('🌍')
          .setStyle(ButtonStyle.Primary)
      );
 
      await message.channel.send({ embeds: [embed], components: [row] });
      return;
    }

    if (message.content.startsWith('!fixcampaignaccount')) {
      if (!isAdmin(message.member)) {
        await message.reply('❌ You must be an admin to use this command.');
        return;
      }

      const args = message.content.trim().split(/\s+/);
      const mentionedUser = message.mentions.users.first();
      const campaignId = args[2];
      const platform = args[3];
      const username = args[4];

      if (!mentionedUser || !campaignId || !platform || !username) {
        await message.reply('❌ Usage: `!fixcampaignaccount @user emoney_shopping tiktok Dijanobs7rq`');
        return;
      }

      const member = await message.guild.members.fetch(mentionedUser.id).catch(() => null);
      if (!member) {
        await message.reply('❌ User not found in server.');
        return;
      }

      const data = loadData();
      const userRecord = ensureUser(data, member);

      ensureCampaignAccount(userRecord, campaignId, platform, username);
      ensureCampaignPlatformStats(userRecord, campaignId, platform, username);
   
      if (!userRecord.campaigns.includes(campaignId)) {
        userRecord.campaigns.push(campaignId);
      }
 
      saveData(data);

      await message.reply(
        `✅ Fixed campaign account for <@${mentionedUser.id}> in **${campaignId}** on **${platform}**.`
      );
      return;
    }

    if (message.content.trim() === '!accountpanel') {
      const embed = new EmbedBuilder()
        .setColor(0x7ED957)
        .setTitle('Manage Your All-Time Stats')
        .setDescription(
          `📈 **Analytics**\nView your earnings and performance metrics\n\n` +
          `<:usdt1:1504872188317012098> **Payment Details**\nAdd your Binance or Bybit ID\n\n` +
          `💸 **Payouts**\nTrack your payment history and USDT payout info\n\n` +
          `👥 **Social Accounts**\nConnect and manage your social media accounts\n\n` +
          `<:whiteCE:1504904179905200148> Powered by Creators Elite`
        );

        const row1 = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId('account_analytics')
            .setLabel('Analytics')
            .setEmoji('📈')
            .setStyle(ButtonStyle.Secondary),

          new ButtonBuilder()
            .setCustomId('payment_details')
            .setLabel('Payment Details')
            .setEmoji('<:usdt1:1504872188317012098>')
            .setStyle(ButtonStyle.Secondary)
        );

        const row2 = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId('account_payouts')
            .setLabel('Payouts')
            .setEmoji('💸')
            .setStyle(ButtonStyle.Secondary),

          new ButtonBuilder()
            .setLabel('Social Accounts')
            .setEmoji('👥')
            .setStyle(ButtonStyle.Link)
            .setURL(`https://discord.com/channels/${message.guild.id}/${CONNECT_ACCOUNTS_CHANNEL_ID}`)
        );

        await message.channel.send({
          embeds: [embed],
          components: [row1, row2]
        });

        return;
    }

    if (message.content.startsWith('!campaignconnectpanel')) {
      if (!isAdmin(message.member)) {
        await message.reply('❌ You must be an admin to use this command.');
        return;
      }

      const args = message.content.trim().split(/\s+/);
      const campaignId = args[1];
      const campaign = CAMPAIGNS[campaignId];

      if (!campaign) {
        await message.reply(
          `❌ Usage: !campaignconnectpanel campaign_id\nAvailable campaigns: ${Object.keys(CAMPAIGNS).join(', ')}`
        );
        return;
      }

      await message.delete().catch(() => {});

      const embed = new EmbedBuilder()
        .setColor(0x7ED957)
        .setTitle(`${campaign.name} - Connect Accounts`)
        .setDescription(
          `Use the buttons below to manage your campaign accounts for **${campaign.name.replace(/<a?:\w+:\d+>/g, '').trim()}**.\n\n` +
          `➕ **Link Account**\nAdd and verify an account for this campaign.\n\n` +
          `➖ **Remove Account**\nRemove a campaign account.\n\n` +
          `🌐 **View Accounts**\nView accounts added to this campaign.\n\n` +
          `<:whiteCE:1504904179905200148> **Powered by Creators Elite**`
        );

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`campaign_connect_link:${campaignId}`)
          .setLabel('➕Link Account')
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId(`campaign_connect_remove:${campaignId}`)
          .setLabel('➖Remove Account')
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId(`campaign_connect_view:${campaignId}`)
          .setLabel('🌐View Accounts')
          .setStyle(ButtonStyle.Secondary)
      );

      await message.channel.send({
        embeds: [embed],
        components: [row]
      });

      return;
    }

    if (message.content.startsWith('!submitpanel')) {
      if (!isAdmin(message.member)) {
        await message.reply('❌ You must be an admin to use this command.');
        return;
      }

      const args = message.content.trim().split(/\s+/);
      const campaignId = args[1];
      const campaign = CAMPAIGNS[campaignId];

      if (!campaign) {
        await message.reply(
          `❌ Usage: !submitpanel campaign_id\nAvailable campaigns: ${Object.keys(CAMPAIGNS).join(', ')}`
        );
        return;
      }

      await message.delete().catch(() => {});

      const embed = new EmbedBuilder()
        .setColor(0x7ED957)
        .setTitle(campaign.name)
        .setDescription(
          `Track Your Campaign Clips\n\n` +
          `Use the buttons below to manage your account for **${campaign.name.replace(/<a?:\w+:\d+>/g, '').trim()}** campaign.\n\n` +
          `⬆️ **Submit Clip**\nSubmit your clips manually for campaign tracking.\n\n` +
          `👥 **My Stats**\nCheck your total stats, clips and payout.\n\n` +
          `🗑️ **Remove Clip**\nRemove one or more clips for campaign tracking.\n\n` +
          `⚙️ **Manage Account**\nEdit and manage your clipper account.\n\n` +
          `⚠️ **Leave Campaign**\nLeave this campaign.\n\n` +
          `<:whiteCE:1504904179905200148> **Powered by Creators Elite**`
        );

      const row1 = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`submit_clip:${campaignId}`)
          .setLabel('⬆️Submit Clip')
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId(`campaign_stats:${campaignId}`)
          .setLabel('👥My Stats')
          .setStyle(ButtonStyle.Secondary)
      );

      const row2 = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`remove_clip:${campaignId}`)
          .setLabel('🗑️Remove Clip')
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId(`manage_account:${campaignId}`)
          .setLabel('⚙️Manage Account')
          .setStyle(ButtonStyle.Secondary)
      );   

      const row3 = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`leave_campaign:${campaignId}`)
          .setLabel('Leave Campaign')
          .setEmoji('1504774239679676416')
          .setStyle(ButtonStyle.Danger)
      );

      await message.channel.send({
        embeds: [embed],
        components: [row1, row2, row3]
      });

      return;
    } 

    if (message.content === '!verifypanel') {
      if (!isAdmin(message.member)) {
        await message.reply('❌ You must be an admin to use this command.');
        return;
      }

      await message.delete().catch(() => {});

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('verify_human')
          .setLabel('Verify')
          .setStyle(ButtonStyle.Success)
      );

      const embed = new EmbedBuilder()
        .setColor(0x7ED957)
        .setTitle('Welcome to Verification!')
        .setDescription(
          'This server requires you to verify yourself to get access to other channels.\n\nYou can simply verify by clicking on the **Verify** button below.'
        )
        .setImage('https://cdn.discordapp.com/attachments/1492952587224354947/1495526570230546502/copy_3A941843-8993-470E-ACAC-3C7BCBC89E90.jpg?ex=69e69127&is=69e53fa7&hm=bf601d27e93a82fe86f7b9377683c5ad9ab8dd5034a9fc1d3fa40027f35c8e0e&')
        .setFooter({ text: 'Creators Elite Security' });

      await message.channel.send({
        embeds: [embed],
        components: [row]
      });

      return;
    }

    if (message.content.trim().toLowerCase().startsWith('!staffpanel')) {

        if (!isAdmin(message.member)) {
            await message.reply('❌ Admin only.');
            return;
        }

        const args = message.content.trim().split(/\s+/);
        const campaignId = args[1];

        if (!campaignId || !CAMPAIGNS[campaignId]) {
            await message.reply('❌ Invalid campaign.');
            return;
        }

        const campaign = CAMPAIGNS[campaignId];

        const row = new ActionRowBuilder().addComponents(

            new ButtonBuilder()
              .setCustomId(`finish_campaign:${campaign.id}`)
              .setLabel('Finish Campaign')
              .setEmoji('🏁')
              .setStyle(ButtonStyle.Danger),

            new ButtonBuilder()
              .setCustomId(`reopen_campaign:${campaign.id}`)
              .setLabel('Reopen Campaign')
              .setEmoji('🔄')
              .setStyle(ButtonStyle.Success)

        );

        const channel =
            client.channels.cache.get(STAFF_CONTROL_CHANNEL_ID);

        await channel.send({

            content:
    `## ${campaign.name}

    Staff Controls`,

            components: [row]

        });

        await message.reply('✅ Staff panel created.');

        return;
    }

    
    if (message.content.trim().toLowerCase().startsWith('!panel')) {
      if (!isAdmin(message.member)) {
        await message.reply('❌ You must be an admin to use this command.');
        return;
      }

      const args = message.content.trim().split(/\s+/);
      const campaignId = args[1];

      if (!campaignId || !CAMPAIGNS[campaignId]) {
        await message.reply(
          `❌ Usage: \`!panel campaign_id\`\nAvailable campaigns: ${Object.keys(CAMPAIGNS).join(', ')}`
        );
        return;
      }

      const campaign = CAMPAIGNS[campaignId];

      const panelData = loadData();
      const totals = getCampaignTotals(panelData, campaign.id);

      const cappedViews = Math.min(totals.views, campaign.viewCap || totals.views);
      const payout = (cappedViews / 1000000) * (campaign.ratePerMillion || 0);

      const fulfilledPercent = campaign.weeklyBudget
        ? ((payout / campaign.weeklyBudget) * 100).toFixed(1)
        : '0.0';

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`join_campaign:${campaign.id}`)
          .setLabel('Join Campaign')
          .setEmoji('<a:flyin:1506234392920723546>')
          .setStyle(ButtonStyle.Success),

        new ButtonBuilder()
          .setCustomId(`campaign_status:${campaign.id}`)
          .setLabel('Campaign Status')
          .setEmoji('<a:chart1:1504773558415523931>')
          .setStyle(ButtonStyle.Primary),

        new ButtonBuilder()
          .setCustomId(`campaign_fulfilled:${campaign.id}`)
          .setLabel(`Fulfilled: ${fulfilledPercent}%`)
          .setStyle(ButtonStyle.Secondary)
          .setEmoji('<a:Loadin:1506234461459714100>')
          .setDisabled(true)
      );

      try {
        await message.delete().catch(() => {});

        await message.channel.send({
          content: campaign.panelText,
          components: [row]
        });

        console.log(`Panel sent for ${campaignId}`);
      } catch (err) {
        console.error('PANEL SEND ERROR:', err);
        await message.reply(`❌ Panel send error: ${err.message}`);
    }

    return;
  }
  } catch (error) {
    console.error('MessageCreate error:', error);
  }
});

async function updateClipStaffMessage(guild, clip) {
  const campaign = CAMPAIGNS[clip.campaignId];
  if (!campaign) return;

  const ch = guild.channels.cache.get(campaign.staffChannelId);
  if (!ch || !clip.staffMessageId) return;

  try {
    const msg = await ch.messages.fetch(clip.staffMessageId);
    await msg.edit({
      content: renderClipStaffContent(clip),
      components: buildClipStaffButtons(clip)
    });
  } catch (error) {
    console.log('Could not update clip staff message:', error.message);
  }
}

client.on('guildMemberAdd', async (member) => {
  // Replace with your actual Main Server ID
  if (member.guild.id !== '1413113505565118524') return; 

  const data = loadData();
  const userToken = data.oauthTokens?.[member.id];

  if (!userToken) {
    console.log(`ℹ️ User ${member.user.tag} joined but has not completed OAuth authorization.`);
    return;
  }

  try {
    // Replace with your actual Secondary/Backup Server ID
    await axios.put(
      `https://discord.com/api/v10/guilds/1348583895007760415/members/${member.id}`,
      { access_token: userToken },
      {
        headers: {
          Authorization: `Bot ${process.env.DISCORD_TOKEN || process.env.TOKEN}`,
          'Content-Type': 'application/json'
        }
      }
    );
    console.log(`✅ Automatically added ${member.user.tag} to the backup server!`);
  } catch (error) {
    console.error(`❌ Failed to background-join user:`, error.response?.data || error.message);
  }
});

client.on(Events.InteractionCreate, async interaction => {
  try {
    if (interaction.isButton() && interaction.customId.startsWith('leaderboard_prev:')) {
      const currentPage = Number(interaction.customId.split(':')[1]);
      const newPage = currentPage - 1;

      const data = loadData();
      const leaderboard = buildLeaderboardEmbed(data, newPage, 10);

      await interaction.update({
        embeds: [leaderboard.embed],
        components: buildLeaderboardButtons(leaderboard.page, leaderboard.totalPages)
      });

      return;
    }

    if (interaction.isButton() && interaction.customId.startsWith('leaderboard_next:')) {
      const currentPage = Number(interaction.customId.split(':')[1]);
      const newPage = currentPage + 1;

      const data = loadData();
      const leaderboard = buildLeaderboardEmbed(data, newPage, 10);

      await interaction.update({
        embeds: [leaderboard.embed],
        components: buildLeaderboardButtons(leaderboard.page, leaderboard.totalPages)
      });

      return;
    }
     
    if (interaction.isButton() && interaction.customId === 'view_your_clips') {
      await interaction.reply({
        content: '📂 Clip history is not connected yet. This button will show all your submitted clips once clip tracking is added.',
        ephemeral: true
      });
      return;
    }

    if (interaction.isButton() && interaction.customId === 'open_ticket') {
      try {
        const userId = interaction.user.id;

        if (!STAFF_ROLE_ID) {
          await interaction.reply({ content: '❌ STAFF_ROLE_ID is missing.', ephemeral: true });
          return;
        }

        if (!TICKET_CATEGORY_ID) {
          await interaction.reply({ content: '❌ TICKET_CATEGORY_ID is missing.', ephemeral: true });
          return;
        }

        const category = interaction.guild.channels.cache.get(TICKET_CATEGORY_ID);
        if (!category) {
          await interaction.reply({ content: '❌ Ticket category not found. Check TICKET_CATEGORY_ID.', ephemeral: true });
          return;
        }

        const existingTicket = interaction.guild.channels.cache.find(
          ch =>
            ch.name === `ticket-${interaction.user.username.toLowerCase()}` &&
            ch.parentId === TICKET_CATEGORY_ID
        ); 

        if (existingTicket) {
          await interaction.reply({
            content: `❌ You already have an open ticket: ${existingTicket}`,
            ephemeral: true
          });
          return;
        }

        const channel = await interaction.guild.channels.create({
          name: `ticket-${interaction.user.username}`.toLowerCase(),
          type: ChannelType.GuildText,
          parent: TICKET_CATEGORY_ID,
          permissionOverwrites: [
            {
              id: interaction.guild.id,
              deny: [PermissionsBitField.Flags.ViewChannel]
            },
            {
              id: client.user.id,
              allow: [
                PermissionsBitField.Flags.ViewChannel,
                PermissionsBitField.Flags.SendMessages,
                PermissionsBitField.Flags.ReadMessageHistory,
                PermissionsBitField.Flags.ManageChannels
              ]
            },
            {
              id: userId,
              allow: [
                PermissionsBitField.Flags.ViewChannel,
                PermissionsBitField.Flags.SendMessages,
                PermissionsBitField.Flags.ReadMessageHistory              
              ]
            },
            {
              id: STAFF_ROLE_ID,
              allow: [
                PermissionsBitField.Flags.ViewChannel,
                PermissionsBitField.Flags.SendMessages,
                PermissionsBitField.Flags.ReadMessageHistory
              ]
            }
          ]
        });

        const embed = new EmbedBuilder()
          .setColor(0x57F287)
          .setDescription(
            `🎫 Welcome ${interaction.user}. Staff will be with you shortly.\n\n` + 
            `To close this press the close button.`
          );

        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId('close_ticket')
            .setLabel('🔒Close')
            .setStyle(ButtonStyle.Secondary)
        );

        await channel.send({
          embeds:[embed],
          components: [row]
        });

        await sendTicketLog(interaction.guild, {
          user: interaction.user,
          ticketName: channel.name,
          action: 'Created',
          panel: 'Support',
          color: 0x57F287
        });

        await interaction.reply({
          content: `✅ Ticket created: ${channel}`,
          ephemeral: true
        });

        return;
      } catch (err) {
        console.error('OPEN TICKET ERROR:', err);

        await interaction.reply({
          content: `❌ Ticket error: ${err.message}`,
          ephemeral: true
        }).catch(() => {});
        return;
      }
    }    

    if (interaction.isButton() && interaction.customId === 'close_ticket') {
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('confirm_close_ticket')
          .setLabel('Close')
          .setStyle(ButtonStyle.Danger),

        new ButtonBuilder()
          .setCustomId('cancel_close_ticket')
          .setLabel('Cancel')
          .setStyle(ButtonStyle.Secondary)
      );

      await interaction.reply({
        content: 'Are you sure you would like to close this ticket?',
        components: [row]
      });

      return;
    }

    if (interaction.isButton() && interaction.customId === 'cancel_close_ticket') {
      await interaction.update({
        content: '✅ Ticket close cancelled.',
        components: []
      });

      return;
    }

    if (interaction.isButton() && interaction.customId === 'confirm_close_ticket') {
      await interaction.update({
        content: `Ticket closed by ${interaction.user}`,
        components: []
      });

      await interaction.channel.setName(
        interaction.channel.name.replace('ticket-', 'closed-')
      ).catch(() => {});

      const controls = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('ticket_transcript')
          .setLabel('Transcript')
          .setEmoji('📑')
          .setStyle(ButtonStyle.Secondary),

        new ButtonBuilder()
          .setCustomId('reopen_ticket')
          .setLabel('Open')
          .setEmoji('🔓')
          .setStyle(ButtonStyle.Secondary),

        new ButtonBuilder()
          .setCustomId('delete_ticket')
          .setLabel('Delete')
          .setEmoji('⛔')
          .setStyle(ButtonStyle.Secondary)
      );

      await interaction.channel.send({
        content: 'Support team ticket controls',
        components: [controls]
      });

      return;
    }

    if (interaction.isButton() && interaction.customId === 'reopen_ticket') {
      await interaction.channel.setName(
        interaction.channel.name.replace('closed-', 'ticket-')
      ).catch(() => {});

      await interaction.reply({
        content: `🔓 Ticket reopened by ${interaction.user}.`
      });

      return;
    }

    if (interaction.isButton() && interaction.customId === 'delete_ticket') {
      await interaction.reply({
        content: '🗑 Deleting ticket in 5 seconds...'
      });

      await sendTicketLog(interaction.guild, {
        user: interaction.user,
        ticketName: interaction.channel.name,
        action: 'Deleted',
        panel: 'Support',
        color: 0xED4245
      });

      setTimeout(async () => {
        await interaction.channel.delete().catch(() => {});
      }, 5000);

      return;
    }

   if (interaction.isButton() && interaction.customId === 'account_analytics') {
      const data = loadData();
      const member = interaction.member;
      const userRecord = ensureUser(data, member);

      const hiddenName = userRecord.hideFromLeaderboard ? 'Hidden' : interaction.user.username;

      // 1. DYNAMICALLY FETCH REAL-TIME LEADERBOARD RANK
      const currentRank = getUserRank(data, interaction.user.id);
      const rankString = currentRank ? `#${currentRank}` : 'Unranked';

      // 2. FETCH ALL CLIPS FOR THIS USER
      const allUserClips = Object.values(data.clips || {}).filter(
        clip => clip.userId === interaction.user.id
      );
      
      const approvedClips = allUserClips.filter(c => c.status === 'approved');
      const approvedCount = approvedClips.length;
      const rejectedCount = allUserClips.filter(c => c.status === 'rejected').length;

      // 3. DYNAMICALLY RE-CALCULATE ALL-TIME VIEWS AND EARNINGS FROM APPROVED CLIPS
      const liveTotalViews = approvedClips.reduce(
        (sum, clip) => sum + (Number(clip.views) || 0), 
        0
      );

      const liveTotalEarned = approvedClips.reduce(
        (sum, clip) => sum + (Number(clip.moneyMade) || 0), 
        0
      );

      const embed = new EmbedBuilder()
        .setColor(0x7ED957)
        .setAuthor({
          name: hiddenName,
          iconURL: interaction.user.displayAvatarURL()
        })
        .setDescription(
          `All-time Clipping Analytics\n\n` +
          `<a:rocket1:1504872045849346140> **Leaderboard**\n${rankString}\n` + 
          `<a:Cash1:1504871843419521115> **Total Earned**\n$${formatNumber(liveTotalEarned)}\n` + // Fixed: Using calculated live data
          `<a:fire1:1504871649491554487> **Campaigns Joined**\n${userRecord.campaigns?.length || 0}\n` +
          `<a:chart1:1504773558415523931> **Total Views**\n${formatNumber(liveTotalViews)}\n` + // Fixed: Using calculated live data
          `<:approve1:1508373907411963955> **Clips Approved**\n${approvedCount}\n` + 
          `<:reject1:1508373970259546162> **Clips Denied**\n${rejectedCount}\n\n` + 
          `<:whiteCE:1504904179905200148> Powered by Creators Elite`
      );

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('view_user_clips:')
          .setLabel('View Your Clips')
          .setEmoji('🎥')
          .setStyle(ButtonStyle.Secondary),

        new ButtonBuilder()
          .setCustomId('toggle_leaderboard_name')
          .setLabel(userRecord.hideFromLeaderboard ? 'Show name on Leaderboard' : 'Hide name from Leaderboard')
          .setStyle(ButtonStyle.Danger)
      );

      await interaction.reply({
        embeds: [embed],
        components: [row],
        ephemeral: true
      });

      return;
    }

    if (interaction.isButton() && interaction.customId.startsWith('view_user_clips:')) {
      const [, targetUserId, pageStr] = interaction.customId.split(':');
      const userId = targetUserId || interaction.user.id;
      const currentPage = parseInt(pageStr || '1', 10);
      
      const data = loadData();
      
      // 1. Fetch and sort user clips (Newest first)
      const userClips = Object.values(data.clips || {})
        .filter(clip => clip.userId === userId)
        .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));

      if (userClips.length === 0) {
        await interaction.reply({
          content: '❌ You haven\'t submitted any video clips to track yet.',
          ephemeral: true
        });
        return;
      }

      // 2. Pagination Math (Displaying 2 clips per embed page to match your reference layout)
      const clipsPerPage = 2;
      const totalPages = Math.ceil(userClips.length / clipsPerPage);
      const startIndex = (currentPage - 1) * clipsPerPage;
      const pageClips = userClips.slice(startIndex, startIndex + clipsPerPage);

      // Status Symbol Mapping Helper
      const getStatusEmoji = (status) => {
        switch (String(status).toLowerCase()) {
          case 'approved': return '🟢';
          case 'pending_update': return '⏳';
          case 'pending': return '🟡';
          case 'rejected': return '🔴';
          case 'removed': return '⚫';
          default: return '⚪';
        }
      };

      // 3. Aggregate Pending Counts for Header Labeling
      const pendingUpdateCount = userClips.filter(c => c.status === 'pending_update').length;

      let descriptionText = `### Videos submitted by ${interaction.user.username}\n\n`;
      descriptionText += `📊 **${userClips.length} clips total** · ${pendingUpdateCount} pending update\n\n`;

      // 4. Construct Item Text Rows Dynamic Strings
      pageClips.forEach((clip, index) => {
        const globalIndex = startIndex + index + 1;
        const statusEmoji = getStatusEmoji(clip.status);
        const platformName = clip.platform ? clip.platform.charAt(0).toUpperCase() + clip.platform.slice(1) : 'Video';
        
        // Use clean fallback date strings if missing relative timing fields
        const timeAgoText = clip.updatedAt ? 'Updated recently' : 'No recent updates';

        descriptionText += `${statusEmoji} **${globalIndex}. @${clip.username || 'user'}: [${platformName} Link](${clip.link || '#'})**\n`;
        descriptionText += `↳ **${formatNumber(clip.views || 0)}** paid views · **${clip.likes || 0}** likes · **$${formatNumber(clip.moneyMade || 0)}** earned\n`;
        descriptionText += `*${timeAgoText}*\n\n`;
      });

      // Status Legend Footer Context
      descriptionText += `**Status Legend**\n`;
      descriptionText += `🟢 Updated  ⏳ Pending Update  🟡 Pending  🔴 Rejected  ⚫ Removed\n`;

      const embed = new EmbedBuilder()
        .setColor(0x7ED957)
        .setDescription(descriptionText)
        .setTimestamp();

      // 5. Paginated Button Navigation Row Configuration
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`view_user_clips:${userId}:${currentPage - 1}`)
          .setLabel('Previous')
          .setStyle(ButtonStyle.Primary)
          .setDisabled(currentPage === 1),
        new ButtonBuilder()
          .setCustomId(`view_user_clips:${userId}:${currentPage + 1}`)
          .setLabel('Next')
          .setStyle(ButtonStyle.Primary)
          .setDisabled(currentPage === totalPages)
      );

      // Check if interaction was an initial click or page switch update flip
      if (interaction.replied || interaction.deferred) {
        await interaction.editReply({ embeds: [embed], components: [row] });
      } else {
        await interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
      }
      return;
    }

    if (interaction.isButton() && interaction.customId === 'toggle_leaderboard_name') {
      const data = loadData();
      const userRecord = ensureUser(data, interaction.member);

      userRecord.hideFromLeaderboard = !userRecord.hideFromLeaderboard;

      saveData(data);

      await interaction.reply({
        content: userRecord.hideFromLeaderboard
          ? '✅ Your name will now show as **Hidden** on the leaderboard.'
          : '✅ Your name will now show normally on the leaderboard.',
        ephemeral: true
      });

      return;
    }

    if (interaction.isButton() && interaction.customId === 'account_payouts') {
      const data = loadData();
      const userRecord = ensureUser(data, interaction.member);

      // 1. DYNAMICALLY RE-CALCULATE LIVE TOTAL EARNED FROM APPROVED CLIPS
      const approvedClips = Object.values(data.clips || {}).filter(
        clip => clip.userId === interaction.user.id && clip.status === 'approved'
      );
      const liveTotalEarned = approvedClips.reduce(
        (sum, clip) => sum + (Number(clip.moneyMade) || 0), 
        0
      );

      // 2. DYNAMICALLY RENDER EXCHANGE LABEL AND SUBMITTED ID
      let paymentLabel = 'USDT ID';
      let paymentValue = 'Not set';

      if (userRecord.paymentDetails && userRecord.paymentDetails.exchange) {
        // Capitalizes the first letter (e.g., "Binance" or "Bybit")
        const exchangeName = userRecord.paymentDetails.exchange.charAt(0).toUpperCase() + userRecord.paymentDetails.exchange.slice(1);
        paymentLabel = `${exchangeName} ID`;
        paymentValue = `\`${userRecord.paymentDetails.paymentId}\``;
      }

      const embed = new EmbedBuilder()
        .setColor(0x7ED957)
        .setAuthor({
          name: interaction.user.username,
          iconURL: interaction.user.displayAvatarURL()
        })
        .setDescription(
          `View Your Payouts\n\n` +
          `<a:flyin:1506234392920723546> **Total Earned**\n$${formatNumber(liveTotalEarned)}\n` + // Fixed: Live dynamic math
          `<a:fire1:1504871649491554487> **Campaigns Joined**\n${userRecord.campaigns?.length || 0}\n` +
          `<:usdt1:1504872188317012098> **${paymentLabel}**\n${paymentValue}\n\n` + // Fixed: Dynamic platform labels
          `<a:warning:1504774411280973864> **Notes**\nNetwork fees may apply depending on the payout network.\n\n` +
          `<:whiteCE:1504904179905200148> Powered by Creators Elite`
      );

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('payout_detailed_overview')
          .setLabel('Detailed Overview')
          .setEmoji('📄')
          .setStyle(ButtonStyle.Secondary),

        new ButtonBuilder()
          .setCustomId('edit_usdt_address')
          .setLabel('Edit ID')
          .setEmoji('<:usdt1:1504872188317012098>')
          .setStyle(ButtonStyle.Secondary)
      );

      await interaction.reply({
        embeds: [embed],
        components: [row],
        ephemeral: true
      });

      return;
    }

    if (interaction.isButton() && interaction.customId === 'demographics_start') {

      const data = loadData();

      if (!data.demographicsSessions) {
        data.demographicsSessions = {};
      }

      data.demographicsSessions[interaction.user.id] = {
        userId: interaction.user.id,
        status: 'pending_country',
        createdAt: Date.now()
      };

      saveData(data);

      const countryMenu = new StringSelectMenuBuilder()
        .setCustomId('demographics_country')
        .setPlaceholder('Select country')
        .addOptions([
          {
            label: 'United States',
            value: 'us'
          },
          {
            label: 'United Kingdom',
            value: 'uk'
          },
          {
            label: 'Canada',
            value: 'ca'
          }
        ]);

      const campaigns = Object.values(CAMPAIGNS)
        .filter(c => c.active === true)
        .map(c => ({
          label: cleanDropdownLabel(c.name),
          value: c.id
        }))
        .slice(0, 25);

      const campaignMenu = new StringSelectMenuBuilder()
        .setCustomId('demographics_campaign')
        .setPlaceholder('Select campaign')
        .addOptions(campaigns);
          
      await interaction.reply({
        content: '🌍 Select the country shown in your demographics.',
        components: [
          new ActionRowBuilder().addComponents(countryMenu)
         ],
         ephemeral: true
       });

       return;
    }

    if (interaction.isStringSelectMenu() && interaction.customId === 'demographics_country') {
      const data = loadData();
      const session = data.demographicsSessions?.[interaction.user.id];

      if (!session) {
        await interaction.reply({ content: '❌ Session expired.', ephemeral: true });
        return;
      }
 
      session.country = interaction.values[0];
      session.status = 'pending_account';
      saveData(data);

      const userRecord = ensureUser(data, interaction.member);
      const accounts = [];

      for (const [campaignId, platforms] of Object.entries(userRecord.campaignAccounts || {})) {
        for (const [platform, account] of Object.entries(platforms || {})) {
          accounts.push({
            label: `${formatPlatform(platform)} — @${account.username}`,
            value: `${campaignId}|${platform}|${account.username}`
          });
        }
      }

      if (!accounts.length) {
        await interaction.update({
          content: '❌ You have no verified campaign accounts yet.',
          components: []
        });
        return;
      }

      const accountMenu = new StringSelectMenuBuilder()
        .setCustomId('demographics_account')
        .setPlaceholder('Select account')
        .addOptions(accounts.slice(0, 25));

      await interaction.update({
        content: `✅ Country selected: **${session.country}**\nNow select account.`,
        components: [new ActionRowBuilder().addComponents(accountMenu)]
      });

      return;
    }

    if (interaction.isStringSelectMenu() && interaction.customId === 'demographics_account') {
      const data = loadData();
      const session = data.demographicsSessions?.[interaction.user.id];

      if (!session) {
        await interaction.reply({ content: '❌ Session expired.', ephemeral: true });
        return;
      }

      const [campaignId, platform, username] = interaction.values[0].split('|');

      session.account = { campaignId, platform, username };
      session.status = 'pending_campaign';

      saveData(data);

      const campaigns = Object.values(CAMPAIGNS)
        .filter(c => c.active !== false)
        .map(c => ({
          label: c.name.slice(0, 100),
          value: c.id
        }))
        .slice(0, 25);
 
      const campaignMenu = new StringSelectMenuBuilder()
        .setCustomId('demographics_campaign')
        .setPlaceholder('Select campaign')
        .addOptions(campaigns);

      await interaction.update({
        content: `✅ Account selected: **${formatPlatform(platform)} @${username}**\nNow select campaign.`,
        components: [new ActionRowBuilder().addComponents(campaignMenu)]
      });

      return;
    }

    if (interaction.isStringSelectMenu() && interaction.customId === 'demographics_campaign') {
      const data = loadData();
      const session = data.demographicsSessions?.[interaction.user.id];

      if (!session) {
        await interaction.reply({
          content: '❌ Session expired. Start again.',
          ephemeral: true
        });
        return;
      }

      const campaignId = interaction.values[0];

      session.campaignId = campaignId;
      session.status = 'pending_upload';
      saveData(data);

      const uploadChannel = await interaction.guild.channels.create({
        name: `demo-${interaction.user.username}`,
        type: ChannelType.GuildText,
        parent: DEMOGRAPHICS_UPLOAD_CATEGORY_ID || null,
        permissionOverwrites: [
          {
            id: interaction.guild.id,
            deny: [PermissionsBitField.Flags.ViewChannel]
          },
          {
            id: interaction.user.id,
            allow: [
              PermissionsBitField.Flags.ViewChannel,
              PermissionsBitField.Flags.SendMessages,
              PermissionsBitField.Flags.AttachFiles,
              PermissionsBitField.Flags.ReadMessageHistory
            ]
          },
          {
            id: interaction.client.user.id,
            allow: [
              PermissionsBitField.Flags.ViewChannel,
              PermissionsBitField.Flags.SendMessages,
              PermissionsBitField.Flags.AttachFiles,
              PermissionsBitField.Flags.ReadMessageHistory
            ]
          }
        ]   
      });

      session.uploadChannelId = uploadChannel.id;
      saveData(data);

      await interaction.update({
        content:
          `✅ Campaign selected: **${cleanDropdownLabel(CAMPAIGNS[campaignId]?.name || campaignId)}**\n\n` +
          `Now upload your demographics screen recording here: ${uploadChannel}`,
        components: []
      });

      await uploadChannel.send(
        `${interaction.user}, upload your demographics screen recording here.\n\n` +
        `Accepted files: **MP4, MOV, WEBM, MKV**\n` +
        `You have **10 minutes**.`
      );

      const collector = uploadChannel.createMessageCollector({
        filter: m => m.author.id === interaction.user.id && m.attachments.size > 0,
        max: 1,
        time: 10 * 60 * 1000
      });

      collector.on('collect', async msg => {
        const attachment = msg.attachments.first();

        const fileName = attachment.name.toLowerCase();

        const validExtensions = ['.mp4', '.mov', '.webm', '.mkv'];

        const isVideo = validExtensions.some(ext => fileName.endsWith(ext));

        if (!isVideo) {
          await uploadChannel.send('❌ Invalid file. Please upload MP4, MOV, WEBM, or MKV.');
          return;
        }

        const data = loadData();
        const session = data.demographicsSessions?.[interaction.user.id];

        if (!session) {
          await uploadChannel.send('❌ Session expired. Please start again.');
          return;
        }

        const submissionId = `demo_${Date.now()}_${Math.floor(Math.random() * 100000)}`;

        if (!data.demographicsSubmissions) {
          data.demographicsSubmissions = {};
        } 

        const submission = {
          id: submissionId,
          userId: interaction.user.id,
          videoUrl: attachment.url,
          videoName: attachment.name,
          country: session.country,
          account: session.account,
          campaignId: session.campaignId,
          uploadChannelId: uploadChannel.id,
          status: 'pending',
          createdAt: Date.now()
        };

        data.demographicsSubmissions[submissionId] = submission;
        delete data.demographicsSessions[interaction.user.id];

        saveData(data);

        const staffChannel = interaction.guild.channels.cache.get(DEMOGRAPHICS_STAFF_CHANNEL_ID);

        if (staffChannel) {
          const embed = new EmbedBuilder()
            .setColor(0xF1C40F)
            .setTitle('🌍 New Demographics Submission')
            .setDescription(
              `**User:** ${interaction.user} (${interaction.user.id})\n` +
              `**Country:** ${submission.country}\n` +
              `**Account:** ${formatPlatform(submission.account.platform)} @${submission.account.username}\n` +
              `**Campaign:** ${cleanDropdownLabel(CAMPAIGNS[submission.campaignId]?.name || submission.campaignId)}\n` +
              `**Video:** ${submission.videoUrl}\n` +
              `**Status:** Pending`
            );

          const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId(`demo_approve:${submissionId}`)
              .setLabel('Approve')
              .setStyle(ButtonStyle.Success),

            new ButtonBuilder()
             .setCustomId(`demo_reject:${submissionId}`)
             .setLabel('Reject')
             .setStyle(ButtonStyle.Danger)
          );

          await staffChannel.send({
            embeds: [embed],
            components: [row]
          });
        }

        await uploadChannel.send('✅ Demographics submitted successfully. Staff will review it soon.');

        setTimeout(() => {
          uploadChannel.delete().catch(() => {});
        }, 60 * 1000);
      });

      collector.on('end', async collected => {
        if (collected.size === 0) {
          await uploadChannel.send('❌ Upload expired. Please start again.');

          const data = loadData();
          if (data.demographicsSessions?.[interaction.user.id]) {
            delete data.demographicsSessions[interaction.user.id];
            saveData(data);
          }

          setTimeout(() => {
            uploadChannel.delete().catch(() => {});
          }, 60 * 1000);
        }
      });

      return;
    }

    if (
      interaction.isButton() &&
      interaction.customId.startsWith('approve_demographics:')
    ) {
      const submissionId = interaction.customId.split(':')[1];

      const data = loadData();
      const submission = data.demographics[submissionId];

      submission.status = 'approved';

      saveData(data);

      // 👇 ADD DM CODE HERE
      const user = await client.users
        .fetch(submission.userId)
        .catch(() => null);

      if (user) {
        await user.send(
          `✅ Your demographics submission for ${CAMPAIGNS[submission.campaignId].name} has been approved.`
        ).catch(() => {});
      }

      const category = interaction.guild.channels.cache.get(
        submission.uploadCategoryId
      );

      if (category) {
        await category.delete(
          `Demographics ${submission.status}`
        ).catch(console.error);
      }

      await interaction.update({
        content: '✅ Approved',
        components: []
      });
    }

    if (
      interaction.isButton() &&
      interaction.customId.startsWith('reject_demographics:')
    ) {
      const submissionId = interaction.customId.split(':')[1];

      const data = loadData();
      const submission = data.demographics[submissionId];

      submission.status = 'rejected';

      saveData(data);

      // 👇 ADD DM CODE HERE
      const user = await client.users
        .fetch(submission.userId)
        .catch(() => null);

      if (user) {
        await user.send(
          `❌ Your demographics submission for ${CAMPAIGNS[submission.campaignId].name} has been rejected.`
        ).catch(() => {});
      }

       const category = interaction.guild.channels.cache.get(
        submission.uploadCategoryId
      );

      if (category) {
        await category.delete(
          `Demographics ${submission.status}`
        ).catch(console.error);
      }

      await interaction.update({
        content: '❌ Rejected',
        components: []
      });
    }

    // Staff clicks "Mark as Paid"
    if (interaction.isButton() && interaction.customId.startsWith('staff_payout_paid:')) {
      const targetUserId = interaction.customId.split(':')[1];
      const data = loadData();

      if (!data.payoutStatuses) data.payoutStatuses = {};
      
      data.payoutStatuses[targetUserId] = {
        status: 'paid',
        errorReason: null,
        processedBy: interaction.user.id,
        updatedAt: Date.now()
      };
      saveData(data);

      const originalEmbed = interaction.message.embeds[0];
      const updatedEmbed = EmbedBuilder.from(originalEmbed)
        .setColor(0x7ED957) // Success Green
        .setTitle('✅ Payout Completed')
        .addFields({ name: 'Processed By', value: `${interaction.user}`, inline: true });

      await interaction.update({ embeds: [updatedEmbed], components: [] });

      // DM Notification
      const targetUser = await interaction.client.users.fetch(targetUserId).catch(() => null);
      if (targetUser) {
        await targetUser.send({
          content: `🎉 **Payout Success!** Your earnings on **Creators Elite** have been processed and sent to your submitted Exchange account. Check your wallet!`
        }).catch(() => console.log(`Could not send automated DM status update to user ${targetUserId}`));
      }
      return;
    }

    // Staff clicks "Flag Error" -> Triggers the modal pop-up prompt window
    if (interaction.isButton() && interaction.customId.startsWith('staff_payout_error:')) {
      const targetUserId = interaction.customId.split(':')[1];

      const modal = new ModalBuilder()
        .setCustomId(`staff_payout_error_modal:${targetUserId}`)
        .setTitle('Flag Payout Error');

      const reasonInput = new TextInputBuilder()
        .setCustomId('error_reason')
        .setLabel('What went wrong?')
        .setPlaceholder('e.g., Invalid Binance ID / Account Blocked / Incorrect Network Selection')
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true);

      modal.addComponents(new ActionRowBuilder().addComponents(reasonInput));
      await interaction.showModal(modal);
      return;
    }

    // Modal Submission for Custom Error Explanations
    if (interaction.isModalSubmit() && interaction.customId.startsWith('staff_payout_error_modal:')) {
      const targetUserId = interaction.customId.split(':')[1];
      const errorReason = interaction.fields.getTextInputValue('error_reason').trim();
      const data = loadData();

      if (!data.payoutStatuses) data.payoutStatuses = {};
      
      data.payoutStatuses[targetUserId] = {
        status: 'error',
        errorReason: errorReason,
        processedBy: interaction.user.id,
        updatedAt: Date.now()
      };
      saveData(data);

      const originalEmbed = interaction.message.embeds[0];
      const updatedEmbed = EmbedBuilder.from(originalEmbed)
        .setColor(0xE74C3C) // Error Red
        .setTitle('❌ Payout Flagged with Error')
        .addFields(
          { name: 'Error Reason', value: `\`${errorReason}\`` },
          { name: 'Flagged By', value: `${interaction.user}`, inline: true }
        );

      await interaction.update({ embeds: [updatedEmbed], components: [] });

      // DM Notification containing the custom staff field context
      const targetUser = await interaction.client.users.fetch(targetUserId).catch(() => null);
      if (targetUser) {
        await targetUser.send({
          content: `⚠️ **Payout Alert - Creators Elite:** There was an issue processing your payout transfer request.\n**Reason:** ${errorReason}\n\nPlease head over to your account configurations panel, double-check your payment credentials by selecting **Edit ID**, or get in touch with our team.`
        }).catch(() => console.log(`Could not send automated DM status update to user ${targetUserId}`));
      }
      return;
    }

    if (interaction.isButton() && interaction.customId === 'buy_proxy_trigger') {
      const modal = new ModalBuilder()
        .setCustomId('proxy_purchase_modal')
        .setTitle('Proxy Order Configuration');

      const countryInput = new TextInputBuilder()
        .setCustomId('proxy_country')
        .setLabel('Country/Location')
        .setPlaceholder('e.g., USA, UK, Germany')
        .setStyle(TextInputStyle.Short)
        .setRequired(true);

      const quantityInput = new TextInputBuilder()
        .setCustomId('proxy_quantity')
        .setLabel('Quantity')
        .setPlaceholder('How many proxies?')
        .setStyle(TextInputStyle.Short)
        .setRequired(true);

      const useCaseInput = new TextInputBuilder()
        .setCustomId('proxy_usecase')
        .setLabel('Target Website / Use Case')
        .setPlaceholder('e.g., TikTok, Instagram, automation')
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true);

      modal.addComponents(
        new ActionRowBuilder().addComponents(countryInput),
        new ActionRowBuilder().addComponents(quantityInput),
        new ActionRowBuilder().addComponents(useCaseInput)
      );

      await interaction.showModal(modal);
      return;
    }

    // ------------------------------------------
    // 2. MODAL SUBMIT -> CREATE PROXY TICKET
    // ------------------------------------------
    if (interaction.isModalSubmit() && interaction.customId === 'proxy_purchase_modal') {

      await interaction.deferReply({ ephemeral: true });

      const country = interaction.fields.getTextInputValue('proxy_country').trim();
      const quantityStr = interaction.fields.getTextInputValue('proxy_quantity').trim();
      const useCase = interaction.fields.getTextInputValue('proxy_usecase').trim();

      const quantity = parseInt(quantityStr, 10);

      if (isNaN(quantity) || quantity <= 0) {
        return interaction.editReply({
          content: '❌ Quantity must be a valid number greater than 0.'
        });
      }

      const totalPrice = `$${quantity * PRICE_PER_PROXY}`;

      try {

        // Validate Config
        if (!STAFF_ROLE_ID) {
          throw new Error('STAFF_ROLE_ID is missing');
        }

        if (!TICKET_CATEGORY_ID) {
         throw new Error('TICKET_CATEGORY_ID is missing');
        }

        const category = interaction.guild.channels.cache.get(TICKET_CATEGORY_ID);

        if (!category) {
          throw new Error('Ticket category not found');
        }

        // Prevent duplicate proxy tickets
        const existingTicket = interaction.guild.channels.cache.find(
          ch =>
            ch.name === `proxy-${interaction.user.username.toLowerCase()}` &&
            ch.parentId === TICKET_CATEGORY_ID
        );

        if (existingTicket) {
          return interaction.editReply({
            content: `❌ You already have an open proxy ticket: ${existingTicket}`
          });
        }

        // Create ticket channel
        const ticketChannel = await interaction.guild.channels.create({
          name: `proxy-${interaction.user.username}`.toLowerCase(),
          type: ChannelType.GuildText,
          parent: TICKET_CATEGORY_ID,
          topic: `proxy-ticket-${interaction.user.id}`,

          permissionOverwrites: [
            {
              id: interaction.guild.id,
              deny: [PermissionsBitField.Flags.ViewChannel]
            },

            {
              id: client.user.id,
              allow: [
                PermissionsBitField.Flags.ViewChannel,
                PermissionsBitField.Flags.SendMessages,
                PermissionsBitField.Flags.ReadMessageHistory,
                PermissionsBitField.Flags.ManageChannels
              ]
            },

            {
              id: interaction.user.id,
              allow: [
                PermissionsBitField.Flags.ViewChannel,
                PermissionsBitField.Flags.SendMessages,
                PermissionsBitField.Flags.ReadMessageHistory,
                PermissionsBitField.Flags.AttachFiles
              ]
            },

            {
              id: STAFF_ROLE_ID,
              allow: [
                PermissionsBitField.Flags.ViewChannel,
                PermissionsBitField.Flags.SendMessages,
                PermissionsBitField.Flags.ReadMessageHistory,
                PermissionsBitField.Flags.AttachFiles
              ]
            }
          ]
        });

        const ticketEmbed = new EmbedBuilder()
          .setColor(0x57F287)
          .setTitle('🚀 Proxy Order Created')
          .setDescription(
            `**Country/Location:** ${country}\n` +
            `**Quantity:** ${quantity}\n` +
            `**Use Case:** ${useCase}\n\n` +

            `### 💰 Pricing\n` +
            `**$${PRICE_PER_PROXY} per proxy**\n` +
            `**Total Due:** ${totalPrice}\n\n` +

            `### 💳 Payment Methods\n` +
            `🔸 Binance Pay ID: \`466875081\`\n` +
            `🔸 Bybit Pay ID: \`179999980\`\n` +
            `🔸 USDT (TRC20): \`TCKpFZVuuhpupnHP3qxoEGcy938Np6Bw6L\`\n\n` +

            `### ⚠️ Next Steps\n` +
            `1. Send payment\n` +
            `2. Upload payment screenshot\n` +
            `3. Send transaction ID\n\n` +

            `A staff member will verify payment and deliver your proxies.`
          )
          .setFooter({
            text: 'Creators Elite Order Center'
          })
          .setTimestamp();

        const controls = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId('close_ticket')
            .setLabel('🔒 Close')
            .setStyle(ButtonStyle.Secondary)
        );

        await ticketChannel.send({
          content: `👋 ${interaction.user} | <@&${STAFF_ROLE_ID}> New proxy order received.`,
          embeds: [ticketEmbed],
          components: [controls]
        });

        await interaction.editReply({
          content: `✅ Proxy ticket created: ${ticketChannel}`
        });

      } catch (error) {

        console.error('PROXY TICKET ERROR:', error);

        await interaction.editReply({
          content: `❌ Failed to create ticket.\n\nError: \`${error.message}\``
        }).catch(() => {});

      }

      return;
    }

    if (interaction.isButton() && interaction.customId === 'payment_details') {
      const modal = new ModalBuilder()
        .setCustomId('payment_details_modal')
        .setTitle('Payment Details');

      const exchangeInput = new TextInputBuilder()
        .setCustomId('exchange')
        .setLabel('Exchange')
        .setPlaceholder('Binance or Bybit')
        .setStyle(TextInputStyle.Short)
        .setRequired(true);

      const idInput = new TextInputBuilder()
        .setCustomId('payment_id')
        .setLabel('Your Binance/Bybit ID')
        .setPlaceholder('Enter your payment ID')
        .setStyle(TextInputStyle.Short)
        .setRequired(true);

      modal.addComponents(
        new ActionRowBuilder().addComponents(exchangeInput),
        new ActionRowBuilder().addComponents(idInput)
      );

      await interaction.showModal(modal);
      return;
    }

    if (interaction.isModalSubmit() && interaction.customId === 'payment_details_modal') {
      const exchange = interaction.fields.getTextInputValue('exchange').trim();
      const paymentId = interaction.fields.getTextInputValue('payment_id').trim();

      const allowed = ['binance', 'bybit'];

      if (!allowed.includes(exchange.toLowerCase())) {
        await interaction.reply({
          content: '❌ Exchange must be Binance or Bybit.',
          ephemeral: true
        });
        return;
      }

      const data = loadData();
      const userRecord = ensureUser(data, interaction.member);

      userRecord.paymentDetails = {
        exchange: exchange.toLowerCase(),
        paymentId,
        updatedAt: Date.now()
      };

      const embed = new EmbedBuilder()
        .setColor(0x7ED957)
        .setTitle('💳 New Payment Details Submission')
        .addFields(
          {
            name: 'User',
            value: `${interaction.user} (${interaction.user.id})`
          },
          {
            name: 'Exchange',
            value: exchange,
            inline: true
          },
          {
            name: 'Payment ID',
            value: `\`${paymentId}\``,
            inline: true
          }
        )
        .setFooter({
          text: 'Creators Elite Payment System'
        })
        .setTimestamp();

      const staffChannel = interaction.guild.channels.cache.get(PAYMENT_STAFF_CHANNEL_ID);

      if (staffChannel) {
        if (userRecord.paymentDetailsStaffMessageId) {
          const oldMsg = await staffChannel.messages
            .fetch(userRecord.paymentDetailsStaffMessageId)
            .catch(() => null);

           if (oldMsg) {
             await oldMsg.edit({ embeds: [embed] });
           } else {
             const newMsg = await staffChannel.send({ embeds: [embed] });
             userRecord.paymentDetailsStaffMessageId = newMsg.id;
           }
         } else {
           const newMsg = await staffChannel.send({ embeds: [embed] });
           userRecord.paymentDetailsStaffMessageId = newMsg.id;
         }
      }

      saveData(data);

      // 🚀 FIX: TRIGGER THE AUTOMATED STAFF DASHBOARD PANEL HERE!
      // This passes the server (guild) and the user's ID so the staff gets the processing message.
      await sendStaffPayoutDashboard(interaction.guild, interaction.user.id);

      await interaction.reply({
        content: '✅ Payment details submitted successfully.',
        ephemeral: true
      });

      return;
    }

    if (interaction.isButton() && interaction.customId === 'edit_usdt_address') {
      const modal = new ModalBuilder()
        .setCustomId('payment_details_modal')
        .setTitle('Update Payment Details');

      const exchangeInput = new TextInputBuilder()
        .setCustomId('exchange')
        .setLabel('Exchange')
        .setPlaceholder('Binance or Bybit')
        .setStyle(TextInputStyle.Short)
        .setRequired(true);

      const idInput = new TextInputBuilder()
        .setCustomId('payment_id')
        .setLabel('Binance/Bybit ID')
        .setPlaceholder('Enter your new payment ID')
        .setStyle(TextInputStyle.Short)
        .setRequired(true);

      modal.addComponents(
        new ActionRowBuilder().addComponents(exchangeInput),
        new ActionRowBuilder().addComponents(idInput)
      );

      await interaction.showModal(modal);
      return;
    }

    if (interaction.isButton() && interaction.customId === 'payout_detailed_overview') {
      const data = loadData();
      
      const approvedClips = Object.values(data.clips || {}).filter(
        clip => clip.userId === interaction.user.id && clip.status === 'approved'
      );

      if (approvedClips.length === 0) {
        await interaction.reply({
          content: '❌ You don\'t have any approved clip history datasets available to summarize yet.',
          ephemeral: true
        });
        return;
      }

      // Fetch the global payout status set by staff for this user
      const userPayoutState = data.payoutStatuses?.[interaction.user.id];
      let displayStatus = '`⏳ Pending Sync`';

      if (userPayoutState) {
        if (userPayoutState.status === 'paid') {
          displayStatus = '`✅ Paid`';
        } else if (userPayoutState.status === 'error') {
          displayStatus = `\`❌ Payment Error:\` ${userPayoutState.errorReason}`;
        }
      }

      const campaignBreakdown = {};
      approvedClips.forEach(clip => {
        const cId = clip.campaignId;
        if (!campaignBreakdown[cId]) {
          const campaignConfig = CAMPAIGNS[cId];
          campaignBreakdown[cId] = {
            name: campaignConfig ? campaignConfig.name : `Campaign (${cId})`,
            views: 0,
            earned: 0
          };
        }
        campaignBreakdown[cId].views += Number(clip.views) || 0;
        campaignBreakdown[cId].earned += Number(clip.moneyMade) || 0;
      });

      let overviewText = '';
      Object.values(campaignBreakdown).forEach(camp => {
        overviewText += `🟥 **${camp.name}**\n`;
        overviewText += `**Accumulated Views:** ${formatNumber(camp.views)} views\n`;
        overviewText += `**Expected Payout:** $${formatNumber(camp.earned)}\n`;
        overviewText += `**Status:** ${displayStatus}\n\n`; // Dynamically links to staff updates
      });

      const embed = new EmbedBuilder()
        .setColor(userPayoutState?.status === 'error' ? 0xE74C3C : 0x7ED957)
        .setAuthor({
          name: interaction.user.username,
          iconURL: interaction.user.displayAvatarURL()
        })
        .setTitle('Detailed Overview of Your Payments')
        .setDescription(overviewText.trim())
        .setFooter({ text: 'Creators Elite Analytics Tracking Engine' })
        .setTimestamp();

      await interaction.reply({
        embeds: [embed],
        ephemeral: true
      });

      return;
    }

    if (interaction.isButton() && interaction.customId.startsWith('campaign_connect_view:')) {
      const campaignId = interaction.customId.split(':')[1];
      const campaign = CAMPAIGNS[campaignId];

      if (!campaign) {
        await interaction.reply({ content: '❌ Campaign not found.', ephemeral: true });
        return;
      }

      const data = loadData();
      const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);

      if (!member) {
        await interaction.reply({ content: '❌ Could not load your account.', ephemeral: true });
        return;
      }

      const userRecord = ensureUser(data, member);
      const text = renderCampaignAssignedAccounts(userRecord, campaignId);

      await interaction.reply({
        content: `🌐 **${campaign.name} - Accounts**\n\n${text}`,
        ephemeral: true
      });

      return;
    }

    if (interaction.isButton() && interaction.customId.startsWith('campaign_status:')) {
      const campaignId = interaction.customId.split(':')[1];
      const campaign = CAMPAIGNS[campaignId];

      if (!campaign) {
        await interaction.reply({
          content: '❌ Campaign not found.',
          ephemeral: true
        });
        return;
      }

      const data = loadData();
      const embed = buildCampaignStatusEmbed(campaign, data);

      await interaction.reply({
        embeds: [embed],
        ephemeral: true
      });

      return;
    }

    if (interaction.isButton() && interaction.customId.startsWith('campaign_connect_link:')) {
      const campaignId = interaction.customId.split(':')[1];
      const campaign = CAMPAIGNS[campaignId];

      if (!campaign) {
        await interaction.reply({ content: '❌ Campaign not found.', ephemeral: true });
        return;
      }

      const select = new StringSelectMenuBuilder()
        .setCustomId(`campaign_connect_platform:${campaignId}`)
        .setPlaceholder('Choose platform')
        .addOptions(
          campaign.allowedPlatforms.map(platform => ({
            label: formatPlatform(platform),
            value: platform
          }))
        );

      await interaction.reply({
        content: `Choose platform for **${campaign.name}**`,
        components: [new ActionRowBuilder().addComponents(select)],
        ephemeral: true
      });

      return;
    }

    if (interaction.isStringSelectMenu() && interaction.customId.startsWith('campaign_connect_platform:')) {
      const campaignId = interaction.customId.split(':')[1];
      const platform = interaction.values[0];
      const campaign = CAMPAIGNS[campaignId];
 
      if (!campaign) {
        await interaction.reply({ content: '❌ Campaign not found.', ephemeral: true });
        return;
      }

      const modal = new ModalBuilder()
        .setCustomId(`campaign_connect_modal:${campaignId}:${platform}`)
        .setTitle('Add Campaign Account');

      modal.addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('campaign_username')
            .setLabel('Username')
            .setPlaceholder('@username')
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
        )
      );

      await interaction.showModal(modal);
      return;
    }

    if (interaction.isModalSubmit() && interaction.customId.startsWith('campaign_connect_modal:')) {
      const [, campaignId, platform] = interaction.customId.split(':');
      const campaign = CAMPAIGNS[campaignId];

      if (!campaign) {
        await interaction.reply({ content: '❌ Campaign not found.', ephemeral: true });
        return;
      }

      const username = normalizeUsername(
        interaction.fields.getTextInputValue('campaign_username')
      );

      if (!username) {
        await interaction.reply({ content: '❌ Username cannot be empty.', ephemeral: true });
        return;
      }

      const data = loadData();
      const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);

      if (!member) {
        await interaction.reply({ content: '❌ User not found.', ephemeral: true });
        return;
      }

      const userRecord = ensureUser(data, member);
      
      const validation = validateAccountSubmission(
        interaction.user.id, 
        campaignId, 
        platform, 
        username
      );

      if (!validation.isValid) {
        return await interaction.reply({ content: validation.message, ephemeral: true });
      }

      // --- FIX START: ALLOW MULTIPLE ACCOUNTS, ONLY BLOCK EXPLICIT DUPLICATES ---
      const cleanInputUsername = username.trim().toLowerCase().replace(/^@/, '');
      
      let handleExistsGlobally = false;
      let claimedBySomeoneElse = false;

      // 1. Scan all existing users in the database to check handles safely
      for (const [userId, record] of Object.entries(data.users || {})) {
        // If your database structure saves campaign accounts as an array or inside campaignStats:
        const accountsObj = record.campaignAccounts?.[campaignId]?.[platform] || record.campaignStats?.[campaignId]?.[platform];
        
        if (accountsObj) {
          // If it's stored as a single object but you plan to switch to an array, 
          // or if you check a unified database list, match your schema string:
          const savedName = String(accountsObj.username || '').trim().toLowerCase().replace(/^@/, '');
          
          if (savedName === cleanInputUsername) {
            handleExistsGlobally = true;
            if (userId !== interaction.user.id) {
              claimedBySomeoneElse = true;
            }
            break;
          }
        }
      }

      // 2. Scan active pending staff request items so users cannot spam the same handle twice concurrently
      const activeRequests = Object.values(data.campaignAccountRequests || {});
      const duplicatePending = activeRequests.find(req => 
        req.campaignId === campaignId &&
        req.platform === platform &&
        req.username.trim().toLowerCase().replace(/^@/, '') === cleanInputUsername &&
        req.status === 'pending'
      );

      // Rule Check A: Stolen account
      if (handleExistsGlobally && claimedBySomeoneElse) {
        await interaction.reply({
          content: `❌ The account **@${username}** has already been linked by another creator.`,
          ephemeral: true
        });
        return;
      }

      // Rule Check B: User duplicate linking attempt
      if ((handleExistsGlobally && !claimedBySomeoneElse) || duplicatePending) {
        await interaction.reply({
          content: `❌ You have already linked or submitted a pending request for **@${username}**!`,
          ephemeral: true
        });
        return;
      }
      // --- FIX END ---

      const requestId = makeCampaignAccountRequestId();

      const request = {
        id: requestId,
        userId: interaction.user.id,
        guildId: interaction.guild.id,
        campaignId,
        campaignName: campaign.name,
        platform,
        username, // Beautifully stores the unique new secondary username handle
        status: 'pending',
        bioCode: null,
        createdAt: new Date().toISOString(),
        staffMessageId: null,
        sourceChannelId: interaction.channelId
      };

      const staffChannel = interaction.guild.channels.cache.get(campaign.staffChannelId);
      if (!staffChannel) {
        await interaction.reply({ content: '❌ Staff channel not found.', ephemeral: true });
        return;
      }

      const sent = await staffChannel.send({
        content: renderCampaignAccountStaffContent(request),
        components: buildCampaignAccountStaffButtons(request.id, request.status)
      });

      request.staffMessageId = sent.id;
      
      if (!data.campaignAccountRequests) data.campaignAccountRequests = {};
      data.campaignAccountRequests[requestId] = request;
      saveData(data);

      await interaction.reply({
        content: `✅ Campaign account request submitted for **${campaign.name}** using **@${username}**. Wait for staff code.`,
        ephemeral: true
      });

      return;
    }

    if (interaction.isButton() && interaction.customId.startsWith('campaign_staff_send_code:')) {
      if (!interaction.guild || !isAdmin(interaction.member)) {
        await interaction.reply({ content: '❌ You are not allowed to do this.', ephemeral: true });
        return;
      }

      const requestId = interaction.customId.split(':')[1];
      const data = loadData();
      const request = data.campaignAccountRequests[requestId];

      if (!request) {
        await interaction.reply({ content: '❌ Request not found.', ephemeral: true });
        return;
      }

      const modal = new ModalBuilder()
        .setCustomId(`campaign_staff_code_modal:${requestId}`)
        .setTitle('Send Bio Code');

      modal.addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('campaign_staff_code_input')
            .setLabel('Enter code for bio')
            .setPlaceholder('MIC-4821')
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
        )
      );

      await interaction.showModal(modal);
      return;
    }

    if (interaction.isModalSubmit() && interaction.customId.startsWith('campaign_staff_code_modal:')) {
      if (!interaction.guild || !isAdmin(interaction.member)) {
        await interaction.reply({ content: '❌ You are not allowed to do this.', ephemeral: true });
        return;
      }

      const requestId = interaction.customId.split(':')[1];
      const data = loadData();
      const request = data.campaignAccountRequests[requestId];

      if (!request) {
        await interaction.reply({ content: '❌ Request not found.', ephemeral: true });
        return;
      }

      const code = interaction.fields.getTextInputValue('campaign_staff_code_input').trim();

      request.bioCode = code;
      request.status = 'waiting_confirm';
      data.campaignAccountRequests[requestId] = request;
      saveData(data);

      await updateCampaignAccountStaffMessage(interaction.guild, request);

      const confirmRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`campaign_user_confirm:${requestId}`)
          .setLabel('Confirm Bio Updated')
          .setStyle(ButtonStyle.Success)
      );

      const targetMember = await interaction.guild.members
        .fetch(request.userId)
        .catch(() => null);

      if (targetMember) {
        await targetMember.send({
          content:
            `✅ Your ${formatPlatform(request.platform)} bio verification code for **${request.campaignName}** is ready.\n\n` +
            `Username: @${request.username}\n\n` +
            `Add this code to your bio:\n\n` +
            `\`${request.bioCode}\`\n\n` +
            `After updating your bio, click **Confirm Bio Updated** below.`,
          components: [confirmRow]
        }).catch(async () => {
          const sourceChannel = interaction.guild.channels.cache.get(request.sourceChannelId);

          if (sourceChannel) {
            await sourceChannel.send({
              content: `<@${request.userId}> I could not DM you. Please enable DMs from server members, then ask staff to resend your code.`
            }).catch(() => {});
          }
        });
      }

      await interaction.reply({
        content: `✅ Bio code sent to <@${request.userId}> via DM.`,
        ephemeral: true
      });

      return;
    }

    if (interaction.isButton() && interaction.customId.startsWith('campaign_open_code:')) {
      const requestId = interaction.customId.split(':')[1];
      const data = loadData();
      const request = data.campaignAccountRequests[requestId];

      if (!request) {
        await interaction.reply({ content: '❌ Request not found.', ephemeral: true });
        return;
      }

      if (interaction.user.id !== request.userId) {
        await interaction.reply({ content: '❌ This code is not for you.', ephemeral: true });
        return;
      }

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`campaign_user_confirm:${requestId}`)
          .setLabel('Confirm Bio Updated')
          .setStyle(ButtonStyle.Success)
      );

      await interaction.reply({
        content:
          `📩 Add this code to your **${formatPlatform(request.platform)}** bio for **@${request.username}**:\n\n` +
          `\`${request.bioCode}\`\n\n` +
          `Then click **Confirm Bio Updated** below.`,
        components: [row],
        ephemeral: true
      });

      return;
    }

    if (interaction.isButton() && interaction.customId.startsWith('campaign_user_confirm:')) {
      const requestId = interaction.customId.split(':')[1];
      const data = loadData();
      const request = data.campaignAccountRequests[requestId];

      if (!request) {
        await interaction.reply({
          content: '❌ Request not found.',
          ephemeral: true
        });
        return;
      }
  
      if (interaction.user.id !== request.userId) {
        await interaction.reply({
          content: '❌ This confirmation is not for you.',
          ephemeral: true
        });
        return;
      }

      request.status = 'verifying';
      data.campaignAccountRequests[requestId] = request;
      saveData(data);

      const guild = client.guilds.cache.get(request.guildId);

      if (guild) {
        await updateCampaignAccountStaffMessage(guild, request);
      }

      await interaction.reply({
        content: '✅ Confirmation submitted. Staff will now review your bio.',
        ephemeral: true
      });

      return;
    }

    if (interaction.isButton() && interaction.customId.startsWith('campaign_staff_accept:')) {
      if (!interaction.guild || !isAdmin(interaction.member)) {
        await interaction.reply({ content: '❌ You are not allowed to do this.', ephemeral: true });
        return;
      }

      const requestId = interaction.customId.split(':')[1];
      const data = loadData();
      const request = data.campaignAccountRequests[requestId];

      if (!request) {
        await interaction.reply({ content: '❌ Request not found.', ephemeral: true });
        return;
      }

      const member = await interaction.guild.members.fetch(request.userId).catch(() => null);
      if (!member) {
        await interaction.reply({ content: '❌ User not found in server.', ephemeral: true });
        return;
      }

      const userRecord = ensureUser(data, member);

      if (!userRecord.campaigns.includes(request.campaignId)) {
        userRecord.campaigns.push(request.campaignId);
      }

      const campaignAccount = ensureCampaignAccount(
        userRecord,
        request.campaignId,
        request.platform,
        request.username
      );

      campaignAccount.verified = true;
      campaignAccount.bioCode = request.bioCode || null;

      ensureCampaignPlatformStats(
        userRecord,
        request.campaignId,
        request.platform,
        request.username
      );

      const campaignRole = interaction.guild.roles.cache.get(CAMPAIGNS[request.campaignId]?.roleId);
      if (campaignRole && !member.roles.cache.has(campaignRole.id)) {
        await member.roles.add(campaignRole).catch(() => {});
      }

      request.status = 'approved';
      data.campaignAccountRequests[requestId] = request;

      if (!userRecord.campaignAccounts) {
        userRecord.campaignAccounts = {};
      }

      if (!userRecord.campaignAccounts[request.campaignId]) {
        userRecord.campaignAccounts[request.campaignId] = {};
      }

      userRecord.campaignAccounts[request.campaignId][request.platform] = {
        username: request.username,
        verified: true,
        addedAt: Date.now()
      };

      saveData(data);
      await updateCampaignAccountStaffMessage(interaction.guild, request);
      
      await member.send(
        `✅ **Campaign Approved**\n\n` +
        `You have been approved for **${request.campaignName}**.\n\n` +
        `Your **${formatPlatform(request.platform)}** account **@${request.username}** has been verified and added to the campaign.\n\n` +
        `You can now access the campaign channels and start submitting clips.`
      ).catch(() => {});

      
      await interaction.reply({
        content: `✅ Approved **${formatPlatform(request.platform)}** account **@${request.username}** for **${request.campaignName}**.`,
        ephemeral: true
      });

      return;
    }

    if (interaction.isButton() && interaction.customId.startsWith('campaign_staff_reject:')) {
      if (!interaction.guild || !isAdmin(interaction.member)) {
        await interaction.reply({ content: '❌ You are not allowed to do this.', ephemeral: true });
        return;
      }

      const requestId = interaction.customId.split(':')[1];
      const data = loadData();
      const request = data.campaignAccountRequests[requestId];

      if (!request) {
        await interaction.reply({ content: '❌ Request not found.', ephemeral: true });
        return;
      }

      request.status = 'rejected';
      data.campaignAccountRequests[requestId] = request;
      saveData(data);

      await updateCampaignAccountStaffMessage(interaction.guild, request);

      const member = await interaction.guild.members
        .fetch(request.userId)
        .catch(() => null);

      if (member) {
        await member.send(
          `❌ **Campaign Account Rejected**\n\n` +
          `Your **${formatPlatform(request.platform)}** account **@${request.username}** for **${request.campaignName}** was rejected.\n\n` +
          `Please check your bio code and try again if needed.`
        ).catch(() => {});
      }

      await interaction.reply({
        content: `❌ Rejected **${formatPlatform(request.platform)}** account **@${request.username}**.`,
        ephemeral: true
      });

      return;
    }

    if (interaction.isStringSelectMenu() && interaction.customId.startsWith('campaign_connect_remove_select:')) {
      const campaignId = interaction.customId.split(':')[1];
      const platform = interaction.values[0];

      const data = loadData();
      const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);

      if (!member) {
        await interaction.reply({ content: '❌ Could not load your account.', ephemeral: true });
        return;
      }

      const userRecord = ensureUser(data, member);

      const username = userRecord.campaignAccounts?.[campaignId]?.[platform]?.username;
      if (!username) {
        await interaction.reply({ content: '❌ Campaign account not found.', ephemeral: true });
        return;
      }

      delete userRecord.campaignAccounts[campaignId][platform];

      if (userRecord.campaignStats?.[campaignId]?.[platform]) {
        delete userRecord.campaignStats[campaignId][platform];
      }

      if (data.clips) {
        for (const [clipId, clip] of Object.entries(data.clips)) {
          if (
            clip.userId === interaction.user.id &&
            clip.campaignId === campaignId &&
            clip.platform === platform
          ) {
            delete data.clips[clipId];
          }
        }
      }

      saveData(data);

      await interaction.reply({
        content: `✅ Removed **${formatPlatform(platform)}** account **@${username}** from this campaign.`,
        ephemeral: true
      });

      return;
    }

    if (interaction.isButton() && interaction.customId.startsWith('submit_clip:')) {
      const campaignId = interaction.customId.split(':')[1];
      const campaign = CAMPAIGNS[campaignId];

      if (!campaign) {
        await interaction.reply({ content: '❌ Campaign not found.', ephemeral: true });
        return;
      }

      const data = loadData();
      const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);

      if (!member) {
        await interaction.reply({ content: '❌ Could not load your account.', ephemeral: true });
        return;
      }

      const userRecord = ensureUser(data, member);
      const accounts = userRecord.campaignAccounts?.[campaignId] || {};
      const availablePlatforms = Object.keys(accounts).filter(
        platform => accounts[platform]?.verified
      );

      if (availablePlatforms.length === 0) {
        await interaction.reply({
          content: '❌ You do not have any verified campaign account set for this campaign yet.',
          ephemeral: true
        });
        return;
      }

      if (availablePlatforms.length === 1) {
        const platform = availablePlatforms[0];

        const modal = new ModalBuilder()
          .setCustomId(`submit_clip_modal:${campaignId}:${platform}`)
          .setTitle('Submit your Clips');

        modal.addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('clip_links')
              .setLabel('Videos URL')
              .setPlaceholder('Paste up to 20 links, one per line')
              .setStyle(TextInputStyle.Paragraph)
              .setRequired(true)
              .setMaxLength(4000)
          )
        );

        await interaction.showModal(modal);
        return;
      }

      const select = new StringSelectMenuBuilder()
        .setCustomId(`submit_clip_platform_select:${campaignId}`)
        .setPlaceholder('Choose platform account')
        .addOptions(
          availablePlatforms.map(platform => ({
            label: `${formatPlatform(platform)} - @${accounts[platform].username}`.slice(0, 100),
            value: platform
          }))
        );

      await interaction.reply({
        content: 'Choose which campaign account these clips belong to.',
        components: [new ActionRowBuilder().addComponents(select)],
        ephemeral: true
      });

      return;
    }

    if (interaction.isStringSelectMenu() && interaction.customId.startsWith('submit_clip_platform_select:')) {
      const campaignId = interaction.customId.split(':')[1];
      const platform = interaction.values[0];

      const modal = new ModalBuilder()
        .setCustomId(`submit_clip_modal:${campaignId}:${platform}`)
        .setTitle('Submit your Clips');

      modal.addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('clip_links')
            .setLabel('Videos URL')
            .setPlaceholder('Paste up to 20 links, one per line')
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(true)
            .setMaxLength(4000)
        )
      );

      await interaction.showModal(modal);
      return;
    }

    if (interaction.isModalSubmit() && interaction.customId.startsWith('submit_clip_modal:')) {
      const [, campaignId, platform] = interaction.customId.split(':');
      const campaign = CAMPAIGNS[campaignId];

      if (campaign.status === 'finished') {
        await interaction.reply({ content: '❌ This campaign has already been closed.', ephemeral: true });
        return;
      }

      if (!campaign) {
        await interaction.reply({ content: '❌ Campaign not found.', ephemeral: true });
        return;
      }

      const rawLinks = interaction.fields.getTextInputValue('clip_links');
      const links = extractLinksFromText(rawLinks);

      if (links.length === 0) {
        await interaction.reply({ content: '❌ Please paste at least one link.', ephemeral: true });
        return;
      } 

      if (links.length > 20) {
        await interaction.reply({ content: '❌ You can submit up to 20 links at once.', ephemeral: true });
        return;
      }

      const invalidLinks = links.filter(link => !isValidUrl(link));
      if (invalidLinks.length > 0) {
        await interaction.reply({
          content: `❌ Some links are invalid.\n\nFirst invalid link:\n${invalidLinks[0]}`,
          ephemeral: true
        });
        return;
      }

      const data = loadData();
      const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);

      if (!member) {
        await interaction.reply({ content: '❌ User not found.', ephemeral: true });
        return;
      }

      const userRecord = ensureUser(data, member);
      const campaignAccount = userRecord.campaignAccounts?.[campaignId]?.[platform];
      
      if (!campaignAccount || !campaignAccount.verified) {
        await interaction.reply({
          content: `❌ No verified ${formatPlatform(platform)} account found for this campaign.`,
          ephemeral: true
        });
        return;
      }

      const username = campaignAccount.username;
      const platformStats = ensureCampaignPlatformStats(userRecord, campaignId, platform, username);

      const staffChannel = interaction.guild.channels.cache.get(campaign.staffChannelId);
      let submittedCount = 0;
      let duplicateCount = 0; // Tracks if any links in the batch were duplicates

      for (const videoUrl of links) {

          // ----------------------------
          // MONSTERLAB CAMPAIGNS
          // ----------------------------
          if (campaign.source === "monsterlab") {

              const monsterResult =
                  await submitClipToMonsterLab(
                      campaign.id,
                      videoUrl,
                      campaign.password || "",
                      "",
                      ""
                  );

              if (!monsterResult.success) {

                  await interaction.reply({

                      content:
              `❌ Failed to submit this clip to MonsterLab.

              Reason:

              ${monsterResult.error || monsterResult.message || "Unknown error."}`,

                      ephemeral: true

                  });

                  return;

              }

              const clipId = makeClipId();

              const clip = {

                id: clipId,
                
                monsterlabSubmissionId: monsterResult.data.submissionId,

                  userId: interaction.user.id,

                  campaignId,

                  campaignName: campaign.name,

                  platform: monsterResult.data.platform,

                  username: monsterResult.data.handle,

                  videoUrl,

                  status: "pending",

                  views: 0,

                  moneyMade: 0,

                  staffMessageId: null,

                  monsterlab: true

              };

              data.clips[clipId] = clip;

              if (staffChannel) {

                  const sent =
                      await staffChannel.send({

                          content:
                              renderClipStaffContent(clip),

                          components:
                              buildClipStaffButtons(clip)

                      }).catch(() => null);

                  if (sent) {

                      clip.staffMessageId = sent.id;

                      data.clips[clipId] = clip;

                  }
              
              }

              submittedCount++;

              continue;
          }

          // ----------------------------
          // EXISTING SYSTEM
          // ----------------------------

          const urlValidation = validateClipSubmission(videoUrl);

          if (!urlValidation.isValid) {

              duplicateCount++;

              continue;

          }

          const clipId = makeClipId();

          const clip = {

              id: clipId,

              userId: interaction.user.id,

              campaignId,

              campaignName: campaign.name,

              platform,

              username,

              videoUrl,

              status: "pending",

              views: 0,

              moneyMade: 0,

              submittedAt: new Date().toISOString(),

              staffMessageId: null

          };

          data.clips[clipId] = clip;

          platformStats.videosPosted++;

          userRecord.stats.videosPosted++;

          if (staffChannel) {

              const sent = await staffChannel.send({

                  content: renderClipStaffContent(clip),

                  components: buildClipStaffButtons(clip)

              }).catch(() => null);

              if (sent) {

                  clip.staffMessageId = sent.id;

                  data.clips[clipId] = clip;

              }

          }

          submittedCount++;

      }

      saveData(data);

      // Construct response message
      let responseMessage =
        `✅ Submitted **${submittedCount}** clip(s).
        
        🟡 Status: Pending Staff Review

        Your clip was successfully submitted.`;

      if (duplicateCount > 0) {

        responseMessage +=
          `\n⚠️ **${duplicateCount}** link(s) were ignored because they were already submitted before.`;

      }

      // If all submitted links were duplicates
      if (
        submittedCount === 0 &&
        duplicateCount > 0
      ) {

        responseMessage =
          `❌ Submission failed. All links you provided have already been submitted to the system!`;

      }

      // Single Discord reply
      await interaction.reply({

        content: responseMessage,

        ephemeral: true
      });

      return;
    }

    if (interaction.isButton() && interaction.customId.startsWith('campaign_stats:')) {
      const campaignId = interaction.customId.split(':')[1];
      const campaign = CAMPAIGNS[campaignId];

      if (!campaign) {
        await interaction.reply({ content: '❌ Campaign not found.', ephemeral: true });
        return;
      }

      const data = loadData();
      const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);

      if (!member) {
        await interaction.reply({ content: '❌ Could not load your stats.', ephemeral: true });
        return;
      }

      const userRecord = ensureUser(data, member);
      const embed = buildCampaignStatsEmbed(data, userRecord, campaignId, campaign.name);

      saveData(data);

      await interaction.reply({
        embeds: [embed],
        ephemeral: true
      });

      return;
    }

    // ===============================
    // Finish Campaign
    // ===============================
    if (
       interaction.isButton() &&
       interaction.customId.startsWith("finish_campaign:")
    ) {

       if (!isAdmin(interaction.member)) {
           return interaction.reply({
               content: "❌ Staff only.",
               ephemeral: true
           });
       }

       const campaignId = interaction.customId.split(":")[1];

       const campaign = CAMPAIGNS[campaignId];

       if (!campaign)
           return interaction.reply({
               content: "Campaign not found.",
               ephemeral: true
           });

       campaign.status = "finished";

       const data = loadData();

       if (!data.campaignStatus)
           data.campaignStatus = {};

       data.campaignStatus[campaignId] = {
           status: "finished",
           finishedAt: Date.now(),
           archived: false
       };

       saveData(data);

       campaign.status = "finished"

       await updateCampaignPanelMessage(
           interaction.guild,
           campaignId
       );

       await interaction.reply({
           content:
               "🏁 Campaign finished.\nIt will automatically move in 24 hours.",
           ephemeral: true
       });

       setTimeout(async () => {

           try {

               const guild = interaction.guild;

               const category =
                   guild.channels.cache.get(
                       campaign.categoryId
                   );

               if (!category) return;

               let finishedCategory =
                   guild.channels.cache.find(
                       c =>
                           c.type === ChannelType.GuildCategory &&
                           c.name === "📁 Finished Campaigns"
                   );

               if (!finishedCategory) {

                   finishedCategory =
                       await guild.channels.create({
                           name: "📁 Finished Campaigns",
                           type: ChannelType.GuildCategory
                       });

               }

               const children =
                   guild.channels.cache.filter(
                       c => c.parentId === category.id
                   );

               for (const [, ch] of children) {

                   await ch.setParent(finishedCategory.id);

                   await ch.permissionOverwrites.edit(
                       guild.roles.everyone,
                       {
                           ViewChannel: false
                       }
                   );

               }

               await category.delete().catch(() => {});

           } catch (err) {

               console.error(
                   "Move finished campaign failed:",
                   err
               );

           }

       }, 24 * 60 * 60 * 1000);

       return;
    }



    // ===============================
    // Reopen Campaign
    // ===============================
    if (
        interaction.isButton() &&
        interaction.customId.startsWith("reopen_campaign:")
    ) {

        if (!isAdmin(interaction.member)) {
            return interaction.reply({
                content: "❌ Staff only.",
                ephemeral: true
            });
        }

        const campaignId =
            interaction.customId.split(":")[1];

        const campaign =
            CAMPAIGNS[campaignId];

        if (!campaign)
            return interaction.reply({
                content: "Campaign not found.",
                ephemeral: true
           });

        campaign.status = "active";

        const data = loadData();

        if (data.campaignStatus?.[campaignId]) {
            data.campaignStatus[campaignId].status = "active";
            delete data.campaignStatus[campaignId].finishedAt;
            data.campaignStatus[campaignId].archived = false;
        }

        saveData(data);

        campaign.status = "active";

        await updateCampaignPanelMessage(
            interaction.guild,
            campaignId
        );

        await interaction.reply({
            content: "✅ Campaign reopened.",
            ephemeral: true
        });

        return;
    }

    if (interaction.isButton() && interaction.customId.startsWith('remove_clip:')) {
      const campaignId = interaction.customId.split(':')[1];
      const data = loadData();

      const clips = getUserCampaignClips(data, interaction.user.id, campaignId);

      if (clips.length === 0) {
        await interaction.reply({
          content: '📭 You have no submitted clips for this campaign.',
          ephemeral: true
        });
        return;
      }

      const select = new StringSelectMenuBuilder()
        .setCustomId(`remove_clip_select:${campaignId}`)
        .setPlaceholder('Select clip to remove')
        .addOptions(
          clips.slice(0, 25).map(clip => ({
            label: `${formatPlatform(clip.platform)} - @${clip.username}`.slice(0, 100),
            description: clip.videoUrl.slice(0, 100),
            value: clip.id
          }))
        );

      await interaction.reply({
        content: 'Choose the clip you want to remove.',
        components: [new ActionRowBuilder().addComponents(select)],
        ephemeral: true
      });

      return;
    }

    if (interaction.isStringSelectMenu() && interaction.customId.startsWith('remove_clip_select:')) {
      const campaignId = interaction.customId.split(':')[1];
      const clipId = interaction.values[0];
      const data = loadData();

      if (!data.clips || !data.clips[clipId]) {
        await interaction.reply({ content: '❌ Clip not found.', ephemeral: true });
        return;
      }

      const clip = data.clips[clipId];

      if (clip.userId !== interaction.user.id) {
        await interaction.reply({ content: '❌ You can only remove your own clips.', ephemeral: true });
        return;
      }

      const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
      if (!member) {
        await interaction.reply({ content: '❌ User not found.', ephemeral: true });
        return;
      }

      const userRecord = ensureUser(data, member);
      const platformStats = userRecord.campaignStats?.[campaignId]?.[clip.platform];

      if (platformStats) {
        platformStats.videosPosted = Math.max(0, (platformStats.videosPosted || 0) - 1);

        if (clip.status === 'approved') {
          platformStats.videosApproved = Math.max(0, (platformStats.videosApproved || 0) - 1);
          platformStats.totalViews = Math.max(0, (platformStats.totalViews || 0) - (clip.views || 0));
          platformStats.moneyMade = Math.max(0, (platformStats.moneyMade || 0) - (clip.moneyMade || 0));

          userRecord.stats.videosApproved = Math.max(0, (userRecord.stats.videosApproved || 0) - 1);
          userRecord.stats.totalViews = Math.max(0, (userRecord.stats.totalViews || 0) - (clip.views || 0));
          userRecord.stats.moneyMade = Math.max(0, (userRecord.stats.moneyMade || 0) - (clip.moneyMade || 0));
        }

        if (clip.status === 'rejected') {
          platformStats.videosRejected = Math.max(0, (platformStats.videosRejected || 0) - 1);
          userRecord.stats.videosRejected = Math.max(0, (userRecord.stats.videosRejected || 0) - 1);
        }
      }

      userRecord.stats.videosPosted = Math.max(0, (userRecord.stats.videosPosted || 0) - 1);

      delete data.clips[clipId];
      saveData(data);

      await interaction.reply({
        content: `✅ Removed clip: ${clip.videoUrl}`,
        ephemeral: true
      });

      return;
    }
    
    if (interaction.isButton() && interaction.customId.startsWith('leave_campaign:')) {
      const campaignId = interaction.customId.split(':')[1];
      const campaign = CAMPAIGNS[campaignId];

      if (!campaign) {
        await interaction.reply({ content: '❌ Campaign not found.', ephemeral: true });
        return;
      }

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`confirm_leave_campaign:${campaignId}`)
          .setLabel('Yes, Leave')
          .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
          .setCustomId('cancel_leave_campaign')
          .setLabel('Cancel')
          .setStyle(ButtonStyle.Secondary)
      );

      await interaction.reply({
        content: `⚠️ Are you sure you want to leave **${campaign.name}**?`,
        components: [row],
        ephemeral: true
      });

      return;
    }

    if (interaction.isButton() && interaction.customId.startsWith('confirm_leave_campaign:')) {
      const campaignId = interaction.customId.split(':')[1];
      const campaign = CAMPAIGNS[campaignId];

      if (!campaign) {
        await interaction.update({ content: '❌ Campaign not found.', components: [] });
        return;
      }

      const data = loadData();
      const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);

      if (!member) {
        await interaction.update({ content: '❌ Could not load your server profile.', components: [] });
        return;
      }

      const userRecord = ensureUser(data, member);

      userRecord.campaigns = (userRecord.campaigns || []).filter(id => id !== campaignId);

      if (userRecord.campaignAccounts?.[campaignId]) {
        delete userRecord.campaignAccounts[campaignId];
      }

      if (userRecord.campaignStats?.[campaignId]) {
        delete userRecord.campaignStats[campaignId];
      }

      const campaignRole = interaction.guild.roles.cache.get(campaign.roleId);
      if (campaignRole && member.roles.cache.has(campaignRole.id)) {
        await member.roles.remove(campaignRole).catch(() => {});
      }

      saveData(data);

      await interaction.update({
        content: `✅ You left **${campaign.name}** successfully.`,
        components: []
      });

      return;
    }

    if (interaction.isButton() && interaction.customId === 'cancel_leave_campaign') {
      await interaction.update({
        content: '✅ Cancelled. You are still in the campaign.',
        components: []
      });

      return;
    }

    if (interaction.isButton() && interaction.customId.startsWith('manage_account:')) {
      const campaignId = interaction.customId.split(':')[1];
      const campaign = CAMPAIGNS[campaignId];

      if (!campaign) {
        await interaction.reply({ content: '❌ Campaign not found.', ephemeral: true });
        return;
      }
 
      const data = loadData();
      const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);

      if (!member) {
        await interaction.reply({ content: '❌ Could not load your account.', ephemeral: true });
        return;
      }

      const userRecord = ensureUser(data, member);
      const accountText = renderCampaignAssignedAccounts(userRecord, campaignId);

      await interaction.reply({
        content:
          `⚙️ **Manage Campaign Account - ${campaign.name}**\n\n` +
          `**Current campaign accounts:**\n${accountText}\n\n` +
          `Use the campaign connect-accounts channel to add or remove accounts for this campaign.`,
        ephemeral: true
      });

      return;
    }

    if (interaction.isButton() && interaction.customId.startsWith('clip_approve:')) {
      if (!interaction.guild || !isAdmin(interaction.member)) {
        await interaction.reply({
          content: '❌ You are not allowed to do this.',
          ephemeral: true
        });
        return;
      }

      const clipId = interaction.customId.split(':')[1];
      const data = loadData();
      const clip = data.clips?.[clipId];

      if (!clip) {
        await interaction.reply({ content: '❌ Clip not found.', ephemeral: true });
        return;
      }

      if (clip.status === 'approved') {
        await interaction.reply({ content: '❌ This clip is already approved.', ephemeral: true });
        return;
      }

      if (clip.platform === 'instagram') {
        clip.status = 'approved';
        clip.cycle = getCampaignCycle(CAMPAIGNS[clip.campaignId].startDate);
        clip.approvedAt = Date.now();

        clip.trackingStatus = 'manual_review_required';
        clip.startingViews = 0;
        clip.currentViews = 0;
        clip.views = 0;
        clip.moneyMade = 0;
        clip.lastChecked = Date.now();

        data.clips[clipId] = clip;
        saveData(data);

        await updateClipStaffMessage(interaction.guild, clip);

        await interaction.reply({
          content: '✅ Instagram clip approved. Staff must update views manually after review.',
          ephemeral: true
        });

        return;
      }

      clip.status = 'approved';
      clip.cycle = getCampaignCycle(CAMPAIGNS[clip.campaignId].startDate);
      clip.approvedAt = Date.now();

      let currentViews = 0;

      try {
        currentViews = await fetchClipViews(clip);
      } catch {
        currentViews = 0;
      }

      clip.startingViews = currentViews;
      clip.currentViews = currentViews;
      clip.views = 0;
      clip.moneyMade = 0;
      clip.lastChecked = Date.now();

      data.clips[clipId] = clip;
      saveData(data);

      await updateClipStaffMessage(interaction.guild, clip);

      await interaction.reply({
        content: `✅ Clip approved. Auto-tracking started from **${formatNumber(currentViews)}** views.`,
        ephemeral: true
      });

      return;
    }

    if (
      interaction.isButton() &&
      interaction.customId.startsWith('instagram_views:')
    ) {
      const clipId = interaction.customId.split(':')[1];

      const modal = new ModalBuilder()
        .setCustomId(`instagram_views_modal:${clipId}`)
        .setTitle('Update Instagram Views');

      const viewsInput = new TextInputBuilder()
        .setCustomId('instagram_views')
        .setLabel('Current Instagram Reel Views')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setPlaceholder('Example: 125000');

      modal.addComponents(
        new ActionRowBuilder().addComponents(viewsInput)
      );

      await interaction.showModal(modal);

      return;
    }

    if (
      interaction.isModalSubmit() &&
      interaction.customId.startsWith('instagram_views_modal:')
    ) {
      const clipId = interaction.customId.split(':')[1];
      const data = loadData();
      const clip = data.clips?.[clipId];

      if (!clip) {
        await interaction.reply({ content: '❌ Clip not found.', ephemeral: true });
        return;
      }

      const currentViews = Number(
        interaction.fields.getTextInputValue('instagram_views').replace(/,/g, '')
      );

      if (!Number.isFinite(currentViews) || currentViews < 0) {
        await interaction.reply({ content: '❌ Invalid views number.', ephemeral: true });
        return;
      }

      // Update clip values
      clip.currentViews = currentViews;
      const startingViews = clip.startingViews || 0;
      const earnedViews = Math.max(0, currentViews - startingViews);
      clip.views = earnedViews;

      const campaign = CAMPAIGNS[clip.campaignId];
      const rate = campaign?.ratePerMillion || 0;
      clip.moneyMade = (earnedViews / 1000000) * rate;

      data.clips[clipId] = clip;
      saveData(data);

      // 1. Update the staff review message panel
      await updateClipStaffMessage(interaction.guild, clip);

      // 2. Update campaign details panel
      await updateCampaignPanelMessage(interaction.guild, clip.campaignId);

      // 3. FIX: Instantly recalculate and edit the public leaderboard message!
      await updateLeaderboardMessage(interaction.guild);

      await interaction.reply({
        content: `✅ Instagram views updated to ${formatNumber(currentViews)}.`,
        ephemeral: true
      });

      return;
    }

    if (interaction.customId.startsWith("update_views:")) {

        const clipId = interaction.customId.split(":")[1];

        const modal = new ModalBuilder()
            .setCustomId(`update_views_modal:${clipId}`)
            .setTitle("Update Clip Views");

        const viewsInput = new TextInputBuilder()
            .setCustomId("views")
            .setLabel("Current Views")
            .setStyle(TextInputStyle.Short)
            .setRequired(true);

        modal.addComponents(
            new ActionRowBuilder().addComponents(viewsInput)
        );

        await interaction.showModal(modal);

        return;
    }

    if (interaction.customId.startsWith("update_views_modal:")) {

        const clipId = interaction.customId.split(":")[1];

        const data = loadData();

        const clip = data.clips[clipId];

        if (!clip) {

            return interaction.reply({
                content: "❌ Clip not found.",
                ephemeral: true
            });

        }

        const campaign = CAMPAIGNS[clip.campaignId];

        const newViews = Number(
            interaction.fields.getTextInputValue("views")
        );

        if (isNaN(newViews) || newViews < 0) {

            return interaction.reply({
                content: "❌ Invalid view count.",
                ephemeral: true
            });

        }

        clip.views = newViews;

        clip.moneyMade =
            (newViews / 1000000) *
            (campaign.ratePerMillion || 0);

        data.clips[clipId] = clip;

        saveData(data);

        await updateLeaderboardMessage(
            interaction.guild
        );

        await updateCampaignPanelMessage(
            interaction.guild,
            clip.campaignId
        );

        await updateClipStaffMessage(
            interaction.guild,
            clip
        );

        await interaction.reply({

            content:
                `✅ Views updated to ${newViews.toLocaleString()}.`,

            ephemeral: true

        });

        return;
    }

    if (interaction.isButton() && interaction.customId.startsWith('clip_reject:')) {
      if (!interaction.guild || !isAdmin(interaction.member)) {
        await interaction.reply({
          content: '❌ You are not allowed to do this.',
          ephemeral: true
        });
        return;
      }

      const clipId = interaction.customId.split(':')[1];
      const data = loadData();
      const clip = data.clips?.[clipId];

      if (!clip) {
        await interaction.reply({
          content: '❌ Clip not found.',
          ephemeral: true
        });
        return;
      }

      if (clip.status === 'rejected') {
        await interaction.reply({
          content: '❌ This clip is already rejected.',
          ephemeral: true
        });
        return;
      }

      const modal = new ModalBuilder()
        .setCustomId(`clip_reject_modal:${clipId}`)
        .setTitle('Reject Clip');

      const reasonInput = new TextInputBuilder()
        .setCustomId('reject_reason')
        .setLabel('Reason for rejection')
        .setPlaceholder('Example: Wrong campaign, low quality, duplicate, invalid link...')
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true)
        .setMaxLength(500);

      modal.addComponents(
        new ActionRowBuilder().addComponents(reasonInput)
      );

      await interaction.showModal(modal);
      return;
    }

    if (interaction.isModalSubmit() && interaction.customId.startsWith('clip_reject_modal:')) {
      if (!interaction.guild || !isAdmin(interaction.member)) {
        await interaction.reply({
          content: '❌ You are not allowed to do this.',
          ephemeral: true
        });
        return;
      }

      const clipId = interaction.customId.split(':')[1];
      const reason = interaction.fields.getTextInputValue('reject_reason').trim();

      const data = loadData();
      const clip = data.clips?.[clipId];

      if (!clip) {
        await interaction.reply({
          content: '❌ Clip not found.',
          ephemeral: true
        });
        return;
      }

      if (clip.status === 'rejected') {
        await interaction.reply({
          content: '❌ This clip is already rejected.',
          ephemeral: true
        });
        return;
      }

      const userRecord = data.users?.[clip.userId];

      clip.status = 'rejected';
      clip.rejectReason = reason;
      clip.rejectedAt = Date.now();
      clip.rejectedBy = interaction.user.id;

      clip.views = 0;
      clip.moneyMade = 0;
      clip.trackingError = null;

      data.clips[clipId] = clip;

      if (userRecord) {
        if (!userRecord.stats) userRecord.stats = {};
        userRecord.stats.videosRejected = (userRecord.stats.videosRejected || 0) + 1;
      }

      saveData(data);

      await updateClipStaffMessage(interaction.guild, clip);

      const member = await interaction.guild.members.fetch(clip.userId).catch(() => null);

      if (member) {
        await member.send(
          `❌ **Clip Rejected**\n\n` +
          `Your clip for **${CAMPAIGNS[clip.campaignId]?.name || 'campaign'}** was rejected.\n\n` +
          `**Reason:** ${reason}`
        ).catch(() => {});
      }

      await interaction.reply({
        content: `✅ Clip rejected.\nReason: ${reason}`,
        ephemeral: true
      });
   
      return;
    }

    if (interaction.customId.startsWith("restore_clip:")) {

        const clipId = interaction.customId.split(":")[1];

        const data = loadData();

        const clip = data.clips[clipId];

        if (!clip) {
            return interaction.reply({
                content: "❌ Clip not found.",
                ephemeral: true
            });
        }

        clip.status = "approved";
        clip.rejectReason = null;
        clip.restoredAt = Date.now();
        clip.restoredBy = interaction.user.id;

        data.clips[clipId] = clip;

        saveData(data);

        await updateClipStaffMessage(
            interaction.guild,
            clip
        );

        await interaction.reply({
            content: "✅ Clip restored successfully.",
            ephemeral: true
        });

        return;
    }

    if (interaction.isStringSelectMenu() && interaction.customId.startsWith('campaign_account_select:')) {
       const campaignId = interaction.customId.split(':')[1];
       const campaign = CAMPAIGNS[campaignId];

       if (!campaign) {
         await interaction.reply({
           content: '❌ Campaign not found.',
           ephemeral: true
         });
         return;
       }

       const [platform, username] = interaction.values[0].split(':');
       const data = loadData();

       const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
       if (!member) {
         await interaction.reply({
           content: '❌ Could not load your account.',
           ephemeral: true
         });
         return;
       }

       const userRecord = ensureUser(data, member);

       // optional: block more than one account per platform for a campaign
       if (
         userRecord.campaignAccounts?.[campaignId]?.[platform] &&
         userRecord.campaignAccounts[campaignId][platform].username !== username
       ) {
         await interaction.reply({
           content: `❌ You already assigned a ${formatPlatform(platform)} account to this campaign.`,
           ephemeral: true
         });
         return;
       }

       ensureCampaignAccount(userRecord, campaignId, platform, username);
       ensureCampaignPlatformStats(userRecord, campaignId, platform, username);

       if (!userRecord.campaigns.includes(campaignId)) {
          userRecord.campaigns.push(campaignId);
       }

       saveData(data);

       await interaction.reply({
         content: `✅ Assigned **${formatPlatform(platform)}** account **@${username}** to **${campaign.name}**.`,
         ephemeral: true
       });

       return;
    }

    if (interaction.isButton() && interaction.customId === 'verify_human') {
      if (!interaction.guild) {
        await interaction.reply({
          content: '❌ This can only be used in the server.',
          ephemeral: true
        });
        return;
      }

      const data = loadData();
      const userRecord = ensureUser(data, interaction.member);
      userRecord.verified = true;
      saveData(data);

      const verifiedRole = interaction.guild.roles.cache.get(VERIFIED_ROLE_ID);
      const clipperRole = interaction.guild.roles.cache.get(CLIPPER_ROLE_ID);

      if (!verifiedRole) {
        await interaction.reply({
          content: '❌ VERIFIED_ROLE_ID is missing or wrong.',
          ephemeral: true
        });
        return;
      }

      if (!clipperRole) {
        await interaction.reply({
          content: '❌ CLIPPER_ROLE_ID is missing or wrong.',
          ephemeral: true
        });
        return;
      }

      try {
        if (!interaction.member.roles.cache.has(VERIFIED_ROLE_ID)) {
          await interaction.member.roles.add(verifiedRole);
        }

        if (!interaction.member.roles.cache.has(CLIPPER_ROLE_ID)) {
          await interaction.member.roles.add(clipperRole);
        }

        await interaction.reply({
          content: '✅ Verification successful. You now have access and the clipper role.',
          ephemeral: true
        });
      } catch (error) {
        console.error('Role add error:', error);

        await interaction.reply({
          content:
            '❌ Verification saved, but I could not add the role.\n\n' +
            'Check: bot has Manage Roles permission, bot role is above Clipper role, and role IDs are correct.',
          ephemeral: true
        });
      }

      return;
    }

    if (interaction.isButton() && interaction.customId.startsWith('join_campaign:')) {
      const campaignId = interaction.customId.split(':')[1];
      const campaign = CAMPAIGNS[campaignId];

      if (!campaign) {
        await interaction.reply({
          content: '❌ Campaign not found.',
          ephemeral: true
        });
        return;
      }

      const select = new StringSelectMenuBuilder()
        .setCustomId(`campaign_connect_platform:${campaign.id}`)
        .setPlaceholder('Choose platform')
        .addOptions(
          campaign.allowedPlatforms.map(platform => ({
            label: formatPlatform(platform),
            value: platform
          }))
        );

      await interaction.reply({
        content: `Choose platform for **${campaign.name}**`,
        components: [new ActionRowBuilder().addComponents(select)],
        ephemeral: true
      });

      return;
    }

    if (interaction.isStringSelectMenu() && interaction.customId.startsWith('campaign_platform:')) {
      const [, campaignId] = interaction.customId.split(':');
      const platform = interaction.values[0];
      const campaign = CAMPAIGNS[campaignId];

      if (!campaign) {
        await interaction.reply({
          content: '❌ Campaign not found.',
          ephemeral: true
        });
        return;
      }

      const modal = new ModalBuilder()
        .setCustomId(`campaign_username:${campaignId}:${platform}`)
        .setTitle('Enter Username');

      modal.addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('campaign_username_input')
            .setLabel('Username')
            .setPlaceholder('@username')
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
        )
      );

      await interaction.showModal(modal);
      return;
    }

    if (interaction.isModalSubmit() && interaction.customId.startsWith('campaign_username:')) {
      const [, campaignId, platform] = interaction.customId.split(':');
      const campaign = CAMPAIGNS[campaignId];

      if (!campaign) {
        await interaction.reply({
          content: '❌ Campaign not found.',
          ephemeral: true
        });
        return;
      }

      const username = normalizeUsername(
        interaction.fields.getTextInputValue('campaign_username_input')
      );

      if (!username) {
        await interaction.reply({
          content: '❌ Username cannot be empty.',
          ephemeral: true
        });
        return;
      }

      const data = loadData();
      const appId = makeApplicationId();

      const app = {
        id: appId,
        guildId: interaction.guild.id,
        userId: interaction.user.id,
        campaignId,
        campaignName: campaign.name,
        platform,
        username,
        status: 'pending',
        bioCode: null,
        staffChannelId: campaign.staffChannelId,
        staffMessageId: null,
        sourceChannelId: interaction.channelId
      };

      const staffCh = interaction.guild.channels.cache.get(campaign.staffChannelId);
      if (!staffCh) {
        await interaction.reply({
          content: '❌ Staff channel not found.',
          ephemeral: true
        });
        return;
      }

      const msg = await staffCh.send({
        content: renderStaffContent(app),
        components: buildStaffButtons(appId, 'pending')
      });

      app.staffMessageId = msg.id;
      data.applications[appId] = app;
      saveData(data);

      await interaction.reply({
        content: '✅ Submitted. Wait for code.',
        ephemeral: true
      });
      return;
    }

    if (interaction.isButton() && interaction.customId.startsWith('staff_send_code:')) {
      if (!interaction.guild || !isAdmin(interaction.member)) {
        await interaction.reply({
          content: '❌ You are not allowed to do this.',
          ephemeral: true
        });
        return;
      }

      const appId = interaction.customId.split(':')[1];
      const data = loadData();
      const app = data.applications[appId];

      if (!app) {
        await interaction.reply({
          content: '❌ Application not found.',
          ephemeral: true
        });
        return;
      }

      const modal = new ModalBuilder()
        .setCustomId(`staff_code:${appId}`)
        .setTitle('Enter Code');

      modal.addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('code')
            .setLabel('Code')
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
        )
      );

      await interaction.showModal(modal);
      return;
    }

    if (interaction.isModalSubmit() && interaction.customId.startsWith('staff_code:')) {
      if (!interaction.guild || !isAdmin(interaction.member)) {
        await interaction.reply({
          content: '❌ You are not allowed to do this.',
          ephemeral: true
        });
        return;
      }

      const appId = interaction.customId.split(':')[1];
      const data = loadData();
      const app = data.applications[appId];

      if (!app) {
        await interaction.reply({
          content: '❌ Application not found.',
          ephemeral: true
        });
        return;
      }

      const code = interaction.fields.getTextInputValue('code').trim();

      app.bioCode = code;
      app.status = 'waiting_confirm';
      data.applications[appId] = app;
      saveData(data);

      await updateStaffMessage(interaction.guild, app);

      const sourceChannel = interaction.guild.channels.cache.get(app.sourceChannelId);
      if (!sourceChannel) {
        await interaction.reply({
          content: '❌ Original campaign channel not found.',
          ephemeral: true
        });
        return;
      }

      const confirmRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`user_confirm:${appId}`)
          .setLabel('Confirm Bio Updated')
          .setStyle(ButtonStyle.Success)
      );

      await sourceChannel.send({
        content: `📩 <@${app.userId}> your bio code for **${app.campaignName}** is:

\`${code}\`

Add this code to your **${formatPlatform(app.platform)}** bio for **@${app.username}**.

When done, click the button below.`,
        components: [confirmRow]
      });

      await interaction.reply({
        content: `✅ Code sent to <@${app.userId}>.`,
        ephemeral: true
      });
      return;
    }

    if (interaction.isButton() && interaction.customId.startsWith('user_confirm:')) {
      const appId = interaction.customId.split(':')[1];
      const data = loadData();
      const app = data.applications[appId];

      if (!app) {
        await interaction.reply({
          content: '❌ Application not found.',
          ephemeral: true
        });
        return;
      }

      if (interaction.user.id !== app.userId) {
        await interaction.reply({
          content: '❌ This confirmation is not for you.',
          ephemeral: true
        });
        return;
      }

      app.status = 'verifying';
      data.applications[appId] = app;
      saveData(data);

      await updateStaffMessage(interaction.guild, app);

      await interaction.reply({
        content: '✅ Submitted. Staff reviewing.',
        ephemeral: true
      });
      return;
    }

    if (interaction.isButton() && interaction.customId.startsWith('staff_accept:')) {
      if (!interaction.guild || !isAdmin(interaction.member)) {
        await interaction.reply({
          content: '❌ You are not allowed to do this.',
          ephemeral: true
        });
        return;
      }

      const appId = interaction.customId.split(':')[1];
      const data = loadData();
      const app = data.applications[appId];

      if (!app) {
        await interaction.reply({
          content: '❌ Application not found.',
          ephemeral: true
        });
        return;
      }

      const member = await interaction.guild.members.fetch(app.userId).catch(() => null);
      if (!member) {
        await interaction.reply({
          content: '❌ User not found in server.',
          ephemeral: true
        });
        return;
      }

      const clipperRole = interaction.guild.roles.cache.get(CLIPPER_ROLE_ID);
      const campaignRole = interaction.guild.roles.cache.get(CAMPAIGNS[app.campaignId]?.roleId);

      if (clipperRole && !member.roles.cache.has(CLIPPER_ROLE_ID)) {
        await member.roles.add(clipperRole).catch(() => {});
      }

      if (campaignRole && !member.roles.cache.has(campaignRole.id)) {
        await member.roles.add(campaignRole).catch(() => {});
      }

      app.status = 'approved';
      data.applications[appId] = app;

      const userRecord = ensureUser(data, member);

      if (!userRecord.campaigns.includes(app.campaignId)) {
        userRecord.campaigns.push(app.campaignId);
      }

      ensureCampaignAccount(
        userRecord,
        app.campaignId,
        app.platform,
        app.username
      );

      const campaignAccount = ensureCampaignAccount(
        userRecord,
        app.campaignId,
        app.platform,
        app.username
      );

      campaignAccount.verified = true;
      campaignAccount.bioCode = app.bioCode || null;

      ensureCampaignPlatformStats(
        userRecord,
        app.campaignId,
        app.platform,
        app.username
      );

      saveData(data);
      await updateStaffMessage(interaction.guild, app);

      await interaction.reply({
        content: `✅ <@${app.userId}> was approved for **${app.campaignName}**.`,
        ephemeral: true
      });
      return;
    }

    if (interaction.isButton() && interaction.customId.startsWith('staff_reject:')) {
      if (!interaction.guild || !isAdmin(interaction.member)) {
        await interaction.reply({
          content: '❌ You are not allowed to do this.',
          ephemeral: true
        });
        return;
      }

      const appId = interaction.customId.split(':')[1];
      const data = loadData();
      const app = data.applications[appId];

      if (!app) {
        await interaction.reply({
          content: '❌ Application not found.',
          ephemeral: true
        });
        return;
      }

      app.status = 'rejected';
      data.applications[appId] = app;
      saveData(data);

      await updateStaffMessage(interaction.guild, app);

      await interaction.reply({
        content: `❌ <@${app.userId}> was rejected for **${app.campaignName}**.`,
        ephemeral: true
      });
      return;
    }
  } catch (e) {
    console.error('Interaction error:', e);

    if (interaction.isRepliable()) {
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({
          content: `❌ Error: ${e.message}`,
          ephemeral: true
        }).catch(() => {});
      } else {
        await interaction.reply({
          content: `❌ Error: ${e.message}`,
          ephemeral: true
        }).catch(() => {});
      }
    }
  }
});

// connectMongo();

// ==========================================
// 🌐 OAUTH2 WEB SERVER FOR FORCED JOINING
// ==========================================

app.get('/callback', async (req, res) => {
  const code = req.query.code;
  if (!code) return res.send('❌ Authorization missing.');

  try {
    // Exchange the authorization code for an Access Token
    const tokenResponse = await axios.post('https://discord.com/api/v10/oauth2/token', new URLSearchParams({
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      grant_type: 'authorization_code',
      code: code,
      redirect_uri: REDIRECT_URI,
    }), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    });

    const accessToken = tokenResponse.data.access_token;

    // Get the user's Discord ID profile details
    const userResponse = await axios.get('https://discord.com/api/v10/users/@me', {
      headers: { Authorization: `Bearer ${accessToken}` }
    });

    const userId = userResponse.data.id;

    // Save this tracking token to your database
    const data = loadData();
    if (!data.oauthTokens) data.oauthTokens = {};
    data.oauthTokens[userId] = accessToken;
    saveData(data);

    res.send('✅ Account Authorized Successfully! You can close this tab and return to Discord.');
  } catch (error) {
    console.error('OAuth Error:', error.response?.data || error.message);
    res.send('❌ Failed to process account connection.');
  }
});

// Start the Express Server
app.listen(PORT, () => {
  console.log(`🌐 OAuth Web Server internally listening on port ${PORT}`);
});

client.once('ready', () => {
  console.log('Monsterlab sync is manual.');
});

client.on('messageCreate', async message => {

    if (message.author.bot) return;

    if (message.content !== '!cleanupchannels') return;

    console.log('Cleanup command received');

    await message.reply('Cleanup started...');

    const prefixes = [
        '-clipping',
        'campaign-rules',
        'updates',
        'connect-accounts',
        'guides',
        'clip-assets',
        'submit-clips',
        'chat'
    ];

    let deleted = 0;

    for (const channel of message.guild.channels.cache.values()) {

        if (channel.type !== ChannelType.GuildText) continue;

        if (prefixes.some(name => channel.name.includes(name))) {

            try {
                console.log('Deleting:', channel.name);
                await channel.delete();
                deleted++;
            } catch (err) {
                console.log('Failed:', channel.name, err.message);
            }

        }
    }

    await message.reply(`✅ Deleted ${deleted} channels.`);
});

// Your existing login statement
client.login(process.env.TOKEN); 