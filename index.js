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
  PermissionsBitField,
  EmbedBuilder
} = require('discord.js');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.DirectMessages
  ]
});

const VERIFIED_ROLE_ID = process.env.VERIFIED_ROLE_ID;
const CLIPPER_ROLE_ID = process.env.CLIPPER_ROLE_ID;

const dataFilePath = path.join(__dirname, 'data.json');

const CAMPAIGNS = {
  emoney_shopping: {
    id: 'emoney_shopping',
    name: 'Michael Carbonara Campaign',
    allowedPlatforms: ['tiktok', 'instagram', 'youtube'],
    payoutThreshold: 100000,
    staffChannelId: process.env.EMONEY_STAFF_CHANNEL_ID,
    roleId: process.env.EMONEY_CAMPAIGN_ROLE_ID,
    panelText: `🎙️ **Earn Money Posting Political Clips – Michael Carbonara Campaign**

Earn money by posting clips and edits of politician *Michael Carbonara* discussing current political topics. High-quality AI-generated content is accepted!

All you have to do is **register for the campaign below** and follow the guidelines to start earning.

📊 **Campaign Overview**
• **Content:** Michael Carbonara political discussions
• **Platforms:** TikTok, IG Reels, YouTube Shorts
• **Requirement:** Must tag **@mcarbonarafl** at the start of every caption
• **Requirement:** Likeness (audio/visual) must be exact
• **Strict Rule:** **NO** Anti-Trump or Anti-White House content
• **Strict Rule:** **NO** outrageous or violent content *(r*pe, killing, etc.)*

💰 **Payment Details**

> **TikTok:** $160 per 100,000 views  
> **YouTube Shorts:** $100 per 100,000 views  
> **Instagram Reels:** $50 per 100,000 views  
> **Account Limit:** Unlimited  
> **Payment Method:** Crypto  
> **Minimum Payout:** 100k views to qualify

🚀 **Join the Campaign**
Click the button below to start clipping and earning:`
  }
};

function loadData() {
  if (!fs.existsSync(dataFilePath)) {
    fs.writeFileSync(
      dataFilePath,
      JSON.stringify({
        users: {},
        applications: {},
        socialAccounts: {},
        socialLinkRequests: {},
        clips: {}
      }, null, 2)
    );
  }

  const raw = JSON.parse(fs.readFileSync(dataFilePath, 'utf8'));
  if (!raw.users) raw.users = {};
  if (!raw.applications) raw.applications = {};
  if (!raw.socialAccounts) raw.socialAccounts = {};
  if (!raw.socialLinkRequests) raw.socialLinkRequests = {};
  if (!raw.clips) raw.clips = {};
  return raw;
}

function saveData(data) {
  fs.writeFileSync(dataFilePath, JSON.stringify(data, null, 2));
}

function ensureUser(data, member) {
  if (!data.users[member.id]) {
    data.users[member.id] = {
      discordId: member.id,
      discordName: member.user.username,
      verified: false,
      campaigns: [],
      socials: [],
      stats: {
        videosPosted: 0,
        videosApproved: 0,
        videosRejected: 0,
        totalViews: 0,
        moneyMade: 0
      },
      campaignStats: {},
      campaignAccounts:{}
    };
  }

  const user = data.users[member.id];

  // ✅ Always enforce structure (this is what you were trying to add)
  if (!user.stats) {
    user.stats = {
      videosPosted: 0,
      videosApproved: 0,
      videosRejected: 0,
      totalViews: 0,
      moneyMade: 0
    };
  }

  if (!data.users[member.id].campaignStats) {
  data.users[member.id].campaignStats = {};
}

if (!data.users[member.id].campaignAccounts) {
  data.users[member.id].campaignAccounts = {};
}

if (!data.users[member.id].socials) {
  data.users[member.id].socials = [];
}

  user.discordName = member.user.username;
  return data.users[member.id];
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

function getStatusLabel(status) {
  return {
    pending: 'Pending',
    waiting_confirm: 'Waiting for user confirmation',
    verifying: 'Verifying',
    approved: 'Approved',
    rejected: 'Rejected'
  }[status] || status;
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
  return Object.values(data.users).sort((a, b) => {
    const viewsA = a.stats?.totalViews || 0;
    const viewsB = b.stats?.totalViews || 0;
    return viewsB - viewsA;
  });
}

function buildLeaderboardEmbed(data, page = 1, perPage = 10) {
  const users = getLeaderboardUsers(data);
  const totalPages = Math.max(1, Math.ceil(users.length / perPage));
  const safePage = Math.min(Math.max(page, 1), totalPages);

  const start = (safePage - 1) * perPage;
  const pageUsers = users.slice(start, start + perPage);

  let lines = pageUsers.map((user, index) => {
    const rank = start + index + 1;
    const views = user.stats?.totalViews || 0;

    let prefix = `${rank}.`;
    if (rank === 1) prefix = '🥇';
    if (rank === 2) prefix = '🥈';
    if (rank === 3) prefix = '🥉';

    const name = user.discordName || `User ${rank}`;
    return `${prefix} **${name}**: **${formatNumber(views)}** Views`;
  });

  if (lines.length === 0) {
    lines = ['No stats yet.'];
  }

  const embed = new EmbedBuilder()
    .setColor(0x7ED957)
    .setDescription(
      `🎬 **Creators Elite** 💎\n\n` +
      `## Top Clippers All Time 📈\n\n` +
      `${lines.join('\n')}\n\n` +
      `**Powered by Creators Elite**`
    )
    .setFooter({ text: `Page ${safePage} / ${totalPages}` });

  return {
    embed,
    page: safePage,
    totalPages
  };
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
  const users = getLeaderboardUsers(data);
  const index = users.findIndex(user => user.discordId === userId);
  return index === -1 ? null : index + 1;
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

function buildCampaignStatsEmbed(userRecord, campaignId, campaignName) {
  const stats = ensureCampaignStats(userRecord, campaignId);

  const campaign = CAMPAIGNS[campaignId];
  const payoutThreshold = campaign?.payoutThreshold || 100000;

  const pendingVideos = Math.max(
    stats.videosPosted - stats.videosApproved - stats.videosRejected,
    0
  );

  const viewsNeeded = Math.max(payoutThreshold - stats.totalViews, 0);

  const payoutText =
    stats.totalViews >= payoutThreshold
      ? `Eligible for payout.\n**Money Made:** $${formatNumber(stats.moneyMade)}`
      : `You need **${formatNumber(viewsNeeded)}** more views to reach **${formatNumber(payoutThreshold)}** views for payout.`;

  return new EmbedBuilder()
    .setColor(0x7ED957)
    .setDescription(
      `🎬 **Campaign Stats - ${campaignName}**\n\n` +
      `📊 **Total Views**\n${formatNumber(stats.totalViews)}\n\n` +
      `💰 **Payout (Target: ${formatNumber(payoutThreshold)} Views)**\n${payoutText}\n\n` +
      `🟢 **Approved Videos**\n${stats.videosApproved}\n\n` +
      `🟡 **Pending Videos**\n${pendingVideos}\n\n` +
      `🔴 **Rejected Videos**\n${stats.videosRejected}\n\n` +
      `🎞️ **View Your Clips**\nClick the button below to check the clips submitted for this campaign.`
    )
    .setFooter({ text: `Last update | ${new Date().toLocaleString()}` });
}
 
function makeSocialRequestId() {
  return `social_${Date.now()}_${Math.floor(Math.random() * 100000)}`;
}

function renderSocialStaffContent(request) {
  return `📥 **Social Account Verification Request**

**User:** <@${request.userId}>
**Platform:** ${formatPlatform(request.platform)}
**Username:** @${request.username}
**Status:** ${getStatusLabel(request.status)}
${request.bioCode ? `**Bio Code:** \`${request.bioCode}\`\n` : ''}`;
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

function renderClipStaffContent(clip) {
  return `📥 **New Clip Submission**

**User:** <@${clip.userId}>
**Campaign:** ${clip.campaignName}
**Platform:** ${formatPlatform(clip.platform)}
**Username:** @${clip.username}
**Link:** ${clip.videoUrl}
**Status:** ${clip.status}`;
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

function buildClipStaffButtons(clipId, status) {
  if (status === 'pending') {
    return [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`clip_approve:${clipId}`)
          .setLabel('Approve')
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId(`clip_reject:${clipId}`)
          .setLabel('Reject')
          .setStyle(ButtonStyle.Danger)
      )
    ];
  }

  if (status === 'approved' || status === 'rejected') {
    return [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`clip_done:${clipId}`)
          .setLabel(status === 'approved' ? 'Approved' : 'Rejected')
          .setStyle(status === 'approved' ? ButtonStyle.Success : ButtonStyle.Danger)
          .setDisabled(true)
      )
    ];
  }

  return [];
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

async function updateClipStaffMessage(guild, clip) {
  const campaign = CAMPAIGNS[clip.campaignId];
  if (!campaign) return;

  const ch = guild.channels.cache.get(campaign.staffChannelId);
  if (!ch || !clip.staffMessageId) return;

  try {
    const msg = await ch.messages.fetch(clip.staffMessageId);
    await msg.edit({
      content: renderClipStaffContent(clip),
      components: buildClipStaffButtons(clip.id, clip.status)
    });
  } catch (error) {
    console.log('Could not update clip staff message:', error.message);
  }
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

client.once(Events.ClientReady, c => {
  console.log(`Online as ${c.user.tag}`);
});

client.on(Events.MessageCreate, async message => {
  try {
    if (message.author.bot) return;
    if (!message.guild) return;

    console.log('MESSAGE RECEIVED:', message.content);

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

    if (message.content.startsWith('!submitpanel')) {
      if (!isAdmin(message.member)) {
        await message.reply('❌ You must be an admin to use this command.');
        return;
      }

      const args = message.content.trim().split(/\s+/);
      const campaignId = args[1];
      const campaign = CAMPAIGNS[campaignId];

      if (!campaign) {
        await message.reply('❌ Usage: !submitpanel campaign_id');
        return;
      }

      await message.delete().catch(() => {});

      const embed = new EmbedBuilder()
        .setColor(0x7ED957)
        .setDescription(
          `🎬 **${campaign.name}**\n\n` +
          `Track Your Campaign Clips\n\n` +
          `Use the buttons below to manage your account for **${campaign.name}** campaign.\n\n` +
          `⬆️ **Submit Clip**\nSubmit your clips manually for campaign tracking.\n\n` +
          `👥 **My Stats**\nCheck your total stats, clips and payout.\n\n` +
          `🗑️ **Remove Clip**\nRemove one or more clips for campaign tracking.\n\n` +
          `⚙️ **Manage Account**\nEdit and manage your clipper account.\n\n` +
          `⚠️ **Leave Campaign**\nLeave this campaign.\n\n` +
          `**Powered by Creators Elite**`
        );

      const row1 = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`submit_clip:${campaignId}`)
          .setLabel('Submit Clip')
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId(`campaign_stats:${campaignId}`)
          .setLabel('My Stats')
          .setStyle(ButtonStyle.Primary)
        );

      const row2 = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`remove_clip:${campaignId}`)
          .setLabel('Remove Clip')
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId(`manage_account:${campaignId}`)
          .setLabel('Manage Account')
          .setStyle(ButtonStyle.Secondary)
        );

      const row3 = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`leave_campaign:${campaignId}`)
          .setLabel('Leave Campaign')
          .setStyle(ButtonStyle.Danger)
      );

      await message.channel.send({
        embeds: [embed],
        components: [row1, row2, row3]
      });

      return;
    }

    if (message.content === '!socialpanel') {
      if (!isAdmin(message.member)) {
        await message.reply('❌ You must be an admin to use this command.');
        return;
      }

      await message.delete().catch(() => {});

      const embed = new EmbedBuilder()
        .setColor(0x7ED957)
        .setTitle('Manage Your Social Accounts')
        .setDescription(
          `Use the buttons below to manage your social media accounts.\n\n` +
          `➕ **Link Account**\nConnect a new social media account.\n\n` +
          `➖ **Remove Account**\nUnlink a connected social account.\n\n` +
          `🌐 **View Accounts**\nView your connected social accounts.\n\n` +
          `**Powered by Creators Elite**`
       );

     const row1 = new ActionRowBuilder().addComponents(
       new ButtonBuilder()
         .setCustomId('social_link')
         .setLabel('Link Account')
         .setStyle(ButtonStyle.Success),
       new ButtonBuilder()
         .setCustomId('social_remove')
         .setLabel('Remove Account')
         .setStyle(ButtonStyle.Secondary),
       new ButtonBuilder()
         .setCustomId('social_view')
         .setLabel('View Accounts')
         .setStyle(ButtonStyle.Primary)
     );

     await message.channel.send({
       embeds: [embed],
       components: [row1]
     });

     return;
   }

    if (message.content.startsWith('!campaignpanel')) {
      if (!isAdmin(message.member)) {
        await message.reply('❌ You must be an admin to use this command.');
        return;
      }

      const args = message.content.trim().split(/\s+/);
      const campaignId = args[1];

      if (!campaignId || !CAMPAIGNS[campaignId]) {
        await message.channel.send(
          `❌ Usage: \`!campaignpanel campaign_id\`\nAvailable campaigns: ${Object.keys(CAMPAIGNS).join(', ')}`
        );
        return;
      }

      const campaign = CAMPAIGNS[campaignId];

      await message.delete().catch(() => {});

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`join_campaign:${campaign.id}`)
          .setLabel('Join Campaign')
          .setStyle(ButtonStyle.Success)
      );

      await message.channel.send({
        content: campaign.panelText,
        components: [row]
      });

      return;
    }
  } catch (error) {
    console.error('MessageCreate error:', error);
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

    if (interaction.isButton() && interaction.customId === 'social_link') {
      const select = new StringSelectMenuBuilder()
        .setCustomId('social_link_platform')
        .setPlaceholder('Select platform')
        .addOptions([
          { label: 'TikTok', value: 'tiktok' },
          { label: 'Instagram', value: 'instagram' },
          { label: 'YouTube', value: 'youtube' },
        ]);

      await interaction.reply({
        content: 'Choose the platform you want to link.',
        components: [new ActionRowBuilder().addComponents(select)],
        ephemeral: true
      });

      return;
    }

    if (interaction.isStringSelectMenu() && interaction.customId === 'social_link_platform') {
      const platform = interaction.values[0];

      const modal = new ModalBuilder()
        .setCustomId(`social_link_modal:${platform}`)
        .setTitle('Link Account');

      modal.addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('social_username')
            .setLabel('Username')
            .setPlaceholder('@username')
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
        )
      );

      await interaction.showModal(modal);
      return;
    }
    
    if (interaction.isModalSubmit() && interaction.customId.startsWith('social_link_modal:')) {
      const platform = interaction.customId.split(':')[1];
      const username = normalizeUsername(
        interaction.fields.getTextInputValue('social_username')
      );

      if (!username) {
        await interaction.reply({
          content: '❌ Username cannot be empty.',
          ephemeral: true
        });
        return;
      }

      const data = loadData();
      ensureUser(data, interaction.member);
      ensureUserSocials(data, interaction.user.id);

      const key = normalizeSocialKey(platform, username);
      const existing = data.socialAccounts[key];

      if (existing && existing.ownerId !== interaction.user.id) {
        await interaction.reply({
          content: `❌ This ${formatPlatform(platform)} account is already linked by another user.`,
          ephemeral: true
        });
        return;
      }

      if (existing && existing.ownerId === interaction.user.id) {
        await interaction.reply({
          content: `❌ You already linked this ${formatPlatform(platform)} account.`,
          ephemeral: true
        });
        return;
      }  

      const alreadyPending = Object.values(data.socialLinkRequests).find(
        req =>
          req.platform === platform &&
          req.username.toLowerCase() === username.toLowerCase() &&
          req.status !== 'approved' &&
          req.status !== 'rejected'
      );

      if (alreadyPending && alreadyPending.userId !== interaction.user.id) {
        await interaction.reply({
          content: `❌ This ${formatPlatform(platform)} account already has a pending verification request.`,
          ephemeral: true
        });
        return;
      }

      const requestId = makeSocialRequestId();

      const request = {
        id: requestId,
        userId: interaction.user.id,
        guildId: interaction.guild.id,
        platform,
        username,
        status: 'pending',
        bioCode: null,
        createdAt: new Date().toISOString(),
        staffMessageId: null,
        sourceChannelId: interaction.channelId
      };

      const staffChannel = interaction.guild.channels.cache.get(process.env.SOCIAL_STAFF_CHANNEL_ID);
      if (!staffChannel) {
        await interaction.reply({
          content: '❌ Social staff channel not found.',
          ephemeral: true
        });
        return;
      }

      const sent = await staffChannel.send({
        content: renderSocialStaffContent(request),
        components: buildSocialStaffButtons(request.id, request.status)
      });

      request.staffMessageId = sent.id;
      data.socialLinkRequests[requestId] = request;
      saveData(data);

      await interaction.reply({
        content: `✅ Your ${formatPlatform(platform)} account verification request was submitted. Please wait for staff to send your bio code.`,
        ephemeral: true
      });

      return;
    }

    if (interaction.isButton() && interaction.customId.startsWith('submit_clip:')) {
      try {
        const campaignId = interaction.customId.split(':')[1];
        const campaign = CAMPAIGNS[campaignId];

        if (!campaign) {
          await interaction.reply({
            content: '❌ Campaign not found.',
            ephemeral: true
          });
          return;
        }

        if (!interaction.guild) {
          await interaction.reply({
            content: '❌ This can only be used in a server.',
            ephemeral: true
          });
          return;
        }

        const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);

        if (!member) {
          await interaction.reply({
            content: '❌ Could not load your account.',
            ephemeral: true
          });
          return;
        }

        const data = loadData();
        const userRecord = ensureUser(data, member);

        if (!userRecord.campaignStats) {
          userRecord.campaignStats = {};
        }

        const campaignPlatforms = Object.keys(userRecord.campaignStats[campaignId] || {});

        if (campaignPlatforms.length === 0) {
          await interaction.reply({
            content: '❌ You do not have any platform account set for this campaign yet.',
            ephemeral: true
          });
          return;
        }

        if (campaignPlatforms.length === 1) {
          const platform = campaignPlatforms[0];
  
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
          .setPlaceholder('Choose account/platform for this clip')
          .addOptions(
            campaignPlatforms.map(platform => ({
              label: `${formatPlatform(platform)} - @${userRecord.campaignStats[campaignId][platform].username}`.slice(0, 100),
              value: platform
            }))
          );

        await interaction.reply({
          content: 'Choose which platform account this clip belongs to.',
          components: [new ActionRowBuilder().addComponents(select)],
          ephemeral: true
        });
    
        return;
        } catch (error) {
        console.error('submit_clip button error:', error);

        if (interaction.replied || interaction.deferred) {
          await interaction.followUp({
            content: '❌ Something went wrong opening Submit Clip.',
            ephemeral: true
          }).catch(() => {});
        } else {
          await interaction.reply({
            content: '❌ Something went wrong opening Submit Clip.',
            ephemeral: true
          }).catch(() => {});
        }
      }
    }

    if (interaction.isModalSubmit() && interaction.customId.startsWith('submit_clip_modal:')) {
      const campaignId = interaction.customId.split(':')[1];
      const campaign = CAMPAIGNS[campaignId];

      if (!campaign) {
        await interaction.reply({
          content: '❌ Campaign not found.',
          ephemeral: true
        });
        return;
      }

      const rawLinks = interaction.fields.getTextInputValue('clip_links');
      const links = extractLinksFromText(rawLinks);

      if (links.length === 0) {
        await interaction.reply({
          content: '❌ Please paste at least one link.',
          ephemeral: true
        });
        return;
      }

      if (links.length > 20) {
        await interaction.reply({
          content: '❌ You can submit up to 20 links at once.',
          ephemeral: true
        });
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
        await interaction.reply({
          content: '❌ User not found.',
          ephemeral: true
        });
        return;
      }

      const userRecord = ensureUser(data, member);

      if (!data.clips) data.clips = {};
  
      const campaignAccounts = userRecord.campaignStats?.[campaignId] || {};
      const platforms = Object.keys(campaignAccounts);

      if (platforms.length === 0) {
        await interaction.reply({
          content: '❌ You do not have any campaign account set for this campaign yet.',
          ephemeral: true
        });
        return;
      }

      if (platforms.length > 1) {
        await interaction.reply({
          content: '❌ You have multiple campaign accounts for this campaign. Add platform selection next before using multi-link submission.',
          ephemeral: true
        });
        return;
      }

      const platform = platforms[0];
      const platformStats = campaignAccounts[platform];
      const username = platformStats.username || 'unknown';

      const staffChannel = interaction.guild.channels.cache.get(campaign.staffChannelId);

      let submittedCount = 0;

      for (const videoUrl of links) {
        const clipId = makeClipId();

        const clip = {
          id: clipId,
          userId: interaction.user.id,
          campaignId,
          campaignName: campaign.name,
          platform,
          username,
          videoUrl,
          status: 'pending',
          views: 0,
          moneyMade: 0,
          submittedAt: new Date().toISOString(),
          staffMessageId: null
        };

        data.clips[clipId] = clip;
        platformStats.videosPosted += 1;

        if (staffChannel) {
          const sent = await staffChannel.send({
            content: renderClipStaffContent(clip),
            components: buildClipStaffButtons(clip.id, clip.status)
          }).catch(() => null);

          if (sent) {
            clip.staffMessageId = sent.id;
            data.clips[clipId] = clip;
          }
        }

        submittedCount += 1;
      }

      saveData(data);

      await interaction.reply({
        content: `✅ Submitted **${submittedCount}** clip(s) for **${campaign.name}** on **${formatPlatform(platform)}** (@${username}).`,
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
        await interaction.reply({
          content: '❌ Clip not found.',
          ephemeral: true
        });
        return;
      }

      const modal = new ModalBuilder()
        .setCustomId(`clip_approve_modal:${clipId}`)
        .setTitle('Approve Clip');

      modal.addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('clip_views')
            .setLabel('Views')
            .setPlaceholder('50000')
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('clip_payout')
            .setLabel('Payout in dollars')
            .setPlaceholder('80')
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
        )
      );
 
      await interaction.showModal(modal);
      return;
    }

    if (interaction.isModalSubmit() && interaction.customId.startsWith('clip_approve_modal:')) {
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

      const views = Number(interaction.fields.getTextInputValue('clip_views').trim());
      const payout = Number(interaction.fields.getTextInputValue('clip_payout').trim());

      if (Number.isNaN(views) || views < 0 || Number.isNaN(payout) || payout < 0) {
        await interaction.reply({
          content: '❌ Enter valid numbers for views and payout.',
          ephemeral: true
        });
        return;
      }

      const member = await interaction.guild.members.fetch(clip.userId).catch(() => null);
      if (!member) {
        await interaction.reply({
          content: '❌ User not found in server.',
          ephemeral: true
        });
        return;
      }

      const userRecord = ensureUser(data, member);
      const platformStats = ensureCampaignPlatformStats(
        userRecord,
        clip.campaignId,
        clip.platform,
        clip.username
      );

      // prevent double-approval
      if (clip.status === 'approved') {
        await interaction.reply({
          content: '❌ This clip is already approved.',
          ephemeral: true
        });
        return;
      }

      // if it was rejected before, undo rejected count
      if (clip.status === 'rejected') {
        platformStats.videosRejected = Math.max(0, (platformStats.videosRejected || 0) - 1);
      }

      clip.status = 'approved';
      clip.views = views;
      clip.moneyMade = payout;
      data.clips[clipId] = clip;

      platformStats.videosApproved += 1;
      platformStats.totalViews += views;
      platformStats.moneyMade += payout;

      saveData(data);
      await updateClipStaffMessage(interaction.guild, clip);

      await interaction.reply({
        content: `✅ Clip approved.\nViews: **${formatNumber(views)}**\nPayout: **$${payout}**`,
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

      const member = await interaction.guild.members.fetch(clip.userId).catch(() => null);
      if (!member) {
        await interaction.reply({
          content: '❌ User not found in server.',
          ephemeral: true
        });
        return;
      }

      const userRecord = ensureUser(data, member);
      const platformStats = ensureCampaignPlatformStats(
        userRecord,
        clip.campaignId,
        clip.platform,
        clip.username
      );

      if (clip.status === 'rejected') {
        await interaction.reply({
          content: '❌ This clip is already rejected.',
          ephemeral: true
        });
        return;
      }

      // if it was approved before, undo approved stats
      if (clip.status === 'approved') {
        platformStats.videosApproved = Math.max(0, (platformStats.videosApproved || 0) - 1);
        platformStats.totalViews = Math.max(0, (platformStats.totalViews || 0) - (clip.views || 0));
        platformStats.moneyMade = Math.max(0, (platformStats.moneyMade || 0) - (clip.moneyMade || 0));
      }

      clip.status = 'rejected';
      clip.views = 0;
      clip.moneyMade = 0;
      data.clips[clipId] = clip;

      platformStats.videosRejected += 1;

      saveData(data);
      await updateClipStaffMessage(interaction.guild, clip);

      await interaction.reply({
        content: `❌ Clip rejected.`,
        ephemeral: true
      });

      return;
    }

    if (interaction.isButton() && interaction.customId === 'social_view') {
      const data = loadData();
      const member = interaction.guild
        ? await interaction.guild.members.fetch(interaction.user.id).catch(() => null)
        : null;

      if (!member) {
        await interaction.reply({
          content: '❌ Could not load your accounts.',
          ephemeral: true
        });
        return;
      }

      const userRecord = ensureUser(data, member);
      saveData(data);

      const socials = userRecord.socials || [];

      if (socials.length === 0) {
        await interaction.reply({
          content: '📭 You have no linked social accounts.',
          ephemeral: true
        });
        return;
      }

      const lines = socials.map(acc => `• **${formatPlatform(acc.platform)}** — @${acc.username}`);

      await interaction.reply({
        content: `🔗 **Your Linked Accounts**\n\n${lines.join('\n')}`,
        ephemeral: true
      });

      return;
    }

    if (interaction.isButton() && interaction.customId === 'social_remove') {
      const data = loadData();
      const member = interaction.guild
        ? await interaction.guild.members.fetch(interaction.user.id).catch(() => null)
        : null;

      if (!member) {
        await interaction.reply({
          content: '❌ Could not load your accounts.',
          ephemeral: true
        });
        return;
      }

      const userRecord = ensureUser(data, member);
      saveData(data);

      const socials = userRecord.socials || [];

      if (socials.length === 0) {
        await interaction.reply({
          content: '📭 You have no linked accounts to remove.',
          ephemeral: true
        });
        return;
      }

      const select = new StringSelectMenuBuilder()
        .setCustomId('social_remove_select')
        .setPlaceholder('Select account to remove')
        .addOptions(
          socials.map((acc, index) => ({
            label: `${formatPlatform(acc.platform)} - @${acc.username}`,
            value: String(index)
          }))
        );

      await interaction.reply({
        content: 'Choose the account you want to remove.',
        components: [new ActionRowBuilder().addComponents(select)],
        ephemeral: true
      });

      return;
    }
    
    if (interaction.isStringSelectMenu() && interaction.customId === 'social_remove_select') {
      const data = loadData();
      const member = interaction.guild
        ? await interaction.guild.members.fetch(interaction.user.id).catch(() => null)
        : null;

      if (!member) {
        await interaction.reply({
          content: '❌ Could not load your accounts.',
          ephemeral: true
        });
        return;
      }

      const userRecord = ensureUser(data, member);
      const socials = userRecord.socials || [];
      const selectedIndex = Number(interaction.values[0]);

      if (Number.isNaN(selectedIndex) || !socials[selectedIndex]) {
        await interaction.reply({
          content: '❌ Invalid account selection.',
          ephemeral: true
        });
        return;
      }

      const selected = socials[selectedIndex];
      const key = normalizeSocialKey(selected.platform, selected.username);

      delete data.socialAccounts[key];
      userRecord.socials.splice(selectedIndex, 1);

      saveData(data);

      await interaction.reply({
        content: `✅ Removed **${formatPlatform(selected.platform)}** account: @${selected.username}`,
        ephemeral: true
      });

      return;
    }

    if (interaction.isButton() && interaction.customId.startsWith('social_staff_send_code:')) {
      if (!interaction.guild || !isAdmin(interaction.member)) {
        await interaction.reply({
          content: '❌ You are not allowed to do this.',
          ephemeral: true
        });
        return;
      }

      const requestId = interaction.customId.split(':')[1];
      const data = loadData();
      const request = data.socialLinkRequests[requestId];

      if (!request) {
        await interaction.reply({
          content: '❌ Request not found.',
          ephemeral: true
        });
        return;
      }

      const modal = new ModalBuilder()
        .setCustomId(`social_staff_code_modal:${requestId}`)
        .setTitle('Send Bio Code');

      modal.addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('social_staff_code_input')
            .setLabel('Enter code for bio')
            .setPlaceholder('SOC-4821')
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
        )
      );
 
      await interaction.showModal(modal);
      return;
    }
    
    if (interaction.isModalSubmit() && interaction.customId.startsWith('social_staff_code_modal:')) {
      if (!interaction.guild || !isAdmin(interaction.member)) {
        await interaction.reply({
          content: '❌ You are not allowed to do this.',
          ephemeral: true
        });
       return;
      }

      const requestId = interaction.customId.split(':')[1];
      const data = loadData();
      const request = data.socialLinkRequests[requestId];

      if (!request) {
        await interaction.reply({
          content: '❌ Request not found.',
          ephemeral: true
        });
        return;
      }

      const code = interaction.fields.getTextInputValue('social_staff_code_input').trim();
     
      request.bioCode = code;
      request.status = 'waiting_confirm';
      data.socialLinkRequests[requestId] = request;
      saveData(data);

      await updateSocialStaffMessage(interaction.guild, request);

      const sourceChannel = interaction.guild.channels.cache.get(request.sourceChannelId);
      if (!sourceChannel) {
        await interaction.reply({
          content: '❌ Original connect-accounts channel not found.',
          ephemeral: true
        });
        return;
      }

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`social_open_code:${requestId}`)
          .setLabel('Open Bio Code')
          .setStyle(ButtonStyle.Primary)
      );

      await sourceChannel.send({
        content: `<@${request.userId}> your ${formatPlatform(request.platform)} verification code is ready. Click the button below.`,
        components: [row]
      });

      await interaction.reply({
        content: `✅ Code sent to <@${request.userId}> in the connect-accounts channel.`,
        ephemeral: true
      });

      return;
    }

    if (interaction.isButton() && interaction.customId.startsWith('social_user_confirm:')) {
      const requestId = interaction.customId.split(':')[1];
      const data = loadData();
      const request = data.socialLinkRequests[requestId];

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
      data.socialLinkRequests[requestId] = request;
      saveData(data);

      await updateSocialStaffMessage(interaction.guild, request);

      await interaction.reply({
        content: '✅ Confirmation submitted. Staff will now review your bio and approve or reject the account.',
        ephemeral: true
      });

      return;
    }

    if (interaction.isButton() && interaction.customId.startsWith('social_open_code:')) {
      const requestId = interaction.customId.split(':')[1];
      const data = loadData();
      const request = data.socialLinkRequests[requestId];

      if (!request) {
        await interaction.reply({
          content: '❌ Request not found.',
          ephemeral: true
        });
        return;
      }

      if (interaction.user.id !== request.userId) {
        await interaction.reply({
          content: '❌ This verification code is not for you.',
          ephemeral: true
        });
        return;
      }

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`social_user_confirm:${requestId}`)
          .setLabel('Confirm Bio Updated')
          .setStyle(ButtonStyle.Success)
      );

      await interaction.reply({
        content: `📩 Add this code to your **${formatPlatform(request.platform)}** bio for **@${request.username}**:\n\n\`${request.bioCode}\`\n\nThen click **Confirm Bio Updated** below.`,
        components: [row],
        ephemeral: true
      });

      return;
    }

    if (interaction.isButton() && interaction.customId.startsWith('social_staff_accept:')) {
      if (!interaction.guild || !isAdmin(interaction.member)) {
        await interaction.reply({
          content: '❌ You are not allowed to do this.',
          ephemeral: true
        });
        return;
      }

      const requestId = interaction.customId.split(':')[1];
      const data = loadData();
      const request = data.socialLinkRequests[requestId];

      if (!request) {
        await interaction.reply({
          content: '❌ Request not found.',
          ephemeral: true
        });
        return;
      }

      const member = await interaction.guild.members.fetch(request.userId).catch(() => null);
      if (!member) {
        await interaction.reply({
          content: '❌ User not found in server.',
          ephemeral: true
        });
        return;
      }
  
      ensureUser(data, member);
      ensureUserSocials(data, request.userId);

      const key = normalizeSocialKey(request.platform, request.username);
      const existing = data.socialAccounts[key];

      if (existing && existing.ownerId !== request.userId) {
        await interaction.reply({
          content: '❌ This account was linked by another user before approval.',
          ephemeral: true
        });
        return;
      }

      data.socialAccounts[key] = {
        ownerId: request.userId,
        platform: request.platform,
        username: request.username,
        addedAt: new Date().toISOString()
      };
   
      const socials = data.users[request.userId].socials;
      const alreadyExists = socials.some(
        acc =>
          acc.platform === request.platform &&
          acc.username.toLowerCase() === request.username.toLowerCase()
      );

      if (!alreadyExists) {
        socials.push({
          platform: request.platform,
          username: request.username
        });
      }

      request.status = 'approved';
      data.socialLinkRequests[requestId] = request;
      saveData(data);

      await updateSocialStaffMessage(interaction.guild, request);

      await interaction.reply({
        content: `✅ Approved ${formatPlatform(request.platform)} account: @${request.username}`,
        ephemeral: true
      });

      return;
    }

    if (interaction.isButton() && interaction.customId.startsWith('social_staff_reject:')) {
      if (!interaction.guild || !isAdmin(interaction.member)) {
        await interaction.reply({
          content: '❌ You are not allowed to do this.',
          ephemeral: true
        });
        return;
      }

      const requestId = interaction.customId.split(':')[1];
      const data = loadData();
      const request = data.socialLinkRequests[requestId];

      if (!request) {
        await interaction.reply({
          content: '❌ Request not found.',
          ephemeral: true
        });
        return;
      }

      request.status = 'rejected';
      data.socialLinkRequests[requestId] = request;
      saveData(data);
 
      await updateSocialStaffMessage(interaction.guild, request);

      await interaction.reply({
        content: `❌ Rejected ${formatPlatform(request.platform)} account: @${request.username}`,
        ephemeral: true
      });

      return;
    }

    if (interaction.isButton() && interaction.customId.startsWith('campaign_stats:')) {
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
      const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);

      if (!member) {
        await interaction.reply({
          content: '❌ Could not load your stats.',
          ephemeral: true
        });
        return;
      }

      const userRecord = ensureUser(data, member);
      const embed = buildCampaignStatsEmbed(userRecord, campaignId, campaign.name);
      saveData(data);

      await interaction.reply({
        embeds: [embed],
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
            label: `${formatPlatform(clip.platform)} - ${clip.username}`.slice(0, 100),
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
        await interaction.reply({
          content: '❌ Clip not found.',
          ephemeral: true
        });
        return;
      }

      const clip = data.clips[clipId];

      if (clip.userId !== interaction.user.id) {
        await interaction.reply({
          content: '❌ You can only remove your own clips.',
          ephemeral: true
        });
        return;
      }

      const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
      if (!member) {
        await interaction.reply({
          content: '❌ User not found.',
          ephemeral: true
        });
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
        }

        if (clip.status === 'rejected') {
          platformStats.videosRejected = Math.max(0, (platformStats.videosRejected || 0) - 1);
        }
      }

      delete data.clips[clipId];
      saveData(data);

      await interaction.reply({
        content: `✅ Removed clip: ${clip.videoUrl}`,
        ephemeral: true
      });
 
      return;
    }

    if (interaction.isButton() && interaction.customId.startsWith('manage_account:')) {
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
      const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);

      if (!member) {
        await interaction.reply({
          content: '❌ Could not load your account.',
          ephemeral: true
        });
        return;
      }

      const userRecord = ensureUser(data, member);
      const accountText = renderCampaignAccounts(userRecord, campaignId);

      await interaction.reply({
        content:
          `⚙️ **Manage Campaign Account - ${campaign.name}**\n\n` +
          `**Current campaign accounts:**\n${accountText}\n\n` +
          `Use the campaign join flow to add a new platform account for this campaign.`,
        ephemeral: true
      });

      return;
    }

    if (interaction.isButton() && interaction.customId.startsWith('leave_campaign:')) {
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
      const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);

      if (!member) {
        await interaction.reply({
          content: '❌ User not found.',
          ephemeral: true
        });
        return;
      }

      const userRecord = ensureUser(data, member);

      // remove campaign from user's campaign list
      if (Array.isArray(userRecord.campaigns)) {
        userRecord.campaigns = userRecord.campaigns.filter(c => {
          if (typeof c === 'string') return c !== campaignId;
          return c.campaignId !== campaignId;
        });
      }

      // remove campaign-specific stats
      if (userRecord.campaignStats && userRecord.campaignStats[campaignId]) {
        delete userRecord.campaignStats[campaignId];
      }

      // remove clips for this user in this campaign
      if (data.clips) {
        for (const [clipId, clip] of Object.entries(data.clips)) {
          if (clip.userId === interaction.user.id && clip.campaignId === campaignId) {
            delete data.clips[clipId];
          }
        }
      }

      saveData(data);

      // remove role
      const campaignRole = interaction.guild.roles.cache.get(campaign.roleId);
      if (campaignRole && member.roles.cache.has(campaignRole.id)) {
        await member.roles.remove(campaignRole).catch(() => {});
      }

      await interaction.reply({
        content: `✅ You left **${campaign.name}**. Your campaign stats and submitted clips for this campaign were removed.`,
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

      const rolesToAdd = [];
      const verifiedRole = interaction.guild.roles.cache.get(VERIFIED_ROLE_ID);
      const clipperRole = interaction.guild.roles.cache.get(CLIPPER_ROLE_ID);

      if (verifiedRole && !interaction.member.roles.cache.has(VERIFIED_ROLE_ID)) {
        rolesToAdd.push(verifiedRole);
      }

      if (clipperRole && !interaction.member.roles.cache.has(CLIPPER_ROLE_ID)) {
        rolesToAdd.push(clipperRole);
      }

      if (rolesToAdd.length > 0) {
        await interaction.member.roles.add(rolesToAdd).catch(() => {});
      }

      await interaction.reply({
        content: '✅ Verification successful. You now have access.',
        ephemeral: true
      });
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
        .setCustomId(`campaign_platform:${campaign.id}`)
        .setPlaceholder('Select a platform')
        .addOptions(
          campaign.allowedPlatforms.map(p => ({
            label: formatPlatform(p),
            value: p
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
          content: '❌ Something went wrong.',
          ephemeral: true
        }).catch(() => {});
      } else {
        await interaction.reply({
          content: '❌ Something went wrong.',
          ephemeral: true
        }).catch(() => {});
      }
    }
  }
});

client.login(process.env.TOKEN);