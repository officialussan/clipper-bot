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
        socialLinkRequests: {}
      }, null, 2)
    );
  }

  const raw = JSON.parse(fs.readFileSync(dataFilePath, 'utf8'));
  if (!raw.users) raw.users = {};
  if (!raw.applications) raw.applications = {};
  if (!raw.socialAccounts) raw.socialAccounts = {};
  if (!raw.socialLinkRequests) raw.socialLinkRequests = {};
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
      }
    };
  }

  if (!data.users[member.id].stats) {
    data.users[member.id].stats = {
      videosPosted: 0,
      videosApproved: 0,
      videosRejected: 0,
      totalViews: 0,
      moneyMade: 0
    };
  }

  if (!data.users[member.id].socials) {
    data.users[member.id].socials = [];
  }

  data.users[member.id].discordName = member.user.username;
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

function renderStaffContent(app) {
  return `📥 **Campaign Application**

User: <@${app.userId}>
Campaign: ${app.campaignName}
Platform: ${formatPlatform(app.platform)}
Username: @${app.username}
Status: ${getStatusLabel(app.status)}
${app.bioCode ? `Code: \`${app.bioCode}\`` : ''}`;
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
        .setDisabled(page >= totalPages),
      new ButtonBuilder()
        .setCustomId('leaderboard_mystats')
        .setLabel('My Stats')
        .setStyle(ButtonStyle.Primary)
    )
  ];
}

function getUserRank(data, userId) {
  const users = getLeaderboardUsers(data);
  const index = users.findIndex(user => user.discordId === userId);
  return index === -1 ? null : index + 1;
}

function buildMyStatsEmbed(userRecord, rank) {
  const stats = userRecord.stats || {
    videosPosted: 0,
    videosApproved: 0,
    videosRejected: 0,
    totalViews: 0,
    moneyMade: 0
  };

  const pendingVideos = Math.max(
    stats.videosPosted - stats.videosApproved - stats.videosRejected,
    0
  );

  const viewsNeeded = Math.max(5000 - stats.totalViews, 0);

  const payoutText =
    stats.totalViews >= 5000
      ? `Eligible for payout.\n**Money Made:** $${stats.moneyMade}`
      : `You need **${formatNumber(viewsNeeded)}** more views to be eligible for payout.`;

  return new EmbedBuilder()
    .setColor(0x7ED957)
    .setDescription(
      `🎬 **Campaign Stats - Michael Carbonara Campaign**\n\n` +
      `🏆 **Leaderboard**\n` +
      `${rank ? `#${rank}` : 'No Placement'}\n\n` +
      `📊 **Total Views**\n` +
      `${formatNumber(stats.totalViews)}\n\n` +
      `💰 **Payout**\n` +
      `${payoutText}\n\n` +
      `🟢 **Approved Videos**\n` +
      `${stats.videosApproved}\n\n` +
      `🟡 **Pending Videos**\n` +
      `${pendingVideos}\n\n` +
      `🔴 **Rejected Videos**\n` +
      `${stats.videosRejected}\n\n` +
      `🎞️ **View Your Clips**\n` +
      `Click the button below to check the stats of all your submitted videos.`
    )
    .setFooter({
      text: `Last update | ${new Date().toLocaleString()}`
    });
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

    // SAFE REPLY FUNCTION (prevents crashes)
    const safeReply = async (payload) => {
      if (interaction.replied || interaction.deferred) {
        return interaction.followUp(payload);
      } else {
        return interaction.reply(payload);
      }
    };

    // =========================
    // LEADERBOARD NAVIGATION
    // =========================

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

    // =========================
    // MY STATS
    // =========================

    if (interaction.isButton() && interaction.customId === 'leaderboard_mystats') {
      const data = loadData();

      const member = await interaction.guild?.members.fetch(interaction.user.id).catch(() => null);
      if (!member) {
        return safeReply({ content: '❌ Could not load your stats.', ephemeral: true });
      }

      const userRecord = ensureUser(data, member);
      saveData(data);

      const rank = getUserRank(data, interaction.user.id);
      const embed = buildMyStatsEmbed(userRecord, rank);

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('view_your_clips')
          .setLabel('View Your Clips')
          .setStyle(ButtonStyle.Secondary)
      );

      return safeReply({
        embeds: [embed],
        components: [row],
        ephemeral: true
      });
    }

    if (interaction.isButton() && interaction.customId === 'view_your_clips') {
      return safeReply({
        content: '📂 Clip tracking coming soon.',
        ephemeral: true
      });
    }

    // =========================
    // SOCIAL LINK FLOW
    // =========================

    if (interaction.isButton() && interaction.customId === 'social_link') {
      const select = new StringSelectMenuBuilder()
        .setCustomId('social_link_platform')
        .setPlaceholder('Select platform')
        .addOptions([
          { label: 'TikTok', value: 'tiktok' },
          { label: 'Instagram', value: 'instagram' },
          { label: 'YouTube', value: 'youtube' }
        ]);

      return safeReply({
        content: 'Choose platform',
        components: [new ActionRowBuilder().addComponents(select)],
        ephemeral: true
      });
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

      return interaction.showModal(modal);
    }

    // =========================
    // SUBMIT LINK REQUEST
    // =========================

    if (interaction.isModalSubmit() && interaction.customId.startsWith('social_link_modal:')) {
      const platform = interaction.customId.split(':')[1];
      const username = normalizeUsername(
        interaction.fields.getTextInputValue('social_username')
      );

      if (!username) {
        return safeReply({ content: '❌ Username required', ephemeral: true });
      }

      const data = loadData();

      // SAFETY INIT
      if (!data.socialAccounts) data.socialAccounts = {};
      if (!data.socialLinkRequests) data.socialLinkRequests = {};

      const key = normalizeSocialKey(platform, username);

      if (data.socialAccounts[key]) {
        return safeReply({
          content: `❌ Already linked by someone.`,
          ephemeral: true
        });
      }

      const requestId = `req_${Date.now()}`;

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
        sourceChannelId: interaction.channelId // ✅ FIXED
      };

      const staffChannel = interaction.guild.channels.cache.get(process.env.SOCIAL_STAFF_CHANNEL_ID);

      if (!staffChannel) {
        return safeReply({ content: '❌ Staff channel missing', ephemeral: true });
      }

      const msg = await staffChannel.send({
        content: `📥 Social Request\nUser: <@${request.userId}>\nPlatform: ${platform}\nUsername: @${username}`,
        components: [
          new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId(`social_staff_send_code:${requestId}`)
              .setLabel('Send Code')
              .setStyle(ButtonStyle.Primary)
          )
        ]
      });

      request.staffMessageId = msg.id;
      data.socialLinkRequests[requestId] = request;
      saveData(data);

      return safeReply({
        content: `✅ Request submitted.`,
        ephemeral: true
      });
    }

    // =========================
    // STAFF SEND CODE
    // =========================

    if (interaction.isButton() && interaction.customId.startsWith('social_staff_send_code:')) {
      if (!isAdmin(interaction.member)) {
        return safeReply({ content: '❌ Not allowed', ephemeral: true });
      }

      const requestId = interaction.customId.split(':')[1];

      const modal = new ModalBuilder()
        .setCustomId(`social_staff_code_modal:${requestId}`)
        .setTitle('Send Code');

      modal.addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('code')
            .setLabel('Code')
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
        )
      );

      return interaction.showModal(modal);
    }

    // =========================
    // STAFF SUBMIT CODE
    // =========================

    if (interaction.isModalSubmit() && interaction.customId.startsWith('social_staff_code_modal:')) {
      if (!isAdmin(interaction.member)) {
        return safeReply({ content: '❌ Not allowed', ephemeral: true });
      }

      const requestId = interaction.customId.split(':')[1];
      const data = loadData();

      const request = data.socialLinkRequests?.[requestId];
      if (!request) {
        return safeReply({ content: '❌ Not found', ephemeral: true });
      }

      const code = interaction.fields.getTextInputValue('code');

      request.bioCode = code;
      request.status = 'waiting_confirm';
      saveData(data);

      const sourceChannel = interaction.guild.channels.cache.get(request.sourceChannelId);

      await sourceChannel.send({
        content: `<@${request.userId}> Add this code:\n\`${code}\``,
        components: [
          new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId(`social_user_confirm:${requestId}`)
              .setLabel('Confirm Bio Updated')
              .setStyle(ButtonStyle.Success)
          )
        ]
      });

      return safeReply({ content: '✅ Code sent', ephemeral: true });
    }

  } catch (err) {
    console.error('Interaction error:', err);

    if (interaction.isRepliable()) {
      try {
        if (interaction.replied || interaction.deferred) {
          await interaction.followUp({ content: '❌ Error occurred', ephemeral: true });
        } else {
          await interaction.reply({ content: '❌ Error occurred', ephemeral: true });
        }
      } catch {}
    }
  }
});

client.login(process.env.TOKEN);