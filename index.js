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
  PermissionsBitField
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
    name: 'eMoney Shopping',
    allowedPlatforms: ['tiktok', 'instagram', 'youtube', 'facebook'],
    staffChannelId: process.env.EMONEY_STAFF_CHANNEL_ID,
    roleId: process.env.EMONEY_CAMPAIGN_ROLE_ID,
    panelText: `🛍️ **Earn Money Posting Clips & Edits – eMoney Shopping**

Earn money by posting clips and edits of *eMoney Shopping coupons* — **“The Resell Universe.”**

All you have to do is **register for the campaign below** and follow the guidelines to start earning.

📊 **Campaign Overview**
• Clips & edits that follow campaign guidelines
• Platforms: TikTok, Instagram, YouTube, Facebook
• Target: Tier 1 countries
• Minimum video length: 20 seconds

💰 **Earnings**
• $1 per 1,000 views
• $100 per 100,000 views
• $300 per 1,000,000 views

• **Budget:** $15,000 *(up to 15M total views)*
• **Minimum payout:** **$10**

🚀 **Join the Campaign**
Click the button below to start clipping and earning:`
  },

  insidious: {
    id: 'insidious',
    name: 'Insidious',
    allowedPlatforms: ['tiktok', 'instagram'],
    staffChannelId: process.env.INSIDIOUS_STAFF_CHANNEL_ID,
    roleId: process.env.INSIDIOUS_CAMPAIGN_ROLE_ID,
    panelText: `🎬 **Earn Money Posting Clips – Insidious**

Choose a platform, submit your username, wait for staff code, add it to your bio, then confirm.`
  }
};

function loadData() {
  if (!fs.existsSync(dataFilePath)) {
    fs.writeFileSync(
      dataFilePath,
      JSON.stringify(
        {
          users: {},
          applications: {}
        },
        null,
        2
      )
    );
  }

  const data = JSON.parse(fs.readFileSync(dataFilePath, 'utf8'));
  if (!data.users) data.users = {};
  if (!data.applications) data.applications = {};
  return data;
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
      stats: {
        videosPosted: 0,
        videosApproved: 0,
        videosRejected: 0,
        totalViews: 0,
        moneyMade: 0
      }
    };
  }

  data.users[member.id].discordName = member.user.username;
  return data.users[member.id];
}

function isAdmin(member) {
  return member.permissions.has(PermissionsBitField.Flags.Administrator);
}

function formatPlatform(platform) {
  const map = {
    tiktok: 'TikTok',
    instagram: 'Instagram',
    youtube: 'YouTube',
    facebook: 'Facebook'
  };
  return map[platform] || platform;
}

function normalizeUsername(username) {
  return String(username).trim().replace(/^@+/, '');
}

function makeApplicationId() {
  return `app_${Date.now()}_${Math.floor(Math.random() * 100000)}`;
}

function renderStaffContent(app) {
  return `📥 **New Campaign Application**

**User:** <@${app.userId}>
**Campaign:** ${app.campaignName}
**Platform:** ${formatPlatform(app.platform)}
**Username:** @${app.username}
**Status:** ${app.statusLabel}${app.bioCode ? `

**Bio Code:** \`${app.bioCode}\`` : ''}`;
}

function getStatusLabel(status) {
  const map = {
    pending: 'Pending',
    waiting_confirm: 'Waiting for user confirmation',
    verifying: 'Verifying',
    approved: 'Approved',
    rejected: 'Rejected'
  };
  return map[status] || status;
}

function buildStaffButtons(appId, status) {
  if (status === 'pending') {
    return [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`staff_send_code:${appId}`)
          .setLabel('Send Code')
          .setStyle(ButtonStyle.Primary)
      )
    ];
  }

  if (status === 'waiting_confirm') {
    return [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`staff_waiting:${appId}`)
          .setLabel('Waiting for user confirm')
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(true)
      )
    ];
  }

  if (status === 'verifying') {
    return [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`staff_accept:${appId}`)
          .setLabel('Accept')
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId(`staff_reject:${appId}`)
          .setLabel('Reject')
          .setStyle(ButtonStyle.Danger)
      )
    ];
  }

  return [];
}

async function updateStaffMessage(guild, app) {
  const channel = guild.channels.cache.get(app.staffChannelId);
  if (!channel) return;

  try {
    const msg = await channel.messages.fetch(app.staffMessageId);
    await msg.edit({
      content: renderStaffContent({
        ...app,
        statusLabel: getStatusLabel(app.status)
      }),
      components: buildStaffButtons(app.id, app.status)
    });
  } catch (error) {
    console.log('Could not update staff message:', error.message);
  }
}

client.once(Events.ClientReady, readyClient => {
  console.log(`Bot is online as ${readyClient.user.tag}`);
});

client.on(Events.MessageCreate, async message => {
  try {
    if (message.author.bot) return;
    if (!message.guild) return;

    // VERIFY PANEL
    if (message.content === '!verifypanel') {
      if (!isAdmin(message.member)) return;

      await message.delete().catch(() => {});

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('verify_human')
          .setLabel("I'm not a robot")
          .setStyle(ButtonStyle.Success)
      );

      await message.channel.send({
        content: `✅ **Verification Required**

Click the button below to verify that you're human.`,
        components: [row]
      });

      return;
    }

    // CAMPAIGN PANEL
    if (message.content.startsWith('!campaignpanel')) {
      if (!isAdmin(message.member)) return;

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
    // VERIFY BUTTON
    if (interaction.isButton() && interaction.customId === 'verify_human') {
      if (!interaction.guild) {
        await interaction.reply({ content: '❌ This can only be used in the server.', ephemeral: true });
        return;
      }

      const role = interaction.guild.roles.cache.get(VERIFIED_ROLE_ID);
      if (!role) {
        await interaction.reply({ content: '❌ Verified role not found.', ephemeral: true });
        return;
      }

      const data = loadData();
      const userRecord = ensureUser(data, interaction.member);
      userRecord.verified = true;
      saveData(data);

      if (!interaction.member.roles.cache.has(VERIFIED_ROLE_ID)) {
        await interaction.member.roles.add(role);
      }

      await interaction.reply({
        content: '✅ Verification successful. You now have access.',
        ephemeral: true
      });
      return;
    }

    // JOIN CAMPAIGN BUTTON
if (interaction.isButton() && interaction.customId.startsWith('join_campaign:')) {
  try {
    console.log("JOIN BUTTON CLICKED:", interaction.customId);

    if (!interaction.guild) {
      await interaction.reply({
        content: "❌ This can only be used in the server.",
        ephemeral: true
      });
      return;
    }

    const campaignId = interaction.customId.split(':')[1];
    console.log("CAMPAIGN ID:", campaignId);

    const campaign = CAMPAIGNS[campaignId];
    console.log("CAMPAIGN CONFIG:", campaign);

    if (!campaign) {
      await interaction.reply({
        content: "❌ Campaign not found.",
        ephemeral: true
      });
      return;
    }

    const allowed = campaign.allowedPlatforms;
    console.log("ALLOWED PLATFORMS:", allowed);

    if (!allowed || allowed.length === 0) {
      await interaction.reply({
        content: "❌ No platforms configured for this campaign.",
        ephemeral: true
      });
      return;
    }

    if (allowed.length === 1) {
      const platform = allowed[0];

      const modal = new ModalBuilder()
        .setCustomId(`campaign_username:${campaign.id}:${platform}`)
        .setTitle(`Join ${campaign.name}`);

      const usernameInput = new TextInputBuilder()
        .setCustomId('campaign_username_input')
        .setLabel(`Enter your ${formatPlatform(platform)} username`)
        .setPlaceholder('username')
        .setStyle(TextInputStyle.Short)
        .setRequired(true);

      modal.addComponents(
        new ActionRowBuilder().addComponents(usernameInput)
      );

      await interaction.showModal(modal);
      return;
    }

    const options = allowed.map(platform => ({
      label: formatPlatform(platform),
      value: platform
    }));

    const select = new StringSelectMenuBuilder()
      .setCustomId(`campaign_platform:${campaign.id}`)
      .setPlaceholder('Select a platform')
      .addOptions(options);

    await interaction.reply({
      content: `Choose the platform you want to use for **${campaign.name}**.`,
      components: [new ActionRowBuilder().addComponents(select)],
      ephemeral: true
    });
    return;
  } catch (err) {
    console.error("JOIN CAMPAIGN ERROR:", err);

    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({
        content: "❌ Something broke while opening the campaign form.",
        ephemeral: true
      }).catch(() => {});
    }
    return;
  }
}

    // PLATFORM SELECT
    if (interaction.isStringSelectMenu() && interaction.customId.startsWith('campaign_platform:')) {
      const campaignId = interaction.customId.split(':')[1];
      const campaign = CAMPAIGNS[campaignId];
      const platform = interaction.values[0];

      if (!campaign) {
        await interaction.reply({ content: '❌ Campaign not found.', ephemeral: true });
        return;
      }

      const modal = new ModalBuilder()
        .setCustomId(`campaign_username:${campaign.id}:${platform}`)
        .setTitle(`Join ${campaign.name}`);

      const usernameInput = new TextInputBuilder()
        .setCustomId('campaign_username_input')
        .setLabel(`Enter your ${formatPlatform(platform)} username`)
        .setPlaceholder('username')
        .setStyle(TextInputStyle.Short)
        .setRequired(true);

      modal.addComponents(
        new ActionRowBuilder().addComponents(usernameInput)
      );

      await interaction.showModal(modal);
      return;
    }

    // USERNAME MODAL
    if (interaction.isModalSubmit() && interaction.customId.startsWith('campaign_username:')) {
      const [, campaignId, platform] = interaction.customId.split(':');
      const campaign = CAMPAIGNS[campaignId];

      if (!campaign) {
        await interaction.reply({ content: '❌ Campaign not found.', ephemeral: true });
        return;
      }

      const username = normalizeUsername(
        interaction.fields.getTextInputValue('campaign_username_input')
      );

      if (!username) {
        await interaction.reply({ content: '❌ Username cannot be empty.', ephemeral: true });
        return;
      }

      const appId = makeApplicationId();
      const data = loadData();
      ensureUser(data, interaction.member);

      const staffChannel = interaction.guild.channels.cache.get(campaign.staffChannelId);
      if (!staffChannel) {
        await interaction.reply({ content: '❌ Staff channel not found for this campaign.', ephemeral: true });
        return;
      }

      const application = {
        id: appId,
        guildId: interaction.guild.id,
        userId: interaction.user.id,
        campaignId: campaign.id,
        campaignName: campaign.name,
        platform,
        username,
        status: 'pending',
        bioCode: null,
        createdAt: new Date().toISOString(),
        staffChannelId: campaign.staffChannelId,
        staffMessageId: null
      };

      const sent = await staffChannel.send({
        content: renderStaffContent({
          ...application,
          statusLabel: getStatusLabel(application.status)
        }),
        components: buildStaffButtons(application.id, application.status)
      });

      application.staffMessageId = sent.id;
      data.applications[appId] = application;
      saveData(data);

      await interaction.reply({
        content: `✅ Your application for **${campaign.name}** was submitted.\nStatus: **Pending**\nPlease wait for staff to send your bio code.`,
        ephemeral: true
      });
      return;
    }

    // STAFF SEND CODE BUTTON
    if (interaction.isButton() && interaction.customId.startsWith('staff_send_code:')) {
      if (!interaction.guild || !isAdmin(interaction.member)) {
        await interaction.reply({ content: '❌ You are not allowed to do this.', ephemeral: true });
        return;
      }

      const appId = interaction.customId.split(':')[1];
      const data = loadData();
      const app = data.applications[appId];

      if (!app) {
        await interaction.reply({ content: '❌ Application not found.', ephemeral: true });
        return;
      }

      const modal = new ModalBuilder()
        .setCustomId(`staff_code_modal:${appId}`)
        .setTitle('Send Bio Code');

      const codeInput = new TextInputBuilder()
        .setCustomId('staff_code_input')
        .setLabel('Enter code for user bio')
        .setPlaceholder('EMO-4821')
        .setStyle(TextInputStyle.Short)
        .setRequired(true);

      modal.addComponents(
        new ActionRowBuilder().addComponents(codeInput)
      );

      await interaction.showModal(modal);
      return;
    }

    // STAFF CODE MODAL
    if (interaction.isModalSubmit() && interaction.customId.startsWith('staff_code_modal:')) {
      if (!interaction.guild || !isAdmin(interaction.member)) {
        await interaction.reply({ content: '❌ You are not allowed to do this.', ephemeral: true });
        return;
      }

      const appId = interaction.customId.split(':')[1];
      const data = loadData();
      const app = data.applications[appId];

      if (!app) {
        await interaction.reply({ content: '❌ Application not found.', ephemeral: true });
        return;
      }

      const code = interaction.fields.getTextInputValue('staff_code_input').trim();
      app.bioCode = code;
      app.status = 'waiting_confirm';
      data.applications[appId] = app;
      saveData(data);

      const user = await client.users.fetch(app.userId).catch(() => null);

      if (!user) {
        await interaction.reply({
          content: '❌ Could not DM the user.',
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

      try {
        await user.send({
          content: `📩 **Campaign Bio Code**

**Campaign:** ${app.campaignName}
**Platform:** ${formatPlatform(app.platform)}
**Username:** @${app.username}

Add this code to your account bio:

\`${code}\`

When you finish, click the button below.`,
          components: [confirmRow]
        });
      } catch (error) {
        await interaction.reply({
          content: '❌ Could not DM the user. Ask them to enable DMs and try again.',
          ephemeral: true
        });
        return;
      }

      await updateStaffMessage(interaction.guild, app);

      await interaction.reply({
        content: `✅ Code sent to <@${app.userId}> successfully.`,
        ephemeral: true
      });
      return;
    }

    // USER CONFIRM BUTTON
    if (interaction.isButton() && interaction.customId.startsWith('user_confirm:')) {
      const appId = interaction.customId.split(':')[1];
      const data = loadData();
      const app = data.applications[appId];

      if (!app) {
        await interaction.reply({ content: '❌ Application not found.', ephemeral: true });
        return;
      }

      if (interaction.user.id !== app.userId) {
        await interaction.reply({ content: '❌ This confirmation is not for you.', ephemeral: true });
        return;
      }

      app.status = 'verifying';
      data.applications[appId] = app;
      saveData(data);

      const guild = client.guilds.cache.get(app.guildId);
      if (guild) {
        await updateStaffMessage(guild, app);
      }

      await interaction.reply({
        content: `✅ Your confirmation was submitted.\nStatus: **Verifying**\nStaff will now review your bio and make a final decision.`,
        ephemeral: true
      });
      return;
    }

    // STAFF ACCEPT
    if (interaction.isButton() && interaction.customId.startsWith('staff_accept:')) {
      if (!interaction.guild || !isAdmin(interaction.member)) {
        await interaction.reply({ content: '❌ You are not allowed to do this.', ephemeral: true });
        return;
      }

      const appId = interaction.customId.split(':')[1];
      const data = loadData();
      const app = data.applications[appId];

      if (!app) {
        await interaction.reply({ content: '❌ Application not found.', ephemeral: true });
        return;
      }

      const member = await interaction.guild.members.fetch(app.userId).catch(() => null);
      if (!member) {
        await interaction.reply({ content: '❌ User not found in server.', ephemeral: true });
        return;
      }

      const clipperRole = interaction.guild.roles.cache.get(CLIPPER_ROLE_ID);
      const campaignRole = interaction.guild.roles.cache.get(CAMPAIGNS[app.campaignId].roleId);

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

      saveData(data);
      await updateStaffMessage(interaction.guild, app);

      try {
        await member.send(`✅ You were approved for **${app.campaignName}**.`);
      } catch (error) {
        console.log('Could not DM approved user.');
      }

      await interaction.reply({
        content: `✅ <@${app.userId}> was approved for **${app.campaignName}**.`,
        ephemeral: true
      });
      return;
    }

    // STAFF REJECT
    if (interaction.isButton() && interaction.customId.startsWith('staff_reject:')) {
      if (!interaction.guild || !isAdmin(interaction.member)) {
        await interaction.reply({ content: '❌ You are not allowed to do this.', ephemeral: true });
        return;
      }

      const appId = interaction.customId.split(':')[1];
      const data = loadData();
      const app = data.applications[appId];

      if (!app) {
        await interaction.reply({ content: '❌ Application not found.', ephemeral: true });
        return;
      }

      app.status = 'rejected';
      data.applications[appId] = app;
      saveData(data);

      await updateStaffMessage(interaction.guild, app);

      const member = await interaction.guild.members.fetch(app.userId).catch(() => null);
      if (member) {
        try {
          await member.send(`❌ Your application for **${app.campaignName}** was rejected.`);
        } catch (error) {
          console.log('Could not DM rejected user.');
        }
      }

      await interaction.reply({
        content: `❌ <@${app.userId}> was rejected for **${app.campaignName}**.`,
        ephemeral: true
      });
      return;
    }
  } catch (error) {
    console.error('Interaction error:', error);

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