require('dotenv').config();
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const {
  Client,
  GatewayIntentBits,
  ActionRowBuilder,
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  LabelBuilder,
  TextInputBuilder,
  TextInputStyle,
  StringSelectMenuBuilder,
  Events,
  ChannelType,
  PermissionsBitField,
  PermissionFlagsBits,
  EmbedBuilder,
  Status,
  MessageFlags
} = require('discord.js');

const cron = require("node-cron");

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
const GET_HELP_CHANNEL_ID = process.env.GET_HELP_CHANNEL_ID || '1492888887452762313';
const DEMOGRAPHICS_UPLOAD_CATEGORY_ID = process.env.DEMOGRAPHICS_UPLOAD_CATEGORY_ID;
const PAYMENT_STAFF_CHANNEL_ID = process.env.PAYMENT_STAFF_CHANNEL_ID;
const LEADERBOARD_CHANNEL_ID = '1495692728431018015';
const LEADERBOARD_MESSAGE_ID = '1508380113056567417';
const MONSTERLAB_API_KEY = process.env.MONSTERLAB_API_KEY;
const INSTAGRAM_APP_ID = process.env.INSTAGRAM_APP_ID;
const INSTAGRAM_APP_SECRET = process.env.INSTAGRAM_APP_SECRET;
const INSTAGRAM_TEST_ACCESS_TOKEN = process.env.INSTAGRAM_TEST_ACCESS_TOKEN;
const INSTAGRAM_REDIRECT_URI = process.env.INSTAGRAM_REDIRECT_URI;
const INSTAGRAM_API_VERSION = process.env.INSTAGRAM_API_VERSION || 'v24.0';
const APIFY_API_TOKEN = process.env.APIFY_API_TOKEN;
const APIFY_INSTAGRAM_ACTOR = 'apify~instagram-reel-scraper';
const APIFY_INSTAGRAM_PROFILE_ACTOR = 'apify~instagram-profile-scraper';
const PRICE_PER_PROXY = 7;
const FINISHED_CAMPAIGNS_CATEGORY_ID = '1520064994274709747';
const STAFF_CONTROL_CHANNEL_ID = "1521116369909710889";
const GOAL_CHANNEL_ID = process.env.GOAL_CHANNEL_ID;
const PAID_CHANNEL_ID = process.env.PAID_CHANNEL_ID;
const AVAILABLE_CHANNEL_ID = process.env.AVAILABLE_CHANNEL_ID;
const VIEWS_CHANNEL_ID = process.env.VIEWS_CHANNEL_ID;
const ACTIVE_CAMPAIGNS_CHANNEL_ID = process.env.ACTIVE_CAMPAIGNS_CHANNEL_ID;
const CLIP_TRACK_INTERVAL_MS = 3 * 60 * 60 * 1000;
const CLIP_TRACK_SCHEDULER_MS = 10 * 60 * 1000;
const CLIP_TRACK_RETRY_MS = 15 * 60 * 1000;
const GLOBAL_SOCIAL_VERIFICATION_TTL_MS = 30 * 60 * 1000;
const INSTAGRAM_PROFILE_VERIFICATION_COOLDOWN_MS = 20 * 1000;

function getInstagramConfigurationStatus() {
  const missing = [];
  if (!INSTAGRAM_APP_ID) missing.push('INSTAGRAM_APP_ID');
  if (!INSTAGRAM_APP_SECRET) missing.push('INSTAGRAM_APP_SECRET');
  if (!INSTAGRAM_TEST_ACCESS_TOKEN) missing.push('INSTAGRAM_TEST_ACCESS_TOKEN');
  if (!INSTAGRAM_REDIRECT_URI) missing.push('INSTAGRAM_REDIRECT_URI');
  return { configured: missing.length === 0, missing };
}

async function fetchInstagramTestIdentity() {
  if (!INSTAGRAM_TEST_ACCESS_TOKEN) throw new Error('Instagram test access token is not configured.');
  const response = await axios.get('https://graph.instagram.com/me', {
    params: {
      fields: 'id,user_id,username,account_type',
      access_token: INSTAGRAM_TEST_ACCESS_TOKEN
    },
    timeout: 15000
  });
  const data = response.data || {};
  const instagramUserId = data.user_id || data.id;
  if (!instagramUserId) throw new Error('Instagram did not return an account ID.');
  return {
    instagramUserId: String(instagramUserId),
    apiIdentityId: data.id ? String(data.id) : null,
    username: data.username || null,
    accountType: data.account_type || null
  };
}

function getInstagramApiErrorDetails(error) {
  const metaError = error?.response?.data?.error || {};
  return {
    status: Number(error?.response?.status) || null,
    code: Number(metaError.code) || null,
    subcode: Number(metaError.error_subcode) || null,
    type: metaError.type || null,
    message: metaError.message || error?.message || 'Instagram API request failed.'
  };
}

async function instagramApiGet(path, params = {}) {
  if (!INSTAGRAM_TEST_ACCESS_TOKEN) throw new Error('Instagram test access token is not configured.');
  const cleanPath = String(path || '').replace(/^\/+/, '');
  const url = `https://graph.instagram.com/${INSTAGRAM_API_VERSION}/${cleanPath}`;
  try {
    const response = await axios.get(url, { params: { ...params, access_token: INSTAGRAM_TEST_ACCESS_TOKEN }, timeout: 15000 });
    return response.data;
  } catch (error) {
    const details = getInstagramApiErrorDetails(error);
    const wrapped = new Error(details.message || 'Instagram API request failed.');
    wrapped.instagramApiError = details;
    throw wrapped;
  }
}

async function fetchInstagramTestMedia(limit = 10) {
  const identity = await fetchInstagramTestIdentity();
  const MAX_MEDIA_TO_INSPECT = 100;
  const MAX_PAGES_TO_INSPECT = 10;
  const PAGE_LIMIT = 25;
  const media = [];
  let pagesInspected = 0;
  let after = null;
  let partialError = null;
  while (media.length < MAX_MEDIA_TO_INSPECT && pagesInspected < MAX_PAGES_TO_INSPECT) {
    try {
      const data = await instagramApiGet(`${identity.instagramUserId}/media`, {
        fields: 'id,caption,media_type,media_product_type,permalink,thumbnail_url,media_url,timestamp,username',
        limit: Math.min(Math.max(Number(limit) || PAGE_LIMIT, 1), PAGE_LIMIT),
        ...(after ? { after } : {})
      });
      pagesInspected++;
      media.push(...(Array.isArray(data?.data) ? data.data : []));
      if (media.filter(isInstagramReel).length >= 5) break;
      after = data?.paging?.cursors?.after || null;
      if (!after || !(data?.data || []).length) break;
    } catch (error) {
      partialError = error.instagramApiError || getInstagramApiErrorDetails(error);
      break;
    }
  }
  return { identity, media: media.slice(0, MAX_MEDIA_TO_INSPECT), pagesInspected, partialError };
}

function isInstagramReel(media) {
  return getInstagramMediaClassification(media).isReel;
}

function getInstagramMediaClassification(media) {
  const mediaType = String(media?.media_type || 'UNKNOWN').toUpperCase();
  const productType = String(media?.media_product_type || 'UNKNOWN').toUpperCase();
  const permalink = String(media?.permalink || '');
  return { mediaType, productType, isReel: productType === 'REELS' || productType === 'REEL' || /\/reels?\//i.test(permalink) };
}

function extractInstagramInsightValue(metric) {
  if (!metric) return null;
  const values = Array.isArray(metric.values) ? metric.values : [];
  const latestValue = values.length ? values[values.length - 1]?.value : null;
  const directValue = metric.total_value?.value ?? metric.value ?? latestValue;
  const numeric = Number(directValue);
  return Number.isFinite(numeric) ? numeric : null;
}

async function fetchInstagramTestMediaInsights(media) {
  if (!media?.id) throw new Error('Instagram media ID is missing.');
  const results = {}, errors = [];
  for (const metricName of ['views', 'plays']) {
    try {
      const response = await instagramApiGet(`${media.id}/insights`, { metric: metricName });
      const value = extractInstagramInsightValue(Array.isArray(response?.data) ? response.data[0] : null);
      if (value !== null) results[metricName] = value;
    } catch (error) {
      const details = error.instagramApiError || {};
      errors.push({ metric: metricName, status: details.status || null, code: details.code || null, message: details.message || error.message });
    }
  }
  const views = Number.isFinite(Number(results.views)) ? Number(results.views) : Number.isFinite(Number(results.plays)) ? Number(results.plays) : null;
  return { views, metrics: results, errors };
}

function getInstagramMediaTitle(media) {
  const caption = String(media?.caption || '').trim();
  if (!caption) return isInstagramReel(media) ? 'Instagram Reel' : 'Instagram Post';
  const firstLine = caption.split(/\r?\n/)[0].trim();
  return firstLine.length > 80 ? `${firstLine.slice(0, 77)}...` : firstLine;
}

const instagramMediaTestCooldowns = new Map();
const apifyInstagramTestCooldowns = new Map();
const apifyInstagramProfileTestCooldowns = new Map();

function parsePublicInstagramReelUrl(input) {
  let url;
  try {
    url = new URL(String(input || '').trim());
  } catch {
    return null;
  }

  const hostname = url.hostname.toLowerCase().replace(/^www\./, '');
  if (hostname !== 'instagram.com') return null;

  const match = url.pathname.match(/^\/reels?\/([^/?#]+)\/?/i);
  if (!match) return null;

  const shortcode = String(match[1] || '').trim();
  if (!shortcode) return null;

  return {
    platform: 'instagram',
    shortcode,
    canonicalUrl: `https://www.instagram.com/reel/${shortcode}/`
  };
}

function getApifyInstagramError(error) {
  const status = Number(error?.response?.status) || null;
  if (status === 402) return { status, message: 'Apify account does not have enough usage credit.' };
  if (status === 401 || status === 403) return { status, message: 'Apify API token is invalid or unauthorized.' };
  return { status, message: 'Instagram Reel data could not be retrieved.' };
}

async function runApifyInstagramReelScraper(reelUrl) {
  if (!APIFY_API_TOKEN) throw new Error('APIFY_API_TOKEN is not configured.');

  const parsed = parsePublicInstagramReelUrl(reelUrl);
  if (!parsed) throw new Error('Invalid Instagram Reel URL.');

  try {
    const response = await axios.post(
      `https://api.apify.com/v2/acts/${APIFY_INSTAGRAM_ACTOR}/run-sync-get-dataset-items`,
      {
        // The official Reel Scraper accepts direct Reel URLs in its `username` array.
        username: [parsed.canonicalUrl],
        resultsLimit: 1
      },
      {
        headers: { Authorization: `Bearer ${APIFY_API_TOKEN}` },
        timeout: 120000
      }
    );
    return Array.isArray(response.data) ? response.data : [];
  } catch (error) {
    const details = getApifyInstagramError(error);
    const wrapped = new Error(details.message);
    wrapped.apifyInstagramError = details;
    throw wrapped;
  }
}

function getFirstFiniteNonNegativeValue(values) {
  for (const value of values) {
    if (value === null || value === undefined || value === '') continue;
    const numeric = Number(value);
    if (Number.isFinite(numeric) && numeric >= 0) return numeric;
  }
  return null;
}

function getFirstFiniteApifyMetric(candidates) {
  for (const candidate of candidates) {
    if (candidate.value === null || candidate.value === undefined || candidate.value === '') continue;
    const numeric = Number(candidate.value);
    if (Number.isFinite(numeric) && numeric >= 0) {
      return { value: numeric, field: candidate.field };
    }
  }
  return { value: null, field: null };
}

function getSafeApifyInstagramDiagnostics(item) {
  const diagnostics = {};
  const keyMatches = /view|play|like|comment|share|reach|impression|video|count/i;
  const addValue = (key, value) => {
    if (!keyMatches.test(key) || (typeof value !== 'number' && typeof value !== 'string')) return;
    if (typeof value === 'string' && (/^https?:\/\//i.test(value) || value.length > 100)) return;
    diagnostics[key] = value;
  };

  for (const [key, value] of Object.entries(item || {})) {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      for (const [nestedKey, nestedValue] of Object.entries(value)) {
        addValue(`${key}.${nestedKey}`, nestedValue);
      }
    } else {
      addValue(key, value);
    }
  }
  return diagnostics;
}

function getApifyTimestampMs(value) {
  if (value === null || value === undefined || value === '') return null;
  const numeric = Number(value);
  if (Number.isFinite(numeric) && numeric > 0) return numeric < 100000000000 ? numeric * 1000 : numeric;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeApifyInstagramReel(item, requestedUrl) {
  const requested = parsePublicInstagramReelUrl(requestedUrl);
  if (!requested) throw new Error('Invalid Instagram Reel URL.');
  const source = item || {};
  const shortcode = String(source.shortcode || source.shortCode || requested.shortcode).trim();
  const usernameValue = [source.ownerUsername, source.username, source.owner?.username, source.authorUsername]
    .find(value => typeof value === 'string' && value.trim());
  const username = usernameValue ? usernameValue.replace(/^@+/, '').trim() : '';
  const ownerId = source.ownerId || source.owner?.id || source.userId || source.ownerPk || null;
  if (!username && !ownerId) throw new Error('Apify did not return a reliable Reel owner identity.');

  const caption = String(source.caption || source.text || source.title || '').trim();
  const firstLine = caption.split(/\r?\n/)[0].trim();
  const title = firstLine ? (firstLine.length > 100 ? `${firstLine.slice(0, 97)}...` : firstLine) : 'Instagram Reel';
  const thumbnailCandidate = [source.displayUrl, source.thumbnailUrl, source.thumbnailSrc]
    .find(value => typeof value === 'string' && /^https:\/\//i.test(value));
  const permalink = parsePublicInstagramReelUrl(source.reelUrl || source.url || source.permalink);

  // Apify Instagram Reel public play count is represented by
  // videoPlayCount in the current Actor output.
  // videoViewCount may represent a different/partial metric and must not
  // take precedence for Reel tracking.
  const viewMetric = getFirstFiniteApifyMetric([
    { field: 'videoPlayCount', value: source.videoPlayCount },
    { field: 'videoViewCount', value: source.videoViewCount },
    { field: 'playCount', value: source.playCount },
    { field: 'views', value: source.views },
    { field: 'viewCount', value: source.viewCount }
  ]);

  return {
    platform: 'instagram',
    ownerId: ownerId === null || ownerId === undefined ? null : String(ownerId),
    videoId: String(source.id || source.videoId || shortcode),
    shortcode,
    url: permalink?.canonicalUrl || requested.canonicalUrl,
    username,
    title,
    thumbnailUrl: thumbnailCandidate || null,
    views: viewMetric.value,
    viewMetricField: viewMetric.field,
    likes: getFirstFiniteNonNegativeValue([source.likesCount, source.likeCount, source.likes]),
    comments: getFirstFiniteNonNegativeValue([source.commentCount, source.commentsCount, source.comments]),
    durationSeconds: normalizeVideoDurationSeconds(source.videoDuration ?? source.duration),
    publishedTimestamp: getApifyTimestampMs(source.timestamp || source.publishedTimestamp || source.publishedAt || source.takenAt),
    fetchedAt: Date.now(),
    source: 'apify'
  };
}

async function fetchInstagramPublicReelMetadata(reelUrl) {
  return runApifyInstagramReelScraper(reelUrl);
}

async function fetchApifyInstagramReelMetadata(reelUrl) {
  const parsed = parsePublicInstagramReelUrl(reelUrl);
  if (!parsed) throw new Error('Invalid Instagram Reel URL.');

  const items = await fetchInstagramPublicReelMetadata(parsed.canonicalUrl);
  const item = items.find(candidate => {
    const candidateUrl = parsePublicInstagramReelUrl(candidate?.inputUrl || candidate?.reelUrl || candidate?.url || candidate?.permalink);
    return candidateUrl?.shortcode === parsed.shortcode || String(candidate?.shortcode || candidate?.shortCode || '') === parsed.shortcode;
  }) || items[0];
  if (!item) throw new Error('Instagram Reel data could not be retrieved.');

  const reel = normalizeApifyInstagramReel(item, parsed.canonicalUrl);
  return {
    authorUsername: reel.username,
    authorId: reel.ownerId,
    platformAccountId: reel.ownerId,
    authorDisplayName: item.ownerFullName || reel.username,
    title: reel.title,
    views: reel.views,
    likes: reel.likes,
    viewMetricField: reel.viewMetricField,
    thumbnailUrl: reel.thumbnailUrl,
    durationSeconds: reel.durationSeconds,
    publishedTimestamp: reel.publishedTimestamp,
    canonicalUrl: reel.url
  };
}

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

const localDataFilePath = path.join(__dirname, 'data.json');
const railwayDataFilePath = '/data/data.json';
const railwayBackupFilePath = '/data/data.backup.json';
const primaryDataFilePath = process.env.RAILWAY_ENVIRONMENT ? railwayDataFilePath : localDataFilePath;
const mirrorDataFilePath = localDataFilePath;
const dataFilePath = primaryDataFilePath;
// The project-level data.json mirror exists inside the running Railway
// container. It does not automatically synchronize back to the developer's
// local computer or Git repository. Persistent production copies live in
// the mounted /data volume.

const CAMPAIGNS = {
  elephant: {
    id: 'elephant',
    name: 'Elephant Clipping Campaign',
    allowedPlatforms: ['tiktok', 'instagram', 'youtube'],
    payoutThreshold: 17500,
    campaignBudget: 2400,
    startDate: '2026-08-03T07:00:00.000Z',
    endDate: '2026-08-31T07:00:00.000Z',
    cycleWeeks: "1",
    budgetCycle: "weekly",
    budgetMode: "weekly",
    budgetCycleWeeks: 1,
    budgetResetDayUtc: 1,
    budgetResetHourUtc: 7,
    earningCycle: "monthly",
    separateEarningLifecycle: true,
    viewCap: 8000000,
    ratePerMillion: 300,
    panelChannelId:'1492239981308018698',
    panelMessageId:'1536315496121634828',
    roleId: process.env.ELEPHANT_ROLE_ID,
    entryChannelId: process.env.ELEPHANT_ENTRY_CHANNEL_ID,
    connectAccountChannelId: '1521567104552276058',
    source: 'monsterlab',
    accountMode: 'campaign_staff_code',
    monsterCampaignId: "fbFMAJpxpQkZ0Honf7z4",
    status: 'active',
    
    panelText: `# <a:fire1:1504871649491554487> **Earn Money Posting Clips – Elephant Clipping Campaign**

Create and post engaging clips and edits that follow the campaign rules to earn
based on performance.

## <a:chart1:1504773558415523931> Campaign Overview

• **Clips:** Any clips and edits that follow the campaign rules → <#1492248546156609778>
• **Platforms:** TikTok, Instagram Reels & YouTube Shorts
• **Country Tier:** Tier 1 countries only
• **Minimum Video Duration:** 10 seconds

## <a:Cash1:1504871843419521115> Payment Details

> **Payout Schedule:** Monthly
> **Rate:** $300 per 1M eligible views
> **Weekly Budget:** $2,400
> **Minimum Payout:** $10

## <a:arrow1:1504776324051374130> Join the Campaign

Click the button below to start clipping and earning.`

  },

  crowder: {
    id: 'crowder',
    name: 'Steven Crowder Clipping Campaign',
    allowedPlatforms: ['tiktok', 'instagram', 'youtube'],
    payoutThreshold: 17500,
    campaignBudget: 2100,
    startDate: '2026-08-03T07:00:00.000Z',
    endDate: '2026-08-31T07:00:00.000Z',
    cycleWeeks: "1",
    budgetCycle: "weekly",
    budgetMode: "weekly",
    budgetCycleWeeks: 1,
    budgetResetDayUtc: 1,
    budgetResetHourUtc: 7,
    earningCycle: "monthly",
    separateEarningLifecycle: true,
    ratePerMillion: 300,
    viewCap: 7000000,
    panelChannelId:'1521565850505838672',
    panelMessageId:'1536315187026468895',
    roleId: process.env.CROWDER_ROLE_ID,
    entryChannelId: process.env.CROWDER_ENTRY_CHANNEL_ID,
    connectAccountChannelId: '1521566652796240046',
    source: 'monsterlab',
    accountMode: 'campaign_staff_code',
    monsterCampaignId: "Qgl6rzYPcDIVxqZ23kXI",
    status: 'active',

    panelText: `
# <a:fire1:1504871649491554487> Earn Money Posting Clips – Steven Crowder Clipping Campaign

Create and post engaging clips and edits that follow the campaign rules to earn
based on performance.

## <a:chart1:1504773558415523931> Campaign Overview

• **Clips:** Any clips and edits that follow the campaign rules → <#1492184654864842963>
• **Platforms:** TikTok, Instagram Reels & YouTube Shorts
• **Country Tier:** Tier 1 countries only
• **Minimum Video Duration:** 10 seconds

## <a:Cash1:1504871843419521115> Payment Details

> **Payout Schedule:** Monthly
> **Rate:** $300 per 1M eligible views
> **Weekly Budget:** $2,100
> **Minimum Payout:** $10

## <a:arrow1:1504776324051374130> Join the Campaign

Click the button below to start clipping and earning.`
  },

  ice: {
    id: 'ice',
    name: 'ICE',
    allowedPlatforms: ['tiktok', 'instagram', 'youtube'],
    countryTiers: ['Tier 1', 'Tier 2', 'Tier 3'],
    minimumVideoDuration: '10 seconds',
    minimumVideoDurationSeconds: 10,
    clipRequirement: 'Any clips and edits that follow the campaign rules',
    budgetMode: 'straight',
    earningCycle: 'straight',
    accountMode: 'global_auto_verify',
    source: 'internal',
    campaignBudget: 500,
    viewCap: 1_000_000,
    ratePerMillion: 500,
    payoutThresholdViews: 10_000,
    maxPayoutPerClipPercent: 10,
    refillable: true,
    roleId: process.env.ICE_ROLE_ID,
    entryChannelId: process.env.ICE_ENTRY_CHANNEL_ID,
    launchAt: null,
    panelChannelId: 1535996383209988158,
    panelMessageId: 1536305479116914739,
    rulesChannelId: 1535996676056023152,
    status: 'pending_launch',
    panelText: `# <a:fire1:1504871649491554487> Earn Money Posting Clips & Edits – ICE

Create and post engaging clips and edits that follow the campaign rules to earn
based on performance.

## <a:chart1:1504773558415523931> Campaign Details

• **Clips:** Any clips and edits that follow the campaign rules
• **Platforms:** TikTok, Instagram Reels & YouTube Shorts
• **Country Tier:** Tier 1, 2 & 3
• **Minimum Video Duration:** 10 seconds

## <a:Cash1:1504871843419521115> Payment Details

> **Payout:** $0.50 per 1,000 eligible views
> **Budget:** $500 — Up to 1M Total Eligible Views
> **Minimum Payout:** 10K eligible unpaid views
> **Max Payout Per Clip:** $50

## <a:arrow1:1504776324051374130> Join the Campaign

Click the button below to start clipping and earning.`
  }
};

const ELEPHANT_JULY_RECONCILIATION = Object.freeze({
  migrationName: 'elephantJulyHistoricalReconciliationV2',
  campaignId: 'elephant',
  earningRunKey: 'elephant:2026-07-01T00:00:00.000Z:2026-08-03T00:00:00.000Z',
  cycleStartAt: '2026-07-01T00:00:00.000Z',
  firstPayableWindowStartAt: '2026-07-20T00:00:00.000Z',
  firstPayableWindowEndAt: '2026-07-27T00:00:00.000Z',
  cycleEndAt: '2026-08-03T00:00:00.000Z',
  nextCycleStartAt: '2026-08-03T07:00:00.000Z',
  nextEarningRunKey: 'elephant:2026-08-03T07:00:00.000Z:2026-08-31T07:00:00.000Z',
  rawPool: 19_914_268,
  weeklyCap: 8_000_000,
  expectedSubmissionCount: 51,
  expectedStatuses: Object.freeze({ approved: 34, rejected: 2, pending: 15 }),
  reconciliationStatus: 'reconstructed',
  reconciliationMethod: 'pro_rata_first_week_cap_largest_remainder',
  reconciliationReason: 'Historical per-creator capped allocation order was not persisted.',
  users: Object.freeze({
    '1318322406976127156': Object.freeze({ rawFirstWindowViews: 1_505_622, firstWindowCreditedViews: 604_841, secondWindowCreditedViews: 0, totalCreditedViews: 604_841, messageId: '1534540132152115304', carryForward: false }),
    '1318324803895165000': Object.freeze({ rawFirstWindowViews: 18_407_123, firstWindowCreditedViews: 7_394_547, secondWindowCreditedViews: 0, totalCreditedViews: 7_394_547, messageId: '1533820016825471077', carryForward: false }),
    '1437858346685173763': Object.freeze({ rawFirstWindowViews: 1_275, firstWindowCreditedViews: 512, secondWindowCreditedViews: 3_788, totalCreditedViews: 4_300, messageId: null, carryForward: true }),
    '1480294670499320023': Object.freeze({ rawFirstWindowViews: 248, firstWindowCreditedViews: 100, secondWindowCreditedViews: 142, totalCreditedViews: 242, messageId: '1534540131082440735', carryForward: true }),
    '1522218555356086313': Object.freeze({ rawFirstWindowViews: 0, firstWindowCreditedViews: 0, secondWindowCreditedViews: 168, totalCreditedViews: 168, messageId: '1534540138124935320', carryForward: true })
  }),
  pendingOnlyUserId: '1189010402533720127',
  payoutChannelId: '1533817836311416972'
});

const CROWDER_HISTORICAL_RECONCILIATION = Object.freeze({
  migrationName: 'crowderHistoricalCycleReconciliationV2',
  supersededMigrationName: 'crowderHistoricalCycleReconciliationV1',
  campaignId: 'crowder',
  payoutChannelId: '1533817837267718174',
  ratePerMillion: 300,
  historicalPayoutThresholdViews: 17_500,
  currentPayoutThresholdViews: 17_500,
  currentEarningRunKey: 'crowder:2026-08-03T07:00:00.000Z:2026-08-31T07:00:00.000Z',
  currentCycleStartAt: '2026-08-03T07:00:00.000Z',
  currentCycleEndAt: '2026-08-31T07:00:00.000Z',
  historicalCycle: Object.freeze({
    earningRunKey: 'crowder:2026-06-29T00:00:00.000Z:2026-08-03T07:00:00.000Z',
    cycleStartAt: '2026-06-29T00:00:00.000Z',
    cycleEndAt: '2026-08-03T07:00:00.000Z',
    expectedSubmissionCount: 147,
    expectedStatuses: Object.freeze({ approved: 108, rejected: 16, pending: 23 }),
    expectedCreditedViews: 5_317_034,
    expectedEarnings: 1_595.1102,
    expectedLegacyRecordedPaidViews: 2_711_131,
    expectedLegacyRecordedPaidAmount: 813.3393,
    windows: Object.freeze([
      Object.freeze({ startAt: '2026-06-29T00:00:00.000Z', endAt: '2026-07-06T00:00:00.000Z', creditedViews: 0 }),
      Object.freeze({ startAt: '2026-07-06T00:00:00.000Z', endAt: '2026-07-13T00:00:00.000Z', creditedViews: 99_070 }),
      Object.freeze({ startAt: '2026-07-13T00:00:00.000Z', endAt: '2026-07-20T00:00:00.000Z', creditedViews: 5_089_837 }),
      Object.freeze({ startAt: '2026-07-20T00:00:00.000Z', endAt: '2026-07-27T00:00:00.000Z', creditedViews: 77_548 }),
      Object.freeze({ startAt: '2026-07-27T00:00:00.000Z', endAt: '2026-08-03T07:00:00.000Z', creditedViews: 50_579 })
    ]),
    users: Object.freeze({
      '1189010402533720127': Object.freeze({ creditedViews: 2_170_780, legacyRecordedPaidViews: 169_000, legacyRecordedPaidAmount: 50.7 }),
      '1318322406976127156': Object.freeze({ creditedViews: 2_516_689, legacyRecordedPaidViews: 2_516_631, legacyRecordedPaidAmount: 754.9893 }),
      '1379441616414314679': Object.freeze({ creditedViews: 18, legacyRecordedPaidViews: 0, legacyRecordedPaidAmount: 0, messageId: '1534540126087020707' }),
      '1437858346685173763': Object.freeze({ creditedViews: 20_249, legacyRecordedPaidViews: 0, legacyRecordedPaidAmount: 0 }),
      '1446981610657419406': Object.freeze({ creditedViews: 10_693, legacyRecordedPaidViews: 0, legacyRecordedPaidAmount: 0 }),
      '1468222318198259864': Object.freeze({ creditedViews: 547_664, legacyRecordedPaidViews: 25_500, legacyRecordedPaidAmount: 7.65, messageId: '1533876856586244218' }),
      '1469031652352327873': Object.freeze({ creditedViews: 19_076, legacyRecordedPaidViews: 0, legacyRecordedPaidAmount: 0 }),
      '1480294670499320023': Object.freeze({ creditedViews: 31_477, legacyRecordedPaidViews: 0, legacyRecordedPaidAmount: 0 }),
      '1495891626223079536': Object.freeze({ creditedViews: 138, legacyRecordedPaidViews: 0, legacyRecordedPaidAmount: 0, messageId: '1534540100783050903' }),
      '1516030505710129312': Object.freeze({ creditedViews: 151, legacyRecordedPaidViews: 0, legacyRecordedPaidAmount: 0 }),
      '1522218555356086313': Object.freeze({ creditedViews: 99, legacyRecordedPaidViews: 0, legacyRecordedPaidAmount: 0, messageId: '1534540127961874565' }),
      '1518535459720925268': Object.freeze({ creditedViews: 0, legacyRecordedPaidViews: 0, legacyRecordedPaidAmount: 0 })
    })
  }),
  supersededEarningRunKeys: Object.freeze([
    'crowder:2026-06-29T00:00:00.000Z:2026-07-27T00:00:00.000Z',
    'crowder:2026-07-27T00:00:00.000Z:2026-08-03T07:00:00.000Z'
  ]),
  finalCarry: Object.freeze({
    '1379441616414314679': Object.freeze({ views: 18, amount: 0.0054 }),
    '1446981610657419406': Object.freeze({ views: 10_693, amount: 3.2079 }),
    '1495891626223079536': Object.freeze({ views: 138, amount: 0.0414 }),
    '1516030505710129312': Object.freeze({ views: 151, amount: 0.0453 }),
    '1522218555356086313': Object.freeze({ views: 99, amount: 0.0297 })
  }),
  expectedReadyViews: 5_305_935,
  expectedReadyAmount: 1_591.7805,
  expectedCarryViews: 11_099,
  expectedCarryAmount: 3.3297,
  expectedActualPaidViews: 0,
  expectedActualPaidAmount: 0,
  expectedHistoricalFingerprint: '8dff7cf91067ce6cfe36b1e37c46e4f28117103aee9d9c2adae9056454f57a50'
});

function writeJsonAtomic(filePath, jsonText) {
  const directory = path.dirname(filePath);
  if (!fs.existsSync(directory)) fs.mkdirSync(directory, { recursive: true });
  const tempPath = filePath + '.' + process.pid + '.tmp';
  fs.writeFileSync(tempPath, jsonText, 'utf8');
  fs.renameSync(tempPath, filePath);
}

function readJsonFileSafely(filePath) {
  try {
    if (!fs.existsSync(filePath)) return null;
    const content = fs.readFileSync(filePath, 'utf8');
    if (!content.trim()) return null;
    const parsed = JSON.parse(content);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
  } catch (error) {
    console.error('Could not read ' + filePath + ':', error.message);
    return null;
  }
}

function repairApprovalSnapshotInvariants(data) {
  let impossibleApprovalSnapshots = 0;
  let repairedApprovalSnapshots = 0;
  for (const collection of [data?.clips, data?.clipReviews]) {
    for (const clip of Object.values(collection || {})) {
      const wasApproved = clip.wasEverApproved === true || Boolean(clip.approvedAt) || clip.status === 'approved';
      const submissionViews = Number(clip.submissionViews);
      const approvalViews = Number(clip.approvalViews);
      if (!wasApproved || !Number.isFinite(submissionViews) || submissionViews < 0) continue;
      if (clip.approvalViews === null || clip.approvalViews === undefined || !Number.isFinite(approvalViews) || approvalViews < submissionViews) {
        impossibleApprovalSnapshots++;
        clip.approvalViews = submissionViews;
        repairedApprovalSnapshots++;
      }
    }
  }
  return { impossibleApprovalSnapshots, repairedApprovalSnapshots };
}

function loadData() {
  let raw = readJsonFileSafely(primaryDataFilePath);
  let recovered = false;
  if (!raw && process.env.RAILWAY_ENVIRONMENT) raw = readJsonFileSafely(railwayBackupFilePath), recovered = !!raw;
  if (!raw && mirrorDataFilePath !== primaryDataFilePath) raw = readJsonFileSafely(mirrorDataFilePath), recovered = !!raw;
  if (!raw) { raw = { users: {}, applications: {}, campaignAccountRequests: {}, clips: {}, campaignStatus: {}, payoutTrackers: {} }; recovered = true; }

  raw.users ||= {}; raw.applications ||= {}; raw.campaignAccountRequests ||= {}; raw.globalSocialVerificationRequests ||= {}; raw.demographicsSubmissions ||= {}; raw.campaignAllocations ||= {}; raw.clips ||= {}; raw.clipReviews ||= {}; raw.campaignStatus ||= {}; raw.payoutTrackers ||= {}; raw.storageMigrations ||= {};
  for (const request of Object.values(raw.payoutRequests || {})) {
    if (!request?.campaignId || !request?.userId) continue;
    const id = request.id || request.campaignId + '_' + request.userId;
    raw.payoutTrackers[id] ||= { ...request, id };
  }
  delete raw.payoutRequests;
  for (const clip of Object.values(raw.clips || {})) {
    clip.payout ||= {};
    clip.payout.paidViews = Number(clip.payout.paidViews ?? clip.payout.totalPaidViews ?? 0) || 0;
    clip.payout.paidMoney = Number(clip.payout.paidMoney ?? clip.payout.totalPaidAmount ?? 0) || 0;
    if (!Array.isArray(clip.payout.history)) clip.payout.history = [];
    clip.payout.lastPaidAt ??= null;
    delete clip.payout.totalPaidViews; delete clip.payout.totalPaidAmount;
  }
  let migrationChanged = false;
  if (!raw.storageMigrations.clipReviewSplitV1) {
    let movedPending = 0;
    let keptApproved = 0;
    for (const [clipId, clip] of Object.entries(raw.clips || {})) {
      const paidViews = Number(clip.payout?.paidViews) || 0;
      const paidMoney = Number(clip.payout?.paidMoney) || 0;
      const hasHistory = Array.isArray(clip.payout?.history) && clip.payout.history.length > 0;
      const previouslyApproved = Boolean(clip.approvedAt || clip.wasEverApproved === true || paidViews > 0 || paidMoney > 0 || hasHistory);
      const moveToReviews = clip.status === 'pending' || (clip.status === 'rejected' && !previouslyApproved);
      initializeClipTrackingFields(clip);
      if (moveToReviews) {
        if (raw.clipReviews[clipId]) {
          console.warn(`⚠️ Migration skipped duplicate clip ID ${clipId}`);
          continue;
        }
        clip.payoutEligible = false;
        clip.wasEverApproved = false;
        if (clip.status === 'rejected') clip.rejectionStage ||= 'pre_approval';
        raw.clipReviews[clipId] = clip;
        delete raw.clips[clipId];
        movedPending++;
      } else {
        if (clip.status === 'approved') { clip.payoutEligible ??= true; clip.wasEverApproved ??= true; }
        if (clip.status === 'rejected' && previouslyApproved) { clip.payoutEligible = false; clip.wasEverApproved = true; clip.rejectionStage ||= 'post_approval'; }
        keptApproved++;
      }
    }
    raw.storageMigrations.clipReviewSplitV1 = true;
    migrationChanged = true;
    console.log(`✅ Clip review storage migration complete: ${movedPending} pending/rejected review clips moved, ${keptApproved} approved/history clips kept.`);
  }
  if (!raw.storageMigrations.clipTrackingScheduleV1) {
    for (const collection of [raw.clipReviews, raw.clips]) {
      for (const clip of Object.values(collection || {})) {
        initializeClipTrackingFields(clip);
        clip.trackingRetryAt ??= null;
        clip.lastTrackingError ??= null;
        clip.lastTrackingErrorAt ??= null;
        if (clip.status === 'approved') clip.payoutEligible ??= true;
      }
    }
    raw.storageMigrations.clipTrackingScheduleV1 = true;
    migrationChanged = true;
    console.log('✅ Clip tracking schedule migration complete.');
  }
  if (!raw.storageMigrations.rejectionLifecycleV1) {
    for (const [clipId, clip] of Object.entries(raw.clipReviews || {})) {
      if (clip.status !== 'rejected') continue;
      clip.payoutEligible = false;
      clip.wasEverApproved ??= false;
      clip.rejectionStage ??= 'pre_approval';
      clip.views = Math.max(Number(clip.views) || 0, Number(clip.currentViews) || 0, Number(clip.approvalViews) || 0, Number(clip.submissionViews) || 0);
    }
    for (const [clipId, clip] of Object.entries(raw.clips || {})) {
      if (clip.status !== 'rejected') continue;
      clip.views = Math.max(Number(clip.views) || 0, Number(clip.currentViews) || 0, Number(clip.approvalViews) || 0, Number(clip.submissionViews) || 0);
      if (wasClipPreviouslyApproved(clip)) {
        clip.payoutEligible = false;
        clip.wasEverApproved = true;
        clip.rejectionStage = 'post_approval';
      } else if (!raw.clipReviews[clipId]) {
        clip.payoutEligible = false;
        clip.wasEverApproved = false;
        clip.rejectionStage = 'pre_approval';
        raw.clipReviews[clipId] = clip;
        delete raw.clips[clipId];
      }
    }
    raw.storageMigrations.rejectionLifecycleV1 = true;
    migrationChanged = true;
    console.log('✅ Rejection lifecycle migration complete.');
  }
  if (!raw.storageMigrations.submissionBudgetCycleV1) {
    for (const collection of [raw.clips, raw.clipReviews]) {
      for (const [clipId, clip] of Object.entries(collection || {})) {
        const campaign = CAMPAIGNS[clip.campaignId];
        const submittedTimestamp = getClipSubmissionTimestamp(clip);
        if (campaign && submittedTimestamp) {
          clip.budgetCycleIndex = getCampaignBudgetCycleIndex(campaign, submittedTimestamp);
          clip.budgetCycleSubmittedAt = submittedTimestamp;
          delete clip.budgetCycleUnknown;
        } else {
          clip.budgetCycleIndex = null;
          clip.budgetCycleUnknown = true;
          console.warn(`Clip ${clipId} has no submission timestamp and was excluded from budget-cycle reporting.`);
        }
      }
    }
    raw.storageMigrations.submissionBudgetCycleV1 = true;
    migrationChanged = true;
  }
  if (!raw.storageMigrations.viewCapTrackingLifecycleV1) {
    for (const collection of [raw.clips, raw.clipReviews]) {
      for (const clip of Object.values(collection || {})) {
        const legacyViews = Math.max(Number(clip.views) || 0, Number(clip.currentViews) || 0, Number(clip.approvalViews) || 0, Number(clip.submissionViews) || 0);
        clip.publicViews = Math.max(Number(clip.publicViews) || 0, legacyViews);
        if (clip.views === null || clip.views === undefined) clip.views = legacyViews;
      }
    }
    finalizeExpiredBudgetCycleClips(raw);
    for (const campaign of Object.values(CAMPAIGNS)) {
      const cap = getCampaignViewCap(campaign);
      const creditedViews = getCampaignCurrentCycleCreditedViews(campaign.id, { data: raw });
      if (cap !== null && creditedViews > cap) {
        console.warn('[Campaign View Cap] legacy current-cycle credited views exceed configured cap; history was preserved for manual review.', { campaignId: campaign.id, viewCap: cap, currentCreditedViews: creditedViews });
      }
    }
    raw.storageMigrations.viewCapTrackingLifecycleV1 = true;
    migrationChanged = true;
  }
  if (!raw.storageMigrations.elephantWeeklyBudgetMonthlyEarningsV1) {
    const elephant = CAMPAIGNS.elephant;
    const now = new Date();
    const cycleKey = getCampaignBudgetCycleKey(elephant, now);
    const { periodStart } = getCampaignBudgetPeriod(elephant, now);
    const isFirstEarningWeek = periodStart.getTime() === getCampaignEarningStart(elephant);
    for (const collection of [raw.clips, raw.clipReviews]) {
      for (const clip of Object.values(collection || {})) {
        if (clip.campaignId !== 'elephant') continue;
        const legacyCredited = Math.max(Number(clip.campaignCreditedViews) || 0, Number(clip.views) || 0, Number(clip.approvalViews) || 0);
        clip.publicViews = Math.max(Number(clip.publicViews) || 0, Number(clip.currentViews) || 0, legacyCredited);
        clip.campaignCreditedViews = legacyCredited;
        if (isClipInCampaignEarningPeriod(clip, elephant, now)) {
          if (clip.completedReason === 'budget_cycle_ended') {
            delete clip.trackingStatus;
            delete clip.completedAt;
            delete clip.completedReason;
          }
          if (!clip.budgetTracking) {
            const hasLegacyWeeklyCredit = clip.weeklyViews !== null && clip.weeklyViews !== undefined && Number.isFinite(Number(clip.weeklyViews));
            const initialWeeklyCredit = hasLegacyWeeklyCredit
              ? Math.max(Number(clip.weeklyViews) || 0, 0)
              : (isFirstEarningWeek ? legacyCredited : 0);
            clip.budgetTracking = {
              budgetCycleKey: cycleKey,
              baselinePublicViews: Math.max(clip.publicViews - initialWeeklyCredit, 0),
              lastPublicViews: clip.publicViews,
              creditedViewsThisCycle: initialWeeklyCredit,
              pausedBaselineViews: null,
              initializedAt: Date.now(),
              runLedgerCompleteFor: isFirstEarningWeek ? getCampaignEarningRunKey(elephant) : null
            };
            if (!hasLegacyWeeklyCredit && !isFirstEarningWeek && legacyCredited > 0) {
              console.warn('[Weekly Accounting Migration] Exact current-week reconstruction unavailable; historical totals were preserved.', { campaignId: elephant.id, clipId: clip.id, cycleKey });
            }
          }
        }
      }
    }
    raw.storageMigrations.elephantWeeklyBudgetMonthlyEarningsV1 = true;
    migrationChanged = true;
  }
  if (!raw.storageMigrations.crowderWeeklyBudgetMonthlyEarningsV1) {
    const crowder = CAMPAIGNS.crowder;
    const now = new Date();
    const cycleKey = getCampaignBudgetCycleKey(crowder, now);
    const { periodStart } = getCampaignBudgetPeriod(crowder, now);
    const isFirstEarningWeek = periodStart.getTime() === getCampaignEarningStart(crowder);
    for (const collection of [raw.clips, raw.clipReviews]) {
      for (const clip of Object.values(collection || {})) {
        if (clip.campaignId !== 'crowder') continue;
        const legacyCredited = Math.max(Number(clip.campaignCreditedViews) || 0, Number(clip.views) || 0, Number(clip.approvalViews) || 0);
        clip.publicViews = Math.max(Number(clip.publicViews) || 0, Number(clip.currentViews) || 0, legacyCredited);
        clip.campaignCreditedViews = legacyCredited;
        if (isClipInCampaignEarningPeriod(clip, crowder, now)) {
          if (clip.completedReason === 'budget_cycle_ended') {
            delete clip.trackingStatus;
            delete clip.completedAt;
            delete clip.completedReason;
          }
          if (!clip.budgetTracking) {
            const hasLegacyWeeklyCredit = clip.weeklyViews !== null && clip.weeklyViews !== undefined && Number.isFinite(Number(clip.weeklyViews));
            const initialWeeklyCredit = hasLegacyWeeklyCredit
              ? Math.max(Number(clip.weeklyViews) || 0, 0)
              : (isFirstEarningWeek ? legacyCredited : 0);
            clip.budgetTracking = {
              budgetCycleKey: cycleKey,
              baselinePublicViews: Math.max(clip.publicViews - initialWeeklyCredit, 0),
              lastPublicViews: clip.publicViews,
              creditedViewsThisCycle: initialWeeklyCredit,
              pausedBaselineViews: null,
              initializedAt: Date.now(),
              runLedgerCompleteFor: isFirstEarningWeek ? getCampaignEarningRunKey(crowder) : null
            };
            if (!hasLegacyWeeklyCredit && !isFirstEarningWeek && legacyCredited > 0) {
              console.warn('[Weekly Accounting Migration] Exact current-week reconstruction unavailable; historical totals were preserved.', { campaignId: crowder.id, clipId: clip.id, cycleKey });
            }
          }
        }
      }
    }
    raw.storageMigrations.crowderWeeklyBudgetMonthlyEarningsV1 = true;
    migrationChanged = true;
  }
  if (!raw.storageMigrations.monthlyEarningRunLifecycleV1) {
    const now = Date.now();
    for (const collection of [raw.clips, raw.clipReviews]) {
      for (const clip of Object.values(collection || {})) {
        const campaign = CAMPAIGNS[clip.campaignId];
        if (!campaign?.separateEarningLifecycle) continue;
        if (isClipInCampaignEarningRun(clip, campaign)) {
          clip.earningRunKey ||= getCampaignEarningRunKey(campaign);
          clip.trackingStatus ||= 'active';
        } else {
          clip.trackingStatus = 'completed';
          clip.completedAt ||= now;
          clip.completedReason = 'campaign_earning_period_ended';
        }
      }
    }
    raw.storageMigrations.monthlyEarningRunLifecycleV1 = true;
    migrationChanged = true;
  }
  if (!raw.storageMigrations.monthlyEarningRunBackfillV2) {
    const now = Date.now();
    let backfilled = 0;
    let repaired = 0;
    for (const collection of [raw.clips, raw.clipReviews]) {
      for (const clip of Object.values(collection || {})) {
        const campaign = CAMPAIGNS[clip?.campaignId];
        if (!campaign?.separateEarningLifecycle) continue;
        const belongsToCurrentRun = isClipInCampaignEarningRun(clip, campaign);
        const campaignEnd = getCampaignEarningEnd(campaign);
        if (belongsToCurrentRun && !clip.earningRunKey) {
          clip.earningRunKey = getCampaignEarningRunKey(campaign);
          backfilled++;
        }
        if (
          belongsToCurrentRun &&
          campaignEnd !== null && now < campaignEnd &&
          clip.trackingStatus === 'completed' &&
          clip.completedReason === 'campaign_earning_period_ended' &&
          (clip.status === 'pending' || clip.status === 'approved')
        ) {
          clip.trackingStatus = 'active';
          delete clip.completedAt;
          delete clip.completedReason;
          repaired++;
        }
      }
    }
    raw.storageMigrations.monthlyEarningRunBackfillV2 = true;
    migrationChanged = true;
    if (process.env.DEBUG_MY_STATS === 'true') {
      console.log('[My Stats Backfill]', { backfilled, repaired });
    }
  }
  if (!raw.storageMigrations.payoutTrackerCycleIdentityV1) {
    const payoutTrackerMigration = migratePayoutTrackerCycles(raw, { now: Date.now() });
    migrationChanged = payoutTrackerMigration.changed || migrationChanged;
    console.log('[Payout Tracker Cycle Migration]', {
      migrated: payoutTrackerMigration.migrated.length,
      unresolved: payoutTrackerMigration.unresolved.length
    });
    for (const unresolved of payoutTrackerMigration.unresolved) {
      console.warn('[Payout Tracker Cycle Migration] Legacy tracker requires manual cycle review:', unresolved);
    }
  }
  if (!raw.storageMigrations[ELEPHANT_JULY_RECONCILIATION.migrationName] && getElephantJulyRecords(raw).length > 0) {
    const report = applyElephantJulyReconciliation(raw, { now: Date.now() });
    migrationChanged = report.changed || migrationChanged;
    console.log('[Elephant July Reconciliation]', {
      status: report.status,
      submissions: report.associatedSubmissionCount,
      julyTrackers: report.julyTrackerCount,
      carryForwardViews: report.carryForwardViews,
      totalCreditedViews: report.totalCreditedViews
    });
  }
  if (!raw.storageMigrations[CROWDER_HISTORICAL_RECONCILIATION.migrationName] &&
      getCrowderHistoricalCycleRecords(raw).length > 0) {
    const report = applyCrowderHistoricalReconciliation(raw, { now: Date.now() });
    migrationChanged = report.changed || migrationChanged;
    console.log('[Crowder Historical Reconciliation]', {
      status: report.status,
      earningRunKey: report.earningRunKey,
      historicalTrackers: report.historicalTrackerIds.length,
      carryForwardViews: report.carryForwardViews,
      carryForwardAmount: report.carryForwardAmount
    });
  }
  if (!raw.storageMigrations.approvalSnapshotInvariantV1) {
    const { impossibleApprovalSnapshots, repairedApprovalSnapshots } = repairApprovalSnapshotInvariants(raw);
    raw.storageMigrations.approvalSnapshotInvariantV1 = {
      completedAt: Date.now(),
      impossibleApprovalSnapshots,
      repairedApprovalSnapshots
    };
    migrationChanged = true;
    console.log('[Approval Snapshot Migration]', { impossibleApprovalSnapshots, repairedApprovalSnapshots });
  }
  if (!raw.storageMigrations.publicCurrentViewsInvariantV1) {
    let repairedCurrentPublicSnapshots = 0;
    for (const collection of [raw.clips, raw.clipReviews]) {
      for (const clip of Object.values(collection || {})) {
        const publicSnapshot = Math.max(
          Number(clip.publicViews) || 0,
          Number(clip.currentViews) || 0,
          Number(clip.submissionViews) || 0,
          Number(clip.approvalViews) || 0
        );
        if (Number(clip.currentViews) !== publicSnapshot) {
          clip.currentViews = publicSnapshot;
          repairedCurrentPublicSnapshots++;
        }
        if ((clip.publicViews === null || clip.publicViews === undefined) && publicSnapshot >= 0) clip.publicViews = publicSnapshot;
      }
    }
    raw.storageMigrations.publicCurrentViewsInvariantV1 = { completedAt: Date.now(), repairedCurrentPublicSnapshots };
    migrationChanged = true;
  }
  if (!raw.storageMigrations.augustFirstWeekLegacyWeeklyBackfillV1) {
    const report = repairAugustFirstWeekLegacyWeeklyAccounting(raw, new Date());
    raw.storageMigrations.augustFirstWeekLegacyWeeklyBackfillV1 = report;
    migrationChanged = true;
    console.log('[August Week 1 Legacy Weekly Backfill]', report);
  }
  if (!raw.storageMigrations.globalSocialAccountsV1) {
    let initializedUsers = 0;
    for (const userRecord of Object.values(raw.users || {})) {
      if (userRecord.socials === undefined || userRecord.socials === null) {
        userRecord.socials = [];
        initializedUsers++;
      } else if (!Array.isArray(userRecord.socials)) {
        userRecord.socials = Object.values(userRecord.socials).filter(Boolean);
      }
    }
    raw.storageMigrations.globalSocialAccountsV1 = { completedAt: Date.now(), initializedUsers };
    migrationChanged = true;
  }
  if (!raw.storageMigrations.accountSpecificDemographicsV1) {
    let migrated = 0;
    let alreadyAccountSpecific = 0;
    let unresolved = 0;
    for (const userRecord of Object.values(raw.users || {})) {
      ensureGlobalSocialAccountIds(userRecord);
      for (const campaignId of Object.keys(userRecord.campaignAccounts || {})) ensureCampaignAccountIds(userRecord, campaignId);
    }
    for (const submission of Object.values(raw.demographicsSubmissions || {})) {
      if (String(submission?.status || '').toLowerCase() !== 'approved' || !submission?.demographicTier) continue;
      const resolved = resolveDemographicsSubmissionAccount(raw.users?.[String(submission.userId)], submission.account);
      if (resolved?.account?.demographics?.verified === true) {
        alreadyAccountSpecific++;
        continue;
      }
      const result = applyDemographicsApprovalToAccount(raw, submission, {
        tier: submission.demographicTier,
        pageType: submission.pageType || null,
        approvedAt: submission.approvedAt || submission.tierAssignedAt || Date.now(),
        approvedBy: submission.approvedBy || submission.tierAssignedBy || null
      });
      if (result.applied) migrated++;
      else unresolved++;
    }
    raw.storageMigrations.accountSpecificDemographicsV1 = {
      completedAt: Date.now(),
      migrated,
      alreadyAccountSpecific,
      unresolved,
      userLevelRecordsCopied: 0
    };
    migrationChanged = true;
    console.log('[Account-Specific Demographics Migration]', raw.storageMigrations.accountSpecificDemographicsV1);
  }
  const outOfRunCompletion = finalizeOutOfRunClips(raw, Date.now());
  if (outOfRunCompletion.changed) {
    migrationChanged = true;
    console.log('[Monthly Earning Run Completion]', { completedOutOfRunClips: outOfRunCompletion.completedCount });
  }
  if (migrationChanged) recovered = true;
  if (recovered) saveData(raw);
  return raw;
}

function saveData(data) {
  const jsonText = JSON.stringify(data, null, 2);
  writeJsonAtomic(primaryDataFilePath, jsonText);
  if (process.env.RAILWAY_ENVIRONMENT && railwayBackupFilePath !== primaryDataFilePath) {
    try { writeJsonAtomic(railwayBackupFilePath, jsonText); } catch (error) { console.error('Could not update persistent data backup:', error.message); }
  }
  if (mirrorDataFilePath !== primaryDataFilePath) {
    try { writeJsonAtomic(mirrorDataFilePath, jsonText); } catch (error) { console.error('Could not update project data.json mirror:', error.message); }
  }
}

function parsePayoutCycleBoundsFromKey(earningRunKey) {
  const match = String(earningRunKey || '').match(/:(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z):(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z)$/);
  if (!match) return { cycleStartAt: null, cycleEndAt: null };
  return { cycleStartAt: new Date(match[1]).toISOString(), cycleEndAt: new Date(match[2]).toISOString() };
}

function getCampaignPayoutCycle(campaign, options = {}) {
  if (!campaign?.id) return null;
  const clip = options.clip || null;
  const requestedKey = options.earningRunKey || clip?.earningRunKey || null;
  const now = new Date(options.now ?? Date.now());

  if (campaign.separateEarningLifecycle) {
    let earningRunKey = requestedKey;
    if (!earningRunKey) {
      if (clip && !isClipInCampaignEarningRun(clip, campaign)) return null;
      earningRunKey = getCampaignEarningRunKey(campaign);
    }
    const parsed = parsePayoutCycleBoundsFromKey(earningRunKey);
    const isConfiguredRun = String(earningRunKey) === String(getCampaignEarningRunKey(campaign));
    const start = isConfiguredRun ? getCampaignEarningStart(campaign) : Date.parse(parsed.cycleStartAt || '');
    const end = isConfiguredRun ? getCampaignEarningEnd(campaign) : Date.parse(parsed.cycleEndAt || '');
    return {
      earningRunKey: String(earningRunKey),
      cycleStartAt: Number.isFinite(start) ? new Date(start).toISOString() : parsed.cycleStartAt,
      cycleEndAt: Number.isFinite(end) ? new Date(end).toISOString() : parsed.cycleEndAt,
      cycleType: 'earning_run'
    };
  }

  const explicitKey = requestedKey || campaign.earningRunKey || campaign.payoutCycleKey || null;
  if (explicitKey) {
    const parsed = parsePayoutCycleBoundsFromKey(explicitKey);
    return {
      earningRunKey: String(explicitKey),
      cycleStartAt: parsed.cycleStartAt || (getCampaignLaunchTimestamp(campaign) !== null ? new Date(getCampaignLaunchTimestamp(campaign)).toISOString() : null),
      cycleEndAt: parsed.cycleEndAt || (Number.isFinite(Date.parse(campaign.endDate || '')) ? new Date(campaign.endDate).toISOString() : null),
      cycleType: 'explicit'
    };
  }

  if (isStraightCampaign(campaign)) {
    const start = getCampaignLaunchTimestamp(campaign);
    if (!Number.isFinite(start)) return null;
    const end = Date.parse(campaign.endDate || '');
    return {
      earningRunKey: `${campaign.id}:straight:${new Date(start).toISOString()}`,
      cycleStartAt: new Date(start).toISOString(),
      cycleEndAt: Number.isFinite(end) ? new Date(end).toISOString() : null,
      cycleType: 'straight'
    };
  }

  const referenceDate = clip ? new Date(getClipSubmissionTimestamp(clip)) : now;
  if (Number.isNaN(referenceDate.getTime()) || Number.isNaN(new Date(campaign.startDate).getTime())) return null;
  const { periodStart, periodEnd } = getCampaignBudgetPeriod(campaign, referenceDate);
  if (!periodStart || !periodEnd || Number.isNaN(periodStart.getTime()) || Number.isNaN(periodEnd.getTime())) return null;
  const cycleType = getCampaignBudgetMode(campaign);
  return {
    earningRunKey: `${campaign.id}:${cycleType}:${periodStart.toISOString()}:${periodEnd.toISOString()}`,
    cycleStartAt: periodStart.toISOString(),
    cycleEndAt: periodEnd.toISOString(),
    cycleType
  };
}

function getPayoutTrackerId(campaignId, userId, earningRunKey, cycleStartAt = null, cycleEndAt = null) {
  if (!campaignId || !userId || !earningRunKey) return null;
  const startDate = String(cycleStartAt || '').slice(0, 10);
  const endDate = String(cycleEndAt || '').slice(0, 10);
  const runHash = crypto.createHash('sha256').update(String(earningRunKey)).digest('hex').slice(0, 8);
  const suffix = startDate && endDate
    ? `${startDate}_${endDate}_${runHash}`
    : startDate
      ? `from_${startDate}_${runHash}`
      : runHash;
  return `${campaignId}_${userId}_${suffix}`;
}

function getPayoutTracker(campaignId, userId, options = {}) {
  const data = options.data || loadData();
  const campaign = CAMPAIGNS[campaignId];
  const cycle = options.cycle || getCampaignPayoutCycle(campaign, options);
  if (!cycle) return null;
  const id = getPayoutTrackerId(campaignId, userId, cycle.earningRunKey, cycle.cycleStartAt, cycle.cycleEndAt);
  return data.payoutTrackers?.[id] || null;
}

function ensurePayoutTracker(campaignId, userId, options = {}) {
  const data = options.data || loadData();
  const campaign = CAMPAIGNS[campaignId];
  const cycle = options.cycle || getCampaignPayoutCycle(campaign, options);
  if (!campaign || !cycle) return null;
  if (!data.payoutTrackers) data.payoutTrackers = {};

  const relevantClips = getPayoutCycleClips(data, campaignId, userId, cycle);
  const hasRelevantActivity = relevantClips.some(clip =>
    isPayoutEligibleClip(clip) ||
    Number(clip?.payout?.paidViews) > 0 ||
    Number(clip?.payout?.paidMoney) > 0 ||
    (Array.isArray(clip?.payout?.history) && clip.payout.history.length > 0)
  );
  const id = getPayoutTrackerId(campaignId, userId, cycle.earningRunKey, cycle.cycleStartAt, cycle.cycleEndAt);
  if (!data.payoutTrackers[id] && !hasRelevantActivity && !options.force) return null;
  if (!data.payoutTrackers[id]) {
    data.payoutTrackers[id] = {
      id,
      campaignId,
      userId,
      earningRunKey: cycle.earningRunKey,
      cycleStartAt: cycle.cycleStartAt,
      cycleEndAt: cycle.cycleEndAt,
      cycleType: cycle.cycleType,
      channelId: null,
      messageId: null,
      lifetimeViewsForCycle: 0,
      lifetimeEarnedForCycle: 0,
      paidViewsForCycle: 0,
      paidAmountForCycle: 0,
      currentUnpaidViews: 0,
      currentUnpaidMoney: 0,
      status: 'waiting',
      cycleStatus: 'active',
      closedAt: null,
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
    if (!options.data) saveData(data);
  }

  return data.payoutTrackers[id];
}

function savePayoutTracker(tracker) {
  if (!tracker?.campaignId || !tracker?.userId) {
    throw new Error('Payout tracker requires campaignId and userId.');
  }

  const data = loadData();
  if (!data.payoutTrackers) data.payoutTrackers = {};

  if (!tracker.id && tracker.earningRunKey) {
    tracker.id = getPayoutTrackerId(tracker.campaignId, tracker.userId, tracker.earningRunKey, tracker.cycleStartAt, tracker.cycleEndAt);
  }
  if (!tracker.id) throw new Error('Cycle-specific payout tracker requires earningRunKey.');
  tracker.updatedAt = Date.now();
  data.payoutTrackers[tracker.id] = tracker;
  saveData(data);
  return tracker;
}

function migratePayoutTrackerCycles(data, options = {}) {
  data.payoutTrackers ||= {};
  data.storageMigrations ||= {};
  if (data.storageMigrations.payoutTrackerCycleIdentityV1) {
    return { changed: false, ...data.storageMigrations.payoutTrackerCycleIdentityV1 };
  }
  const now = Number(options.now ?? Date.now());
  const migrated = [];
  const unresolved = [];
  const entries = Object.entries(data.payoutTrackers);

  for (const [legacyId, legacyTracker] of entries) {
    if (!legacyTracker?.campaignId || !legacyTracker?.userId || legacyTracker.earningRunKey || legacyTracker.migratedToTrackerId) continue;
    const campaign = CAMPAIGNS[legacyTracker.campaignId];
    const cycle = getCampaignPayoutCycle(campaign, { now });
    const currentCycleClips = cycle
      ? getPayoutCycleClips(data, legacyTracker.campaignId, legacyTracker.userId, cycle)
      : [];
    const hasProvableCurrentActivity = currentCycleClips.some(clip =>
      isPayoutEligibleClip(clip) ||
      Number(clip?.payout?.paidViews) > 0 ||
      Number(clip?.payout?.paidMoney) > 0 ||
      (Array.isArray(clip?.payout?.history) && clip.payout.history.length > 0)
    );
    if (!cycle || !hasProvableCurrentActivity) {
      legacyTracker.legacyCycleUnresolved = true;
      legacyTracker.legacyCycleUnresolvedReason = cycle ? 'no_provable_current_cycle_activity' : 'campaign_cycle_unavailable';
      unresolved.push({
        trackerId: legacyId,
        campaignId: legacyTracker.campaignId,
        userId: legacyTracker.userId,
        reason: legacyTracker.legacyCycleUnresolvedReason
      });
      continue;
    }

    const trackerId = getPayoutTrackerId(
      legacyTracker.campaignId,
      legacyTracker.userId,
      cycle.earningRunKey,
      cycle.cycleStartAt,
      cycle.cycleEndAt
    );
    const tracker = data.payoutTrackers[trackerId] || {
      ...legacyTracker,
      id: trackerId,
      earningRunKey: cycle.earningRunKey,
      cycleStartAt: cycle.cycleStartAt,
      cycleEndAt: cycle.cycleEndAt,
      cycleType: cycle.cycleType,
      lifetimeViewsForCycle: 0,
      lifetimeEarnedForCycle: 0,
      paidViewsForCycle: 0,
      paidAmountForCycle: 0,
      currentUnpaidViews: 0,
      currentUnpaidMoney: 0,
      cycleStatus: 'active',
      closedAt: null,
      migratedFromTrackerId: legacyId,
      createdAt: legacyTracker.createdAt || now,
      updatedAt: now
    };
    data.payoutTrackers[trackerId] = tracker;
    calculateTrackerStats(tracker, { data, now });

    legacyTracker.migratedToTrackerId = trackerId;
    legacyTracker.legacyArchivedAt = now;
    legacyTracker.legacyMessageId = legacyTracker.messageId || null;
    legacyTracker.legacyChannelId = legacyTracker.channelId || null;
    legacyTracker.messageId = null;
    legacyTracker.channelId = null;
    migrated.push({ legacyTrackerId: legacyId, trackerId, earningRunKey: cycle.earningRunKey });
  }

  const report = { completedAt: now, migrated, unresolved };
  data.storageMigrations.payoutTrackerCycleIdentityV1 = report;
  return { changed: true, ...report };
}

function getElephantJulyRecords(data) {
  const config = ELEPHANT_JULY_RECONCILIATION;
  const start = Date.parse(config.cycleStartAt);
  const end = Date.parse(config.cycleEndAt);
  const unique = new Map();
  for (const clip of [...Object.values(data?.clips || {}), ...Object.values(data?.clipReviews || {})]) {
    const submittedAt = getClipSubmissionTimestamp(clip);
    if (String(clip?.campaignId) !== config.campaignId || !Number.isFinite(submittedAt) || submittedAt < start || submittedAt >= end) continue;
    const identity = getClipIdentityKey(clip) || `id:${clip.id}`;
    if (!unique.has(identity)) unique.set(identity, clip);
  }
  return [...unique.values()];
}

function allocateLargestRemainder(rawByUser, cap) {
  const rows = Object.entries(rawByUser).map(([userId, value]) => ({ userId, raw: Math.max(Number(value) || 0, 0) }));
  const pool = rows.reduce((sum, row) => sum + row.raw, 0);
  if (!pool || !cap) return Object.fromEntries(rows.map(row => [row.userId, 0]));
  for (const row of rows) {
    const exact = row.raw * cap / pool;
    row.credited = Math.floor(exact);
    row.remainder = exact - row.credited;
  }
  let remaining = cap - rows.reduce((sum, row) => sum + row.credited, 0);
  rows.sort((a, b) => b.remainder - a.remainder || a.userId.localeCompare(b.userId));
  for (let index = 0; index < remaining; index++) rows[index].credited++;
  return Object.fromEntries(rows.map(row => [row.userId, row.credited]));
}

function buildElephantJulyReconciliationDryRun(data) {
  const config = ELEPHANT_JULY_RECONCILIATION;
  const records = getElephantJulyRecords(data);
  const firstStart = Date.parse(config.firstPayableWindowStartAt);
  const firstEnd = Date.parse(config.firstPayableWindowEndAt);
  const end = Date.parse(config.cycleEndAt);
  const nextStart = Date.parse(config.nextCycleStartAt);
  const statuses = records.reduce((result, clip) => {
    const status = String(clip.status || 'unknown').toLowerCase();
    result[status] = (result[status] || 0) + 1;
    return result;
  }, {});
  const rawFirst = Object.fromEntries(Object.keys(config.users).map(userId => [userId, 0]));
  const exactSecond = Object.fromEntries(Object.keys(config.users).map(userId => [userId, 0]));
  for (const clip of records) {
    if (String(clip.status).toLowerCase() !== 'approved') continue;
    const userId = String(clip.userId || '');
    rawFirst[userId] ??= 0;
    exactSecond[userId] ??= 0;
    const submittedAt = getClipSubmissionTimestamp(clip);
    const views = Math.max(Number(clip.campaignCreditedViews) || 0, 0);
    if (submittedAt >= firstStart && submittedAt < firstEnd) rawFirst[userId] += views;
    else if (submittedAt >= firstEnd && submittedAt < end) exactSecond[userId] += views;
  }
  const rawPool = Object.values(rawFirst).reduce((sum, views) => sum + views, 0);
  const firstAllocation = allocateLargestRemainder(rawFirst, config.weeklyCap);
  const users = Object.entries(config.users).map(([userId, expected]) => {
    const row = {
      userId,
      rawFirstWindowViews: rawFirst[userId] || 0,
      firstWindowCreditedViews: firstAllocation[userId] || 0,
      secondWindowCreditedViews: exactSecond[userId] || 0
    };
    row.totalCreditedViews = row.firstWindowCreditedViews + row.secondWindowCreditedViews;
    row.earnings = row.totalCreditedViews / 1_000_000 * CAMPAIGNS.elephant.ratePerMillion;
    row.carryForwardViews = expected.carryForward ? row.totalCreditedViews : 0;
    row.carryForwardAmount = expected.carryForward ? row.earnings : 0;
    return { ...row, expected };
  });
  const gapRecords = [...Object.values(data?.clips || {}), ...Object.values(data?.clipReviews || {})].filter(clip => {
    const submittedAt = getClipSubmissionTimestamp(clip);
    return String(clip?.campaignId) === config.campaignId && submittedAt >= end && submittedAt < nextStart;
  });
  const mismatches = [];
  if (records.length !== config.expectedSubmissionCount) mismatches.push(`submission_count:${records.length}`);
  for (const [status, expected] of Object.entries(config.expectedStatuses)) if ((statuses[status] || 0) !== expected) mismatches.push(`status_${status}:${statuses[status] || 0}`);
  if (rawPool !== config.rawPool) mismatches.push(`first_window_raw_pool:${rawPool}`);
  for (const user of users) for (const field of ['rawFirstWindowViews', 'firstWindowCreditedViews', 'secondWindowCreditedViews', 'totalCreditedViews']) {
    if (user[field] !== user.expected[field]) mismatches.push(`${user.userId}_${field}:${user[field]}`);
  }
  const firstWindowCreditedViews = users.reduce((sum, user) => sum + user.firstWindowCreditedViews, 0);
  const secondWindowCreditedViews = users.reduce((sum, user) => sum + user.secondWindowCreditedViews, 0);
  const totalCreditedViews = users.reduce((sum, user) => sum + user.totalCreditedViews, 0);
  const totalEarnings = users.reduce((sum, user) => sum + user.earnings, 0);
  const carryForwardViews = users.reduce((sum, user) => sum + user.carryForwardViews, 0);
  const carryForwardAmount = users.reduce((sum, user) => sum + user.carryForwardAmount, 0);
  if (firstWindowCreditedViews !== 8_000_000) mismatches.push(`first_window_credited:${firstWindowCreditedViews}`);
  if (secondWindowCreditedViews !== 4_098) mismatches.push(`second_window_credited:${secondWindowCreditedViews}`);
  if (totalCreditedViews !== 8_004_098) mismatches.push(`total_credited:${totalCreditedViews}`);
  if (Math.abs(totalEarnings - 2_401.2294) > 1e-9) mismatches.push(`total_earnings:${totalEarnings}`);
  if (carryForwardViews !== 4_710) mismatches.push(`carry_forward_views:${carryForwardViews}`);
  if (Math.abs(carryForwardAmount - 1.413) > 1e-9) mismatches.push(`carry_forward_amount:${carryForwardAmount}`);
  if (gapRecords.some(clip => isPayoutEligibleClip(clip))) mismatches.push('payable_activity_in_august_3_gap');
  return {
    valid: mismatches.length === 0,
    mismatches,
    earningRunKey: config.earningRunKey,
    cycleStartAt: config.cycleStartAt,
    cycleEndAt: config.cycleEndAt,
    submissionCount: records.length,
    statuses,
    rawPool,
    firstWindowCreditedViews,
    secondWindowCreditedViews,
    totalCreditedViews,
    totalEarnings,
    carryForwardViews,
    carryForwardAmount,
    gapRecordCount: gapRecords.length,
    users: users.map(({ expected, ...user }) => user)
  };
}

function getReconciledCreatorAllocation(data, tracker) {
  const ledger = data?.campaignPayoutReconciliations?.[tracker?.earningRunKey];
  if (!['reconstructed', 'recovered'].includes(ledger?.reconciliationStatus)) return null;
  return ledger.users?.[String(tracker.userId)] || null;
}

function getTrackerCarryBalances(tracker) {
  return Array.isArray(tracker?.carryInBalances) ? tracker.carryInBalances : [];
}

function getOldestFirstTrackerCarryBalances(tracker) {
  return [...getTrackerCarryBalances(tracker)].sort((left, right) =>
    Date.parse(left.sourceCycleStartAt || '') - Date.parse(right.sourceCycleStartAt || '') ||
    String(left.sourceEarningRunKey || '').localeCompare(String(right.sourceEarningRunKey || ''))
  );
}

function settleTrackerCarryBalances(tracker, campaign, options = {}) {
  const paidAt = Number(options.paidAt ?? Date.now());
  const paymentId = options.paymentId || createStablePaymentReference(`${tracker.id}:carry:${paidAt}`);
  tracker.paymentHistory ||= [];
  let paidViews = 0;
  let paidMoney = 0;
  for (const carry of getOldestFirstTrackerCarryBalances(tracker)) {
    const unpaidCarryViews = Math.max((Number(carry.views) || 0) - (Number(carry.paidViews) || 0), 0);
    const unpaidCarryAmount = Math.max((Number(carry.amount) || 0) - (Number(carry.paidAmount) || 0), 0);
    if (unpaidCarryViews <= 0 && unpaidCarryAmount <= 0) continue;
    carry.paidViews = (Number(carry.paidViews) || 0) + unpaidCarryViews;
    carry.paidAmount = (Number(carry.paidAmount) || 0) + unpaidCarryAmount;
    carry.status = 'paid';
    carry.paidAt = paidAt;
    carry.paymentId = paymentId;
    paidViews += unpaidCarryViews;
    paidMoney += unpaidCarryAmount;
    tracker.paymentHistory.push({
      date: new Date(paidAt).toISOString(), paidAt, paymentId,
      campaignId: tracker.campaignId, campaignName: campaign.name, payoutTrackerId: tracker.id,
      earningRunKey: tracker.earningRunKey, cycleStartAt: tracker.cycleStartAt,
      cycleEndAt: tracker.cycleEndAt, ratePerMillion: campaign.ratePerMillion,
      status: 'paid', views: unpaidCarryViews, amount: unpaidCarryAmount,
      paymentSource: 'carry_in', sourceEarningRunKey: carry.sourceEarningRunKey,
      sourceCycleStartAt: carry.sourceCycleStartAt, sourceCycleEndAt: carry.sourceCycleEndAt
    });
  }
  return { paidViews, paidMoney, paidAt, paymentId };
}

function settleReconciledTrackerAllocation(data, tracker, campaign, options = {}) {
  const allocation = getReconciledCreatorAllocation(data, tracker);
  if (!allocation) return null;
  const paidAt = Number(options.paidAt ?? Date.now());
  const paymentId = options.paymentId || createStablePaymentReference(`${tracker.id}:reconciled:${paidAt}`);
  const paidViews = Math.max(Number(tracker.currentUnpaidViews) || 0, 0);
  const paidMoney = Math.max(Number(tracker.currentUnpaidMoney) || 0, 0);
  tracker.paymentHistory ||= [];
  if (paidViews > 0 || paidMoney > 0) {
    tracker.paymentHistory.push({
      date: new Date(paidAt).toISOString(), paidAt, paymentId,
      campaignId: tracker.campaignId, campaignName: campaign.name, payoutTrackerId: tracker.id,
      earningRunKey: tracker.earningRunKey, cycleStartAt: tracker.cycleStartAt,
      cycleEndAt: tracker.cycleEndAt, ratePerMillion: campaign.ratePerMillion,
      status: 'paid', views: paidViews, amount: paidMoney,
      paymentSource: tracker.canonicalSettlementModel === 'actual_payment_only'
        ? 'canonical_real_payment'
        : `${tracker.reconciliationStatus || 'reconstructed'}_cycle_allocation`,
      reconciliationStatus: tracker.reconciliationStatus || 'reconstructed'
    });
  }
  if (tracker.canonicalSettlementModel === 'actual_payment_only') {
    tracker.actualPaidViews = (Number(tracker.actualPaidViews) || 0) + paidViews;
    tracker.actualPaidAmount = (Number(tracker.actualPaidAmount) || 0) + paidMoney;
    tracker.actualPaidAt = paidAt;
  }
  return { paidViews, paidMoney, paidAt, paymentId, earningRunKey: tracker.earningRunKey };
}

function applyElephantJulyReconciliation(data, options = {}) {
  const config = ELEPHANT_JULY_RECONCILIATION;
  data.storageMigrations ||= {};
  if (data.storageMigrations[config.migrationName]) return { changed: false, ...data.storageMigrations[config.migrationName] };
  const dryRun = buildElephantJulyReconciliationDryRun(data);
  if (!dryRun.valid) throw new Error(`Elephant July reconciliation aborted: ${dryRun.mismatches.join(', ')}`);
  const reconciledAt = Number(options.now ?? Date.now());
  data.campaignPayoutReconciliations ||= {};
  const ledger = data.campaignPayoutReconciliations[config.earningRunKey] = {
    campaignId: config.campaignId,
    earningRunKey: config.earningRunKey,
    cycleStartAt: config.cycleStartAt,
    cycleEndAt: config.cycleEndAt,
    reconciliationStatus: config.reconciliationStatus,
    reconciliationMethod: config.reconciliationMethod,
    reconciliationReason: config.reconciliationReason,
    reconciliationRawPool: config.rawPool,
    reconciliationCap: config.weeklyCap,
    reconciledAt,
    users: {}
  };
  for (const user of dryRun.users) ledger.users[user.userId] = { ...user };
  const records = getElephantJulyRecords(data);
  for (const clip of records) {
    clip.earningRunKey = config.earningRunKey;
    clip.historicalReconciliationKey = config.earningRunKey;
  }
  data.payoutTrackers ||= {};
  const julyTrackerIds = [];
  const augustCarryTrackerIds = [];
  const reusedMessageIds = [];
  for (const [userId, allocation] of Object.entries(config.users)) {
    const julyId = getPayoutTrackerId(config.campaignId, userId, config.earningRunKey, config.cycleStartAt, config.cycleEndAt);
    if (allocation.messageId) {
      for (const other of Object.values(data.payoutTrackers)) if (String(other?.messageId || '') === allocation.messageId) {
        other.messageId = null;
        other.channelId = null;
        other.historicalMessageReassignedToTrackerId = julyId;
      }
      reusedMessageIds.push(allocation.messageId);
    }
    const july = data.payoutTrackers[julyId] = {
      ...(data.payoutTrackers[julyId] || {}), id: julyId, campaignId: config.campaignId, userId,
      earningRunKey: config.earningRunKey, cycleStartAt: config.cycleStartAt, cycleEndAt: config.cycleEndAt, cycleType: 'earning_run',
      channelId: allocation.messageId ? config.payoutChannelId : null, messageId: allocation.messageId,
      reconciliationStatus: config.reconciliationStatus, reconciliationMethod: config.reconciliationMethod,
      reconciliationReason: config.reconciliationReason, reconciliationRawPool: config.rawPool, reconciliationCap: config.weeklyCap,
      carriedForwardViews: allocation.carryForward ? allocation.totalCreditedViews : 0,
      carriedForwardAmount: allocation.carryForward ? allocation.totalCreditedViews / 1_000_000 * CAMPAIGNS.elephant.ratePerMillion : 0,
      carryForwardEarningRunKey: allocation.carryForward ? config.nextEarningRunKey : null,
      requiresHistoricalMessageVerification: Boolean(allocation.messageId),
      paymentHistory: [], cycleStatus: 'closed', closedAt: Date.parse(config.cycleEndAt), createdAt: reconciledAt, updatedAt: reconciledAt
    };
    calculateTrackerStats(july, { data, now: reconciledAt });
    julyTrackerIds.push(julyId);
    if (!allocation.carryForward) continue;
    const augustCycle = getCampaignPayoutCycle(CAMPAIGNS.elephant, { earningRunKey: config.nextEarningRunKey });
    const august = ensurePayoutTracker(config.campaignId, userId, { data, cycle: augustCycle, force: true });
    august.carryInBalances ||= [];
    if (!august.carryInBalances.some(item => item.sourceEarningRunKey === config.earningRunKey)) august.carryInBalances.push({
      sourceCampaignId: config.campaignId, sourceEarningRunKey: config.earningRunKey,
      sourceCycleStartAt: config.cycleStartAt, sourceCycleEndAt: config.cycleEndAt,
      views: allocation.totalCreditedViews,
      amount: allocation.totalCreditedViews / 1_000_000 * CAMPAIGNS.elephant.ratePerMillion,
      paidViews: 0, paidAmount: 0, status: 'unpaid', carriedAt: reconciledAt
    });
    calculateTrackerStats(august, { data, now: reconciledAt });
    augustCarryTrackerIds.push(august.id);
  }
  let oldTrackersMigrated = 0;
  for (const tracker of Object.values(data.payoutTrackers)) if (
    tracker?.campaignId === config.campaignId && !tracker.earningRunKey && config.users[String(tracker.userId)]?.messageId
  ) {
    tracker.legacyCycleUnresolved = false;
    tracker.historicalReconciledToTrackerId = getPayoutTrackerId(config.campaignId, tracker.userId, config.earningRunKey, config.cycleStartAt, config.cycleEndAt);
    tracker.legacyArchivedAt ||= reconciledAt;
    tracker.messageId = null;
    tracker.channelId = null;
    oldTrackersMigrated++;
  }
  const report = {
    completedAt: reconciledAt, status: 'applied', earningRunKey: config.earningRunKey,
    associatedSubmissionCount: records.length, julyTrackerIds, augustCarryTrackerIds,
    julyTrackerCount: julyTrackerIds.length, oldTrackersMigrated, reusedMessageIds,
    newJulyCardsRequired: 1, totalCreditedViews: dryRun.totalCreditedViews,
    totalEarnings: dryRun.totalEarnings, carryForwardViews: dryRun.carryForwardViews,
    carryForwardAmount: dryRun.carryForwardAmount, dryRun,
    cardSyncTrackerIds: [...julyTrackerIds, ...augustCarryTrackerIds]
  };
  data.storageMigrations[config.migrationName] = report;
  return { changed: true, ...report };
}

function getCrowderHistoricalCycleRecords(data, cycle = CROWDER_HISTORICAL_RECONCILIATION.historicalCycle) {
  const start = Date.parse(cycle.cycleStartAt);
  const end = Date.parse(cycle.cycleEndAt);
  const unique = new Map();
  for (const clip of [...Object.values(data?.clips || {}), ...Object.values(data?.clipReviews || {})]) {
    const submittedAt = getClipSubmissionTimestamp(clip);
    if (String(clip?.campaignId) !== CROWDER_HISTORICAL_RECONCILIATION.campaignId ||
        !Number.isFinite(submittedAt) || submittedAt < start || submittedAt >= end) continue;
    const identity = getClipIdentityKey(clip) || `id:${clip.id}`;
    if (!unique.has(identity)) unique.set(identity, clip);
  }
  return [...unique.values()];
}

function getCrowderCurrentAccountingInvariant(data, now = Date.now()) {
  const config = CROWDER_HISTORICAL_RECONCILIATION;
  const campaign = CAMPAIGNS[config.campaignId];
  const date = new Date(now);
  const weekly = getCampaignCurrentWeekAccounting(data, config.campaignId, date);
  const currentRun = getCampaignCurrentRunAccounting(data, config.campaignId);
  const operational = getCampaignOperationalState(data, campaign, date);
  const currentStart = Date.parse(config.currentCycleStartAt);
  const currentEnd = Date.parse(config.currentCycleEndAt);
  const criticalClips = [...Object.values(data?.clips || {}), ...Object.values(data?.clipReviews || {})]
    .filter(clip => {
      const submittedAt = getClipSubmissionTimestamp(clip);
      return String(clip?.campaignId) === config.campaignId && Number.isFinite(submittedAt) &&
        submittedAt >= currentStart && submittedAt < currentEnd;
    })
    .sort((a, b) => String(a.id).localeCompare(String(b.id)))
    .map(clip => ({
      id: clip.id,
      status: clip.status,
      earningRunKey: clip.earningRunKey || null,
      campaignCreditedViews: Number(clip.campaignCreditedViews) || 0,
      weeklyViews: Number(clip.weeklyViews) || 0,
      weeklyBaselineViews: Number(clip.weeklyBaselineViews) || 0,
      budgetTracking: clip.budgetTracking || null,
      payoutPaidViews: Number(clip.payout?.paidViews) || 0,
      payoutPaidMoney: Number(clip.payout?.paidMoney) || 0
    }));
  return {
    earningRunKey: currentRun?.earningRunKey || null,
    currentRun: currentRun ? {
      users: currentRun.users, videos: currentRun.videos, paidViews: currentRun.paidViews,
      unpaidViews: currentRun.unpaidViews, totalViews: currentRun.totalViews,
      paidMoney: currentRun.paidMoney, unpaidMoney: currentRun.unpaidMoney, totalMoney: currentRun.totalMoney
    } : null,
    weekly: weekly ? {
      weekKey: weekly.weekKey, periodStart: weekly.periodStart?.toISOString?.() || weekly.periodStart,
      periodEnd: weekly.periodEnd?.toISOString?.() || weekly.periodEnd,
      rawCreditedViews: weekly.rawCreditedViews, creditedViews: weekly.creditedViews,
      capReached: weekly.capReached, weeklyCap: weekly.weeklyCap
    } : null,
    fulfilled: getCampaignPanelFulfilledPercent(campaign, data, date),
    operationalState: operational?.state || null,
    currentClipAccountingHash: crypto.createHash('sha256').update(JSON.stringify(criticalClips)).digest('hex')
  };
}

function summarizeCrowderHistoricalCycle(data, cycle) {
  const records = getCrowderHistoricalCycleRecords(data, cycle);
  const statuses = records.reduce((result, clip) => {
    const status = String(clip.status || 'unknown').toLowerCase();
    result[status] = (result[status] || 0) + 1;
    return result;
  }, {});
  const users = {};
  for (const clip of records) {
    const userId = String(clip.userId || '');
    users[userId] ||= { userId, approvedClips: 0, rejectedClips: 0, pendingClips: 0, creditedViews: 0, legacyRecordedPaidViews: 0, legacyRecordedPaidAmount: 0 };
    if (clip.status === 'approved') {
      users[userId].approvedClips++;
      users[userId].creditedViews += Math.max(Number(clip.campaignCreditedViews) || 0, 0);
      users[userId].legacyRecordedPaidViews += Math.max(Number(clip.payout?.paidViews) || 0, 0);
      users[userId].legacyRecordedPaidAmount += Math.max(Number(clip.payout?.paidMoney) || 0, 0);
    } else if (clip.status === 'rejected') users[userId].rejectedClips++;
    else if (clip.status === 'pending') users[userId].pendingClips++;
  }
  const creditedViews = Object.values(users).reduce((sum, user) => sum + user.creditedViews, 0);
  const legacyRecordedPaidViews = Object.values(users).reduce((sum, user) => sum + user.legacyRecordedPaidViews, 0);
  const legacyRecordedPaidAmount = Object.values(users).reduce((sum, user) => sum + user.legacyRecordedPaidAmount, 0);
  const earnings = creditedViews / 1_000_000 * CROWDER_HISTORICAL_RECONCILIATION.ratePerMillion;
  return {
    records,
    submissionCount: records.length,
    statuses,
    creditedViews,
    earnings,
    legacyRecordedPaidViews,
    legacyRecordedPaidAmount,
    users
  };
}

function getCrowderHistoricalFingerprint(records) {
  const rows = records
    .map(clip => ({
      id: String(clip.id || ''),
      userId: String(clip.userId || ''),
      submittedAt: getClipSubmissionTimestamp(clip),
      status: String(clip.status || ''),
      campaignCreditedViews: Math.max(Number(clip.campaignCreditedViews) || 0, 0),
      legacyRecordedPaidViews: Math.max(Number(clip.payout?.paidViews) || 0, 0),
      legacyRecordedPaidAmount: Math.max(Number(clip.payout?.paidMoney) || 0, 0)
    }))
    .sort((left, right) => left.id.localeCompare(right.id));
  return crypto.createHash('sha256').update(JSON.stringify(rows)).digest('hex');
}

function getCrowderHistoricalMessageCandidate(data, userId, expected) {
  const config = CROWDER_HISTORICAL_RECONCILIATION;
  const canonicalId = getPayoutTrackerId(config.campaignId, userId, config.historicalCycle.earningRunKey,
    config.historicalCycle.cycleStartAt, config.historicalCycle.cycleEndAt);
  const canonical = data?.payoutTrackers?.[canonicalId];
  if (canonical?.messageId) return { messageId: canonical.messageId, channelId: canonical.channelId || config.payoutChannelId, source: 'canonical_tracker' };
  if (expected?.messageId) return { messageId: expected.messageId, channelId: config.payoutChannelId, source: 'verified_legacy_historical_candidate' };
  for (const key of config.supersededEarningRunKeys) {
    const cycle = getCampaignPayoutCycle(CAMPAIGNS.crowder, { earningRunKey: key });
    const id = getPayoutTrackerId(config.campaignId, userId, key, cycle?.cycleStartAt, cycle?.cycleEndAt);
    const tracker = data?.payoutTrackers?.[id];
    if (tracker?.messageId) return { messageId: tracker.messageId, channelId: tracker.channelId || config.payoutChannelId, source: 'superseded_historical_tracker' };
  }
  return { messageId: null, channelId: null, source: 'new_card_required' };
}

function getCrowderLegacyTrackerAudit(data, userId) {
  return Object.values(data?.payoutTrackers || {})
    .filter(tracker => tracker?.campaignId === 'crowder' && String(tracker.userId) === String(userId) && !tracker.earningRunKey)
    .map(tracker => ({
      trackerId: tracker.id,
      messageId: tracker.messageId || tracker.legacyMessageId || null,
      status: tracker.status || null,
      lifetimeViews: Number(tracker.lifetimeViews) || 0,
      lifetimeEarned: Number(tracker.lifetimeEarned) || 0,
      lifetimePaid: Number(tracker.lifetimePaid) || 0,
      paidViews: Number(tracker.paidViews) || 0,
      paidMoney: Number(tracker.paidMoney) || 0,
      paymentHistory: structuredClone(tracker.paymentHistory || [])
    }));
}

function buildCrowderHistoricalReconciliationDryRun(data, options = {}) {
  const config = CROWDER_HISTORICAL_RECONCILIATION;
  const cycle = config.historicalCycle;
  const mismatches = [];
  const closeEnough = (actual, expected) => Math.abs(Number(actual) - Number(expected)) <= 1e-9;
  const summary = summarizeCrowderHistoricalCycle(data, cycle);
  if (summary.submissionCount !== cycle.expectedSubmissionCount) mismatches.push(`submission_count:${summary.submissionCount}`);
  for (const [status, expected] of Object.entries(cycle.expectedStatuses)) {
    if ((summary.statuses[status] || 0) !== expected) mismatches.push(`status_${status}:${summary.statuses[status] || 0}`);
  }
  for (const [field, expected] of [
    ['creditedViews', cycle.expectedCreditedViews], ['earnings', cycle.expectedEarnings],
    ['legacyRecordedPaidViews', cycle.expectedLegacyRecordedPaidViews],
    ['legacyRecordedPaidAmount', cycle.expectedLegacyRecordedPaidAmount]
  ]) if (!closeEnough(summary[field], expected)) mismatches.push(`${field}:${summary[field]}`);
  for (const window of cycle.windows) {
    const start = Date.parse(window.startAt);
    const end = Date.parse(window.endAt);
    const creditedViews = summary.records.reduce((sum, clip) => {
      const submittedAt = getClipSubmissionTimestamp(clip);
      return clip.status === 'approved' && submittedAt >= start && submittedAt < end
        ? sum + Math.max(Number(clip.campaignCreditedViews) || 0, 0)
        : sum;
    }, 0);
    if (creditedViews !== window.creditedViews) mismatches.push(`window_${window.startAt}:${creditedViews}`);
  }
  const currentCycle = getCampaignPayoutCycle(CAMPAIGNS.crowder, { earningRunKey: config.currentEarningRunKey });
  const creators = [];
  for (const [userId, expected] of Object.entries(cycle.users)) {
    const observed = summary.users[userId] || {
      userId, approvedClips: 0, rejectedClips: 0, pendingClips: 0,
      creditedViews: 0, legacyRecordedPaidViews: 0, legacyRecordedPaidAmount: 0
    };
    for (const field of ['creditedViews', 'legacyRecordedPaidViews', 'legacyRecordedPaidAmount']) {
      if (!closeEnough(observed[field], expected[field])) mismatches.push(`${userId}_${field}:${observed[field]}`);
    }
    const actualPaidViews = 0;
    const actualPaidAmount = 0;
    const correctedUnpaidViews = Math.max(observed.creditedViews - actualPaidViews, 0);
    const correctedUnpaidAmount = Math.max(observed.creditedViews / 1_000_000 * config.ratePerMillion - actualPaidAmount, 0);
    const thresholdMet = correctedUnpaidViews >= config.historicalPayoutThresholdViews;
    const finalAction = correctedUnpaidViews === 0 ? 'closed_no_payout' : thresholdMet ? 'ready' : 'carry_forward';
    const expectedCarry = config.finalCarry[userId] || { views: 0, amount: 0 };
    const carryInViews = finalAction === 'carry_forward' ? correctedUnpaidViews : 0;
    const carryInAmount = finalAction === 'carry_forward' ? correctedUnpaidAmount : 0;
    if (!closeEnough(carryInViews, expectedCarry.views) || !closeEnough(carryInAmount, expectedCarry.amount)) {
      mismatches.push(`carry_${userId}:${carryInViews}/${carryInAmount}`);
    }
    const historicalMessage = getCrowderHistoricalMessageCandidate(data, userId, expected);
    const currentTrackerId = getPayoutTrackerId(config.campaignId, userId, currentCycle.earningRunKey, currentCycle.cycleStartAt, currentCycle.cycleEndAt);
    const currentTracker = data?.payoutTrackers?.[currentTrackerId];
    creators.push({
      userId,
      cycleEarnedViews: observed.creditedViews,
      cycleEarnedAmount: observed.creditedViews / 1_000_000 * config.ratePerMillion,
      legacyRecordedPaidViews: observed.legacyRecordedPaidViews,
      legacyRecordedPaidAmount: observed.legacyRecordedPaidAmount,
      actualPaidViews,
      actualPaidAmount,
      correctedUnpaidViews,
      correctedUnpaidAmount,
      thresholdMet,
      finalAction,
      historicalMessageId: historicalMessage.messageId,
      historicalMessageSource: historicalMessage.source,
      currentMessageId: currentTracker?.messageId || null,
      carryInViews,
      carryInAmount,
      legacyTrackers: getCrowderLegacyTrackerAudit(data, userId)
    });
  }
  const configuredUsers = new Set(Object.keys(cycle.users));
  for (const [userId, observed] of Object.entries(summary.users)) {
    if (!configuredUsers.has(userId) && (observed.creditedViews > 0 || observed.approvedClips > 0 || observed.rejectedClips > 0 || observed.pendingClips > 0)) {
      mismatches.push(`unexpected_historical_creator:${userId}`);
    }
  }
  const readyCreators = creators.filter(item => item.finalAction === 'ready');
  const carryCreators = creators.filter(item => item.finalAction === 'carry_forward');
  const readyViews = readyCreators.reduce((sum, item) => sum + item.correctedUnpaidViews, 0);
  const readyAmount = readyCreators.reduce((sum, item) => sum + item.correctedUnpaidAmount, 0);
  const carryViews = carryCreators.reduce((sum, item) => sum + item.carryInViews, 0);
  const carryAmount = carryCreators.reduce((sum, item) => sum + item.carryInAmount, 0);
  const actualPaidViews = creators.reduce((sum, item) => sum + item.actualPaidViews, 0);
  const actualPaidAmount = creators.reduce((sum, item) => sum + item.actualPaidAmount, 0);
  if (readyViews !== config.expectedReadyViews) mismatches.push(`ready_views:${readyViews}`);
  if (!closeEnough(readyAmount, config.expectedReadyAmount)) mismatches.push(`ready_amount:${readyAmount}`);
  if (carryViews !== config.expectedCarryViews) mismatches.push(`carry_views:${carryViews}`);
  if (!closeEnough(carryAmount, config.expectedCarryAmount)) mismatches.push(`carry_amount:${carryAmount}`);
  if (actualPaidViews !== config.expectedActualPaidViews) mismatches.push(`actual_paid_views:${actualPaidViews}`);
  if (!closeEnough(actualPaidAmount, config.expectedActualPaidAmount)) mismatches.push(`actual_paid_amount:${actualPaidAmount}`);
  if (readyViews + carryViews !== cycle.expectedCreditedViews) mismatches.push(`liability_views_total:${readyViews + carryViews}`);
  if (!closeEnough(readyAmount + carryAmount, cycle.expectedEarnings)) mismatches.push(`liability_amount_total:${readyAmount + carryAmount}`);
  const historicalFingerprint = getCrowderHistoricalFingerprint(summary.records);
  if (options.enforceProductionFingerprint !== false && config.expectedHistoricalFingerprint && historicalFingerprint !== config.expectedHistoricalFingerprint) {
    mismatches.push(`historical_fingerprint:${historicalFingerprint}`);
  }
  return {
    valid: mismatches.length === 0,
    mismatches,
    earningRunKey: cycle.earningRunKey,
    cycleStartAt: cycle.cycleStartAt,
    cycleEndAt: cycle.cycleEndAt,
    submissionCount: summary.submissionCount,
    statuses: summary.statuses,
    historicalCreditedViews: summary.creditedViews,
    historicalEarnings: summary.earnings,
    legacyRecordedPaidViews: summary.legacyRecordedPaidViews,
    legacyRecordedPaidAmount: summary.legacyRecordedPaidAmount,
    actualPaidViews,
    actualPaidAmount,
    readyViews,
    readyAmount,
    carryViews,
    carryAmount,
    creators,
    historicalFingerprint,
    currentInvariant: getCrowderCurrentAccountingInvariant(data, options.now ?? Date.now())
  };
}

function buildCrowderLegacyPaymentAudit(records, userId, legacyTrackers) {
  const sourceClips = records
    .filter(clip => String(clip.userId) === String(userId) &&
      (Number(clip.payout?.paidViews) > 0 || Number(clip.payout?.paidMoney) > 0 || (clip.payout?.history || []).length > 0))
    .map(clip => ({
      clipId: clip.id,
      status: clip.status,
      legacyRecordedPaidViews: Math.max(Number(clip.payout?.paidViews) || 0, 0),
      legacyRecordedPaidAmount: Math.max(Number(clip.payout?.paidMoney) || 0, 0),
      rawPaymentHistory: structuredClone(clip.payout?.history || [])
    }));
  return {
    legacyPaymentStateSource: 'pre_real_payout_accounting',
    settlementCorrectionReason: 'business_confirmed_no_actual_payment_sent',
    sourceClips,
    legacyTrackers: structuredClone(legacyTrackers),
    duplicateRawHistoryEntriesPreservedForAudit: sourceClips.reduce((sum, item) => sum + Math.max(item.rawPaymentHistory.length - 1, 0), 0)
  };
}

function makeCrowderCarryBalance(userId, sourceCycle, views, amount, carriedAt) {
  return {
    sourceCampaignId: 'crowder',
    sourceEarningRunKey: sourceCycle.earningRunKey,
    sourceCycleStartAt: sourceCycle.cycleStartAt,
    sourceCycleEndAt: sourceCycle.cycleEndAt,
    views,
    amount,
    paidViews: 0,
    paidAmount: 0,
    status: 'unpaid',
    carriedAt,
    userId
  };
}

function applyCrowderHistoricalReconciliation(data, options = {}) {
  const config = CROWDER_HISTORICAL_RECONCILIATION;
  if (data.storageMigrations?.[config.migrationName]) return { changed: false, ...data.storageMigrations[config.migrationName] };
  const reconciledAt = Number(options.now ?? Date.now());
  const dryRun = buildCrowderHistoricalReconciliationDryRun(data, {
    now: reconciledAt,
    enforceProductionFingerprint: options.enforceProductionFingerprint
  });
  if (!dryRun.valid) throw new Error(`Crowder historical reconciliation aborted: ${dryRun.mismatches.join(', ')}`);
  const beforeInvariant = dryRun.currentInvariant;
  const working = structuredClone(data);
  const cycle = config.historicalCycle;
  const records = getCrowderHistoricalCycleRecords(working, cycle);
  working.campaignPayoutReconciliations ||= {};
  const ledger = working.campaignPayoutReconciliations[cycle.earningRunKey] = {
    campaignId: config.campaignId,
    earningRunKey: cycle.earningRunKey,
    cycleStartAt: cycle.cycleStartAt,
    cycleEndAt: cycle.cycleEndAt,
    reconciliationStatus: 'recovered',
    reconciliationMethod: 'approved_historical_credit_direct_no_cap_merged_payout_cycle',
    reconciliationReason: 'Business-confirmed single Crowder payout cycle and no actual payments sent before canonical settlement.',
    reconciliationRawPool: dryRun.historicalCreditedViews,
    reconciliationCap: 7_000_000,
    canonicalSettlementModel: 'actual_payment_only',
    reconciledAt,
    users: {}
  };
  for (const row of dryRun.creators) ledger.users[row.userId] = {
    userId: row.userId,
    totalCreditedViews: row.cycleEarnedViews,
    earnings: row.cycleEarnedAmount,
    legacyRecordedPaidViews: row.legacyRecordedPaidViews,
    legacyRecordedPaidAmount: row.legacyRecordedPaidAmount,
    actualPaidViews: 0,
    actualPaidAmount: 0,
    finalAction: row.finalAction
  };
  for (const clip of records) {
    clip.earningRunKey = cycle.earningRunKey;
    clip.historicalReconciliationKey = cycle.earningRunKey;
  }
  working.payoutTrackers ||= {};
  const historicalTrackerIds = [];
  const currentCarryTrackerIds = [];
  const reusedHistoricalMessageIds = [];
  const currentCycle = getCampaignPayoutCycle(CAMPAIGNS.crowder, { earningRunKey: config.currentEarningRunKey });
  const carryUsers = new Set(Object.keys(config.finalCarry));

  for (const row of dryRun.creators) {
    const userId = row.userId;
    const trackerId = getPayoutTrackerId(config.campaignId, userId, cycle.earningRunKey, cycle.cycleStartAt, cycle.cycleEndAt);
    const messageId = row.historicalMessageId;
    if (messageId) {
      for (const other of Object.values(working.payoutTrackers)) {
        if (other?.id !== trackerId && String(other?.messageId || '') === String(messageId)) {
          other.messageId = null;
          other.channelId = null;
          other.historicalMessageReassignedToTrackerId = trackerId;
        }
      }
      reusedHistoricalMessageIds.push(messageId);
    }
    const carry = config.finalCarry[userId] || { views: 0, amount: 0 };
    const existing = working.payoutTrackers[trackerId] || {};
    const realPaymentHistory = (existing.paymentHistory || []).filter(item => item?.paymentSource === 'canonical_real_payment');
    const tracker = working.payoutTrackers[trackerId] = {
      ...existing,
      id: trackerId, campaignId: config.campaignId, userId,
      earningRunKey: cycle.earningRunKey, cycleStartAt: cycle.cycleStartAt, cycleEndAt: cycle.cycleEndAt,
      cycleType: 'earning_run', channelId: messageId ? config.payoutChannelId : null,
      messageId: messageId || null, requiresHistoricalMessageVerification: Boolean(messageId),
      reconciliationStatus: 'recovered', reconciliationMethod: 'approved_historical_credit_direct_no_cap_merged_payout_cycle',
      reconciliationRawPool: cycle.expectedCreditedViews, reconciliationCap: 7_000_000,
      historicalPayoutThresholdViews: config.historicalPayoutThresholdViews,
      canonicalSettlementModel: 'actual_payment_only',
      actualPaidViews: 0,
      actualPaidAmount: 0,
      actualPaidAt: null,
      legacyRecordedPaidViews: row.legacyRecordedPaidViews,
      legacyRecordedPaidAmount: row.legacyRecordedPaidAmount,
      legacyPaymentStateSource: 'pre_real_payout_accounting',
      settlementCorrectionReason: 'business_confirmed_no_actual_payment_sent',
      legacyPaymentAudit: buildCrowderLegacyPaymentAudit(records, userId, row.legacyTrackers),
      paymentHistory: realPaymentHistory,
      carriedForwardViews: carry.views,
      carriedForwardAmount: carry.amount,
      carriedForwardTotalViews: carry.views,
      carriedForwardTotalAmount: carry.amount,
      carryForwardEarningRunKey: carry.views ? config.currentEarningRunKey : null,
      carryOutBalances: carry.views ? [makeCrowderCarryBalance(userId, cycle, carry.views, carry.amount, reconciledAt)] : [],
      noPayoutRequired: row.finalAction === 'closed_no_payout',
      cycleStatus: 'closed', closedAt: Date.parse(cycle.cycleEndAt),
      createdAt: existing.createdAt || reconciledAt, updatedAt: reconciledAt
    };
    calculateTrackerStats(tracker, { data: working, now: reconciledAt });
    historicalTrackerIds.push(trackerId);
  }

  const replacedSourceKeys = new Set([...config.supersededEarningRunKeys, cycle.earningRunKey]);
  for (const current of Object.values(working.payoutTrackers)) {
    if (current?.campaignId !== config.campaignId || String(current.earningRunKey) !== config.currentEarningRunKey) continue;
    current.carryInBalances = getTrackerCarryBalances(current).filter(item => !replacedSourceKeys.has(String(item.sourceEarningRunKey)));
    calculateTrackerStats(current, { data: working, now: reconciledAt });
  }
  for (const userId of carryUsers) {
    const carry = config.finalCarry[userId];
    const current = ensurePayoutTracker(config.campaignId, userId, { data: working, cycle: currentCycle, force: true });
    current.carryInBalances = getTrackerCarryBalances(current).filter(item => !replacedSourceKeys.has(String(item.sourceEarningRunKey)));
    current.carryInBalances.push(makeCrowderCarryBalance(userId, cycle, carry.views, carry.amount, reconciledAt));
    calculateTrackerStats(current, { data: working, now: reconciledAt });
    currentCarryTrackerIds.push(current.id);
  }

  let legacyTrackersArchived = 0;
  const supersededTrackerIds = [];
  const supersededCardSyncTrackerIds = [];
  for (const tracker of Object.values(working.payoutTrackers)) {
    if (tracker?.campaignId !== config.campaignId || tracker.earningRunKey) continue;
    tracker.legacyCycleUnresolved = false;
    tracker.legacyArchivedAt ||= reconciledAt;
    tracker.historicalReconciledAt = reconciledAt;
    tracker.historicalReconciliationReferences = [cycle.earningRunKey, config.currentEarningRunKey];
    legacyTrackersArchived++;
  }
  for (const tracker of Object.values(working.payoutTrackers)) {
    if (tracker?.campaignId !== config.campaignId || !config.supersededEarningRunKeys.includes(String(tracker.earningRunKey))) continue;
    tracker.supersededByEarningRunKey = cycle.earningRunKey;
    tracker.historicalSupersededAt = reconciledAt;
    tracker.cycleStatus = 'closed';
    supersededTrackerIds.push(tracker.id);
    if (tracker.messageId) supersededCardSyncTrackerIds.push(tracker.id);
  }
  const afterInvariant = getCrowderCurrentAccountingInvariant(working, reconciledAt);
  if (JSON.stringify(beforeInvariant) !== JSON.stringify(afterInvariant)) {
    throw new Error('Crowder historical reconciliation aborted: current campaign accounting changed');
  }
  const duplicateRawHistoryEntriesPreservedForAudit = historicalTrackerIds.reduce((sum, trackerId) =>
    sum + (working.payoutTrackers[trackerId].legacyPaymentAudit?.duplicateRawHistoryEntriesPreservedForAudit || 0), 0);
  const currentCardSyncTrackerIds = Object.values(working.payoutTrackers)
    .filter(tracker => tracker?.campaignId === config.campaignId &&
      String(tracker.earningRunKey) === config.currentEarningRunKey &&
      (tracker.messageId || Number(tracker.carryInViews) > 0))
    .map(tracker => tracker.id);
  const report = {
    completedAt: reconciledAt,
    status: 'applied',
    earningRunKey: cycle.earningRunKey,
    historicalTrackerIds,
    currentCarryTrackerIds,
    currentCardSyncTrackerIds,
    reusedHistoricalMessageIds,
    legacyTrackersArchived,
    supersededTrackerIds,
    supersededCardSyncTrackerIds,
    duplicateRawHistoryEntriesPreservedForAudit,
    historicalTotals: {
      creditedViews: dryRun.historicalCreditedViews,
      earnings: dryRun.historicalEarnings,
      legacyRecordedPaidViews: dryRun.legacyRecordedPaidViews,
      legacyRecordedPaidAmount: dryRun.legacyRecordedPaidAmount,
      actualPaidViews: dryRun.actualPaidViews,
      actualPaidAmount: dryRun.actualPaidAmount,
      readyViews: dryRun.readyViews,
      readyAmount: dryRun.readyAmount
    },
    carryForwardViews: dryRun.carryViews,
    carryForwardAmount: dryRun.carryAmount,
    historicalFingerprint: dryRun.historicalFingerprint,
    creators: dryRun.creators,
    currentInvariantBefore: beforeInvariant,
    currentInvariantAfter: afterInvariant,
    cardSyncTrackerIds: [
      ...historicalTrackerIds.filter(id => Number(working.payoutTrackers[id]?.lifetimeViewsForCycle) > 0),
      ...currentCardSyncTrackerIds
    ]
  };
  working.storageMigrations ||= {};
  working.storageMigrations[config.migrationName] = report;
  for (const key of Object.keys(data)) delete data[key];
  Object.assign(data, working);
  return { changed: true, ...report };
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
            campaignAccounts: {},
            socials: []

        };

    }

    const user = data.users[id];
    if (!Array.isArray(user.socials)) user.socials = Object.values(user.socials || {}).filter(Boolean);

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

function isPayoutEligibleClip(clip) {
  return Boolean(clip && clip.status === 'approved' && clip.payoutEligible !== false);
}

function findClipRecord(data, clipId) {
  if (data.clipReviews?.[clipId]) return { clip: data.clipReviews[clipId], collection: 'clipReviews' };
  if (data.clips?.[clipId]) return { clip: data.clips[clipId], collection: 'clips' };
  return null;
}

function wasClipPreviouslyApproved(clip) {
  return Boolean(
    clip?.wasEverApproved === true ||
    clip?.approvedAt ||
    Number(clip?.payout?.paidViews) > 0 ||
    Number(clip?.payout?.paidMoney) > 0 ||
    (Array.isArray(clip?.payout?.history) && clip.payout.history.length > 0)
  );
}

function getClipRejectionStage(clip, collection) {
  if (clip?.rejectionStage === 'post_approval') return 'post_approval';
  return collection === 'clips' || wasClipPreviouslyApproved(clip)
    ? 'post_approval'
    : 'pre_approval';
}

function getClipSubmittedTimestamp(clip) {
  const directTimestamp = Number(clip?.submittedTimestamp);
  if (Number.isFinite(directTimestamp) && directTimestamp > 0) return directTimestamp;
  const parsed = Date.parse(clip?.submittedAt || clip?.createdAt || '');
  return Number.isFinite(parsed) ? parsed : Date.now();
}

function initializeClipTrackingFields(clip) {
  const submittedTimestamp = getClipSubmittedTimestamp(clip);
  clip.submittedTimestamp = submittedTimestamp;
  clip.submittedAt ||= new Date(submittedTimestamp).toISOString();
  clip.lastChecked = Number(clip.lastChecked) || submittedTimestamp;
  if (clip.trackingStatus === 'completed') {
    clip.nextCheckAt = null;
    clip.trackingRetryAt = null;
    return clip;
  }
  clip.nextCheckAt = Number(clip.nextCheckAt) || submittedTimestamp + CLIP_TRACK_INTERVAL_MS;
  return clip;
}

function isTrackableReviewClip(clip) {
  const campaign = CAMPAIGNS[clip?.campaignId];
  return Boolean(
    clip &&
    clip.status === 'pending' &&
    clip.trackingStatus !== 'completed' &&
    (!campaign?.separateEarningLifecycle || isClipInCampaignEarningPeriod(clip, campaign)) &&
    (clip.platform === 'tiktok' || clip.platform === 'youtube' || clip.platform === 'instagram') &&
    (clip.videoUrl || clip.url)
  );
}

function isTrackableApprovedClip(clip) {
  const campaign = CAMPAIGNS[clip?.campaignId];
  return Boolean(
    clip &&
    isPayoutEligibleClip(clip) &&
    clip.trackingStatus !== 'completed' &&
    (!campaign?.separateEarningLifecycle || isClipInCampaignEarningPeriod(clip, campaign)) &&
    (clip.platform === 'tiktok' || clip.platform === 'youtube' || clip.platform === 'instagram') &&
    (clip.videoUrl || clip.url)
  );
}

function isClipTrackingDue(clip, now = Date.now()) {
  if (clip?.trackingStatus === 'completed') return false;
  initializeClipTrackingFields(clip);
  const retryAt = Number(clip.trackingRetryAt) || 0;
  if (retryAt > 0 && now < retryAt) return false;
  const nextCheckAt = Number(clip.nextCheckAt) || 0;
  return nextCheckAt > 0 && now >= nextCheckAt;
}

function advanceClipNextCheckAt(clip, now = Date.now()) {
  if (clip?.trackingStatus === 'completed') {
    clip.nextCheckAt = null;
    clip.trackingRetryAt = null;
    return null;
  }
  initializeClipTrackingFields(clip);
  const submittedTimestamp = getClipSubmittedTimestamp(clip);
  let nextCheckAt = Number(clip.nextCheckAt);
  if (!Number.isFinite(nextCheckAt) || nextCheckAt <= 0) {
    nextCheckAt = submittedTimestamp + CLIP_TRACK_INTERVAL_MS;
  }
  while (nextCheckAt <= now) nextCheckAt += CLIP_TRACK_INTERVAL_MS;
  clip.nextCheckAt = nextCheckAt;
  return nextCheckAt;
}

function getStoredPublicViews(clip) {
  const publicSnapshots = [
    clip?.publicViews,
    clip?.currentViews,
    clip?.submissionViews,
    clip?.approvalViews
  ].map(Number).filter(value => Number.isFinite(value) && value >= 0);
  // Legacy records used `views` for both public and credited views. Only use it
  // as a public fallback when no explicit public snapshot exists.
  if (!publicSnapshots.length) {
    const legacyViews = Number(clip?.views);
    if (Number.isFinite(legacyViews) && legacyViews >= 0) publicSnapshots.push(legacyViews);
  }
  return publicSnapshots.length ? Math.max(...publicSnapshots) : 0;
}

function getSafeTrackedViews(clip, metadata) {
  const fetchedViews = Number(metadata?.views);
  const existingViews = getStoredPublicViews(clip);
  if (!Number.isFinite(fetchedViews) || fetchedViews < 0) return existingViews;
  return Math.max(existingViews, fetchedViews);
}

function getInitialSubmissionViewState(metadata, campaign) {
  const initialViews = Number(metadata?.views);
  const publicViews = Number.isFinite(initialViews) && initialViews >= 0 ? initialViews : 0;
  const deferredCredit = campaign?.separateEarningLifecycle || isStraightCampaign(campaign);
  const creditedViews = deferredCredit ? 0 : publicViews;
  return {
    publicViews,
    currentViews: publicViews,
    submissionViews: publicViews,
    views: creditedViews,
    campaignCreditedViews: deferredCredit ? 0 : undefined
  };
}

function buildApifyInstagramProfileInput(username) {
  const cleanUsername = normalizeSocialUsername(username);
  if (!cleanUsername) throw new Error('Instagram username is required.');
  return { usernames: [cleanUsername] };
}

async function runApifyInstagramProfileScraper(username) {
  if (!APIFY_API_TOKEN) throw new Error('APIFY_API_TOKEN is not configured.');
  const input = buildApifyInstagramProfileInput(username);

  try {
    const response = await axios.post(
      `https://api.apify.com/v2/actors/${APIFY_INSTAGRAM_PROFILE_ACTOR}/run-sync-get-dataset-items`,
      input,
      {
        headers: { Authorization: `Bearer ${APIFY_API_TOKEN}` },
        timeout: 120000
      }
    );
    return Array.isArray(response.data) ? response.data : [];
  } catch (error) {
    const details = getApifyInstagramError(error);
    const wrapped = new Error(details.message);
    wrapped.apifyInstagramError = details;
    throw wrapped;
  }
}

function normalizeApifyInstagramProfile(item, requestedUsername) {
  const source = item || {};
  const username = normalizeUsername(source.username || '');
  const normalizedUsername = normalizeSocialUsername(username);
  const requestedNormalizedUsername = normalizeSocialUsername(requestedUsername);
  if (!normalizedUsername || normalizedUsername !== requestedNormalizedUsername) {
    throw new Error('Apify did not return the requested Instagram profile.');
  }

  const platformAccountId = source.id === null || source.id === undefined
    ? null
    : String(source.id).trim() || null;
  const hasUsableProfilePayload = Boolean(
    platformAccountId ||
    typeof source.biography === 'string' ||
    typeof source.private === 'boolean'
  );
  if (!hasUsableProfilePayload) throw new Error('Apify did not return usable Instagram profile data.');
  const followers = Number(source.followersCount);
  const profileUrl = typeof source.url === 'string' && /^https:\/\//i.test(source.url)
    ? source.url
    : `https://www.instagram.com/${normalizedUsername}/`;
  const avatarUrl = [source.profilePicUrlHD, source.profilePicUrl]
    .find(value => typeof value === 'string' && /^https:\/\//i.test(value)) || null;

  return {
    platform: 'instagram',
    username,
    normalizedUsername,
    platformAccountId,
    displayName: typeof source.fullName === 'string' && source.fullName.trim()
      ? source.fullName.trim()
      : username,
    bio: typeof source.biography === 'string' ? source.biography : null,
    profileUrl,
    avatarUrl,
    followers: Number.isFinite(followers) && followers >= 0 ? followers : 0,
    private: source.private === true,
    verifiedBadge: source.verified === true,
    rawProvider: 'apify/instagram-profile-scraper'
  };
}

async function fetchInstagramPublicProfile(username, options = {}) {
  const cleanUsername = normalizeSocialUsername(username);
  if (!cleanUsername) throw new Error('Instagram username is required.');
  const runActor = options.runActor || runApifyInstagramProfileScraper;
  const items = await runActor(cleanUsername);
  const matchingItem = (Array.isArray(items) ? items : []).find(item =>
    normalizeSocialUsername(item?.username) === cleanUsername
  );
  if (!matchingItem) throw new Error('Instagram profile could not be retrieved.');
  return normalizeApifyInstagramProfile(matchingItem, cleanUsername);
}

function applyStraightCampaignTracking(clip, metadata, data, publicViews, campaign) {
  const previousCreditedViews = getClipCreditedViews(clip);
  const payoutLimit = ensureClipPayoutLimitSnapshot(clip, campaign, data);
  clip.straightTracking ||= {};
  const tracking = clip.straightTracking;
  const previousObservedViews = Math.max(
    Number(tracking.lastPublicViews) || 0,
    Number(clip.publicViews) || 0,
    Number(clip.currentViews) || 0,
    Number(clip.approvalViews) || 0,
    Number(clip.submissionViews) || 0
  );

  let creditedIncrease = 0;
  if (isPayoutEligibleClip(clip)) {
    if (tracking.baselinePending) {
      tracking.refillBaselineViews = publicViews;
      tracking.baselinePending = false;
    } else {
      const publicGrowth = Math.max(publicViews - previousObservedViews, 0);
      const remainingIncludingThisClip = getStraightCampaignRemainingCreditableViews(data, campaign, clip.id);
      const remainingIncrement = Math.max(remainingIncludingThisClip - previousCreditedViews, 0);
      const remainingClipCapacity = payoutLimit
        ? Math.max(payoutLimit.maxCampaignCreditedViews - previousCreditedViews, 0)
        : Infinity;
      creditedIncrease = Math.min(publicGrowth, remainingIncrement, remainingClipCapacity);
    }
  }

  clip.campaignCreditedViews = previousCreditedViews + creditedIncrease;
  clip.views = clip.campaignCreditedViews;
  clip.publicViews = publicViews;
  clip.currentViews = publicViews;
  tracking.lastPublicViews = publicViews;
  tracking.creditedViews = clip.campaignCreditedViews;
  if (payoutLimit && clip.campaignCreditedViews >= payoutLimit.maxCampaignCreditedViews) {
    clip.clipPayoutCapReached = true;
    clip.trackingStatus = 'completed';
    clip.completedReason = 'clip_payout_cap_reached';
    clip.completedAt ||= Date.now();
    clip.nextCheckAt = null;
    clip.trackingRetryAt = null;
  }
  if (creditedIncrease > 0) tracking.lastCreditedAt = Date.now();
  if (metadata?.title) clip.title = metadata.title;
  if (metadata?.thumbnailUrl) clip.thumbnailUrl = metadata.thumbnailUrl;
  if (metadata?.authorName || metadata?.authorDisplayName || metadata?.authorUsername) {
    clip.platformAuthorName = metadata.authorName || metadata.authorUsername || metadata.authorDisplayName;
  }
  if (metadata?.authorId) clip.platformAuthorId = metadata.authorId;
  clip.lastChecked = Date.now();
  clip.lastTrackingError = null;
  clip.lastTrackingErrorAt = null;
  clip.trackingRetryAt = null;
  return clip.campaignCreditedViews;
}

function getClipLikes(clip) {
  const candidates = [
    clip?.likes,
    clip?.likeCount,
    clip?.likesCount,
    clip?.currentLikes,
    clip?.metadata?.likes,
    clip?.metadata?.likeCount,
    clip?.metadata?.likesCount
  ];
  for (const value of candidates) {
    const numeric = Number(value);
    if (Number.isFinite(numeric) && numeric >= 0) return numeric;
  }
  return null;
}

function applyTrackedMetadata(clip, metadata, data) {
  const fetchedLikes = Number(metadata?.likes);
  if (Number.isFinite(fetchedLikes) && fetchedLikes >= 0) {
    clip.likes = fetchedLikes;
  }
  const fetchedComments = Number(metadata?.comments ?? metadata?.commentCount ?? metadata?.commentsCount);
  if (Number.isFinite(fetchedComments) && fetchedComments >= 0) {
    clip.comments = fetchedComments;
  }
  const publicViews = getSafeTrackedViews(clip, metadata);
  const campaign = CAMPAIGNS[clip.campaignId];
  if (isStraightCampaign(campaign)) {
    return applyStraightCampaignTracking(clip, metadata, data, publicViews, campaign);
  }
  if (campaign?.separateEarningLifecycle) {
    return applySeparateEarningCycleTracking(clip, metadata, data, publicViews, campaign);
  }
  const previousCreditedViews = getClipCreditedViews(clip);
  const payoutLimit = ensureClipPayoutLimitSnapshot(clip, campaign, data);
  const cap = getCampaignViewCap(campaign);
  const otherCreditedViews = cap === null ? 0 : getCampaignCurrentCycleCreditedViews(clip.campaignId, { data, excludeClipId: clip.id });
  const remainingForThisClip = cap === null ? Infinity : Math.max(cap - otherCreditedViews, 0);
  const desiredCreditedViews = Math.max(previousCreditedViews, payoutLimit
    ? Math.min(publicViews, payoutLimit.maxCampaignCreditedViews)
    : publicViews);
  const creditedViews = cap === null
    ? desiredCreditedViews
    : Math.max(previousCreditedViews, Math.min(desiredCreditedViews, remainingForThisClip));

  clip.publicViews = publicViews;
  clip.currentViews = publicViews;
  clip.views = creditedViews;
  if (payoutLimit && creditedViews >= payoutLimit.maxCampaignCreditedViews && isPayoutEligibleClip(clip)) {
    clip.clipPayoutCapReached = true;
    clip.trackingStatus = 'completed';
    clip.completedReason = 'clip_payout_cap_reached';
    clip.completedAt ||= Date.now();
    clip.nextCheckAt = null;
    clip.trackingRetryAt = null;
  }
  if (cap !== null && process.env.DEBUG_VIEW_CAP_TRACKING === 'true') {
    console.log('[Campaign View Cap]', { campaignId: clip.campaignId, budgetCycleIndex: getCampaignBudgetCycleIndex(campaign), viewCap: cap, currentCreditedViews: otherCreditedViews, remainingViews: remainingForThisClip, fulfilled: otherCreditedViews >= cap });
  }
  if (cap !== null && previousCreditedViews > remainingForThisClip && process.env.DEBUG_VIEW_CAP_TRACKING === 'true') {
    console.warn('[Campaign View Cap] legacy credited views exceed remaining capacity', { clipId: clip.id, campaignId: clip.campaignId, previousCreditedViews, remainingForThisClip });
  }
  if (cap !== null && process.env.DEBUG_VIEW_CAP_TRACKING === 'true') {
    const campaignTotalAfter = otherCreditedViews + creditedViews;
    console.log('[Clip View Cap Update]', { clipId: clip.id, campaignId: clip.campaignId, previousCreditedViews, fetchedPublicViews: Number(metadata?.views) || null, creditedViewsAfter: creditedViews, creditedIncrease: creditedViews - previousCreditedViews, campaignTotalAfter, remainingAfter: Math.max(cap - campaignTotalAfter, 0) });
  }
  if (metadata?.title) clip.title = metadata.title;
  if (metadata?.thumbnailUrl) clip.thumbnailUrl = metadata.thumbnailUrl;
  if (metadata?.authorName || metadata?.authorDisplayName || metadata?.authorUsername) {
    clip.platformAuthorName = metadata.authorName || metadata.authorUsername || metadata.authorDisplayName;
  }
  if (metadata?.authorId) clip.platformAuthorId = metadata.authorId;
  clip.lastChecked = Date.now();
  clip.lastTrackingError = null;
  clip.lastTrackingErrorAt = null;
  clip.trackingRetryAt = null;
  return creditedViews;
}

function applySeparateEarningCycleTracking(clip, metadata, data, publicViews, campaign) {
  const accountingDate = Number.isFinite(Number(metadata?.accountingTimestamp))
    ? new Date(Number(metadata.accountingTimestamp))
    : new Date();
  const cycleKey = getCampaignBudgetCycleKey(campaign, accountingDate);
  const previousMonthlyViews = Math.max(Number(clip.campaignCreditedViews) || 0, Number(clip.views) || 0);
  const payoutLimit = ensureClipPayoutLimitSnapshot(clip, campaign, data);
  const remainingClipCapacity = payoutLimit
    ? Math.max(payoutLimit.maxCampaignCreditedViews - previousMonthlyViews, 0)
    : Infinity;
  clip.budgetTracking ||= {};
  const tracking = clip.budgetTracking;

  if (tracking.budgetCycleKey !== cycleKey) {
    const previousCycleKey = tracking.budgetCycleKey || null;
    const previousObservedPublicViews = Math.max(
      Number(tracking.lastPublicViews) || 0,
      Number(tracking.baselinePublicViews) || 0,
      Number(clip.publicViews) || 0,
      Number(clip.currentViews) || 0,
      Number(clip.approvalViews) || 0,
      Number(clip.submissionViews) || 0
    );

    if (previousCycleKey) {
      tracking.history ||= [];
      if (!tracking.history.some(entry => entry?.weekKey === previousCycleKey)) {
        tracking.history.push({
          weekKey: previousCycleKey,
          baselinePublicViews: Math.max(Number(tracking.baselinePublicViews) || 0, 0),
          lastPublicViews: Math.max(Number(tracking.lastPublicViews) || 0, previousObservedPublicViews),
          creditedViews: Math.max(Number(tracking.creditedViewsThisCycle) || 0, 0),
          closedAt: Date.now()
        });
      }
    }

    const cap = getCampaignViewCap(campaign);
    const otherWeeklyCredits = cap === null ? 0 : getCampaignCurrentWeeklyCreditedViews(campaign.id, { data, excludeClipId: clip.id, date: accountingDate });
    const remainingViews = cap === null ? Infinity : Math.max(cap - otherWeeklyCredits, 0);
    const creditedIncrease = isPayoutEligibleClip(clip)
      ? Math.min(Math.max(publicViews - previousObservedPublicViews, 0), remainingViews, remainingClipCapacity)
      : 0;
    tracking.budgetCycleKey = cycleKey;
    tracking.baselinePublicViews = previousObservedPublicViews;
    tracking.lastPublicViews = publicViews;
    tracking.creditedViewsThisCycle = creditedIncrease;
    tracking.pausedBaselineViews = null;
    if (creditedIncrease > 0) tracking.lastCreditedAt = Date.now();
    clip.campaignCreditedViews = previousMonthlyViews + creditedIncrease;
  } else {
    const lastPublicViews = Math.max(Number(tracking.lastPublicViews) || 0, Number(tracking.baselinePublicViews) || 0);
    const publicGrowth = Math.max(publicViews - lastPublicViews, 0);
    const cap = getCampaignViewCap(campaign);
    const otherWeeklyCredits = cap === null ? 0 : getCampaignCurrentWeeklyCreditedViews(campaign.id, { data, excludeClipId: clip.id, date: accountingDate });
    const remainingViews = cap === null ? Infinity : Math.max(cap - otherWeeklyCredits, 0);
    const creditedIncrease = isPayoutEligibleClip(clip)
      ? Math.min(publicGrowth, remainingViews, remainingClipCapacity)
      : 0;
    tracking.creditedViewsThisCycle = Math.max(Number(tracking.creditedViewsThisCycle) || 0, 0) + creditedIncrease;
    tracking.lastPublicViews = publicViews;
    if (creditedIncrease > 0) tracking.lastCreditedAt = Date.now();
    if (cap !== null && process.env.DEBUG_VIEW_CAP_TRACKING === 'true') {
      const weeklyTotalAfter = otherWeeklyCredits + tracking.creditedViewsThisCycle;
      console.log('[Clip View Cap Update]', { clipId: clip.id, campaignId: clip.campaignId, previousCreditedViews: previousMonthlyViews, fetchedPublicViews: Number(metadata?.views) || null, creditedViewsAfter: previousMonthlyViews + creditedIncrease, creditedIncrease, campaignTotalAfter: weeklyTotalAfter, remainingAfter: Math.max(cap - weeklyTotalAfter, 0) });
    }
    clip.campaignCreditedViews = previousMonthlyViews + creditedIncrease;
  }

  clip.campaignCreditedViews ??= previousMonthlyViews;
  clip.publicViews = publicViews;
  clip.currentViews = publicViews;
  clip.views = clip.campaignCreditedViews;
  if (payoutLimit && clip.campaignCreditedViews >= payoutLimit.maxCampaignCreditedViews && isPayoutEligibleClip(clip)) {
    clip.clipPayoutCapReached = true;
    clip.trackingStatus = 'completed';
    clip.completedReason = 'clip_payout_cap_reached';
    clip.completedAt ||= Date.now();
    clip.nextCheckAt = null;
    clip.trackingRetryAt = null;
  }
  if (metadata?.title) clip.title = metadata.title;
  if (metadata?.thumbnailUrl) clip.thumbnailUrl = metadata.thumbnailUrl;
  if (metadata?.authorName || metadata?.authorDisplayName || metadata?.authorUsername) {
    clip.platformAuthorName = metadata.authorName || metadata.authorUsername || metadata.authorDisplayName;
  }
  if (metadata?.authorId) clip.platformAuthorId = metadata.authorId;
  clip.lastChecked = Date.now();
  clip.lastTrackingError = null;
  clip.lastTrackingErrorAt = null;
  clip.trackingRetryAt = null;
  return clip.campaignCreditedViews;
}

function logClipViewLifecycle(clip) {
  if (process.env.DEBUG_CLIP_VIEW_LIFECYCLE !== 'true') return;
  console.log('[Clip View Lifecycle]', {
    clipId: clip?.id,
    campaignId: clip?.campaignId,
    platform: clip?.platform,
    status: clip?.status,
    submissionViews: clip?.submissionViews,
    approvalViews: clip?.approvalViews,
    publicViews: clip?.publicViews,
    currentViews: clip?.currentViews,
    campaignCreditedViews: clip?.campaignCreditedViews,
    currentWeekCreditedViews: clip?.budgetTracking?.creditedViewsThisCycle,
    lastChecked: clip?.lastChecked,
    nextCheckAt: clip?.nextCheckAt,
    trackingStatus: clip?.trackingStatus,
    earningRunKey: clip?.earningRunKey
  });
}

function updatePendingReviewTracking(clip, metadata, data) {
  const views = applyTrackedMetadata(clip, metadata, data);
  const rate = Number(CAMPAIGNS[clip.campaignId]?.ratePerMillion) || 0;
  clip.estimatedEarnings = views / 1_000_000 * rate;
  clip.payoutEligible = false;
  delete clip.totalMoneyMade;
  delete clip.moneyMade;
  delete clip.weeklyMoneyMade;
  delete clip.unpaidViews;
  delete clip.unpaidMoney;
  advanceClipNextCheckAt(clip);
  logClipViewLifecycle(clip);
  return clip;
}

function updateApprovedClipTracking(clip, metadata, data) {
  const approvalSnapshot = clip.approvalViews;
  const views = applyTrackedMetadata(clip, metadata, data);
  if (approvalSnapshot !== undefined && approvalSnapshot !== null) clip.approvalViews = approvalSnapshot;
  const rate = Number(CAMPAIGNS[clip.campaignId]?.ratePerMillion) || 0;
  clip.totalMoneyMade = views / 1_000_000 * rate;
  clip.moneyMade = clip.totalMoneyMade;
  clip.weeklyViews = views;
  clip.weeklyMoneyMade = clip.totalMoneyMade;
  clip.payoutEligible = true;
  clip.payout ||= { paidViews: 0, paidMoney: 0, lastPaidAt: null, history: [] };
  const paidViews = Number(clip.payout.paidViews) || 0;
  clip.unpaidViews = Math.max(views - paidViews, 0);
  clip.unpaidMoney = clip.unpaidViews / 1_000_000 * rate;
  if (isStraightCampaign(CAMPAIGNS[clip.campaignId])) {
    finalizeStraightCampaignIfFulfilled(data, clip.campaignId);
  }
  advanceClipNextCheckAt(clip);
  logClipViewLifecycle(clip);
  return clip;
}

function applyApprovalSnapshotAccounting(clip, campaign, data, latestPublicViews, approvedAt = Date.now()) {
  const rate = Number(campaign?.ratePerMillion) || 0;
  const completedOrOutOfRun = clip.trackingStatus === 'completed' ||
    Boolean(campaign?.separateEarningLifecycle && !isClipInCampaignEarningRun(clip, campaign));
  if (completedOrOutOfRun) {
    const historicalCreditedViews = Math.max(Number(clip.campaignCreditedViews) || 0, Number(clip.views) || 0);
    clip.publicViews = latestPublicViews;
    clip.currentViews = latestPublicViews;
    clip.views = historicalCreditedViews;
    if (campaign?.separateEarningLifecycle) clip.campaignCreditedViews = historicalCreditedViews;
    clip.approvalViews = latestPublicViews;
    clip.totalMoneyMade = historicalCreditedViews / 1_000_000 * rate;
    clip.moneyMade = clip.totalMoneyMade;
    clip.weeklyViews = historicalCreditedViews;
    clip.weeklyMoneyMade = clip.totalMoneyMade;
    clip.nextCheckAt = null;
    clip.trackingRetryAt = null;
    return historicalCreditedViews;
  }
  const viewCap = getCampaignViewCap(campaign);
  const otherCreditedViews = viewCap === null
    ? 0
    : getCampaignCurrentCycleCreditedViews(clip.campaignId, { data, excludeClipId: clip.id, date: new Date(approvedAt) });
  let creditedViews;
  const payoutLimit = ensureClipPayoutLimitSnapshot(clip, campaign, data);

  if (isStraightCampaign(campaign)) {
    const previousCredited = getClipCreditedViews(clip);
    const remainingIncludingThisClip = getStraightCampaignRemainingCreditableViews(data, campaign, clip.id);
    const maxClipCreditedViews = payoutLimit?.maxCampaignCreditedViews ?? Infinity;
    creditedViews = Math.max(previousCredited, Math.min(latestPublicViews, remainingIncludingThisClip, maxClipCreditedViews));
    clip.campaignCreditedViews = creditedViews;
    clip.straightTracking ||= {};
    clip.straightTracking.baselinePublicViews = Number(clip.submissionViews) || 0;
    clip.straightTracking.lastPublicViews = latestPublicViews;
    clip.straightTracking.creditedViews = creditedViews;
    clip.straightTracking.baselinePending = false;
    if (creditedViews > previousCredited) clip.straightTracking.lastCreditedAt = approvedAt;
  } else if (campaign?.separateEarningLifecycle) {
    const previousCredited = Math.max(Number(clip.campaignCreditedViews) || 0, Number(clip.views) || 0);
    clip.budgetTracking ||= {};
    const approvalCycleKey = getCampaignBudgetCycleKey(campaign, new Date(approvedAt));
    const isSameWeek = clip.budgetTracking.budgetCycleKey === approvalCycleKey;
    const existingWeekCredits = isSameWeek
      ? Math.max(Number(clip.budgetTracking.creditedViewsThisCycle) || 0, 0)
      : 0;
    const remainingWeekCapacity = viewCap === null
      ? Infinity
      : Math.max(viewCap - otherCreditedViews - existingWeekCredits, 0);
    const uncreditedPublicViews = Math.max(latestPublicViews - previousCredited, 0);
    const remainingClipCapacity = payoutLimit
      ? Math.max(payoutLimit.maxCampaignCreditedViews - previousCredited, 0)
      : Infinity;
    const creditedIncrease = Math.min(uncreditedPublicViews, remainingWeekCapacity, remainingClipCapacity);
    creditedViews = previousCredited + creditedIncrease;
    if (!isSameWeek && clip.budgetTracking.budgetCycleKey) {
      clip.budgetTracking.history ||= [];
      if (!clip.budgetTracking.history.some(entry => entry?.weekKey === clip.budgetTracking.budgetCycleKey)) {
        clip.budgetTracking.history.push({
          weekKey: clip.budgetTracking.budgetCycleKey,
          baselinePublicViews: Math.max(Number(clip.budgetTracking.baselinePublicViews) || 0, 0),
          lastPublicViews: Math.max(Number(clip.budgetTracking.lastPublicViews) || 0, 0),
          creditedViews: Math.max(Number(clip.budgetTracking.creditedViewsThisCycle) || 0, 0),
          closedAt: approvedAt
        });
      }
    }
    clip.budgetTracking.budgetCycleKey = approvalCycleKey;
    clip.budgetTracking.creditedViewsThisCycle = existingWeekCredits + creditedIncrease;
    if (creditedIncrease > 0) clip.budgetTracking.lastCreditedAt = approvedAt;
    clip.budgetTracking.lastPublicViews = latestPublicViews;
    clip.budgetTracking.baselinePublicViews = isSameWeek
      ? Math.min(Number(clip.budgetTracking.baselinePublicViews) || latestPublicViews, latestPublicViews)
      : Math.max(Number(clip.publicViews) || 0, Number(clip.currentViews) || 0, Number(clip.approvalViews) || 0, Number(clip.submissionViews) || 0);
    clip.campaignCreditedViews = creditedViews;
  } else {
    const maxClipCreditedViews = payoutLimit?.maxCampaignCreditedViews ?? Infinity;
    creditedViews = viewCap === null
      ? Math.min(latestPublicViews, maxClipCreditedViews)
      : Math.min(latestPublicViews, Math.max(viewCap - otherCreditedViews, 0), maxClipCreditedViews);
  }

  clip.publicViews = latestPublicViews;
  clip.currentViews = latestPublicViews;
  clip.views = creditedViews;
  clip.approvalViews = latestPublicViews;
  clip.totalMoneyMade = creditedViews / 1_000_000 * rate;
  clip.moneyMade = clip.totalMoneyMade;
  clip.weeklyViews = creditedViews;
  clip.weeklyMoneyMade = clip.totalMoneyMade;
  if (payoutLimit && creditedViews >= payoutLimit.maxCampaignCreditedViews) {
    clip.clipPayoutCapReached = true;
    clip.trackingStatus = 'completed';
    clip.completedReason = 'clip_payout_cap_reached';
    clip.completedAt ||= approvedAt;
    clip.nextCheckAt = null;
    clip.trackingRetryAt = null;
  }
  return creditedViews;
}

function recordClipTrackingFailure(clip, error) {
  clip.lastTrackingError = error?.message || 'Unknown tracking error';
  clip.lastTrackingErrorAt = Date.now();
  clip.trackingRetryAt = Date.now() + CLIP_TRACK_RETRY_MS;
  return clip;
}

function delayBetweenPlatformRequests() {
  return new Promise(resolve => setTimeout(resolve, 2000));
}
function normalizeSocialUsername(value) {
  return String(value || '').trim().replace(/^@+/, '').toLowerCase();
}
function normalizeTypedSocialPlatform(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'tiktok') return 'tiktok';
  if (normalized === 'instagram' || normalized === 'ig') return 'instagram';
  if (normalized === 'youtube' || normalized === 'yt') return 'youtube';
  return null;
}
function getCampaignBudgetMode(campaign) {
  const explicit = String(campaign?.budgetMode || '').trim().toLowerCase();
  if (explicit === 'weekly' || explicit === 'monthly' || explicit === 'straight') return explicit;
  const legacy = String(campaign?.budgetCycle || '').trim().toLowerCase();
  if (legacy === 'monthly') return 'monthly';
  return 'weekly';
}
function isStraightCampaign(campaign) {
  return getCampaignBudgetMode(campaign) === 'straight';
}
function getCampaignAccountMode(campaign) {
  const explicit = String(campaign?.accountMode || '').trim().toLowerCase();
  if (explicit === 'campaign_staff_code' || explicit === 'global_auto_verify') return explicit;
  return String(campaign?.source || '').trim().toLowerCase() === 'monsterlab'
    ? 'campaign_staff_code'
    : 'global_auto_verify';
}
function isNonMonsterlabCampaign(campaign) {
  return getCampaignAccountMode(campaign) === 'global_auto_verify' ||
    (Boolean(campaign?.source) && String(campaign.source).trim().toLowerCase() !== 'monsterlab');
}
function getCampaignPayoutThresholdViews(campaign) {
  const explicit = Number(campaign?.payoutThresholdViews);
  if (Number.isFinite(explicit) && explicit > 0) return Math.floor(explicit);
  if (isNonMonsterlabCampaign(campaign)) return 10_000;
  const legacy = Number(campaign?.payoutThreshold);
  return Number.isFinite(legacy) && legacy > 0 ? Math.floor(legacy) : 100_000;
}
function formatPayoutThresholdViews(value) {
  const views = Math.max(Math.floor(Number(value) || 0), 0);
  return views > 0 && views % 1000 === 0 ? `${views / 1000}K` : formatNumber(views);
}
function getCampaignLaunchTimestamp(campaign) {
  const value = String(campaign?.launchAt || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(value)) return null;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : null;
}
function normalizeVideoDurationSeconds(value) {
  if (value === null || value === undefined || String(value).trim() === '') return null;
  const numeric = Number(value);
  if (Number.isFinite(numeric) && numeric >= 0) return numeric;
  const match = String(value || '').trim().match(/^P(?:(\d+(?:\.\d+)?)D)?T(?:(\d+(?:\.\d+)?)H)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+(?:\.\d+)?)S)?$/i);
  if (!match) return null;
  const days = Number(match[1] || 0);
  const hours = Number(match[2] || 0);
  const minutes = Number(match[3] || 0);
  const seconds = Number(match[4] || 0);
  const total = days * 86400 + hours * 3600 + minutes * 60 + seconds;
  return Number.isFinite(total) ? total : null;
}
function getCampaignMinimumVideoDurationSeconds(campaign) {
  const seconds = Number(campaign?.minimumVideoDurationSeconds);
  return Number.isFinite(seconds) && seconds > 0 ? seconds : null;
}
function validateCampaignVideoDuration(campaign, metadata) {
  const minimumDurationSeconds = getCampaignMinimumVideoDurationSeconds(campaign);
  if (minimumDurationSeconds === null) return { valid: true };
  const durationSeconds = normalizeVideoDurationSeconds(metadata?.durationSeconds);
  if (!Number.isFinite(durationSeconds)) {
    return { valid: false, code: 'VIDEO_DURATION_UNAVAILABLE', message: "We couldn't verify this video's duration. Please try again shortly." };
  }
  if (durationSeconds < minimumDurationSeconds) {
    return {
      valid: false,
      code: 'VIDEO_TOO_SHORT',
      message: `This video is ${durationSeconds.toFixed(1)} seconds long. Campaign videos must be at least ${minimumDurationSeconds} seconds.`,
      durationSeconds,
      minimumDurationSeconds
    };
  }
  return { valid: true, durationSeconds, minimumDurationSeconds };
}
function normalizeDemographicTier(value) {
  const match = String(value || '').trim().match(/(?:tier\s*)?([1-3])$/i);
  return match ? `Tier ${match[1]}` : null;
}
function getAccountDemographics(account) {
  const source = account?.source || account;
  const demographics = source?.demographics;
  const status = String(demographics?.status || '').trim().toLowerCase();
  const verified = demographics?.verified === true || status === 'approved' || status === 'verified';
  return {
    verified,
    tier: verified ? normalizeDemographicTier(demographics?.tier) : null,
    rawTier: verified ? demographics?.tier ?? null : null,
    pageType: verified ? demographics?.pageType ?? null : null,
    demographics: demographics || null
  };
}
function getCampaignDemographicEligibility(userRecord, campaign, selectedAccount = null) {
  const allowedTiers = new Set((campaign?.countryTiers || []).map(normalizeDemographicTier).filter(Boolean));
  if (!allowedTiers.size) return { required: false, eligible: true, tier: null, allowedTiers: [] };
  const accounts = selectedAccount
    ? [selectedAccount]
    : getCampaignAccountEligibility(userRecord, campaign).accounts;
  const eligibleAccount = accounts.find(account => {
    const demographics = getAccountDemographics(account);
    return demographics.verified && demographics.tier && allowedTiers.has(demographics.tier);
  });
  const approvedTier = eligibleAccount ? getAccountDemographics(eligibleAccount).tier : null;
  return {
    required: true,
    eligible: Boolean(approvedTier && allowedTiers.has(approvedTier)),
    tier: approvedTier,
    accountId: eligibleAccount?.id || eligibleAccount?.source?.id || null,
    allowedTiers: [...allowedTiers]
  };
}
function getCampaignPerClipPayoutLimit(data, campaign) {
  if (!isNonMonsterlabCampaign(campaign)) return null;
  const configuredPercent = Number(campaign?.maxPayoutPerClipPercent);
  if (!Number.isFinite(configuredPercent) || configuredPercent <= 0 || configuredPercent > 100) return null;
  const percent = configuredPercent;
  const allocationBudget = isStraightCampaign(campaign)
    ? Number(getStraightCampaignAllocation(data, campaign.id)?.totalBudget)
    : Number(campaign?.campaignBudget);
  const rate = Number(campaign?.ratePerMillion);
  if (!Number.isFinite(allocationBudget) || allocationBudget <= 0 || !Number.isFinite(rate) || rate <= 0) return null;
  const maxPayoutAmount = allocationBudget * (percent / 100);
  return {
    maxPayoutPerClipPercent: percent,
    maxPayoutAmount,
    maxCampaignCreditedViews: Math.floor(maxPayoutAmount / rate * 1_000_000)
  };
}
function ensureClipPayoutLimitSnapshot(clip, campaign, data) {
  if (!isNonMonsterlabCampaign(campaign)) return null;
  if (!Number.isFinite(Number(clip.maxPayoutAmount)) || !Number.isFinite(Number(clip.maxCampaignCreditedViews))) {
    const limit = getCampaignPerClipPayoutLimit(data, campaign);
    if (!limit) return null;
    clip.maxPayoutPerClipPercent = limit.maxPayoutPerClipPercent;
    clip.maxPayoutAmount = limit.maxPayoutAmount;
    clip.maxCampaignCreditedViews = limit.maxCampaignCreditedViews;
    clip.payoutLimitSnapshottedAt ||= Date.now();
  }
  return {
    maxPayoutPerClipPercent: Number(clip.maxPayoutPerClipPercent) || null,
    maxPayoutAmount: Number(clip.maxPayoutAmount),
    maxCampaignCreditedViews: Math.max(Math.floor(Number(clip.maxCampaignCreditedViews)), 0)
  };
}
function validateCampaignPublicationDate(campaign, metadata) {
  if (!isNonMonsterlabCampaign(campaign)) return { valid: true };
  const campaignLaunch = getCampaignLaunchTimestamp(campaign);
  if (campaignLaunch === null) {
    return { valid: false, code: 'CAMPAIGN_LAUNCH_UNAVAILABLE', message: 'The campaign launch time is not configured. Please contact staff.' };
  }
  const publishedAt = Date.parse(metadata?.publishedAt || '');
  if (!Number.isFinite(publishedAt)) {
    return { valid: false, code: 'PUBLICATION_DATE_UNAVAILABLE', message: "We couldn't verify when this video was published. Please try again shortly." };
  }
  if (publishedAt < campaignLaunch) {
    return { valid: false, code: 'VIDEO_PREDATES_CAMPAIGN', publishedAt, campaignLaunch };
  }
  return { valid: true, publishedAt, campaignLaunch };
}
function normalizeExternalId(value) {
  return String(value || '').trim();
}

async function resolveYouTubeChannelIdentity(input) {
  const raw = String(input || '').trim();
  if (!raw) return null;
  let channelId = null;
  let handle = null;
  try {
    const url = /^https?:\/\//i.test(raw) ? new URL(raw) : null;
    const path = url?.pathname || raw;
    const channelMatch = path.match(/\/channel\/(UC[\w-]{20,})/i);
    const handleMatch = path.match(/@([^/?#]+)/);
    if (/^UC[\w-]{20,}$/i.test(raw)) channelId = raw;
    else if (channelMatch) channelId = channelMatch[1];
    else handle = (handleMatch?.[1] || raw.replace(/^@/, '')).trim();

    const params = { part: 'snippet', key: process.env.YOUTUBE_API_KEY };
    if (channelId) params.id = channelId;
    else params.forHandle = handle;
    let response = await axios.get('https://www.googleapis.com/youtube/v3/channels', { timeout: 15000, params });
    let item = response.data?.items?.[0];
    if (!item && !channelId && handle) {
      response = await axios.get('https://www.googleapis.com/youtube/v3/channels', { timeout: 15000, params: { part: 'snippet', forUsername: handle, key: process.env.YOUTUBE_API_KEY } });
      item = response.data?.items?.[0];
    }
    return item ? { channelId: item.id, handle: handle || null, title: item.snippet?.title || null } : null;
  } catch {
    return null;
  }
}
function normalizeSocialKey(platform, username) {
  return `${platform}:${normalizeUsername(username).toLowerCase()}`;
}

function isUnsafeSocialHost(hostname) {
  const host = String(hostname || '').toLowerCase().replace(/^\[|\]$/g, '');
  if (!host || host === 'localhost' || host.endsWith('.localhost') || host === '::1') return true;
  if (/^127\./.test(host) || /^10\./.test(host) || /^192\.168\./.test(host) || /^0\./.test(host)) return true;
  const match = host.match(/^172\.(\d+)\./);
  return Boolean(match && Number(match[1]) >= 16 && Number(match[1]) <= 31);
}

function getSupportedSocialPlatform(hostname) {
  const host = String(hostname || '').toLowerCase();
  if (host === 'tiktok.com' || host.endsWith('.tiktok.com')) return 'tiktok';
  if (host === 'youtube.com' || host.endsWith('.youtube.com') || host === 'youtu.be') return 'youtube';
  return null;
}

async function expandSocialUrl(inputUrl) {
  let parsed;
  try {
    parsed = new URL(String(inputUrl).trim());
  } catch {
    throw new Error('Invalid social video URL.');
  }

  if (!['http:', 'https:'].includes(parsed.protocol) || isUnsafeSocialHost(parsed.hostname)) {
    throw new Error('Unsafe social video URL.');
  }

  const originalUrl = parsed.toString();
  const isShortHost = ['vm.tiktok.com', 'vt.tiktok.com', 'youtu.be'].includes(parsed.hostname.toLowerCase());
  let response;

  try {
    response = await axios.head(originalUrl, {
      maxRedirects: 5,
      timeout: 10000,
      beforeRedirect: options => {
        if (isUnsafeSocialHost(options.hostname)) throw new Error('Unsafe redirect target.');
      },
      validateStatus: status => status >= 200 && status < 400
    });
  } catch {
    try {
      response = await axios.get(originalUrl, {
        maxRedirects: 5,
        timeout: 10000,
        beforeRedirect: options => {
          if (isUnsafeSocialHost(options.hostname)) throw new Error('Unsafe redirect target.');
        },
        responseType: 'stream',
        validateStatus: status => status >= 200 && status < 400
      });
    } catch {
      throw new Error('Could not resolve this social video URL.');
    }
  }

  try {
    const resolvedUrl = response.request?.res?.responseUrl || response.request?.responseURL || originalUrl;
    const finalUrl = new URL(resolvedUrl);
    if (!['http:', 'https:'].includes(finalUrl.protocol) || isUnsafeSocialHost(finalUrl.hostname)) {
      throw new Error('Unsafe redirect target.');
    }
    const platform = getSupportedSocialPlatform(finalUrl.hostname);
    if (!platform || (isShortHost && finalUrl.hostname.toLowerCase() === parsed.hostname.toLowerCase())) {
      throw new Error('Unsupported or unresolved social video URL.');
    }
    finalUrl.hash = '';
    return { originalUrl, resolvedUrl: finalUrl.toString(), platform };
  } finally {
    response?.data?.destroy?.();
  }
}

function ensureUserSocials(data, userId) {
  if (!data.users[userId]) return;
  if (!Array.isArray(data.users[userId].socials)) {
    data.users[userId].socials = Object.values(data.users[userId].socials || {}).filter(Boolean);
  }
  return data.users[userId].socials;
}

const GLOBAL_SOCIAL_TERMINAL_STATUSES = new Set(['removed', 'unlinked', 'revoked']);
const GLOBAL_SOCIAL_ACTIVE_STATUSES = new Set(['verified', 'connected', 'active']);

function isActiveGlobalSocial(social) {
  if (!social || typeof social !== 'object') return false;
  const status = String(social.status || '').trim().toLowerCase();
  if (GLOBAL_SOCIAL_TERMINAL_STATUSES.has(status) || social.unlinkedAt || social.removedAt || social.revokedAt) return false;
  if (!normalizeTypedSocialPlatform(social.platform) || !normalizeSocialUsername(social.normalizedUsername || social.username)) return false;
  return social.verified === true || GLOBAL_SOCIAL_ACTIVE_STATUSES.has(status);
}

function getActiveGlobalSocials(userRecord) {
  const socials = Array.isArray(userRecord?.socials)
    ? userRecord.socials
    : Object.values(userRecord?.socials || {}).filter(Boolean);
  return socials.filter(isActiveGlobalSocial);
}

function ensureGlobalSocialAccountIds(userRecord, now = Date.now()) {
  if (!userRecord || typeof userRecord !== 'object') return { changed: false, socials: [] };
  let changed = false;
  if (!Array.isArray(userRecord.socials)) {
    userRecord.socials = Object.values(userRecord.socials || {}).filter(Boolean);
    changed = true;
  }
  const usedIds = new Set(userRecord.socials.map(social => String(social?.id || '')).filter(Boolean));
  const idCounts = new Map();
  for (const social of userRecord.socials) {
    const id = String(social?.id || '');
    if (id) idCounts.set(id, (idCounts.get(id) || 0) + 1);
  }
  for (const [index, social] of userRecord.socials.entries()) {
    if (!social || typeof social !== 'object') continue;
    if (!social.id) {
      let id;
      do {
        id = `gsa_legacy_${Number(now)}_${crypto.randomBytes(4).toString('hex')}`;
      } while (usedIds.has(id));
      social.id = id;
      usedIds.add(id);
      idCounts.set(id, 1);
      changed = true;
    }
    const id = String(social.id);
    if ((!social.interactionId && (id.length > 55 || idCounts.get(id) > 1)) || String(social.interactionId || '').length > 55) {
      const identity = `${id}:${index}:${social.platform || ''}:${social.normalizedUsername || social.username || ''}`;
      social.interactionId = `gsi_${crypto.createHash('sha256').update(identity).digest('hex').slice(0, 24)}`;
      changed = true;
    }
  }
  return { changed, socials: userRecord.socials };
}

function getGlobalSocialInteractionId(social) {
  return String(social?.interactionId || social?.id || '');
}

function findGlobalSocialByInteractionId(userRecord, interactionId, { activeOnly = false } = {}) {
  const socials = Array.isArray(userRecord?.socials) ? userRecord.socials : [];
  return socials.find(social =>
    getGlobalSocialInteractionId(social) === String(interactionId) &&
    (!activeOnly || isActiveGlobalSocial(social))
  ) || null;
}

function getVerifiedGlobalSocials(userRecord) {
  const socials = Array.isArray(userRecord?.socials)
    ? userRecord.socials
    : Object.values(userRecord?.socials || {}).filter(Boolean);
  return socials.filter(social =>
    social &&
    isActiveGlobalSocial(social) &&
    social.verified === true &&
    social.status === 'verified' &&
    normalizeTypedSocialPlatform(social.platform) &&
    normalizeSocialUsername(social.normalizedUsername || social.username)
  );
}

function getVerifiedGlobalSocialsForPlatforms(userRecord, allowedPlatforms) {
  const allowed = new Set((allowedPlatforms || []).map(normalizeTypedSocialPlatform).filter(Boolean));
  return getVerifiedGlobalSocials(userRecord).filter(social => allowed.has(normalizeTypedSocialPlatform(social.platform)));
}

function userHasEligibleGlobalSocial(userRecord, campaign) {
  return getVerifiedGlobalSocialsForPlatforms(userRecord, campaign?.allowedPlatforms).length > 0;
}

function getCampaignAccountEligibility(userRecord, campaign) {
  const accountMode = getCampaignAccountMode(campaign);
  if (accountMode === 'global_auto_verify') {
    const accounts = getVerifiedGlobalSocialsForPlatforms(userRecord, campaign?.allowedPlatforms);
    return { accountMode, eligible: accounts.length > 0, accounts };
  }
  const accounts = getAllCampaignAccounts(userRecord, campaign?.id, { activeOnly: true, verifiedOnly: true })
    .filter(account => campaign?.allowedPlatforms?.includes(account.platform))
    .map(account => ({
      ...account,
      id: getCampaignAccountStableId(account.source, campaign.id, account.platform)
    }));
  return { accountMode, eligible: accounts.length > 0, accounts };
}

function getApprovedGlobalAccounts(data, userId, platform) {
  return getVerifiedGlobalSocials(data.users?.[String(userId)])
    .filter(social => normalizeTypedSocialPlatform(social.platform) === normalizeTypedSocialPlatform(platform))
    .map(social => ({
      id: getGlobalSocialInteractionId(social),
      platform: social.platform,
      username: social.username,
      platformAccountId: social.platformAccountId || social.externalAccountId || null,
      externalAccountId: social.platformAccountId || social.externalAccountId || null,
      verified: true,
      source: social
    }));
}

function getApprovedSubmissionAccounts(data, userId, campaignId, platform) {
  const campaign = CAMPAIGNS[campaignId];
  return getCampaignAccountMode(campaign) === 'global_auto_verify'
    ? getApprovedGlobalAccounts(data, userId, platform)
    : getApprovedCampaignAccounts(data, userId, campaignId, platform);
}

function getCampaignSubmissionAccounts(userRecord, campaign) {
  const eligibility = getCampaignAccountEligibility(userRecord, campaign);
  return eligibility.accounts.map(account => ({
    ...account,
    id: account.id || `campaign_${account.platform}`,
    platform: normalizeTypedSocialPlatform(account.platform),
    username: normalizeUsername(account.username)
  })).filter(account => account.platform && account.username);
}

function findVerifiedGlobalSocialOwner(data, platform, username, excludeUserId = null, platformAccountId = null) {
  const normalizedPlatform = normalizeTypedSocialPlatform(platform);
  const normalizedUsername = normalizeSocialUsername(username);
  const stableId = platformAccountId === null || platformAccountId === undefined
    ? null
    : String(platformAccountId).trim() || null;
  for (const [userId, userRecord] of Object.entries(data.users || {})) {
    if (excludeUserId !== null && String(userId) === String(excludeUserId)) continue;
    const match = getVerifiedGlobalSocials(userRecord).find(social => {
      if (normalizeTypedSocialPlatform(social.platform) !== normalizedPlatform) return false;
      const socialStableId = social.platformAccountId || social.externalAccountId;
      const stableIdMatches = stableId && socialStableId && String(socialStableId) === stableId;
      const usernameMatches = normalizedUsername &&
        normalizeSocialUsername(social.normalizedUsername || social.username) === normalizedUsername;
      return Boolean(stableIdMatches || usernameMatches);
    });
    if (match) return { userId, social: match };
  }
  return null;
}

function makeGlobalSocialVerificationCode(data) {
  const activeCodes = new Set(Object.values(data.globalSocialVerificationRequests || {})
    .filter(request => request?.status === 'pending' && Number(request.expiresAt) > Date.now())
    .map(request => String(request.verificationCode || '').toUpperCase()));
  for (let attempt = 0; attempt < 10; attempt++) {
    const code = `CE-${crypto.randomBytes(4).toString('hex').slice(0, 6).toUpperCase()}`;
    if (!activeCodes.has(code)) return code;
  }
  throw new Error('Could not generate a unique verification code.');
}

function createGlobalSocialVerificationRequest(data, { userId, platform, username, returnCampaignId = null, now = Date.now() }) {
  const normalizedPlatform = normalizeTypedSocialPlatform(platform);
  const cleanUsername = normalizeUsername(username);
  const normalizedUsername = normalizeSocialUsername(cleanUsername);
  if (!normalizedPlatform) throw new Error('Unsupported platform. Please enter TikTok, Instagram, or YouTube.');
  if (!normalizedUsername) throw new Error('Username / Handle cannot be empty.');
  data.globalSocialVerificationRequests ||= {};
  const id = `gsv_${now}_${crypto.randomBytes(3).toString('hex')}`;
  const request = {
    id,
    userId: String(userId),
    platform: normalizedPlatform,
    username: cleanUsername,
    normalizedUsername,
    status: 'pending',
    verificationCode: makeGlobalSocialVerificationCode(data),
    verificationRequestedAt: Number(now),
    expiresAt: Number(now) + GLOBAL_SOCIAL_VERIFICATION_TTL_MS,
    returnCampaignId: returnCampaignId && CAMPAIGNS[returnCampaignId] ? returnCampaignId : null,
    lastVerificationAttemptAt: null,
    verificationAttemptCount: 0,
    usedAt: null
  };
  data.globalSocialVerificationRequests[id] = request;
  return request;
}

function removeGlobalSocialAccount(userRecord, socialId, removedBy = null, now = Date.now()) {
  const socials = Array.isArray(userRecord?.socials) ? userRecord.socials : [];
  const social = socials.find(candidate =>
    (String(candidate?.id) === String(socialId) || getGlobalSocialInteractionId(candidate) === String(socialId)) &&
    isActiveGlobalSocial(candidate)
  );
  if (!social) return { removed: false };
  social.status = 'unlinked';
  social.verified = false;
  social.unlinkedAt = Number(now);
  social.unlinkedBy = removedBy;
  social.removedAt = Number(now);
  social.removedBy = removedBy;
  return { removed: true, social };
}

function buildGlobalSocialLinkButtonRow(returnCampaignId = null) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`global_social_link:${returnCampaignId || 'none'}`)
      .setLabel('➕ Link Account')
      .setEmoji('👤')
      .setStyle(ButtonStyle.Success)
  );
}

function buildGlobalSocialLinkModal(returnCampaignId = null, selectedPlatform = null) {
  const normalizedSelectedPlatform = normalizeTypedSocialPlatform(selectedPlatform);
  const platformSelect = new StringSelectMenuBuilder()
    .setCustomId('global_social_platform')
    .setPlaceholder('Select a platform')
    .setMinValues(1)
    .setMaxValues(1)
    .addOptions(
      { label: 'Connect TikTok', value: 'tiktok', emoji: '<:tiktok1:1504871476485029979>', default: normalizedSelectedPlatform === 'tiktok' },
      { label: 'Connect Instagram', value: 'instagram', emoji: '<:ig1:1504871708664922162>', default: normalizedSelectedPlatform === 'instagram' },
      { label: 'Connect YouTube', value: 'youtube', emoji: '<:Yt1:1504872145464070245>', default: normalizedSelectedPlatform === 'youtube' }
    );
  const modal = new ModalBuilder()
    .setCustomId(`global_social_link_modal:${returnCampaignId || 'none'}`)
    .setTitle('Connect your account');
  modal.addLabelComponents(
    new LabelBuilder()
      .setLabel('Select a platform to connect your account')
      .setStringSelectMenuComponent(platformSelect),
    new LabelBuilder()
      .setLabel('Enter your account name')
      .setTextInputComponent(new TextInputBuilder()
        .setCustomId('global_social_username')
        .setPlaceholder('@username')
        .setStyle(TextInputStyle.Short)
        .setRequired(true))
  );
  return modal;
}

function buildGlobalSocialVerificationPrompt(request) {
  const embed = new EmbedBuilder()
    .setColor(0x5865F2)
    .setTitle(`Verify Your ${formatPlatform(request.platform)} Account`)
    .setDescription(
      `**Account:**\n@${request.username}\n\n` +
      `Add this code to your account bio:\n\n` +
      `\`${request.verificationCode}\`\n\n` +
      `The code expires <t:${Math.floor(Number(request.expiresAt) / 1000)}:R>. Once it is visible publicly, click **Verify Account**.`
    )
    .setFooter({ text: 'Creators Elite • Social Verification' });
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`global_social_verify:${request.id}`)
      .setLabel('Verify Account')
      .setEmoji('✅')
      .setStyle(ButtonStyle.Success)
  );
  return { embeds: [embed], components: [row] };
}

function buildInstagramVerificationRetryRow(request) {
  if (!request?.id) return null;
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`global_social_verify:${request.id}`)
      .setLabel('Verify Again')
      .setEmoji('🔄')
      .setStyle(ButtonStyle.Success)
  );
}

function buildInstagramVerificationFailureResponse(result) {
  const request = result?.request;
  const username = request?.username || 'Instagram account';
  const code = request?.verificationCode || 'CE-XXXXXX';
  if (result?.code === 'PRIVATE_PROFILE') {
    return {
      embeds: [new EmbedBuilder()
        .setColor(0xED4245)
        .setTitle('Private Instagram Account ❌')
        .setDescription(
          `We couldn't verify this account because the profile is private.\n\n` +
          'Temporarily make your Instagram account public, add the verification code to your bio, then try again.'
        )],
      components: []
    };
  }
  if (result?.code === 'CODE_NOT_FOUND') {
    const retryRow = buildInstagramVerificationRetryRow(request);
    return {
      embeds: [new EmbedBuilder()
        .setColor(0xED4245)
        .setTitle('Verification Code Not Found ❌')
        .setDescription(
          `We couldn't find your verification code in the bio of **@${username}**.\n\n` +
          `Make sure you've added:\n\n\`${code}\`\n\n` +
          'to your Instagram bio, save the changes, then try again.'
        )],
      components: retryRow ? [retryRow] : []
    };
  }
  if (result?.code === 'PROFILE_UNAVAILABLE') {
    const retryRow = buildInstagramVerificationRetryRow(request);
    return {
      embeds: [new EmbedBuilder()
        .setColor(0xFEE75C)
        .setTitle('Verification Temporarily Unavailable')
        .setDescription(
          `We couldn't check your Instagram profile right now.\n\n` +
          'Your verification code is still valid. Please try again shortly.'
        )],
      components: retryRow ? [retryRow] : []
    };
  }
  if (result?.code === 'COOLDOWN') {
    return {
      embeds: [new EmbedBuilder()
        .setColor(0xFEE75C)
        .setTitle('Please Wait')
        .setDescription(`Please wait ${Math.max(1, Math.ceil(Number(result.retryAfterMs || 0) / 1000))} seconds before checking this profile again.`)],
      components: []
    };
  }
  return null;
}

function buildInstagramVerificationSuccessEmbed(social) {
  return new EmbedBuilder()
    .setColor(0x57F287)
    .setTitle('Instagram Account Verified ✅')
    .setDescription(
      `**@${social.username}** has been successfully verified and connected to your Creators Elite account.\n\n` +
      'You can now remove the verification code from your Instagram bio.'
    )
    .addFields(
      { name: 'Platform', value: 'Instagram', inline: true },
      { name: 'Account', value: `@${social.username}`, inline: true },
      { name: 'Status', value: '✅ Verified', inline: true }
    )
    .setFooter({ text: 'Creators Elite • Social Accounts' });
}

function buildGlobalSocialPanel(guildId, demographicsChannelId = VERIFY_DEMOGRAPHICS_CHANNEL_ID) {
  const embed = new EmbedBuilder()
    .setColor(0x7ED957)
    .setTitle('Manage Your Social Accounts')
    .setDescription(
      `Use the buttons below to manage your social media accounts.\n\n` +
      `👤➕ **Link Account**\nConnect a new social media account.\n\n` +
      `👤➖ **Remove Account**\nUnlink a connected social account.\n\n` +
      `👥 **View Accounts**\nView your connected social accounts.\n\n` +
      `🌍 **Verify Demographics**\nVerify your audience demographics to join campaigns.\n\n` +
      `<:whiteCE:1504904179905200148> **Powered by Creators Elite**`
    );
  const buttons = [
    new ButtonBuilder().setCustomId('global_social_link:none').setLabel('➕ Link Account').setEmoji('👤').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('global_social_remove').setLabel('➖ Remove Account').setEmoji('👤').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('global_social_view').setLabel('View Accounts').setEmoji('👥').setStyle(ButtonStyle.Secondary)
  ];
  const demographicsUrl = guildId && demographicsChannelId
    ? `https://discord.com/channels/${guildId}/${demographicsChannelId}`
    : null;
  if (demographicsUrl) {
    buttons.push(new ButtonBuilder().setLabel('Verify Demographics').setEmoji('🌍').setStyle(ButtonStyle.Link).setURL(demographicsUrl));
  }
  return { embeds: [embed], components: [new ActionRowBuilder().addComponents(...buttons)] };
}

function renderGlobalSocialAccounts(userRecord) {
  const socials = getActiveGlobalSocials(userRecord);
  if (!socials.length) return 'No global social accounts connected.';
  const groups = new Map();
  for (const social of socials) {
    const platform = normalizeTypedSocialPlatform(social.platform);
    if (!groups.has(platform)) groups.set(platform, []);
    const status = social.verified === true ? '✅ Verified' : '🔗 Connected';
    const method = social.verificationMethod === 'bio_code_api' ? '\nVerified via: Bio Code' : '';
    groups.get(platform).push(`@${social.username}\n${status}${method}`);
  }
  return ['tiktok', 'instagram', 'youtube']
    .filter(platform => groups.has(platform))
    .map(platform => `**${formatPlatform(platform)}**\n\n${groups.get(platform).join('\n\n')}`)
    .join('\n\n');
}

function getGlobalSocialAccountAnalytics(data, userId, social) {
  const socialIds = new Set([social?.id, social?.interactionId].filter(Boolean).map(String));
  const platformAccountIds = new Set([social?.platformAccountId, social?.externalAccountId].filter(Boolean).map(String));
  const platform = normalizeTypedSocialPlatform(social?.platform);
  const username = normalizeSocialUsername(social?.normalizedUsername || social?.username);
  const uniqueClips = new Map();
  for (const clip of [...Object.values(data?.clips || {}), ...Object.values(data?.clipReviews || {})]) {
    if (!clip || (userId && String(clip.userId) !== String(userId))) continue;
    const storedSocialId = clip.socialId || clip.globalSocialId || null;
    const hasGlobalSocialId = Boolean(storedSocialId);
    const linkedById = hasGlobalSocialId && socialIds.has(String(storedSocialId));
    const clipPlatformAccountIds = [clip.platformAccountId, clip.platformAuthorId, clip.externalAccountId]
      .filter(Boolean)
      .map(String);
    const linkedByPlatformAccountId = !hasGlobalSocialId &&
      normalizeTypedSocialPlatform(clip.platform) === platform &&
      clipPlatformAccountIds.some(id => platformAccountIds.has(id));
    const stablePlatformIdentityConflicts = platformAccountIds.size > 0 &&
      clipPlatformAccountIds.length > 0 &&
      !linkedByPlatformAccountId;
    const linkedByLegacyIdentity = !hasGlobalSocialId &&
      !stablePlatformIdentityConflicts &&
      getCampaignAccountMode(CAMPAIGNS[clip.campaignId]) === 'global_auto_verify' &&
      normalizeTypedSocialPlatform(clip.platform) === platform &&
      normalizeSocialUsername(clip.username || clip.platformAuthorName) === username;
    if (!linkedById && !linkedByPlatformAccountId && !linkedByLegacyIdentity) continue;
    const key = String(clip.id || clip.clipId || clip.videoUrl || clip.url || uniqueClips.size);
    uniqueClips.set(key, clip);
  }
  const clips = [...uniqueClips.values()];
  const campaignIds = new Set(clips.map(clip => clip.campaignId).filter(Boolean).map(String));
  const campaigns = [...campaignIds].map(campaignId => CAMPAIGNS[campaignId]?.name?.replace(/<a?:\w+:\d+>/g, '').trim() || campaignId);
  const sumMetric = resolver => clips.reduce((total, clip) => total + Math.max(0, Number(resolver(clip)) || 0), 0);
  return {
    campaignIds: [...campaignIds],
    campaignCount: campaignIds.size,
    campaigns,
    totalClips: clips.length,
    totalViews: sumMetric(clip => getStoredPublicViews(clip)),
    totalLikes: sumMetric(clip => clip.likes ?? clip.likeCount ?? clip.likesCount),
    totalComments: sumMetric(clip => clip.comments ?? clip.commentCount ?? clip.commentsCount)
  };
}

function getVerifiedCeDemographicDisplay(account) {
  const demographics = getAccountDemographics(account);
  if (!demographics.verified) return { verified: false, tier: '--', pageType: '--' };
  return {
    verified: true,
    tier: demographics.rawTier || '--',
    pageType: demographics.pageType || '--'
  };
}

function formatAccountCardMetric(value) {
  return Math.max(0, Math.round(Number(value) || 0)).toLocaleString('en-US');
}

function buildGlobalSocialViewNotice(title, description, color = 0xED4245) {
  return {
    content: null,
    embeds: [],
    components: [new ContainerBuilder()
      .setAccentColor(color)
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(`## ${title}`),
        new TextDisplayBuilder().setContent(description)
      )]
  };
}

function buildGlobalSocialViewPage(userRecord, requestedPage = 0, options = {}) {
  ensureGlobalSocialAccountIds(userRecord);
  const socials = getActiveGlobalSocials(userRecord);
  if (!socials.length) {
    const emptyContainer = new ContainerBuilder()
      .setAccentColor(0x5865F2)
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent('## No Social Accounts Connected'),
        new TextDisplayBuilder().setContent("You haven't connected any social accounts yet.\n\nUse **Link Account** on the Connect Socials panel to get started."),
        new TextDisplayBuilder().setContent('-# Powered by Creators Elite')
      );
    return {
      page: 0,
      totalPages: 0,
      totalAccounts: 0,
      embeds: [],
      components: [emptyContainer],
      flags: MessageFlags.IsComponentsV2
    };
  }
  const totalPages = socials.length;
  const page = Math.min(Math.max(Number(requestedPage) || 0, 0), totalPages - 1);
  const social = socials[page];
  const analytics = getGlobalSocialAccountAnalytics(options.data, options.userId, social);
  const demographicDisplay = getVerifiedCeDemographicDisplay(social);
  const status = social.verified === true ? '✅ Verified' : '🔗 Connected';
  const safeProfileUrl = typeof social.profileUrl === 'string' && /^https:\/\//i.test(social.profileUrl) ? social.profileUrl : null;
  const usernameDisplay = safeProfileUrl ? `[@${social.username}](${safeProfileUrl})` : `@${social.username}`;
  const platformEmoji = { tiktok: '<:tiktok1:1504871476485029979>', instagram: '<:ig1:1504871708664922162>', youtube: '<:Yt1:1504872145464070245>' }[normalizeTypedSocialPlatform(social.platform)] || '🔗';
  const accountText =
      `${platformEmoji} **${formatPlatform(social.platform)}**\n` +
      `${usernameDisplay}\n\n` +
      `**Verification Status:** ${status}\n` +
      `**Tier:** ${demographicDisplay.tier}\n` +
      `**Page Type:** ${demographicDisplay.pageType}\n` +
      `**Campaigns Participated:** ${formatAccountCardMetric(analytics.campaignCount)}\n` +
      `**Total Clips:** ${formatAccountCardMetric(analytics.totalClips)}\n` +
      `**Total Views:** ${formatAccountCardMetric(analytics.totalViews)}\n` +
      `**Total Likes:** ${formatAccountCardMetric(analytics.totalLikes)}\n` +
      `**Total Comments:** ${formatAccountCardMetric(analytics.totalComments)}`;
  const container = new ContainerBuilder()
    .setAccentColor(0x00D26A)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent('## Your Connected Social Accounts'),
      new TextDisplayBuilder().setContent(accountText)
    )
    .addActionRowComponents(new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`global_social_disconnect:${getGlobalSocialInteractionId(social)}:${page}`)
        .setLabel('Disconnect')
        .setEmoji('🗑️')
        .setStyle(ButtonStyle.Danger)
    ))
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true));
  const optionPageSize = 25;
  const optionPage = Math.floor(page / optionPageSize);
  const optionPageCount = Math.ceil(socials.length / optionPageSize);
  const optionPageSocials = socials.slice(optionPage * optionPageSize, (optionPage + 1) * optionPageSize);
  container.addActionRowComponents(new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(`global_social_view_select:${optionPage}`)
      .setPlaceholder('Click here to switch account preview')
      .addOptions(optionPageSocials.map(account => ({
        label: `${formatPlatform(account.platform)} — @${account.username}`.slice(0, 100),
        value: getGlobalSocialInteractionId(account),
        emoji: { tiktok: '<:tiktok1:1504871476485029979>', instagram: '<:ig1:1504871708664922162>', youtube: '<:Yt1:1504872145464070245>' }[normalizeTypedSocialPlatform(account.platform)],
        default: getGlobalSocialInteractionId(account) === getGlobalSocialInteractionId(social)
      })))
  ));
  if (optionPageCount > 1) {
    container.addActionRowComponents(new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`global_social_view_options_page:${optionPage - 1}`).setLabel('Previous Accounts').setStyle(ButtonStyle.Secondary).setDisabled(optionPage === 0),
      new ButtonBuilder().setCustomId(`global_social_view_options_page:${optionPage + 1}`).setLabel('Next Accounts').setStyle(ButtonStyle.Secondary).setDisabled(optionPage === optionPageCount - 1)
    ));
  }
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(`Showing account ${page + 1} of ${totalPages}`),
    new TextDisplayBuilder().setContent('-# Powered by Creators Elite')
  );
  return {
    page,
    totalPages,
    totalAccounts: socials.length,
    social,
    analytics,
    embeds: [],
    components: [container],
    flags: MessageFlags.IsComponentsV2
  };
}

function buildGlobalSocialRemovePage(userRecord, requestedPage = 0, pageSize = 25) {
  const socials = getActiveGlobalSocials(userRecord);
  if (!socials.length) {
    return {
      page: 0,
      totalPages: 0,
      totalAccounts: 0,
      content: 'You do not have any connected global social accounts to remove.',
      embeds: [],
      components: [buildGlobalSocialLinkButtonRow(null)]
    };
  }
  const totalPages = Math.ceil(socials.length / pageSize);
  const page = Math.min(Math.max(Number(requestedPage) || 0, 0), totalPages - 1);
  const pageSocials = socials.slice(page * pageSize, (page + 1) * pageSize);
  const select = new StringSelectMenuBuilder()
    .setCustomId(`global_social_remove_select:${page}`)
    .setPlaceholder('Choose an account to unlink')
    .addOptions(pageSocials.map(social => ({
      label: `${formatPlatform(social.platform)} — @${social.username}`.slice(0, 100),
      value: getGlobalSocialInteractionId(social)
    })));
  const components = [new ActionRowBuilder().addComponents(select)];
  if (totalPages > 1) {
    components.push(new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`global_social_remove_page:${page - 1}`).setLabel('Previous').setStyle(ButtonStyle.Secondary).setDisabled(page === 0),
      new ButtonBuilder().setCustomId(`global_social_remove_page:${page + 1}`).setLabel('Next').setStyle(ButtonStyle.Secondary).setDisabled(page === totalPages - 1)
    ));
  }
  return {
    page,
    totalPages,
    totalAccounts: socials.length,
    content: `Select the global social account to unlink. Historical clips and payments will be preserved.${totalPages > 1 ? `\n\nPage ${page + 1} / ${totalPages}` : ''}`,
    embeds: [],
    components
  };
}

function buildGlobalSocialRemoveConfirmation(social, options = {}) {
  const page = Math.max(Number(options.page) || 0, 0);
  const confirmCustomId = options.fromView
    ? `global_social_disconnect_confirm:${getGlobalSocialInteractionId(social)}:${page}`
    : `global_social_remove_confirm:${getGlobalSocialInteractionId(social)}`;
  const cancelCustomId = options.fromView ? `global_social_view_page:${page}` : 'global_social_remove_cancel';
  if (options.fromView) {
    const container = new ContainerBuilder()
      .setAccentColor(0xED4245)
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent('## Disconnect Social Account?'),
        new TextDisplayBuilder().setContent(`Are you sure you want to disconnect **${formatPlatform(social.platform)} @${social.username}**?\n\nHistorical clips, payments, and analytics will be preserved.`)
      )
      .addActionRowComponents(new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(confirmCustomId).setLabel('Disconnect').setEmoji('🗑️').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId(cancelCustomId).setLabel('Cancel').setStyle(ButtonStyle.Secondary)
      ));
    return { content: null, embeds: [], components: [container], flags: MessageFlags.IsComponentsV2 };
  }
  return {
    content: null,
    embeds: [new EmbedBuilder()
      .setColor(0xED4245)
      .setTitle('Remove Social Account?')
      .setDescription(`Are you sure you want to unlink:\n\n**${formatPlatform(social.platform)}**\n@${social.username}\n\nfrom your Creators Elite account?`)],
    components: [new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(confirmCustomId).setLabel('Remove Account').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId(cancelCustomId).setLabel('Cancel').setStyle(ButtonStyle.Secondary)
    )]
  };
}

function buildMissingGlobalAccountResponse(campaign) {
  const platforms = (campaign.allowedPlatforms || []).map(normalizeTypedSocialPlatform).filter(Boolean);
  const singlePlatform = platforms.length === 1 ? formatPlatform(platforms[0]) : null;
  const title = singlePlatform ? `No ${singlePlatform} Account Connected ❌` : 'No Eligible Social Account Connected ❌';
  const description = singlePlatform
    ? `You need to connect and verify a ${singlePlatform} account before joining this campaign.\n\nUse the button below to get started. 👇`
    : `This campaign requires a verified account on at least one of:\n\n${platforms.map(platform => `• ${formatPlatform(platform)}`).join('\n')}\n\nConnect and verify one account to join.`;
  return {
    embeds: [new EmbedBuilder().setColor(0xED4245).setTitle(title).setDescription(description)],
    components: [buildGlobalSocialLinkButtonRow(campaign.id)]
  };
}

function buildMissingCampaignDemographicsResponse(guildId, campaign) {
  const allowedTiers = getCampaignDemographicEligibility({}, campaign).allowedTiers;
  const embed = new EmbedBuilder()
    .setColor(0xED4245)
    .setTitle('Audience Demographics Required ❌')
    .setDescription(
      `You need approved audience demographics in ${allowedTiers.join(', ')} before joining **${campaign.name}**.\n\n` +
      'Use the button below to submit or review your demographics verification.'
    );
  const url = guildId && VERIFY_DEMOGRAPHICS_CHANNEL_ID
    ? `https://discord.com/channels/${guildId}/${VERIFY_DEMOGRAPHICS_CHANNEL_ID}`
    : null;
  const components = url
    ? [new ActionRowBuilder().addComponents(
        new ButtonBuilder().setLabel('Verify Demographics').setEmoji('🌍').setStyle(ButtonStyle.Link).setURL(url)
      )]
    : [];
  return { embeds: [embed], components };
}

function getCampaignAccountCandidates(userRecord, campaignId, platform, options = {}) {
  const normalizedPlatform = normalizeTypedSocialPlatform(platform) || String(platform || '').toLowerCase();
  const stored = userRecord?.campaignAccounts?.[campaignId]?.[normalizedPlatform];
  if (!stored) return [];
  const candidates = Array.isArray(stored)
    ? stored
    : typeof stored === 'object' && ('username' in stored || 'verified' in stored || 'status' in stored)
      ? [stored]
      : Object.values(stored || {}).filter(Boolean);
  return candidates.filter(account => {
    if (!account || typeof account !== 'object') return false;
    const status = String(account.status || '').toLowerCase();
    const terminal = ['rejected', 'removed', 'unlinked', 'revoked'].includes(status) || account.removedAt || account.unlinkedAt || account.revokedAt;
    if (options.activeOnly && terminal) return false;
    if (options.verifiedOnly && !(account.verified === true || status === 'approved' || status === 'verified')) return false;
    return Boolean(normalizeSocialUsername(account.username));
  });
}

function getAllCampaignAccounts(userRecord, campaignId, options = {}) {
  const campaignAccounts = userRecord?.campaignAccounts?.[campaignId] || {};
  return Object.keys(campaignAccounts).flatMap(platform =>
    getCampaignAccountCandidates(userRecord, campaignId, platform, options).map(account => ({
      ...account,
      platform: normalizeTypedSocialPlatform(account.platform || platform) || String(platform).toLowerCase(),
      source: account
    }))
  );
}

function getCampaignAccountStableId(account, campaignId, platform) {
  if (account?.id) return String(account.id);
  const identity = [campaignId, platform, normalizeSocialUsername(account?.username), account?.externalAccountId || ''].join(':');
  return `cga_${crypto.createHash('sha256').update(identity).digest('hex').slice(0, 24)}`;
}

function getDemographicsAccountOptions(userRecord) {
  const options = [];
  for (const social of getVerifiedGlobalSocials(userRecord)) {
    const platform = normalizeTypedSocialPlatform(social.platform);
    options.push({
      label: `${formatPlatform(platform)} — @${social.username}`.slice(0, 100),
      description: 'Global social account',
      value: `g|${getGlobalSocialInteractionId(social)}`
    });
  }
  for (const campaignId of Object.keys(userRecord?.campaignAccounts || {})) {
    for (const account of getAllCampaignAccounts(userRecord, campaignId, { activeOnly: true, verifiedOnly: true })) {
      const accountId = getCampaignAccountStableId(account.source, campaignId, account.platform);
      const campaignName = cleanDropdownLabel(CAMPAIGNS[campaignId]?.name || campaignId);
      options.push({
        label: `${formatPlatform(account.platform)} — @${account.username}`.slice(0, 100),
        description: `${campaignName} campaign account`.slice(0, 100),
        value: `c|${campaignId}|${account.platform}|${accountId}`
      });
    }
  }
  return options;
}

function buildDemographicsAccountSelectionPage(userRecord, requestedPage = 0, pageSize = 25) {
  const options = getDemographicsAccountOptions(userRecord);
  if (!options.length) return { page: 0, totalPages: 0, totalAccounts: 0, content: '❌ You have no verified social accounts yet.', components: [] };
  const totalPages = Math.ceil(options.length / pageSize);
  const page = Math.min(Math.max(Number(requestedPage) || 0, 0), totalPages - 1);
  const select = new StringSelectMenuBuilder()
    .setCustomId('demographics_account')
    .setPlaceholder('Select account')
    .addOptions(options.slice(page * pageSize, (page + 1) * pageSize));
  const components = [new ActionRowBuilder().addComponents(select)];
  if (totalPages > 1) {
    components.push(new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`demographics_account_page:${page - 1}`).setLabel('Previous Accounts').setStyle(ButtonStyle.Secondary).setDisabled(page === 0),
      new ButtonBuilder().setCustomId(`demographics_account_page:${page + 1}`).setLabel('Next Accounts').setStyle(ButtonStyle.Secondary).setDisabled(page === totalPages - 1)
    ));
  }
  return {
    page,
    totalPages,
    totalAccounts: options.length,
    content: `✅ Country selected. Now select the exact account to verify.${totalPages > 1 ? `\n\nPage ${page + 1} / ${totalPages}` : ''}`,
    components
  };
}

function resolveDemographicsAccountSelection(userRecord, selectionValue) {
  const value = String(selectionValue || '');
  if (value.startsWith('g|')) {
    const social = findGlobalSocialByInteractionId(userRecord, value.slice(2), { activeOnly: true });
    if (!social || social.verified !== true) return null;
    return {
      account: social,
      identity: {
        kind: 'global',
        socialId: social.id,
        socialInteractionId: getGlobalSocialInteractionId(social),
        platform: normalizeTypedSocialPlatform(social.platform),
        username: social.username,
        normalizedUsername: normalizeSocialUsername(social.username),
        platformAccountId: social.platformAccountId || social.externalAccountId || null
      }
    };
  }
  if (value.startsWith('c|')) {
    const [, campaignId, platform, accountId] = value.split('|');
    const account = getCampaignAccountCandidates(userRecord, campaignId, platform, { activeOnly: true, verifiedOnly: true })
      .find(candidate => getCampaignAccountStableId(candidate, campaignId, platform) === accountId);
    if (!account) return null;
    return {
      account,
      identity: {
        kind: 'campaign',
        campaignId,
        campaignAccountId: accountId,
        platform: normalizeTypedSocialPlatform(platform),
        username: account.username,
        normalizedUsername: normalizeSocialUsername(account.username),
        platformAccountId: account.externalAccountId || null
      }
    };
  }
  return null;
}

function resolveDemographicsSubmissionAccount(userRecord, accountReference) {
  const reference = accountReference || {};
  if (reference.kind === 'global' || reference.socialId || reference.socialInteractionId) {
    const socials = Array.isArray(userRecord?.socials) ? userRecord.socials : [];
    const social = socials.find(candidate =>
      (reference.socialId && String(candidate.id) === String(reference.socialId)) ||
      (reference.socialInteractionId && getGlobalSocialInteractionId(candidate) === String(reference.socialInteractionId))
    );
    return social ? { account: social, kind: 'global' } : null;
  }
  if (reference.kind === 'campaign' || reference.campaignAccountId) {
    const campaignId = reference.campaignId;
    const platform = normalizeTypedSocialPlatform(reference.platform) || reference.platform;
    const account = getCampaignAccountCandidates(userRecord, campaignId, platform)
      .find(candidate => getCampaignAccountStableId(candidate, campaignId, platform) === String(reference.campaignAccountId));
    return account ? { account, kind: 'campaign' } : null;
  }

  const platform = normalizeTypedSocialPlatform(reference.platform);
  const username = normalizeSocialUsername(reference.username);
  if (!platform || !username) return null;
  if (reference.campaignId === 'global') {
    const matches = (Array.isArray(userRecord?.socials) ? userRecord.socials : []).filter(social =>
      normalizeTypedSocialPlatform(social.platform) === platform &&
      normalizeSocialUsername(social.username) === username
    );
    return matches.length === 1 ? { account: matches[0], kind: 'global', legacyResolved: true } : null;
  }
  const matches = getCampaignAccountCandidates(userRecord, reference.campaignId, platform)
    .filter(account => normalizeSocialUsername(account.username) === username);
  return matches.length === 1 ? { account: matches[0], kind: 'campaign', legacyResolved: true } : null;
}

function applyDemographicsApprovalToAccount(data, submission, approval = {}) {
  const userRecord = data?.users?.[String(submission?.userId)];
  if (!userRecord) return { applied: false, reason: 'USER_NOT_FOUND' };
  const resolved = resolveDemographicsSubmissionAccount(userRecord, submission?.account);
  if (!resolved) return { applied: false, reason: 'ACCOUNT_IDENTITY_UNRESOLVED' };
  const approvedAt = Number(approval.approvedAt) || Date.now();
  const previous = resolved.account.demographics || {};
  resolved.account.demographics = {
    ...previous,
    verified: true,
    status: 'approved',
    tier: approval.tier,
    pageType: approval.pageType ?? previous.pageType ?? null,
    verifiedAt: approvedAt,
    approvedAt,
    approvedBy: approval.approvedBy || null,
    submissionId: submission.id || null,
    country: submission.country || previous.country || null
  };
  return { applied: true, account: resolved.account, kind: resolved.kind, legacyResolved: resolved.legacyResolved === true };
}

function getApprovedCampaignAccounts(data, userId, campaignId, platform) {
  const userRecord = data.users?.[String(userId)];
  return getCampaignAccountCandidates(userRecord, campaignId, platform, { activeOnly: true, verifiedOnly: true })
    .map(account => ({
      id: getCampaignAccountStableId(account, campaignId, platform),
      platform: account.platform || platform,
      username: account.username || '',
      platformAccountId: account.platformAccountId || account.externalAccountId || null,
      externalAccountId: account.platformAccountId || account.externalAccountId || null,
      verified: true,
      source: account
    }));
}

function getProviderClipAuthorIdentity(metadata) {
  const platform = normalizeTypedSocialPlatform(metadata?.platform) || (metadata?.authorUsername ? 'tiktok' : null);
  const platformAccountId = normalizeExternalId(
    metadata?.platformAccountId || metadata?.authorId || metadata?.channelId || metadata?.ownerId
  );
  const authorUsername = normalizeUsername(
    metadata?.authorUsername || metadata?.authorHandle || (platform === 'youtube' ? metadata?.authorDisplayName : '') || ''
  );
  return {
    platform,
    platformAccountId,
    authorUsername,
    normalizedAuthorUsername: normalizeSocialUsername(authorUsername),
    displayName: normalizeUsername(metadata?.authorUsername || metadata?.authorDisplayName || metadata?.authorName || '') || 'this account',
    identifiable: Boolean(platformAccountId || normalizeSocialUsername(authorUsername))
  };
}

async function validateVideoOwnership(approvedAccounts, metadata) {
  const accounts = approvedAccounts || [];
  const identity = getProviderClipAuthorIdentity(metadata);
  if (!identity.identifiable) {
    return { valid: false, matchedAccount: null, reason: 'PROVIDER_OWNER_MISSING', identity };
  }

  for (const account of accounts) {
    const storedId = normalizeExternalId(
      account.platformAccountId || account.externalAccountId || account.source?.platformAccountId || account.source?.externalAccountId || account.source?.channelId
    );
    const authorId = identity.platformAccountId;

    if (storedId && authorId) {
      if (storedId === authorId) return { valid: true, matchedAccount: account, matchedBy: 'platformAccountId', identity, reason: null };
      continue;
    }

    const storedUsername = normalizeSocialUsername(account.username);
    if (!storedUsername) continue;

    if (identity.platform === 'youtube' && authorId) {
      const identity = await resolveYouTubeChannelIdentity(account.username);
      if (identity?.channelId && normalizeExternalId(identity.channelId) === authorId) {
        return { valid: true, matchedAccount: account, matchedBy: 'resolvedChannelId', resolvedPlatformAccountId: identity.channelId, identity: getProviderClipAuthorIdentity(metadata), reason: null };
      }
    }

    if (storedUsername === identity.normalizedAuthorUsername) {
      return { valid: true, matchedAccount: account, matchedBy: 'normalizedUsername', identity, reason: null };
    }
  }

  return {
    valid: false,
    matchedAccount: null,
    reason: 'ACCOUNT_NOT_CONNECTED',
    identity
  };
}

async function findOtherVerifiedClipAccountOwner(data, excludedUserId, campaignId, platform, metadata) {
  for (const userId of Object.keys(data.users || {})) {
    if (String(userId) === String(excludedUserId)) continue;
    const accounts = getApprovedSubmissionAccounts(data, userId, campaignId, platform);
    if (!accounts.length) continue;
    const ownership = await validateVideoOwnership(accounts, metadata);
    if (ownership.valid) return { userId, account: ownership.matchedAccount };
  }
  return null;
}

function parseCanonicalVideoUrl(resolvedUrl) {
  const url = new URL(resolvedUrl);
  const host = url.hostname.toLowerCase();

  const instagramReel = parsePublicInstagramReelUrl(resolvedUrl);
  if (instagramReel) {
    return { platform: 'instagram', videoId: instagramReel.shortcode, canonicalUrl: instagramReel.canonicalUrl };
  }

  if (host === 'tiktok.com' || host.endsWith('.tiktok.com')) {
    const match = url.pathname.match(/\/video\/(\d+)/);
    if (!match) return null;
    return { platform: 'tiktok', videoId: match[1], canonicalUrl: url.toString() };
  }

  if (host === 'youtube.com' || host.endsWith('.youtube.com') || host === 'youtu.be') {
    const videoId = getYouTubeVideoId(url.toString());
    if (!videoId || !/^[A-Za-z0-9_-]{11}$/.test(videoId)) return null;
    return { platform: 'youtube', videoId, canonicalUrl: `https://www.youtube.com/watch?v=${videoId}` };
  }

  return null;
}

function getClipVideoKey(platform, videoId) {
  const normalizedPlatform = String(platform || '').trim().toLowerCase();
  const normalizedVideoId = String(videoId || '').trim();
  return normalizedPlatform && normalizedVideoId ? `${normalizedPlatform}:${normalizedVideoId}` : null;
}

function normalizeClipVideoUrl(value) {
  try {
    const url = new URL(String(value || '').trim());
    url.hash = '';
    const host = url.hostname.toLowerCase();
    if (host === 'youtube.com' || host.endsWith('.youtube.com') || host === 'youtu.be') {
      const videoId = getYouTubeVideoId(url.toString());
      return videoId ? `youtube:${videoId}` : null;
    }
    if (host === 'tiktok.com' || host.endsWith('.tiktok.com')) {
      const match = url.pathname.match(/\/video\/(\d+)/);
      return match ? `tiktok:${match[1]}` : null;
    }
    const instagramReel = parsePublicInstagramReelUrl(value);
    if (instagramReel) return `instagram:${instagramReel.shortcode}`;
  } catch {}
  return null;
}

async function validateClipBeforeSubmission({ data, userId, campaignId, submittedUrl }) {
  const campaign = CAMPAIGNS[campaignId];
  if (!campaign) return { valid: false, message: '❌ Campaign not found.', metadata: null };
  if (isNonMonsterlabCampaign(campaign) && !getCampaignPerClipPayoutLimit(data, campaign)) {
    return { valid: false, code: 'CAMPAIGN_PAYOUT_CONFIG_INVALID', message: '❌ This campaign payout configuration is incomplete. Please contact staff.', metadata: null };
  }
  const campaignState = getCampaignOperationalState(data, campaign);
  const submissionBlockMessage = getCampaignSubmissionBlockMessage(campaignState);
  if (submissionBlockMessage) return { valid: false, message: submissionBlockMessage, metadata: null };
  try {
    const instagramReel = parsePublicInstagramReelUrl(submittedUrl);
    const expanded = instagramReel
      ? { resolvedUrl: instagramReel.canonicalUrl, platform: 'instagram' }
      : await expandSocialUrl(submittedUrl);
    const parsed = parseCanonicalVideoUrl(expanded.resolvedUrl);
    if (!parsed) return { valid: false, code: 'UNSUPPORTED_VIDEO_URL', message: '❌ This link is not a supported public TikTok, Instagram, or YouTube video.', metadata: null };
    if (!campaign.allowedPlatforms?.includes(parsed.platform)) {
      return { valid: false, message: `❌ ${formatPlatform(parsed.platform)} is not enabled for this campaign.`, metadata: null };
    }

    const incomingVideoKey = getClipVideoKey(parsed.platform, parsed.videoId);
    const incomingUrlKey = normalizeClipVideoUrl(parsed.canonicalUrl);
    const allStoredClips = [
      ...Object.values(data.clipReviews || {}),
      ...Object.values(data.clips || {})
    ].filter(clip => String(clip.campaignId) === String(campaignId));
    const duplicate = allStoredClips.some(clip =>
      (getClipVideoKey(clip.platform, clip.videoId) && getClipVideoKey(parsed.platform, parsed.videoId) && getClipVideoKey(clip.platform, clip.videoId) === getClipVideoKey(parsed.platform, parsed.videoId)) ||
      (normalizeClipVideoUrl(clip.videoUrl || clip.url) && normalizeClipVideoUrl(parsed.canonicalUrl) && normalizeClipVideoUrl(clip.videoUrl || clip.url) === normalizeClipVideoUrl(parsed.canonicalUrl))
    );
    const matchedDuplicate = duplicate ? allStoredClips.find(clip =>
      (getClipVideoKey(clip.platform, clip.videoId) && incomingVideoKey && getClipVideoKey(clip.platform, clip.videoId) === incomingVideoKey) ||
      (normalizeClipVideoUrl(clip.videoUrl || clip.url) && incomingUrlKey && normalizeClipVideoUrl(clip.videoUrl || clip.url) === incomingUrlKey)
    ) : null;
    if (duplicate) {
      if (process.env.DEBUG_CLIP_DUPLICATES === 'true') console.log('[Clip Duplicate Check]', { campaignId, incomingPlatform: parsed.platform, incomingVideoId: parsed.videoId, incomingVideoKey, matchedClipId: matchedDuplicate?.id || null, matchedCampaignId: matchedDuplicate?.campaignId || null, matchedStatus: matchedDuplicate?.status || null });
      return { valid: false, code: 'DUPLICATE_CLIP', message: 'Duplicate clip in this campaign.', metadata: null };
    }
    if (duplicate) return { valid: false, message: '❌ This video has already been submitted.', metadata: null };

    const metadata = await fetchSubmissionMetadata(parsed.platform, parsed.canonicalUrl, parsed.videoId);
    metadata.platform = parsed.platform;
    const providerIdentity = getProviderClipAuthorIdentity(metadata);
    if (!providerIdentity.identifiable) {
      return {
        valid: false,
        code: 'PROVIDER_OWNER_MISSING',
        message: "We couldn't reliably identify the account that posted this clip.",
        metadata,
        authorIdentity: providerIdentity
      };
    }
    const accounts = getApprovedSubmissionAccounts(data, userId, campaignId, parsed.platform);
    if (!accounts.length) {
      const otherOwner = await findOtherVerifiedClipAccountOwner(data, userId, campaignId, parsed.platform, metadata);
      return {
        valid: false,
        code: otherOwner ? 'ACCOUNT_OWNED_BY_ANOTHER_CREATOR' : 'ACCOUNT_NOT_CONNECTED',
        message: otherOwner
          ? 'This social account is already registered to another Creators Elite creator.'
          : `This clip was posted by **@${providerIdentity.displayName}**, but that account is not connected and verified for this campaign.`,
        metadata,
        authorIdentity: providerIdentity
      };
    }

    const ownership = await validateVideoOwnership(accounts, metadata);
    if (!ownership.valid) {
      if (ownership.reason === 'PROVIDER_OWNER_MISSING') {
        return {
          valid: false,
          code: 'PROVIDER_OWNER_MISSING',
          message: "We couldn't reliably identify the account that posted this clip.",
          metadata,
          authorIdentity: providerIdentity
        };
      }
      const otherOwner = await findOtherVerifiedClipAccountOwner(data, userId, campaignId, parsed.platform, metadata);
      return {
        valid: false,
        code: otherOwner ? 'ACCOUNT_OWNED_BY_ANOTHER_CREATOR' : 'ACCOUNT_NOT_CONNECTED',
        message: otherOwner
          ? 'This social account is already registered to another Creators Elite creator.'
          : `This clip was posted by **@${providerIdentity.displayName}**, but that account is not connected and verified for this campaign.`,
        metadata,
        authorIdentity: providerIdentity
      };
    }

    const demographicEligibility = getCampaignDemographicEligibility(data.users?.[String(userId)], campaign, ownership.matchedAccount);
    if (!demographicEligibility.eligible) {
      return {
        valid: false,
        code: 'DEMOGRAPHICS_NOT_ELIGIBLE',
        message: `❌ Approved audience demographics for **@${ownership.matchedAccount.username}** are required before submitting clips.`,
        metadata,
        matchedAccount: ownership.matchedAccount,
        authorIdentity: providerIdentity
      };
    }

    const durationValidation = validateCampaignVideoDuration(campaign, metadata);
    if (!durationValidation.valid) {
      return { valid: false, code: durationValidation.code, message: `❌ ${durationValidation.message}`, metadata };
    }

    const publicationValidation = validateCampaignPublicationDate(campaign, metadata);
    if (!publicationValidation.valid) {
      if (publicationValidation.code === 'VIDEO_PREDATES_CAMPAIGN') {
        return {
          valid: false,
          code: publicationValidation.code,
          message: 'This video was published before the campaign launch.',
          metadata,
          responseEmbed: buildPreLaunchSubmissionEmbed(
            campaign,
            parsed.platform,
            publicationValidation.publishedAt,
            publicationValidation.campaignLaunch
          )
        };
      }
      return { valid: false, code: publicationValidation.code, message: `❌ ${publicationValidation.message}`, metadata };
    }

    const matchedSource = ownership.matchedAccount.source || ownership.matchedAccount;
    if (providerIdentity.platformAccountId && !normalizeExternalId(matchedSource.platformAccountId || matchedSource.externalAccountId || matchedSource.channelId)) {
      matchedSource.platformAccountId = String(providerIdentity.platformAccountId);
      matchedSource.externalAccountId = String(providerIdentity.platformAccountId);
      if (parsed.platform === 'youtube') matchedSource.channelId ||= String(providerIdentity.platformAccountId);
      saveData(data);
    }

    return { valid: true, message: null, metadata, authorIdentity: providerIdentity, platform: parsed.platform, videoId: parsed.videoId, canonicalUrl: parsed.canonicalUrl, matchedAccount: ownership.matchedAccount };
  } catch (err) {
    return {
      valid: false,
      code: 'PROVIDER_UNAVAILABLE',
      message: "We couldn't verify this clip right now. Please try again shortly.",
      metadata: null
    };
  }
}

function makeApplicationId() {
  return `app_${Date.now()}_${Math.floor(Math.random() * 100000)}`;
}

function getUserPayoutSummary(data, userId, campaignId) {
    const campaign = CAMPAIGNS[campaignId];
    const clips = (campaign?.separateEarningLifecycle
        ? getCurrentRunAccountingClips(data, campaignId, userId)
        : Object.values(data.clips || {}))
        .filter(c =>
            String(c.userId) === String(userId) &&
            String(c.campaignId) === String(campaignId) &&
            isPayoutEligibleClip(c)
        );

    const totalViews =
        clips.reduce(
            (s,c)=>s + getApprovedClipViews(c),
            0
        );

    const unpaidViews =
        clips.reduce(
            (s,c)=>s + Math.max(getApprovedClipViews(c) - (Number(c.payout?.paidViews) || 0), 0),
            0
        );

    const totalMoney =
        clips.reduce(
            (s,c)=>s + getApprovedClipEarnings(c, CAMPAIGNS[campaignId]),
            0
        );

    const unpaidMoney =
        clips.reduce(
            (s,c)=>s + Math.max(getApprovedClipViews(c) - (Number(c.payout?.paidViews) || 0), 0) / 1_000_000 * (Number(CAMPAIGNS[campaignId]?.ratePerMillion) || 0),
            0
        );

    return {

        totalViews,

        unpaidViews,

        totalMoney,

        unpaidMoney,

        clips

    };

}

function getPayoutCycleClips(data, campaignId, userId, cycle) {
    const campaign = CAMPAIGNS[campaignId];
    if (!campaign || !cycle?.earningRunKey) return [];
    const clips = getUniqueClipRecords([
        ...Object.values(data?.clips || {}),
        ...Object.values(data?.clipReviews || {})
    ]).filter(clip => {
        if (String(clip.campaignId) !== String(campaignId) || String(clip.userId) !== String(userId)) return false;
        const clipCycle = getCampaignPayoutCycle(campaign, { clip });
        return String(clipCycle?.earningRunKey || '') === String(cycle.earningRunKey);
    });
    if (!campaign.separateEarningLifecycle || String(cycle.earningRunKey) !== String(getCampaignEarningRunKey(campaign))) return clips;
    const currentRunById = new Map(getCurrentRunAccountingClips(data, campaignId, userId)
        .map(clip => [getClipIdentityKey(clip), clip]));
    return clips.map(clip => currentRunById.get(getClipIdentityKey(clip)) || clip);
}

function getTrackerCycle(tracker) {
    if (!tracker?.earningRunKey) return null;
    return {
        earningRunKey: tracker.earningRunKey,
        cycleStartAt: tracker.cycleStartAt || null,
        cycleEndAt: tracker.cycleEndAt || null,
        cycleType: tracker.cycleType || 'earning_run'
    };
}

function calculateTrackerStats(tracker, options = {}) {
    const data = options.data || loadData();
    const campaign = CAMPAIGNS[tracker.campaignId];
    const cycle = getTrackerCycle(tracker);
    if (!campaign || !cycle) return tracker;

    const reconstructed = getReconciledCreatorAllocation(data, tracker);
    const historicalPayments = reconstructed && Array.isArray(tracker.paymentHistory)
        ? tracker.paymentHistory.filter(payment => payment?.status === 'paid')
        : [];
    const usesCanonicalActualSettlement = reconstructed && tracker.canonicalSettlementModel === 'actual_payment_only';
    const accounting = reconstructed ? {
        totalViews: reconstructed.totalCreditedViews,
        totalMoney: reconstructed.earnings,
        paidViews: usesCanonicalActualSettlement
            ? Math.max(Number(tracker.actualPaidViews) || 0, 0)
            : historicalPayments.reduce((sum, payment) => sum + Math.max(Number(payment.views) || 0, 0), 0),
        paidMoney: usesCanonicalActualSettlement
            ? Math.max(Number(tracker.actualPaidAmount) || 0, 0)
            : historicalPayments.reduce((sum, payment) => sum + Math.max(Number(payment.amount) || 0, 0), 0)
    } : calculateClipCollectionAccounting(
        getPayoutCycleClips(data, tracker.campaignId, tracker.userId, cycle),
        campaign,
        { scope: 'payout_cycle', campaignId: tracker.campaignId, userId: tracker.userId, earningRunKey: tracker.earningRunKey }
    );
    const carriedOutViews = Math.min(Math.max(Number(tracker.carriedForwardViews) || 0, 0), accounting.totalViews);
    const carriedOutAmount = Math.min(Math.max(Number(tracker.carriedForwardAmount) || 0, 0), accounting.totalMoney);
    const carryBalances = getTrackerCarryBalances(tracker);
    const carryInViews = carryBalances.reduce((sum, item) => sum + Math.max(Number(item.views) || 0, 0), 0);
    const carryInAmount = carryBalances.reduce((sum, item) => sum + Math.max(Number(item.amount) || 0, 0), 0);
    const carryInPaidViews = carryBalances.reduce((sum, item) => sum + Math.min(Math.max(Number(item.paidViews) || 0, 0), Math.max(Number(item.views) || 0, 0)), 0);
    const carryInPaidAmount = carryBalances.reduce((sum, item) => sum + Math.min(Math.max(Number(item.paidAmount) || 0, 0), Math.max(Number(item.amount) || 0, 0)), 0);
    const carriedOutCarryInViews = Math.min(
        Math.max(Number(tracker.carriedForwardCarryInViews) || 0, 0),
        Math.max(carryInViews - carryInPaidViews, 0)
    );
    const carriedOutCarryInAmount = Math.min(
        Math.max(Number(tracker.carriedForwardCarryInAmount) || 0, 0),
        Math.max(carryInAmount - carryInPaidAmount, 0)
    );
    accounting.unpaidViews = Math.max(accounting.totalViews - accounting.paidViews - carriedOutViews, 0);
    accounting.unpaidMoney = Math.max(accounting.totalMoney - accounting.paidMoney - carriedOutAmount, 0);
    tracker.campaignViewsForCycle = accounting.totalViews;
    tracker.campaignEarnedForCycle = accounting.totalMoney;
    tracker.carryInViews = carryInViews;
    tracker.carryInAmount = carryInAmount;
    tracker.carryInPaidViews = carryInPaidViews;
    tracker.carryInPaidAmount = carryInPaidAmount;
    tracker.lifetimeViewsForCycle = accounting.totalViews;
    tracker.lifetimeEarnedForCycle = accounting.totalMoney;
    tracker.paidViewsForCycle = accounting.paidViews + carryInPaidViews;
    tracker.paidAmountForCycle = accounting.paidMoney + carryInPaidAmount;
    tracker.currentUnpaidViews = accounting.unpaidViews + Math.max(carryInViews - carryInPaidViews - carriedOutCarryInViews, 0);
    tracker.currentUnpaidMoney = accounting.unpaidMoney + Math.max(carryInAmount - carryInPaidAmount - carriedOutCarryInAmount, 0);
    tracker.lifetimeViews = accounting.totalViews;
    tracker.lifetimeEarned = accounting.totalMoney;
    tracker.lifetimePaid = accounting.paidMoney + carryInPaidAmount;
    const now = Number(options.now ?? Date.now());
    const cycleEnd = Date.parse(tracker.cycleEndAt || '');
    tracker.cycleStatus = Number.isFinite(cycleEnd) && now >= cycleEnd ? 'closed' : 'active';
    tracker.closedAt = tracker.cycleStatus === 'closed' ? (tracker.closedAt || cycleEnd) : null;
    if (tracker.status !== 'issue') {
        const payoutThresholdViews = Math.max(Number(tracker.historicalPayoutThresholdViews) || getCampaignPayoutThresholdViews(campaign), 0);
        tracker.status = tracker.noPayoutRequired && tracker.currentUnpaidViews === 0 ? 'closed_no_payout' :
            (carriedOutViews > 0 || carriedOutCarryInViews > 0) && tracker.currentUnpaidViews === 0 ? 'carried_forward' :
            tracker.currentUnpaidViews === 0 ? 'paid' :
            tracker.currentUnpaidViews >= payoutThresholdViews ? 'ready' : 'waiting';
    }
    tracker.updatedAt = now;
    return tracker;
}

function formatPayoutCycleLabel(tracker) {
    const format = value => {
        const date = new Date(value);
        const day = new Intl.DateTimeFormat('en-US', {
            day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC'
        }).format(date);
        if (date.getUTCHours() === 0 && date.getUTCMinutes() === 0) return day;
        return `${day} ${String(date.getUTCHours()).padStart(2, '0')}:${String(date.getUTCMinutes()).padStart(2, '0')} UTC`;
    };
    const start = Number.isFinite(Date.parse(tracker?.cycleStartAt || '')) ? format(tracker.cycleStartAt) : null;
    const end = Number.isFinite(Date.parse(tracker?.cycleEndAt || '')) ? format(tracker.cycleEndAt) : null;
    if (start && end) return `${start} → ${end}`;
    if (start) return `${start} → ongoing`;
    return tracker?.earningRunKey || 'Cycle identity unavailable';
}

function closeExpiredPayoutTrackers(data, now = Date.now()) {
    const closedTrackerIds = [];
    for (const tracker of Object.values(data?.payoutTrackers || {})) {
        if (!tracker?.earningRunKey || tracker.migratedToTrackerId) continue;
        const cycleEnd = Date.parse(tracker.cycleEndAt || '');
        if (!Number.isFinite(cycleEnd) || Number(now) < cycleEnd || tracker.cycleStatus === 'closed') continue;
        tracker.cycleStatus = 'closed';
        tracker.closedAt = tracker.closedAt || cycleEnd;
        tracker.updatedAt = Number(now);
        closedTrackerIds.push(tracker.id);
    }
    return closedTrackerIds;
}

async function syncPayoutCard(guild, campaignId, userId, options = {}) {

    const data = loadData();

    const campaign = CAMPAIGNS[campaignId];
    if (!campaign) return;
    
    const user = data.users?.[userId];

    let paymentLabel = "Payment ID";
    let paymentValue = "Not Set";

    if (user?.paymentDetails?.exchange) {

        const exchange =
            user.paymentDetails.exchange;

        paymentLabel =
            `${exchange.charAt(0).toUpperCase()}${exchange.slice(1)} ID`;

        paymentValue =
            user.paymentDetails.paymentId;

    }

    const payoutChannelId =
        data.campaignStaffChannels?.[campaignId]?.payouts;

    if (!payoutChannelId) return;

    const currentChannel = guild.channels.cache.get(payoutChannelId);

    if (!currentChannel) return;

    if (!data.payoutTrackers) data.payoutTrackers = {};
    const requestedTracker = options.trackerId ? data.payoutTrackers[options.trackerId] : null;
    const cycle = requestedTracker
        ? getTrackerCycle(requestedTracker)
        : getCampaignPayoutCycle(campaign, options);
    const tracker = requestedTracker || ensurePayoutTracker(campaignId, userId, { data, cycle });
    if (!tracker || !cycle) return null;
    const payoutId = tracker.id;
    const messageChannel = tracker.channelId
        ? await guild.channels.fetch(tracker.channelId).catch(() => null)
        : null;
    calculateTrackerStats(tracker, { data, now: options.now });
    const statusLabels = {
        waiting: '🟡 Waiting for threshold',
        ready: '🟢 Ready for payment',
        paid: '✅ Paid — waiting for new views',
        carried_forward: '↪️ Carried forward to next cycle',
        closed_no_payout: '⚪ Closed — no payout',
        issue: '🔴 Payment issue'
    };
    const isRecoveredHistoricalCycle = tracker.reconciliationStatus === 'recovered';
    const recoveredStatusLabels = {
        ready: 'Ready for Payout',
        paid: 'Paid',
        carried_forward: 'Carried Forward',
        closed_no_payout: 'Closed — No Payout',
        issue: 'Payment Issue',
        waiting: 'Waiting for Threshold'
    };
    const statusText = isRecoveredHistoricalCycle
        ? (recoveredStatusLabels[tracker.status] || recoveredStatusLabels.waiting)
        : (statusLabels[tracker.status] || statusLabels.waiting);
    const cycleStatusText = tracker.cycleStatus === 'closed' ? '🔒 Closed' : '🟢 Active';
    tracker.updatedAt = Date.now();
    data.payoutTrackers[payoutId] = tracker;

    saveData(data);

    const amountDigits = isRecoveredHistoricalCycle ? 4 : 2;
    const paidDisplay = isRecoveredHistoricalCycle && tracker.paidAmountForCycle === 0
        ? '0.00'
        : tracker.paidAmountForCycle.toFixed(amountDigits);
    const unpaidDisplay = isRecoveredHistoricalCycle && tracker.currentUnpaidMoney === 0
        ? '0.00'
        : tracker.currentUnpaidMoney.toFixed(amountDigits);
    const embed = new EmbedBuilder()

        .setColor(0x00AE86)

        .setTitle(isRecoveredHistoricalCycle
            ? `${campaign.id.charAt(0).toUpperCase()}${campaign.id.slice(1)} Payout`
            : "💰 Creator Ready For Payment")

        .setDescription(

`👤 <@${userId}>

**Campaign**
${campaign.name}

**Campaign Cycle**
${formatPayoutCycleLabel(tracker)}

**Unpaid Views**
${formatNumber(tracker.currentUnpaidViews)}

**Amount**
$${unpaidDisplay}

**${paymentLabel}**
\`${paymentValue}\``

);

    embed.addFields(
        { name: isRecoveredHistoricalCycle ? 'Cycle Earned Views' : 'Campaign Earned Views', value: formatNumber(tracker.lifetimeViewsForCycle), inline: true },
        { name: isRecoveredHistoricalCycle ? 'Cycle Earned' : 'Earned', value: '$' + tracker.lifetimeEarnedForCycle.toFixed(amountDigits), inline: true },
        { name: 'Paid', value: '$' + paidDisplay, inline: true },
        { name: 'Current Unpaid Views', value: formatNumber(tracker.currentUnpaidViews), inline: true },
        { name: 'Current Unpaid Amount', value: '$' + unpaidDisplay, inline: true },
        { name: 'Status', value: `${statusText}\n${cycleStatusText}`, inline: true }
    );
    if (['reconstructed', 'recovered'].includes(tracker.reconciliationStatus)) {
        const label = tracker.reconciliationStatus === 'recovered' ? 'Recovered Historical Cycle' : 'Reconstructed Historical Cycle';
        const settlementNote = tracker.canonicalSettlementModel === 'actual_payment_only'
            ? '\nLegacy paid-looking fields are audit metadata only; canonical paid values reflect real staff payouts.'
            : '';
        embed.addFields({ name: 'Historical Reconciliation', value: `${label}\nMethod: \`${tracker.reconciliationMethod}\`${settlementNote}`, inline: false });
    }
    const carriedForwardDisplayViews = Math.max(Number(tracker.carriedForwardTotalViews ?? tracker.carriedForwardViews) || 0, 0);
    const carriedForwardDisplayAmount = Math.max(Number(tracker.carriedForwardTotalAmount ?? tracker.carriedForwardAmount) || 0, 0);
    if (carriedForwardDisplayViews > 0) {
        const destination = tracker.carryForwardEarningRunKey
            ? getCampaignPayoutCycle(campaign, { earningRunKey: tracker.carryForwardEarningRunKey })
            : null;
        const destinationText = destination ? `\nMoved to ${formatPayoutCycleLabel(destination)}` : '';
        embed.addFields({ name: 'Carried Forward', value: `${formatNumber(carriedForwardDisplayViews)} views • $${carriedForwardDisplayAmount.toFixed(4)}${destinationText}`, inline: false });
    }
    if (Number(tracker.carryInViews) > 0) {
        embed.addFields({ name: 'Previous Balance', value: `${formatNumber(Math.max(tracker.carryInViews - tracker.carryInPaidViews, 0))} unpaid views • $${Math.max(tracker.carryInAmount - tracker.carryInPaidAmount, 0).toFixed(4)}\nPayout liability only — excluded from campaign credit and Fulfilled.`, inline: false });
    }

    const row = new ActionRowBuilder()

        .addComponents(

            new ButtonBuilder()

                .setCustomId(`pay:${payoutId}`)

                .setLabel("Mark Paid")

                .setStyle(ButtonStyle.Success)

                .setDisabled(tracker.status !== "ready"),

            new ButtonBuilder()

                .setCustomId(`issue:${payoutId}`)

                .setLabel("Issue")

                .setStyle(ButtonStyle.Danger),

            new ButtonBuilder()

                .setCustomId(`payout_refresh:${payoutId}`)

                .setLabel("Refresh")

                .setStyle(ButtonStyle.Secondary)

        );

    const payload = {
        embeds: [embed],
        components: [row]
    };

    if (tracker.status === 'issue') {
        row.addComponents(
            new ButtonBuilder()
                .setCustomId(`payout_resolve_issue:${payoutId}`)
                .setLabel('Resolve Issue')
                .setStyle(ButtonStyle.Success)
        );
    }

    let msg = null;
    if (tracker.messageId) {
        msg = await messageChannel?.messages.fetch(tracker.messageId).catch(() => null);
        if (tracker.requiresHistoricalMessageVerification) {
            if (!msg) throw new Error(`Historical payout message ${tracker.messageId} could not be fetched; replacement not posted.`);
            const rendered = JSON.stringify(msg.embeds?.map(item => item.toJSON?.() || item) || []);
            if (client.user?.id && String(msg.author?.id) !== String(client.user.id)) throw new Error(`Historical payout message ${tracker.messageId} is not owned by this bot.`);
            if (String(msg.channelId) !== String(payoutChannelId)) throw new Error(`Historical payout message ${tracker.messageId} is outside the payout channel.`);
            if (!rendered.includes(String(userId)) || !rendered.toLowerCase().includes(String(campaign.id).toLowerCase())) throw new Error(`Historical payout message ${tracker.messageId} does not match creator ${userId}.`);
        }
    }

    if (msg) {
        await msg.edit(payload);
    } else {
        msg = await currentChannel.send(payload);
    }

    console.log("✅ Payout card sent");

    data.payoutTrackers[payoutId].messageId = msg.id;
    data.payoutTrackers[payoutId].channelId = msg.channel.id;

    saveData(data);

    return { tracker: data.payoutTrackers[payoutId], message: msg };

}

async function syncElephantJulyReconciliationCards(guild) {
    const migrationName = ELEPHANT_JULY_RECONCILIATION.migrationName;
    const snapshot = loadData();
    const migration = snapshot.storageMigrations?.[migrationName];
    if (!migration || migration.status !== 'applied' || migration.cardsCompletedAt) return null;
    const results = { ...(migration.cardSyncResults || {}) };
    const supersededResults = { ...(migration.supersededCardSyncResults || {}) };
    for (const trackerId of migration.cardSyncTrackerIds || []) {
        if (results[trackerId]?.status === 'synced') continue;
        const current = loadData();
        const tracker = current.payoutTrackers?.[trackerId];
        if (!tracker) {
            results[trackerId] = { status: 'failed', error: 'tracker_not_found', attemptedAt: Date.now() };
            continue;
        }
        try {
            const hadMessage = Boolean(tracker.messageId);
            const synced = await syncPayoutCard(guild, tracker.campaignId, tracker.userId, { trackerId });
            results[trackerId] = {
                status: 'synced', messageId: synced?.message?.id || null,
                channelId: synced?.message?.channelId || null,
                reusedExistingMessage: hadMessage, syncedAt: Date.now()
            };
        } catch (error) {
            results[trackerId] = { status: 'failed', error: error.message, attemptedAt: Date.now() };
            console.error(`[Elephant July Reconciliation] Card sync failed for ${trackerId}:`, error.message);
        }
    }
    const latest = loadData();
    const latestMigration = latest.storageMigrations?.[migrationName];
    if (!latestMigration) return results;
    latestMigration.cardSyncResults = results;
    if ((latestMigration.cardSyncTrackerIds || []).every(id => results[id]?.status === 'synced')) latestMigration.cardsCompletedAt = Date.now();
    saveData(latest);
    return results;
}

async function syncCrowderHistoricalReconciliationCards(guild) {
    const migrationName = CROWDER_HISTORICAL_RECONCILIATION.migrationName;
    const snapshot = loadData();
    const migration = snapshot.storageMigrations?.[migrationName];
    if (!migration || migration.status !== 'applied' || migration.cardsCompletedAt) return null;
    const results = { ...(migration.cardSyncResults || {}) };
    for (const trackerId of migration.cardSyncTrackerIds || []) {
        if (results[trackerId]?.status === 'synced') continue;
        const current = loadData();
        const tracker = current.payoutTrackers?.[trackerId];
        if (!tracker) {
            results[trackerId] = { status: 'failed', error: 'tracker_not_found', attemptedAt: Date.now() };
            continue;
        }
        try {
            const hadMessage = Boolean(tracker.messageId);
            const synced = await syncPayoutCard(guild, tracker.campaignId, tracker.userId, { trackerId });
            results[trackerId] = {
                status: 'synced', messageId: synced?.message?.id || null,
                channelId: synced?.message?.channelId || null,
                reusedExistingMessage: hadMessage, syncedAt: Date.now()
            };
        } catch (error) {
            results[trackerId] = { status: 'failed', error: error.message, attemptedAt: Date.now() };
            console.error(`[Crowder Historical Reconciliation] Card sync failed for ${trackerId}:`, error.message);
        }
    }
    for (const trackerId of migration.supersededCardSyncTrackerIds || []) {
        if (supersededResults[trackerId]?.status === 'synced') continue;
        const current = loadData();
        const tracker = current.payoutTrackers?.[trackerId];
        if (!tracker?.messageId || !tracker?.channelId) {
            supersededResults[trackerId] = { status: 'failed', error: 'superseded_message_not_bound', attemptedAt: Date.now() };
            continue;
        }
        try {
            const channel = await guild.channels.fetch(tracker.channelId).catch(() => null);
            const message = await channel?.messages.fetch(tracker.messageId).catch(() => null);
            if (!message) throw new Error(`Superseded payout message ${tracker.messageId} could not be fetched.`);
            if (client.user?.id && String(message.author?.id) !== String(client.user.id)) {
                throw new Error(`Superseded payout message ${tracker.messageId} is not owned by this bot.`);
            }
            const rendered = JSON.stringify(message.embeds?.map(item => item.toJSON?.() || item) || []);
            if (!rendered.includes(String(tracker.userId)) || !rendered.toLowerCase().includes('crowder')) {
                throw new Error(`Superseded payout message ${tracker.messageId} does not match creator ${tracker.userId}.`);
            }
            const canonicalId = getPayoutTrackerId(
                'crowder', tracker.userId,
                CROWDER_HISTORICAL_RECONCILIATION.historicalCycle.earningRunKey,
                CROWDER_HISTORICAL_RECONCILIATION.historicalCycle.cycleStartAt,
                CROWDER_HISTORICAL_RECONCILIATION.historicalCycle.cycleEndAt
            );
            const canonical = current.payoutTrackers?.[canonicalId];
            const canonicalReference = canonical?.messageId
                ? `\n\nCanonical historical card: https://discord.com/channels/${guild.id}/${canonical.channelId}/${canonical.messageId}`
                : '';
            await message.edit({
                embeds: [new EmbedBuilder()
                    .setColor(0x5865F2)
                    .setTitle('Crowder Payout Card Superseded')
                    .setDescription(`<@${tracker.userId}>\n\nThis partial historical card was merged into the canonical **29 Jun 2026 → 3 Aug 2026 07:00 UTC** payout cycle. It cannot process a payout.${canonicalReference}`)
                    .setFooter({ text: 'Creators Elite • Historical audit record' })],
                components: []
            });
            supersededResults[trackerId] = {
                status: 'synced', messageId: message.id, channelId: message.channelId,
                canonicalTrackerId: canonicalId, syncedAt: Date.now()
            };
        } catch (error) {
            supersededResults[trackerId] = { status: 'failed', error: error.message, attemptedAt: Date.now() };
            console.error(`[Crowder Historical Reconciliation] Superseded card sync failed for ${trackerId}:`, error.message);
        }
    }
    const latest = loadData();
    const latestMigration = latest.storageMigrations?.[migrationName];
    if (!latestMigration) return results;
    latestMigration.cardSyncResults = results;
    latestMigration.supersededCardSyncResults = supersededResults;
    if ((latestMigration.cardSyncTrackerIds || []).every(id => results[id]?.status === 'synced') &&
        (latestMigration.supersededCardSyncTrackerIds || []).every(id => supersededResults[id]?.status === 'synced')) {
        latestMigration.cardsCompletedAt = Date.now();
    }
    saveData(latest);
    return { cards: results, supersededCards: supersededResults };
}

function getCampaignCycle(campaign, date = new Date()) {

    date = new Date(date);

    if (isNaN(date.getTime())) {
        date = new Date();
    }

    if (campaign.campaignMode === "monthly") {

        const start = new Date(campaign.startDate);

        const diffMonths =
            (date.getUTCFullYear() - start.getUTCFullYear()) * 12 +
            (date.getUTCMonth() - start.getUTCMonth());

        return Math.max(0, diffMonths);

    }

    const start = new Date(campaign.startDate);

    const diffWeeks = Math.floor(
        (date.getTime() - start.getTime()) /
        (7 * 24 * 60 * 60 * 1000)
    );

    return Math.max(
        0,
        Math.floor(
            diffWeeks / (campaign.cycleWeeks || 1)
        )
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

async function sendAccountForStaffReview(guild, campaignId, accountData) {
    const campaign = CAMPAIGNS[campaignId];
    const channelId = campaign?.staffChannels?.linkAccount;
    if (!channelId) return;

    const channel = guild.channels.cache.get(channelId);
    if (channel) {
        // Send account linking review payload with Accept/Reject buttons
        await channel.send({ embeds: [/* Account Link Embed */], components: [/* Staff Action Buttons */] });
    }
}

// Dynamic routing helper for clip reviews
async function sendClipForStaffReview(guild, clip) {
    const data = loadData();
    const campaignStaffMap = data.campaignStaffChannels?.[clip.campaignId];
    
    if (!campaignStaffMap) {
        console.error(`⚠️ No staff channels configured for campaign: ${clip.campaignId}`);
        return;
    }

    // Pick channel ID based on clip platform ('instagram', 'tiktok', 'youtube')
    const platformKey = clip.platform.toLowerCase();
    const targetChannelId = campaignStaffMap[platformKey];

    if (!targetChannelId) {
        console.error(`⚠️ No target channel ID found for platform: ${platformKey}`);
        return;
    }

    const channel = guild.channels.cache.get(targetChannelId);
    if (channel) {
        await channel.send({
            content: `📌 **New ${clip.platform.toUpperCase()} Submission** from <@${clip.userId}>`,
            embeds: [/* Clip Review Embed */],
            components: [/* Approve / Reject Action Row Buttons */]
        });
    }
}

const ACTIVE_ACCOUNT_REQUEST_STATUSES = new Set([
  'pending',
  'waiting_confirm',
  'ready_for_review',
  'verifying',
  'bio_updated',
  'approved'
]);

const TERMINAL_ACCOUNT_REQUEST_STATUSES = new Set([
  'rejected',
  'removed',
  'unlinked',
  'revoked'
]);

function isApprovedAccountRequestStillLinked(data, request) {
  if (String(request?.status || '').toLowerCase() !== 'approved') return false;
  return getCampaignAccountCandidates(
    data?.users?.[request.userId],
    request.campaignId,
    request.platform,
    { activeOnly: true, verifiedOnly: true }
  ).some(account => normalizeSocialKey(request.platform, account.username) === normalizeSocialKey(request.platform, request.username));
}

function validateAccountSubmission(userId, campaignId, platform, username, dataOverride = null) {
  const data = dataOverride || loadData();
  const currentKey = normalizeSocialKey(platform, username);

  // 1. FIND ANY EXISTING ACTIVE OR PENDING REQUEST FOR THIS EXACT HANDLE
  const conflictingRequest = Object.values(data.campaignAccountRequests || {}).find(
    req => {
      const status = String(req?.status || '').toLowerCase();
      if (TERMINAL_ACCOUNT_REQUEST_STATUSES.has(status)) return false;
      if (!ACTIVE_ACCOUNT_REQUEST_STATUSES.has(status)) return false;
      if (normalizeSocialKey(req.platform, req.username) !== currentKey) return false;
      return status !== 'approved' || isApprovedAccountRequestStillLinked(data, req);
    }
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

// Deprecated: submission flow uses validateClipBeforeSubmission() for campaign-scoped canonical duplicate checks.
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

function buildClipStaffEmbed(clip) {
  const campaign = CAMPAIGNS[clip.campaignId];
  const campaignName = clip.campaignName || campaign?.name || clip.campaignId;
  const clipUrl = clip.videoUrl || clip.url || '';
  const title = clip.title || clip.caption || clipUrl || 'View clip';
  const color = { pending: 0xF1C40F, approved: 0x57F287, rejected: 0xED4245 }[clip.status] || 0xF1C40F;
  const pending = clip.status === 'pending';
  const rejected = clip.status === 'rejected';
  const rejectionStage = rejected ? getClipRejectionStage(clip, null) : null;
  const creditedViews = getClipCreditedViews(clip);
  const earnings = pending || rejectionStage === 'pre_approval'
    ? Number(clip.estimatedEarnings) || 0
    : creditedViews / 1_000_000 * (Number(campaign?.ratePerMillion) || 0);
  const payoutLimitText = Number.isFinite(Number(clip.maxPayoutAmount))
    ? `**Clip Payout Limit**\n$${Number(clip.maxPayoutAmount).toFixed(2)}${clip.clipPayoutCapReached ? ' — Reached' : ''}\n`
    : '';
  const statusText = pending ? '🟡 Pending Review' :
    rejectionStage === 'pre_approval' ? '🔴 Rejected Before Approval' :
    rejectionStage === 'post_approval' ? '🔴 Removed From Payment' :
    clip.status === 'approved' ? '✅ Approved' : clip.status || 'pending';
  const completed = clip.trackingStatus === 'completed' ||
    Boolean(campaign?.separateEarningLifecycle && !isClipInCampaignEarningRun(clip, campaign));
  const wasApproved = clip.wasEverApproved === true || Boolean(clip.approvedAt) || clip.status === 'approved';
  const approvalViewsText = wasApproved && Number.isFinite(Number(clip.approvalViews))
    ? formatNumber(Number(clip.approvalViews))
    : 'Not approved yet';
  const trackingText = completed
    ? '**Tracking**\n✅ Completed\n' + (clip.completedReason ? '**Completed Reason**\n' + String(clip.completedReason).replace(/_/g, ' ') + '\n' : '')
    : '**Next Scheduled Check**\n' + (Number(clip.nextCheckAt) > 0 ? '<t:' + Math.floor(Number(clip.nextCheckAt) / 1000) + ':R>' : 'Not scheduled');
  const viewsLabel = rejected ? 'Latest Recorded Views' : 'Current Views';
  const earningsLabel = rejectionStage === 'pre_approval' ? 'Estimated Earnings Before Rejection' :
    rejectionStage === 'post_approval' ? 'Tracked Earnings Before Removal' :
    pending ? 'Estimated Earnings' : 'Current Earnings';
  const embed = new EmbedBuilder()
    .setColor(color)
    .setTitle('Clip Review')
    .setDescription(
      '**Creator**\n<@' + clip.userId + '>\n' +
      '**Campaign**\n' + campaignName + '\n' +
      '**Platform**\n' + formatPlatform(clip.platform) + '\n' +
      '**Account**\n@' + (clip.username || 'Unknown') + '\n' +
      '**Video**\n[' + title + '](' + clipUrl + ')\n' +
      '**Status**\n' + statusText + '\n' +
      '**' + viewsLabel + '**\n' + formatNumber(getSafeTrackedViews(clip, null)) + '\n' +
      '**Campaign Credited Views**\n' + formatNumber(creditedViews) + '\n' +
      '**' + earningsLabel + '**\n$' + earnings.toFixed(2) + (pending ? ' — Not Yet Approved' : '') + '\n' +
      payoutLimitText +
      (pending ? '**Payment Eligibility**\nNot eligible until approved\n' : '') +
      (rejectionStage === 'pre_approval' ? '**Payment Eligibility**\nNot eligible\n' : '') +
      (rejectionStage === 'post_approval' ? '**Payment Eligibility**\nNot eligible for new payment\n**Historical Paid**\n$' + (Number(clip.payout?.paidMoney) || 0).toFixed(2) + '\n' : '') +
      (rejected ? '**Rejection Reason**\n' + (clip.rejectReason || 'Not provided') + '\n' : '') +
      '**Submission Views**\n' + (Number.isFinite(Number(clip.submissionViews)) ? formatNumber(Number(clip.submissionViews)) : 'Unavailable') + '\n' +
      '**Approval Views**\n' + approvalViewsText + '\n' +
      '**Last Updated**\n<t:' + Math.floor((clip.lastChecked || Date.now()) / 1000) + ':R>\n' +
      trackingText
    );
  if (clip.thumbnailUrl) embed.setThumbnail(clip.thumbnailUrl);
  return embed;
}

async function sendClipApprovedDM(guild, clip) {
  try {
    const member = await guild.members.fetch(clip.userId);
    const clipUrl = clip.videoUrl || clip.url;
    const rawTitle = clip.title || clip.caption || 'View approved clip';
    const title = String(rawTitle).replace(/\\/g, '\\\\').replace(/\[/g, '\\[').replace(/\]/g, '\\]');
    const videoText = clipUrl ? `[${title}](${clipUrl})` : title;
    const embed = new EmbedBuilder().setColor(0x00E676)
      .setAuthor({ name: clip.campaignName || CAMPAIGNS[clip.campaignId]?.name || 'Creators Elite', iconURL: guild.iconURL() || undefined })
      .setTitle('Your video has been approved ✅')
      .setDescription(videoText + '\n\n📈 **Current Views**\n' + formatNumber(getSafeTrackedViews(clip, null)) + '\n\n💰 **Current Earnings**\n$' + Number(clip.totalMoneyMade ?? clip.moneyMade ?? 0).toFixed(2) + '\n\n🌐 **Platform**\n' + formatPlatform(clip.platform))
      .setFooter({ text: 'Creators Elite • Thank you for clipping ❤️', iconURL: 'https://cdn.discordapp.com/emojis/1504904179905200148.png' })
      .setTimestamp();
    if (clip.thumbnailUrl) embed.setThumbnail(clip.thumbnailUrl);
    await member.send({ embeds: [embed] });
  } catch (err) {
    console.error(`Could not DM approved clip to ${clip.userId}:`, err.message);
  }
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
    } else if (clip.status === "approved") {
        row.addComponents(
            new ButtonBuilder()
                .setCustomId(`clip_reject:${clip.id}`)
                .setLabel("Reject")
                .setEmoji("❌")
                .setStyle(ButtonStyle.Danger)
        );
        if (clip.trackingStatus !== 'completed') {
            row.addComponents(
                new ButtonBuilder()
                    .setCustomId(`update_views:${clip.id}`)
                    .setLabel("Update Views")
                    .setEmoji("📈")
                    .setStyle(ButtonStyle.Primary)
            );
        }
    } else if (clip.status === "rejected") {
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
    clip => clip.userId === userId && isPayoutEligibleClip(clip)
  );
  
  const liveTotalEarned = approvedClips.reduce((sum, clip) => sum + (Number(clip.totalMoneyMade) || 0), 0);
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

async function backfillPayoutCards() {

    const data = loadData();
    const guild = client.guilds.cache.first();

    if (!guild) return;

    const cycleOwners = new Map();
    for (const clip of Object.values(data.clips || {})) {
        if (!isPayoutEligibleClip(clip) && Number(clip.payout?.paidViews) <= 0 && Number(clip.payout?.paidMoney) <= 0) continue;
        const campaign = CAMPAIGNS[clip.campaignId];
        const cycle = getCampaignPayoutCycle(campaign, { clip });
        if (!cycle) continue;
        cycleOwners.set(`${clip.campaignId}|${clip.userId}|${cycle.earningRunKey}`, {
            campaignId: clip.campaignId,
            userId: clip.userId,
            earningRunKey: cycle.earningRunKey
        });
    }
    for (const owner of cycleOwners.values()) {
        await syncPayoutCard(guild, owner.campaignId, owner.userId, { earningRunKey: owner.earningRunKey });
    }

    console.log("✅ Existing payout cards generated.");
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
      const userClips = Object.values(data.clips || {}).filter(clip => clip.userId === user.discordId && isPayoutEligibleClip(clip));
      const totalViews = getUserAllTimeCreditedViews(data, user.discordId);

      const moneyMade = userClips.reduce(
        (sum, clip) => sum + (Number(clip.totalMoneyMade) || 0),
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
      const liveTotalViews = getUserAllTimeCreditedViews(data, userId);

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

  if (process.env.DEBUG_STATS_CONSISTENCY === 'true') {
    const leaderboardViews = sortedUsers.reduce((sum, user) => sum + user.totalViews, 0);
    const serverViews = getServerAllTimeCreditedViews(data);
    console.log('[Stats Consistency]', { serverViews, leaderboardViews, difference: leaderboardViews - serverViews });
  }

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

      let rankDisplay;

      switch (overallRank) {
        case 1:
          rankDisplay = "🥇";
          break;
        case 2:
          rankDisplay = "🥈";
          break;
        case 3:
          rankDisplay = "🥉";
          break;
        default:
          rankDisplay = `\`${overallRank}.\``;
      }

      const displayName = user.hideFromLeaderboard
        ? "*Hidden*"
        : user.username;

      leaderboardText += `${rankDisplay} **${displayName}**: ${formatNumber(user.totalViews)} Views\n`;
    });
  }

  const embed = new EmbedBuilder()
    .setColor(0x7ED957)
    .setTitle('🎬 Creators Elite <a:rgem:1506235676276953190>')
    .setDescription(`### Top Clippers All Time <a:chart1:1504773558415523931>\n\n${leaderboardText}\n\n<:whiteCE:1504904179905200148> Powered by Creators Elite`)
    .setFooter({ text: `Page ${currentPage} / ${totalPages}` });

  return { embed, page: currentPage, totalPages };
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
      const liveTotalViews = getUserAllTimeCreditedViews(data, id);

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

function getApprovedClipViews(clip) {
  if (!clip) return 0;
  return getClipCreditedViews(clip);
}

function getApprovedClipEarnings(clip, campaign) {
  const views = getApprovedClipViews(clip);
  const rate = Number(campaign?.ratePerMillion) || 0;
  return views / 1_000_000 * rate;
}

function getCampaignBudgetCycleWeeks(campaign) {
  const explicitWeeks = Number(campaign?.budgetCycleWeeks);
  if (Number.isFinite(explicitWeeks) && explicitWeeks > 0) return explicitWeeks;
  const configuredWeeks = Number(campaign?.cycleWeeks);
  if (Number.isFinite(configuredWeeks) && configuredWeeks > 0) return configuredWeeks;
  return String(campaign?.budgetCycle || 'weekly').toLowerCase() === 'monthly' ? 4 : 1;
}

function getCampaignBudgetCycleIndex(campaign, date = new Date()) {
  const parsedDate = new Date(date);
  const startDate = new Date(campaign?.startDate);
  if (Number.isNaN(parsedDate.getTime()) || Number.isNaN(startDate.getTime())) return 0;
  const lengthMs = getCampaignBudgetCycleWeeks(campaign) * 7 * 24 * 60 * 60 * 1000;
  return Math.max(0, Math.floor((parsedDate.getTime() - startDate.getTime()) / lengthMs));
}

function getCampaignBudgetPeriod(campaign, date = new Date()) {
  const cycleIndex = getCampaignBudgetCycleIndex(campaign, date);
  const cycleWeeks = getCampaignBudgetCycleWeeks(campaign);
  const periodStart = new Date(campaign.startDate);
  periodStart.setUTCDate(periodStart.getUTCDate() + cycleIndex * cycleWeeks * 7);
  const periodEnd = new Date(periodStart);
  periodEnd.setUTCDate(periodEnd.getUTCDate() + cycleWeeks * 7);
  return { cycleIndex, periodStart, periodEnd };
}

function getCampaignEarningPeriod(campaign) {
  const start = new Date(campaign?.startDate);
  const end = new Date(campaign?.endDate);
  return {
    periodStart: Number.isNaN(start.getTime()) ? null : start,
    periodEnd: Number.isNaN(end.getTime()) ? null : end
  };
}

function getCampaignEarningStart(campaign) {
  const value = Date.parse(campaign?.startDate || '');
  return Number.isFinite(value) ? value : null;
}

function getCampaignEarningEnd(campaign) {
  const value = Date.parse(campaign?.endDate || '');
  return Number.isFinite(value) ? value : null;
}

function getCampaignEarningRunKey(campaign) {
  return [campaign?.id || 'unknown', campaign?.startDate || '', campaign?.endDate || ''].join(':');
}

function isClipInCampaignEarningRun(clip, campaign) {
  const submittedAt = getClipSubmissionTimestamp(clip);
  const start = getCampaignEarningStart(campaign);
  const end = getCampaignEarningEnd(campaign);
  if (!Number.isFinite(submittedAt) || !Number.isFinite(start) || !Number.isFinite(end)) return false;
  if (submittedAt < start || submittedAt >= end) return false;
  // A submission timestamp inside this configured run is authoritative for
  // legacy records created before earningRunKey was introduced.
  if (!clip?.earningRunKey) return true;
  return String(clip.earningRunKey) === String(getCampaignEarningRunKey(campaign));
}

function isCampaignEarningActive(campaign, date = new Date()) {
  const { periodStart, periodEnd } = getCampaignEarningPeriod(campaign);
  if (!campaign?.separateEarningLifecycle) return true;
  if (!periodStart || !periodEnd) return false;
  const time = new Date(date).getTime();
  return time >= periodStart.getTime() && time < periodEnd.getTime();
}

function isClipInCampaignEarningPeriod(clip, campaign, date = new Date()) {
  if (!campaign?.separateEarningLifecycle) return isClipInCurrentBudgetCycle(clip, campaign, date);
  return isClipInCampaignEarningRun(clip, campaign) && isCampaignEarningActive(campaign, date);
}

function getCampaignBudgetCycleKey(campaign, date = new Date()) {
  const { periodStart } = getCampaignBudgetPeriod(campaign, date);
  return periodStart ? periodStart.toISOString() : null;
}

function getClipSubmissionTimestamp(clip) {
  const direct = Number(clip?.submittedTimestamp);
  if (Number.isFinite(direct) && direct > 0) return direct;
  const parsed = Date.parse(clip?.submittedAt || clip?.createdAt || '');
  return Number.isFinite(parsed) ? parsed : null;
}

function getClipBudgetCycleIndex(clip, campaign) {
  const submittedTimestamp = getClipSubmissionTimestamp(clip);
  return submittedTimestamp ? getCampaignBudgetCycleIndex(campaign, submittedTimestamp) : null;
}

function isClipInCurrentBudgetCycle(clip, campaign, now = new Date()) {
  const clipCycle = getClipBudgetCycleIndex(clip, campaign);
  return clipCycle !== null && Number(clipCycle) === Number(getCampaignBudgetCycleIndex(campaign, now));
}

function getCampaignViewCap(campaign) {
  const value = Number(campaign?.viewCap);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : null;
}

function getStraightCampaignAllocation(data, campaignId) {
  const campaign = CAMPAIGNS[campaignId];
  if (!campaign || !isStraightCampaign(campaign)) return null;
  const stored = data?.campaignAllocations?.[campaignId] || {};
  const baseBudget = Math.max(Number(campaign.campaignBudget) || 0, 0);
  const baseViewCap = Math.max(Number(campaign.viewCap) || 0, 0);
  return {
    totalBudget: Math.max(Number(stored.totalBudget) || baseBudget, baseBudget),
    totalViewCap: Math.max(Number(stored.totalViewCap) || baseViewCap, baseViewCap),
    refills: Array.isArray(stored.refills) ? stored.refills : []
  };
}

function getStraightCampaignCreditRecords(data, campaignId, excludeClipId = null) {
  return getUniqueClipRecords([
    ...Object.values(data?.clips || {}),
    ...Object.values(data?.clipReviews || {})
  ]).filter(clip =>
    String(clip?.campaignId) === String(campaignId) &&
    String(clip?.id) !== String(excludeClipId || '') &&
    (getClipActiveCreditedViews(clip) > 0 || Number(clip?.payout?.paidMoney) > 0)
  );
}

function getStraightCampaignAccounting(data, campaignId) {
  const campaign = CAMPAIGNS[campaignId];
  const allocation = getStraightCampaignAllocation(data, campaignId);
  if (!campaign || !allocation) return null;
  const creditRecords = getStraightCampaignCreditRecords(data, campaignId);
  const rawCreditedViews = creditRecords.reduce((sum, clip) => sum + getClipActiveCreditedViews(clip), 0);
  const rate = Math.max(Number(campaign.ratePerMillion) || 0, 0);
  const rawCreditedMoney = creditRecords.reduce((sum, clip) => sum + getClipActiveCreditedMoney(clip, campaign), 0);
  const creditedViews = Math.min(rawCreditedViews, allocation.totalViewCap);
  const creditedMoney = Math.min(rawCreditedMoney, allocation.totalBudget);
  const viewProgress = allocation.totalViewCap > 0 ? creditedViews / allocation.totalViewCap : 0;
  const moneyProgress = allocation.totalBudget > 0 ? creditedMoney / allocation.totalBudget : 0;
  return {
    creditedViews,
    creditedMoney,
    rawCreditedViews,
    rawCreditedMoney,
    viewCap: allocation.totalViewCap,
    budget: allocation.totalBudget,
    remainingViews: Math.max(allocation.totalViewCap - creditedViews, 0),
    remainingMoney: Math.max(allocation.totalBudget - creditedMoney, 0),
    fulfilledPercent: Math.min(Math.max(viewProgress, moneyProgress) * 100, 100),
    capReached: (allocation.totalViewCap > 0 && rawCreditedViews >= allocation.totalViewCap) ||
      (allocation.totalBudget > 0 && rawCreditedMoney >= allocation.totalBudget),
    refills: allocation.refills
  };
}

function getStraightCampaignRemainingCreditableViews(data, campaign, excludeClipId = null) {
  const allocation = getStraightCampaignAllocation(data, campaign.id);
  if (!allocation) return 0;
  const otherRecords = getStraightCampaignCreditRecords(data, campaign.id, excludeClipId);
  const otherViews = otherRecords.reduce((sum, clip) => sum + getClipActiveCreditedViews(clip), 0);
  const remainingByViews = Math.max(allocation.totalViewCap - otherViews, 0);
  const rate = Math.max(Number(campaign.ratePerMillion) || 0, 0);
  if (rate <= 0) return remainingByViews;
  const otherMoney = otherRecords.reduce((sum, clip) => sum + getClipActiveCreditedMoney(clip, campaign), 0);
  const remainingByMoney = Math.max(allocation.totalBudget - otherMoney, 0) / rate * 1_000_000;
  return Math.max(Math.floor(Math.min(remainingByViews, remainingByMoney)), 0);
}

function finalizeStraightCampaignIfFulfilled(data, campaignId, now = Date.now()) {
  const accounting = getStraightCampaignAccounting(data, campaignId);
  if (!accounting?.capReached) return false;
  data.campaignStatus ||= {};
  const previous = data.campaignStatus[campaignId] || {};
  data.campaignStatus[campaignId] = {
    ...previous,
    status: 'finished_budget',
    finishReason: 'campaign_budget_fulfilled',
    finishedAt: previous.status === 'finished_budget' ? previous.finishedAt : Number(now),
    archived: false
  };
  return previous.status !== 'finished_budget' || previous.finishReason !== 'campaign_budget_fulfilled';
}

function applyStraightCampaignRefill(data, campaignId, addBudget, addViewCap, options = {}) {
  const campaign = CAMPAIGNS[campaignId];
  if (!campaign || !isStraightCampaign(campaign)) throw new Error('Campaign is not a straight-budget campaign.');
  if (campaign.refillable !== true) throw new Error('Campaign is not configured as refillable.');
  const budgetIncrease = Number(addBudget);
  const viewCapIncrease = Number(addViewCap);
  if (!Number.isFinite(budgetIncrease) || budgetIncrease <= 0 || !Number.isFinite(viewCapIncrease) || viewCapIncrease <= 0) {
    throw new Error('Refill budget and view cap must both be positive numbers.');
  }
  const now = Number(options.now ?? Date.now());
  const allocation = getStraightCampaignAllocation(data, campaignId);
  const baselineViews = options.baselineViews || {};
  data.campaignAllocations ||= {};
  data.campaignAllocations[campaignId] = {
    totalBudget: allocation.totalBudget + budgetIncrease,
    totalViewCap: allocation.totalViewCap + Math.floor(viewCapIncrease),
    refills: [
      ...allocation.refills,
      { addedBudget: budgetIncrease, addedViewCap: Math.floor(viewCapIncrease), refilledAt: now, refilledBy: options.refilledBy || null }
    ]
  };
  data.campaignStatus ||= {};
  data.campaignStatus[campaignId] = {
    ...(data.campaignStatus[campaignId] || {}),
    status: 'active',
    finishReason: null,
    finishedAt: null,
    reopenedAt: now,
    archived: false
  };
  for (const clip of Object.values(data.clips || {})) {
    if (String(clip.campaignId) !== String(campaignId) || !isPayoutEligibleClip(clip)) continue;
    clip.straightTracking ||= {};
    const fetchedBaseline = Number(baselineViews[clip.id]);
    if (Number.isFinite(fetchedBaseline) && fetchedBaseline >= 0) {
      const baseline = Math.max(fetchedBaseline, Number(clip.publicViews) || 0, Number(clip.currentViews) || 0);
      clip.publicViews = baseline;
      clip.currentViews = baseline;
      clip.straightTracking.lastPublicViews = baseline;
      clip.straightTracking.refillBaselineViews = baseline;
      clip.straightTracking.baselinePending = false;
    } else {
      clip.straightTracking.baselinePending = true;
    }
    if (clip.completedReason === 'campaign_budget_fulfilled') {
      clip.trackingStatus = 'active';
      clip.completedReason = null;
      clip.completedAt = null;
    }
    clip.nextCheckAt = clip.trackingStatus === 'completed' ? null : now + CLIP_TRACK_INTERVAL_MS;
    clip.trackingRetryAt = null;
  }
  return getStraightCampaignAccounting(data, campaignId);
}

function campaignHasViewCap(campaign) {
  return getCampaignViewCap(campaign) !== null;
}

function getClipCreditedViews(clip) {
  const persistedCredited = Number(clip?.campaignCreditedViews);
  if (Number.isFinite(persistedCredited) && persistedCredited >= 0) return persistedCredited;
  const canonicalLegacyViews = Number(clip?.views);
  if (Number.isFinite(canonicalLegacyViews) && canonicalLegacyViews >= 0) return canonicalLegacyViews;
  // Old records created before `views`/campaignCreditedViews existed used the
  // approval snapshot as their only accounting value.
  return Math.max(Number(clip?.approvalViews) || 0, 0);
}

function isPostApprovalRejectedClip(clip) {
  return Boolean(
    clip?.status === 'rejected' &&
    (clip.rejectionStage === 'post_approval' || clip.wasEverApproved === true || clip.approvedAt || Number(clip.payout?.paidViews) > 0 || Number(clip.payout?.paidMoney) > 0)
  );
}

function getClipPaidCreditedViews(clip, creditedViews = getClipCreditedViews(clip)) {
  return Math.min(Math.max(Number(clip?.payout?.paidViews) || 0, 0), Math.max(Number(creditedViews) || 0, 0));
}

function getClipActiveCreditedViews(clip) {
  const historicalCreditedViews = getClipCreditedViews(clip);
  if (isPayoutEligibleClip(clip)) return historicalCreditedViews;
  if (isPostApprovalRejectedClip(clip) || Number(clip?.payout?.paidViews) > 0 || Number(clip?.payout?.paidMoney) > 0) {
    return getClipPaidCreditedViews(clip, historicalCreditedViews);
  }
  return 0;
}

function getClipActiveCreditedMoney(clip, campaign = CAMPAIGNS[clip?.campaignId]) {
  const rate = Math.max(Number(campaign?.ratePerMillion) || 0, 0);
  const activeViewsMoney = getClipActiveCreditedViews(clip) / 1_000_000 * rate;
  const paidMoney = Math.max(Number(clip?.payout?.paidMoney) || 0, 0);
  return Math.max(activeViewsMoney, paidMoney);
}

function getClipWeekCreditRecords(clip) {
  const records = new Map();
  for (const entry of clip?.budgetTracking?.history || []) {
    if (!entry?.weekKey) continue;
    records.set(String(entry.weekKey), Math.max(Number(entry.creditedViews) || 0, 0));
  }
  if (clip?.budgetTracking?.budgetCycleKey) {
    records.set(
      String(clip.budgetTracking.budgetCycleKey),
      Math.max(Number(clip.budgetTracking.creditedViewsThisCycle) || 0, 0)
    );
  }
  return [...records.entries()]
    .map(([weekKey, creditedViews]) => ({ weekKey, creditedViews, timestamp: Date.parse(weekKey) }))
    .sort((a, b) => (Number.isFinite(a.timestamp) ? a.timestamp : Infinity) - (Number.isFinite(b.timestamp) ? b.timestamp : Infinity));
}

function getClipActiveWeekCreditedViews(clip, weekKey) {
  const record = getClipWeekCreditRecords(clip).find(entry => entry.weekKey === String(weekKey));
  if (!record) return 0;
  if (!isPostApprovalRejectedClip(clip)) return record.creditedViews;
  let remainingPaidViews = getClipPaidCreditedViews(clip);
  for (const entry of getClipWeekCreditRecords(clip)) {
    const paidForWeek = Math.min(entry.creditedViews, remainingPaidViews);
    if (entry.weekKey === String(weekKey)) return paidForWeek;
    remainingPaidViews = Math.max(remainingPaidViews - paidForWeek, 0);
  }
  return 0;
}

function getCurrentBudgetCycleEligibleClips(campaignId, options = {}) {
  const data = options.data || loadData();
  const campaign = CAMPAIGNS[campaignId];
  if (!campaign) return [];
  return getUniqueClipRecords([
    ...Object.values(data.clips || {}),
    ...Object.values(data.clipReviews || {})
  ]).filter(clip =>
    String(clip.campaignId) === String(campaignId) &&
    isClipInCurrentBudgetCycle(clip, campaign) &&
    clip.trackingStatus !== 'completed' &&
    (isPayoutEligibleClip(clip) || Number(clip.payout?.paidViews) > 0 || Number(clip.payout?.paidMoney) > 0)
  );
}

function isWeeklyCreditRecord(clip) {
  return clip?.status === 'pending' ||
    isPayoutEligibleClip(clip) ||
    Number(clip?.payout?.paidViews) > 0 ||
    Number(clip?.payout?.paidMoney) > 0;
}

function getStoredWeekCreditedViews(clip, weekKey) {
  if (clip?.budgetTracking?.budgetCycleKey === weekKey) {
    return Math.max(Number(clip.budgetTracking.creditedViewsThisCycle) || 0, 0);
  }
  const historyEntry = (clip?.budgetTracking?.history || []).find(entry => entry?.weekKey === weekKey);
  return Math.max(Number(historyEntry?.creditedViews) || 0, 0);
}

function getTrustedCurrentRunCreditedViews(clip) {
  const campaignCreditedViews = Number(clip?.campaignCreditedViews);
  if (Number.isFinite(campaignCreditedViews) && campaignCreditedViews >= 0) {
    return { views: campaignCreditedViews, source: 'campaignCreditedViews' };
  }
  const compatibilityViews = Number(clip?.views);
  if (Number.isFinite(compatibilityViews) && compatibilityViews >= 0) {
    return { views: compatibilityViews, source: 'views_compatibility_fallback' };
  }
  return { views: 0, source: 'missing' };
}

function getFirstFiniteTimestamp(values) {
  for (const value of values) {
    const numeric = Number(value);
    if (Number.isFinite(numeric) && numeric > 0) return numeric;
    const parsed = Date.parse(value || '');
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

function repairAugustFirstWeekLegacyWeeklyAccounting(data, now = new Date()) {
  const migrationName = 'augustFirstWeekLegacyWeeklyBackfillV1';
  const campaign = CAMPAIGNS.elephant;
  const earningRunKey = getCampaignEarningRunKey(campaign);
  const weekStart = getCampaignEarningStart(campaign);
  const weekEnd = Date.parse('2026-08-10T07:00:00.000Z');
  const weekKey = new Date(weekStart).toISOString();
  const executedAt = new Date(now).getTime();
  const baseReport = {
    migrationName,
    campaignId: campaign.id,
    earningRunKey,
    weekKey,
    weekStart: new Date(weekStart).toISOString(),
    weekEnd: new Date(weekEnd).toISOString(),
    executedAt,
    allocationMethod: 'missing pre-upgrade credit segments first, then stored credit segments; each phase ordered by best available approval/submission/credit timestamps',
    exactPerViewCreditOrderAvailable: false,
    allocationWarning: 'The legacy schema has no per-view credit-event ledger. Allocation uses the best persisted timestamps and preserves all raw campaign, public, and payment history fields.'
  };

  if (data?.storageMigrations?.[migrationName]) {
    return data.storageMigrations[migrationName];
  }

  if (!Number.isFinite(executedAt) || executedAt < weekStart || executedAt >= weekEnd) {
    return { ...baseReport, status: 'skipped_outside_august_week_1', clips: [], users: [] };
  }

  const grouped = new Map();
  for (const [collectionName, collection] of [['clips', data?.clips || {}], ['clipReviews', data?.clipReviews || {}]]) {
    for (const clip of Object.values(collection)) {
      const submittedAt = getClipSubmissionTimestamp(clip);
      if (
        String(clip?.campaignId) !== campaign.id ||
        !isClipInCampaignEarningRun(clip, campaign) ||
        !Number.isFinite(submittedAt) || submittedAt < weekStart || submittedAt >= weekEnd
      ) continue;
      const identity = getClipIdentityKey(clip) || `id:${clip.id}`;
      if (!grouped.has(identity)) grouped.set(identity, []);
      grouped.get(identity).push({ clip, collectionName });
    }
  }

  const records = [...grouped.entries()].map(([identity, copies]) => {
    const primary = copies.find(copy => copy.collectionName === 'clips')?.clip || copies[0].clip;
    const trusted = getTrustedCurrentRunCreditedViews(primary);
    const eligible = isWeeklyCreditRecord(primary);
    const expectedWeekViews = eligible ? trusted.views : 0;
    const storedWeekViews = getStoredWeekCreditedViews(primary, weekKey);
    const missingWeekViews = Math.max(expectedWeekViews - storedWeekViews, 0);
    const indicators = [];
    if (!primary.budgetTracking?.budgetCycleKey) indicators.push('MISSING_WEEK_KEY');
    if (primary.budgetTracking?.budgetCycleKey !== weekKey) indicators.push('WRONG_WEEK_KEY');
    if (primary.budgetTracking?.creditedViewsThisCycle === null || primary.budgetTracking?.creditedViewsThisCycle === undefined) indicators.push('MISSING_CURRENT_WEEK_CREDIT');
    if (storedWeekViews === 0 && expectedWeekViews > 0) indicators.push('ZERO_WEEK_WITH_CURRENT_RUN_CREDIT');
    if (missingWeekViews > 0) indicators.push('POST_UPGRADE_DELTA_ONLY');
    const inferredPreUpgrade = indicators.length > 0 && missingWeekViews > 0;
    const legacyCreditTimestamp = getFirstFiniteTimestamp([
      primary.approvedAt,
      primary.submittedTimestamp,
      primary.submittedAt,
      primary.createdAt
    ]);
    const storedCreditTimestamp = getFirstFiniteTimestamp([
      primary.budgetTracking?.lastCreditedAt,
      primary.lastChecked,
      primary.approvedAt,
      primary.submittedTimestamp,
      primary.submittedAt
    ]);
    return {
      identity,
      copies,
      primary,
      eligible,
      trustedSource: trusted.source,
      expectedWeekViews,
      storedWeekViews,
      missingWeekViews,
      inferredPreUpgrade,
      indicators,
      legacyCreditTimestamp,
      storedCreditTimestamp,
      weekKeyBefore: primary.budgetTracking?.budgetCycleKey || null,
      baselineInitializedAtBefore: primary.budgetTracking?.initializedAt || null,
      weeklyBaselineViewsBefore: primary.weeklyBaselineViews ?? primary.budgetTracking?.baselinePublicViews ?? null,
      allocatedWeekViews: 0
    };
  });

  const segments = [];
  for (const record of records) {
    if (record.missingWeekViews > 0) {
      segments.push({ record, phase: 0, timestamp: record.legacyCreditTimestamp, views: record.missingWeekViews });
    }
    const retainedStoredViews = Math.min(record.storedWeekViews, record.expectedWeekViews);
    if (retainedStoredViews > 0) {
      segments.push({ record, phase: 1, timestamp: record.storedCreditTimestamp, views: retainedStoredViews });
    }
  }
  segments.sort((a, b) =>
    a.phase - b.phase ||
    a.timestamp - b.timestamp ||
    String(a.record.primary.id).localeCompare(String(b.record.primary.id))
  );

  const weeklyCap = getCampaignViewCap(campaign);
  const legitimateTotalBeforeCap = records.reduce((sum, record) => sum + record.expectedWeekViews, 0);
  let remainingCap = weeklyCap === null ? Infinity : weeklyCap;
  for (const segment of segments) {
    const allocated = Math.min(segment.views, remainingCap);
    segment.record.allocatedWeekViews += allocated;
    remainingCap = Math.max(remainingCap - allocated, 0);
  }

  if (legitimateTotalBeforeCap > weeklyCap) {
    console.warn('[August Week 1 Legacy Weekly Backfill] Reconstructed credits exceed the weekly cap; applying best-available timestamp allocation.', {
      campaignId: campaign.id,
      legitimateTotalBeforeCap,
      weeklyCap,
      allocationMethod: baseReport.allocationMethod
    });
  }

  for (const record of records) {
    for (const { clip } of record.copies) {
      clip.budgetTracking ||= {};
      clip.budgetTracking.budgetCycleKey = weekKey;
      clip.budgetTracking.creditedViewsThisCycle = record.allocatedWeekViews;
      clip.budgetTracking.baselinePublicViews ??= Math.max(
        Math.max(Number(clip.publicViews) || 0, Number(clip.currentViews) || 0) - record.expectedWeekViews,
        0
      );
      clip.budgetTracking.lastPublicViews = Math.max(
        Number(clip.budgetTracking.lastPublicViews) || 0,
        Number(clip.publicViews) || 0,
        Number(clip.currentViews) || 0
      );
      clip.budgetTracking.initializedAt ??= executedAt;
      clip.budgetTracking.runLedgerCompleteFor = earningRunKey;
    }
  }

  const usersById = new Map();
  for (const record of records) {
    const userId = String(record.primary.userId || 'unknown');
    if (!usersById.has(userId)) usersById.set(userId, {
      userId,
      currentRunCreditedViewsBefore: 0,
      currentWeekCreditedViewsBefore: 0,
      currentWeekCreditedViewsAfter: 0,
      currentRunPaidViews: 0,
      clips: []
    });
    const user = usersById.get(userId);
    user.currentRunCreditedViewsBefore += record.expectedWeekViews;
    user.currentWeekCreditedViewsBefore += record.storedWeekViews;
    user.currentWeekCreditedViewsAfter += record.allocatedWeekViews;
    user.currentRunPaidViews += Math.min(Math.max(Number(record.primary.payout?.paidViews) || 0, 0), record.expectedWeekViews);
    user.clips.push(record.primary.id);
  }
  const users = [...usersById.values()].map(user => ({
    ...user,
    currentRunUnpaidViewsBefore: Math.max(user.currentRunCreditedViewsBefore - user.currentRunPaidViews, 0),
    screenshotMatchScore:
      Math.abs(user.currentRunCreditedViewsBefore - 9_000_000) +
      Math.abs(user.currentWeekCreditedViewsBefore - 4_200_000) +
      Math.abs(user.currentRunPaidViews - 3_500_000)
  })).sort((a, b) => a.screenshotMatchScore - b.screenshotMatchScore);

  const clipReport = records.map(record => ({
    clipId: record.primary.id,
    userId: record.primary.userId,
    submittedAt: record.primary.submittedAt || record.primary.submittedTimestamp || null,
    approvedAt: record.primary.approvedAt || null,
    status: record.primary.status,
    trackingStatus: record.primary.trackingStatus || null,
    submissionViews: record.primary.submissionViews ?? null,
    approvalViews: record.primary.approvalViews ?? null,
    publicViews: record.primary.publicViews ?? null,
    currentViews: record.primary.currentViews ?? null,
    campaignCreditedViews: record.primary.campaignCreditedViews ?? null,
    views: record.primary.views ?? null,
    weekKeyBefore: record.weekKeyBefore,
    currentWeekCreditedViewsBefore: record.storedWeekViews,
    currentWeekCreditedViewsAfter: record.allocatedWeekViews,
    weeklyViews: record.primary.weeklyViews ?? null,
    weeklyBaselineViews: record.weeklyBaselineViewsBefore,
    baselineInitializedAt: record.baselineInitializedAtBefore,
    earningRunKey: record.primary.earningRunKey || null,
    paidViews: Math.max(Number(record.primary.payout?.paidViews) || 0, 0),
    expectedWeekViews: record.expectedWeekViews,
    differenceBeforeRepair: record.missingWeekViews,
    trustedSource: record.trustedSource,
    eligible: record.eligible,
    inferredPreUpgrade: record.inferredPreUpgrade,
    indicators: record.indicators
  }));
  const preUpgrade = records.filter(record => record.inferredPreUpgrade);
  const postUpgrade = records.filter(record => !record.inferredPreUpgrade);
  const sum = (items, field) => items.reduce((total, item) => total + item[field], 0);

  const report = {
    ...baseReport,
    status: records.length ? 'applied' : 'no_qualifying_clips',
    qualifyingClipCount: records.length,
    inferredPreUpgradeClipCount: preUpgrade.length,
    preUpgradeCreditedViews: sum(preUpgrade, 'expectedWeekViews'),
    preUpgradeStoredWeeklyViews: sum(preUpgrade, 'storedWeekViews'),
    preUpgradeMissingWeeklyViews: sum(preUpgrade, 'missingWeekViews'),
    inferredPostUpgradeClipCount: postUpgrade.length,
    postUpgradeCreditedViews: sum(postUpgrade, 'expectedWeekViews'),
    postUpgradeStoredWeeklyViews: sum(postUpgrade, 'storedWeekViews'),
    week1StoredTotalBefore: sum(records, 'storedWeekViews'),
    legitimateTotalBeforeCap,
    displayedTotalAfterCap: sum(records, 'allocatedWeekViews'),
    weeklyCap,
    users,
    screenshotCandidateUser: users[0] || null,
    clips: clipReport
  };
  data.storageMigrations ||= {};
  data.storageMigrations[migrationName] = report;
  return report;
}

function getCampaignCurrentWeekLedgerEntries(data, campaignId, now = new Date(), excludeClipId = null) {
  const campaign = CAMPAIGNS[campaignId];
  if (!campaign) return [];
  const weekKey = getCampaignBudgetCycleKey(campaign, now);
  const excludedId = excludeClipId ? String(excludeClipId) : null;
  const records = getUniqueClipRecords([
    ...Object.values(data?.clips || {}),
    ...Object.values(data?.clipReviews || {})
  ], { scope: 'current_week_ledger', campaignId });

  return records
    .filter(clip =>
      String(clip.campaignId) === String(campaignId) &&
      String(clip.id) !== excludedId &&
      (!campaign.separateEarningLifecycle || isClipInCampaignEarningRun(clip, campaign)) &&
      isWeeklyCreditRecord(clip) &&
      clip.budgetTracking?.budgetCycleKey === weekKey &&
      getClipActiveWeekCreditedViews(clip, weekKey) > 0
    )
    .map(clip => ({
      clip,
      historicalCreditedViews: Math.max(Number(clip.budgetTracking?.creditedViewsThisCycle) || 0, 0),
      rawCreditedViews: getClipActiveWeekCreditedViews(clip, weekKey),
      creditedAt: Number(clip.budgetTracking?.lastCreditedAt) || Number(clip.lastChecked) || getClipSubmissionTimestamp(clip) || 0
    }))
    .sort((a, b) => a.creditedAt - b.creditedAt || String(a.clip.id).localeCompare(String(b.clip.id)));
}

function allocateCurrentWeekLedger(data, campaignId, now = new Date(), excludeClipId = null) {
  const campaign = CAMPAIGNS[campaignId];
  const cap = getCampaignViewCap(campaign);
  let remaining = cap === null ? Infinity : cap;
  return getCampaignCurrentWeekLedgerEntries(data, campaignId, now, excludeClipId).map(entry => {
    const creditedViews = Math.min(entry.rawCreditedViews, remaining);
    remaining = Math.max(remaining - creditedViews, 0);
    return { ...entry, creditedViews };
  });
}

function getCampaignCurrentWeekAccounting(data, campaignId, now = new Date()) {
  const campaign = CAMPAIGNS[campaignId];
  if (!campaign) return null;
  const { periodStart, periodEnd } = getCampaignBudgetPeriod(campaign, now);
  const weekKey = getCampaignBudgetCycleKey(campaign, now);
  const entries = allocateCurrentWeekLedger(data, campaignId, now);
  const rawCreditedViews = entries.reduce((sum, entry) => sum + entry.rawCreditedViews, 0);
  const creditedViews = entries.reduce((sum, entry) => sum + entry.creditedViews, 0);
  const cap = getCampaignViewCap(campaign);
  const rate = Number(campaign.ratePerMillion) || 0;
  const weeklyBudget = Number(campaign.campaignBudget) || (cap === null ? 0 : cap / 1_000_000 * rate);
  const creditedMoney = creditedViews / 1_000_000 * rate;
  return {
    weekKey,
    periodStart,
    periodEnd,
    rawCreditedViews,
    creditedViews,
    creditedMoney,
    remainingViews: cap === null ? null : Math.max(cap - creditedViews, 0),
    remainingBudget: Math.max(weeklyBudget - creditedMoney, 0),
    capReached: cap !== null && creditedViews >= cap,
    weeklyCap: cap,
    weeklyBudget,
    entries
  };
}

function getUserCurrentWeekAccounting(data, campaignId, userId, now = new Date()) {
  const campaignAccounting = getCampaignCurrentWeekAccounting(data, campaignId, now);
  if (!campaignAccounting) return null;
  const entries = campaignAccounting.entries.filter(entry => String(entry.clip.userId) === String(userId));
  const creditedViews = entries.reduce((sum, entry) => sum + entry.creditedViews, 0);
  const rate = Number(CAMPAIGNS[campaignId]?.ratePerMillion) || 0;
  return {
    weekKey: campaignAccounting.weekKey,
    periodStart: campaignAccounting.periodStart,
    periodEnd: campaignAccounting.periodEnd,
    creditedViews,
    creditedMoney: creditedViews / 1_000_000 * rate,
    entries
  };
}

function getCampaignCurrentWeeklyCreditedViews(campaignId, options = {}) {
  const data = options.data || loadData();
  const campaign = CAMPAIGNS[campaignId];
  if (!campaign) return 0;
  return getCampaignCurrentWeekLedgerEntries(
    data,
    campaignId,
    options.date || new Date(),
    options.excludeClipId || null
  ).reduce((total, entry) => total + entry.rawCreditedViews, 0);
}

function getCampaignCurrentCycleCreditedViews(campaignId, options = {}) {
  if (isStraightCampaign(CAMPAIGNS[campaignId])) {
    return getStraightCampaignAccounting(options.data || loadData(), campaignId)?.creditedViews || 0;
  }
  if (CAMPAIGNS[campaignId]?.separateEarningLifecycle) {
    return getCampaignCurrentWeeklyCreditedViews(campaignId, options);
  }
  const excludeClipId = options.excludeClipId ? String(options.excludeClipId) : null;
  return getCurrentBudgetCycleEligibleClips(campaignId, options)
    .filter(clip => String(clip.id) !== excludeClipId)
    .reduce((total, clip) => total + getClipActiveCreditedViews(clip), 0);
}

function isCampaignCurrentBudgetCycleFulfilled(campaignId, options = {}) {
  const campaign = CAMPAIGNS[campaignId];
  const cap = getCampaignViewCap(campaign);
  return cap !== null && getCampaignCurrentCycleCreditedViews(campaignId, options) >= cap;
}

function finalizeExpiredBudgetCycleClips(data = loadData(), now = new Date()) {
  let changed = false;
  for (const collection of [data.clipReviews || {}, data.clips || {}]) {
    for (const clip of Object.values(collection)) {
      const campaign = CAMPAIGNS[clip?.campaignId];
      if (!campaign) continue;
      if (isStraightCampaign(campaign)) continue;
      if (campaign.separateEarningLifecycle) {
        const { periodStart, periodEnd } = getCampaignEarningPeriod(campaign);
        const submittedAt = getClipSubmissionTimestamp(clip);
        if (!periodStart || !periodEnd || !submittedAt || submittedAt < periodStart.getTime() || submittedAt >= periodEnd.getTime() || new Date(now).getTime() < periodEnd.getTime()) continue;
        if (clip.trackingStatus !== 'completed') {
          clip.trackingStatus = 'completed';
          clip.completedAt ||= Date.now();
          clip.completedReason ||= 'campaign_earning_period_ended';
          changed = true;
        }
        clip.nextCheckAt = null;
        clip.trackingRetryAt = null;
        continue;
      }
      const clipCycle = getClipBudgetCycleIndex(clip, campaign);
      const currentCycle = getCampaignBudgetCycleIndex(campaign, now);
      if (clipCycle === null || Number(clipCycle) >= Number(currentCycle)) continue;
      if (clip.trackingStatus !== 'completed') {
        clip.trackingStatus = 'completed';
        clip.completedAt ||= Date.now();
        clip.completedReason ||= 'budget_cycle_ended';
        changed = true;
      }
      clip.nextCheckAt = null;
      clip.trackingRetryAt = null;
    }
  }
  return changed;
}

function finalizeOutOfRunClips(data, now = Date.now()) {
  let completedCount = 0;
  let changed = false;
  for (const collection of [data?.clips || {}, data?.clipReviews || {}]) {
    for (const clip of Object.values(collection)) {
      const campaign = CAMPAIGNS[clip?.campaignId];
      if (!campaign?.separateEarningLifecycle) continue;
      const campaignEnd = getCampaignEarningEnd(campaign);
      const belongsToRun = isClipInCampaignEarningRun(clip, campaign);
      if (!belongsToRun || (campaignEnd !== null && now >= campaignEnd)) {
        if (clip.trackingStatus !== 'completed') {
          clip.trackingStatus = 'completed';
          clip.completedAt ||= now;
          clip.completedReason = 'campaign_earning_period_ended';
          completedCount++;
          changed = true;
        }
        if (clip.nextCheckAt !== null || clip.trackingRetryAt !== null) changed = true;
        clip.nextCheckAt = null;
        clip.trackingRetryAt = null;
      }
    }
  }
  return { completedCount, changed };
}

function getClipTrackingAudit(clip, now = Date.now()) {
  const campaign = CAMPAIGNS[clip?.campaignId];
  const submissionViews = Number(clip?.submissionViews);
  const approvalViews = Number(clip?.approvalViews);
  const publicViews = Number(clip?.publicViews);
  const currentViews = Number(clip?.currentViews);
  const wasApproved = clip?.wasEverApproved === true || Boolean(clip?.approvedAt) || clip?.status === 'approved';
  const outOfRun = Boolean(campaign?.separateEarningLifecycle && !isClipInCampaignEarningRun(clip, campaign));
  const campaignEnd = campaign ? getCampaignEarningEnd(campaign) : null;
  const flags = [];
  if (wasApproved && Number.isFinite(submissionViews) && submissionViews >= 0 && (!Number.isFinite(approvalViews) || approvalViews < submissionViews)) flags.push('APPROVAL_BELOW_SUBMISSION');
  if (clip?.trackingStatus === 'completed' && (Number(clip?.nextCheckAt) > 0 || Number(clip?.trackingRetryAt) > 0)) flags.push('COMPLETED_HAS_NEXT_CHECK');
  if (outOfRun && clip?.trackingStatus !== 'completed') flags.push('OUT_OF_RUN_STILL_ACTIVE');
  if (!Number.isFinite(submissionViews) || submissionViews < 0) flags.push('MISSING_SUBMISSION_SNAPSHOT');
  if (wasApproved && (!Number.isFinite(approvalViews) || approvalViews < 0)) flags.push('MISSING_APPROVAL_SNAPSHOT');
  const snapshotFloor = Math.max(Number.isFinite(submissionViews) ? submissionViews : 0, Number.isFinite(approvalViews) ? approvalViews : 0);
  if ((Number.isFinite(publicViews) && publicViews < snapshotFloor) || (Number.isFinite(currentViews) && currentViews < snapshotFloor)) flags.push('PUBLIC_VIEWS_DECREASED');
  if (campaignEnd !== null && now >= campaignEnd && clip?.trackingStatus !== 'completed') flags.push('TRACKING_ACTIVE_AFTER_CAMPAIGN_END');
  return {
    clipId: clip?.id,
    campaign: clip?.campaignId,
    platform: clip?.platform,
    status: clip?.status,
    trackingStatus: clip?.trackingStatus,
    submittedTimestamp: getClipSubmissionTimestamp(clip),
    submissionViews: clip?.submissionViews,
    approvalViews: clip?.approvalViews,
    currentViews: clip?.currentViews,
    publicViews: clip?.publicViews,
    campaignCreditedViews: clip?.campaignCreditedViews,
    earningRunKey: clip?.earningRunKey,
    currentEarningRunKey: campaign?.separateEarningLifecycle ? getCampaignEarningRunKey(campaign) : null,
    nextCheckAt: clip?.nextCheckAt,
    problemFlags: flags
  };
}

function shouldTrackClip(clip, campaign, data, now = new Date()) {
  if (!clip || !campaign || clip.trackingStatus === 'completed') return false;
  if (clip.status !== 'pending' && !(clip.status === 'approved' && isPayoutEligibleClip(clip))) return false;
  if (
    clip.status === 'approved' &&
    Number.isFinite(Number(clip.maxCampaignCreditedViews)) &&
    getClipCreditedViews(clip) >= Number(clip.maxCampaignCreditedViews)
  ) return false;
  if (isStraightCampaign(campaign)) {
    if (getStraightCampaignAccounting(data, campaign.id)?.capReached) return false;
  } else if (campaign.separateEarningLifecycle) {
    if (!isClipInCampaignEarningPeriod(clip, campaign, now)) return false;
  } else if (!isClipInCurrentBudgetCycle(clip, campaign, now)) return false;
  if (!isStraightCampaign(campaign) && campaignHasViewCap(campaign) && isCampaignCurrentBudgetCycleFulfilled(campaign.id, { data, date: now })) return false;
  return true;
}

function getFiniteNonNegativeNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : 0;
}

function getClipIdentityKey(clip) {
  const platform = String(clip?.platform || '').trim().toLowerCase();
  const videoId = String(clip?.videoId || '').trim();
  if (platform && videoId) return `video:${platform}:${videoId}`;
  const rawUrl = clip?.videoUrl || clip?.url;
  if (rawUrl) {
    try {
      const parsed = parseCanonicalVideoUrl(rawUrl);
      if (parsed?.platform && parsed?.videoId) return `video:${parsed.platform}:${parsed.videoId}`;
      const url = new URL(rawUrl);
      url.hash = '';
      return `url:${url.origin.toLowerCase()}${url.pathname}`;
    } catch {}
  }
  return clip?.id ? `id:${clip.id}` : null;
}

function getClipAccounting(clip, campaign) {
  const totalViews = getClipActiveCreditedViews(clip);
  const rawPaidViews = getFiniteNonNegativeNumber(clip?.payout?.paidViews);
  const paidViews = Math.min(rawPaidViews, totalViews);
  const paidMoney = getFiniteNonNegativeNumber(clip?.payout?.paidMoney);
  if (rawPaidViews > totalViews && process.env.DEBUG_CLIP_ACCOUNTING === 'true') console.warn('[Clip Accounting anomaly]', { id: clip?.id, identity: getClipIdentityKey(clip), rawPaidViews, totalViews });
  const eligible = isPayoutEligibleClip(clip);
  const unpaidViews = eligible ? Math.max(totalViews - paidViews, 0) : 0;
  const unpaidMoney = unpaidViews / 1_000_000 * (Number(campaign?.ratePerMillion) || 0);
  return { eligible, totalViews, rawPaidViews, paidViews, unpaidViews, paidMoney, unpaidMoney,
    accountedViews: paidViews + unpaidViews, accountedMoney: paidMoney + unpaidMoney };
}

function applyPostApprovalCreditReversal(clip, options = {}) {
  if (!isPostApprovalRejectedClip(clip)) return { changed: false, reason: 'not_post_approval_rejected' };
  const historicalCreditedViews = getClipCreditedViews(clip);
  const paidCreditedViews = getClipPaidCreditedViews(clip, historicalCreditedViews);
  const reversedCreditedViews = Math.max(historicalCreditedViews - paidCreditedViews, 0);
  const campaign = CAMPAIGNS[clip.campaignId];
  const reversedEarnings = reversedCreditedViews / 1_000_000 * (Number(campaign?.ratePerMillion) || 0);
  const existing = clip.creditReversal;
  const alreadyApplied = existing?.active === true &&
    Number(existing.historicalCreditedViews) === historicalCreditedViews &&
    Number(existing.paidCreditedViews) === paidCreditedViews &&
    Number(existing.reversedCreditedViews) === reversedCreditedViews;

  const lifecycleChanged = clip.payoutEligible !== false ||
    clip.trackingStatus !== 'completed' ||
    clip.completedReason !== 'post_approval_rejection' ||
    clip.nextCheckAt !== null ||
    clip.trackingRetryAt !== null;
  clip.payoutEligible = false;
  clip.trackingStatus = 'completed';
  clip.completedReason = 'post_approval_rejection';
  clip.completedAt ||= Number(options.now ?? Date.now());
  clip.nextCheckAt = null;
  clip.trackingRetryAt = null;
  if (alreadyApplied) return { changed: lifecycleChanged, historicalCreditedViews, paidCreditedViews, reversedCreditedViews, reversedEarnings };

  const appliedAt = Number(options.now ?? Date.now());
  clip.creditReversal = {
    ...(existing || {}),
    active: true,
    type: 'post_approval_rejection',
    appliedAt,
    appliedBy: options.appliedBy || null,
    historicalCreditedViews,
    paidCreditedViews,
    reversedCreditedViews,
    reversedEarnings,
    reason: options.reason || clip.rejectReason || 'post_approval_rejection',
    budgetCycleKey: clip.budgetTracking?.budgetCycleKey || null,
    currentWeekHistoricalCreditedViews: Math.max(Number(clip.budgetTracking?.creditedViewsThisCycle) || 0, 0)
  };
  clip.creditReversedAt = appliedAt;
  clip.reversedCreditedViews = reversedCreditedViews;
  clip.reversedEarnings = reversedEarnings;
  clip.creditReversalReason = 'post_approval_rejection';
  return { changed: true, historicalCreditedViews, paidCreditedViews, reversedCreditedViews, reversedEarnings };
}

function restorePostApprovalCreditReversal(clip, options = {}) {
  const restoredAt = Number(options.now ?? Date.now());
  clip.status = 'approved';
  clip.payoutEligible = true;
  clip.wasEverApproved = true;
  if (clip.creditReversal) {
    clip.creditReversal.active = false;
    clip.creditReversal.restoredAt = restoredAt;
    clip.creditReversal.restoredBy = options.restoredBy || null;
  }
  if (!clip.clipPayoutCapReached) {
    clip.trackingStatus = 'active';
    clip.completedReason = null;
    clip.completedAt = null;
    clip.nextCheckAt = restoredAt + CLIP_TRACK_INTERVAL_MS;
    clip.trackingRetryAt = null;
  }
  return clip;
}

function reconcileCampaignFulfillmentAfterCreditChange(data, campaignId, now = Date.now()) {
  const campaign = CAMPAIGNS[campaignId];
  if (!campaign || !isStraightCampaign(campaign)) return { changed: false, state: getCampaignOperationalState(data, campaign, new Date(now)) };
  const accounting = getStraightCampaignAccounting(data, campaignId);
  data.campaignStatus ||= {};
  const previous = data.campaignStatus[campaignId] || {};
  if (accounting?.capReached) {
    return { changed: finalizeStraightCampaignIfFulfilled(data, campaignId, now), accounting, state: getCampaignOperationalState(data, campaign, new Date(now)) };
  }
  if (previous.status === 'finished_budget' && previous.finishReason === 'campaign_budget_fulfilled') {
    data.campaignStatus[campaignId] = {
      ...previous,
      status: 'active',
      finishReason: null,
      finishedAt: null,
      reopenedAt: Number(now),
      reopenReason: 'rejected_credit_released',
      archived: false
    };
    return { changed: true, accounting, state: getCampaignOperationalState(data, campaign, new Date(now)) };
  }
  return { changed: false, accounting, state: getCampaignOperationalState(data, campaign, new Date(now)) };
}

function getRejectedCreditAudit(data, campaignId, now = new Date()) {
  const campaign = CAMPAIGNS[campaignId];
  if (!campaign) return null;
  const records = getUniqueClipRecords([
    ...Object.values(data?.clips || {}),
    ...Object.values(data?.clipReviews || {})
  ], { scope: 'rejected_credit_audit', campaignId }).filter(clip =>
    String(clip.campaignId) === String(campaignId) && isPostApprovalRejectedClip(clip)
  );
  const weekKey = campaign.separateEarningLifecycle ? getCampaignBudgetCycleKey(campaign, now) : null;
  const inCurrentScope = clip => isStraightCampaign(campaign) || (campaign.separateEarningLifecycle
    ? clip.budgetTracking?.budgetCycleKey === weekKey
    : isClipInCurrentBudgetCycle(clip, campaign, now));
  const items = records.map(clip => {
    const historicalCampaignCreditedViews = getClipCreditedViews(clip);
    const paidCreditedViews = getClipPaidCreditedViews(clip, historicalCampaignCreditedViews);
    const unpaidCreditedViews = Math.max(historicalCampaignCreditedViews - paidCreditedViews, 0);
    const historicalScopeViews = !inCurrentScope(clip) ? 0 : campaign.separateEarningLifecycle
      ? Math.max(Number(clip.budgetTracking?.creditedViewsThisCycle) || 0, 0)
      : historicalCampaignCreditedViews;
    const activeScopeViews = !inCurrentScope(clip) ? 0 : campaign.separateEarningLifecycle
      ? getClipActiveWeekCreditedViews(clip, weekKey)
      : getClipActiveCreditedViews(clip);
    const reversibleCreditedViews = Math.max(historicalScopeViews - activeScopeViews, 0);
    return {
      clipId: clip.id,
      userId: clip.userId,
      campaignId,
      platform: clip.platform,
      publicViews: Math.max(Number(clip.publicViews) || 0, Number(clip.currentViews) || 0),
      historicalCampaignCreditedViews,
      paidCreditedViews,
      unpaidCreditedViews,
      reversibleCreditedViews,
      reversibleEarnings: reversibleCreditedViews / 1_000_000 * (Number(campaign.ratePerMillion) || 0),
      currentScope: inCurrentScope(clip),
      reversalRecorded: clip.creditReversal?.active === true,
      trackingStatus: clip.trackingStatus || null,
      nextCheckAt: clip.nextCheckAt ?? null
    };
  });
  let incorrectCurrentCampaignActiveCredit = 0;
  let correctedCampaignActiveCredit = 0;
  let capacity = getCampaignViewCap(campaign) || 0;
  let correctedFulfilledPercent = 0;
  let correctedCapReached = false;
  if (isStraightCampaign(campaign)) {
    const allocation = getStraightCampaignAllocation(data, campaignId);
    capacity = allocation?.totalViewCap || capacity;
    const all = getUniqueClipRecords([...Object.values(data?.clips || {}), ...Object.values(data?.clipReviews || {})])
      .filter(clip => String(clip.campaignId) === String(campaignId));
    incorrectCurrentCampaignActiveCredit = all.reduce((sum, clip) => sum + getClipCreditedViews(clip), 0);
    correctedCampaignActiveCredit = all.reduce((sum, clip) => sum + getClipActiveCreditedViews(clip), 0);
    const straightAccounting = getStraightCampaignAccounting(data, campaignId);
    correctedFulfilledPercent = straightAccounting?.fulfilledPercent || 0;
    correctedCapReached = straightAccounting?.capReached === true;
  } else if (campaign.separateEarningLifecycle) {
    const all = getUniqueClipRecords([...Object.values(data?.clips || {}), ...Object.values(data?.clipReviews || {})])
      .filter(clip => String(clip.campaignId) === String(campaignId) && clip.budgetTracking?.budgetCycleKey === weekKey);
    incorrectCurrentCampaignActiveCredit = all.reduce((sum, clip) => sum + Math.max(Number(clip.budgetTracking?.creditedViewsThisCycle) || 0, 0), 0);
    correctedCampaignActiveCredit = getCampaignCurrentWeekAccounting(data, campaignId, now)?.creditedViews || 0;
  } else {
    const all = getCurrentBudgetCycleEligibleClips(campaignId, { data, date: now });
    incorrectCurrentCampaignActiveCredit = all.reduce((sum, clip) => sum + getClipCreditedViews(clip), 0);
    correctedCampaignActiveCredit = all.reduce((sum, clip) => sum + getClipActiveCreditedViews(clip), 0);
  }
  const incorrectRejectedCredit = items.reduce((sum, item) => sum + item.reversibleCreditedViews, 0);
  if (!isStraightCampaign(campaign)) {
    correctedFulfilledPercent = capacity > 0 ? Math.min(correctedCampaignActiveCredit / capacity * 100, 100) : 0;
    correctedCapReached = capacity > 0 && correctedCampaignActiveCredit >= capacity;
  }
  return {
    campaignId,
    campaignName: campaign.name,
    weekKey,
    items,
    rejectedPostApprovalClips: items.length,
    incorrectRejectedCredit,
    historicalRejectedCredit: items.reduce((sum, item) => sum + item.historicalCampaignCreditedViews, 0),
    paidRejectedCredit: items.reduce((sum, item) => sum + item.paidCreditedViews, 0),
    unpaidRejectedCredit: items.reduce((sum, item) => sum + item.unpaidCreditedViews, 0),
    incorrectCurrentCampaignActiveCredit,
    correctedCampaignActiveCredit,
    capacity,
    currentFulfilledPercent: capacity > 0 ? Math.min(incorrectCurrentCampaignActiveCredit / capacity * 100, 100) : 0,
    correctedFulfilledPercent,
    shouldReopen: !correctedCapReached && getCampaignOperationalState(data, campaign, now).state === 'finished' &&
      data?.campaignStatus?.[campaignId]?.status === 'finished_budget'
  };
}

function reconcileRejectedCredits(data, campaignId, options = {}) {
  const campaign = CAMPAIGNS[campaignId];
  if (!campaign) return null;
  const now = Number(options.now ?? Date.now());
  const before = getRejectedCreditAudit(data, campaignId, new Date(now));
  let changedClips = 0;
  const affectedUsers = new Set();
  const affectedPayoutCycles = new Map();
  for (const collection of [data.clips || {}, data.clipReviews || {}]) {
    for (const clip of Object.values(collection)) {
      if (String(clip?.campaignId) !== String(campaignId) || !isPostApprovalRejectedClip(clip)) continue;
      const result = applyPostApprovalCreditReversal(clip, { now, appliedBy: options.appliedBy || null, reason: 'post_approval_rejection_reconciliation' });
      if (result.changed) changedClips++;
      if (clip.userId) {
        affectedUsers.add(String(clip.userId));
        const cycle = getCampaignPayoutCycle(campaign, { clip });
        if (cycle) affectedPayoutCycles.set(`${clip.userId}|${cycle.earningRunKey}`, {
          userId: String(clip.userId),
          earningRunKey: cycle.earningRunKey
        });
      }
    }
  }
  const campaignState = reconcileCampaignFulfillmentAfterCreditChange(data, campaignId, now);
  const after = getRejectedCreditAudit(data, campaignId, new Date(now));
  return {
    changed: changedClips > 0 || campaignState.changed,
    changedClips,
    affectedUsers: [...affectedUsers],
    affectedPayoutCycles: [...affectedPayoutCycles.values()],
    before,
    after,
    campaignState
  };
}

function getUniqueClipRecords(clips, diagnosticContext = {}) {
  const unique = new Map();
  for (const clip of clips || []) {
    if (!clip) continue;
    const key = getClipIdentityKey(clip);
    if (!key) continue;
    const existing = unique.get(key);
    if (!existing) { unique.set(key, { ...clip, payout: { ...(clip.payout || {}) }, _accountingIdentityKey: key }); continue; }
    const existingViews = getClipCreditedViews(existing);
    const incomingViews = getClipCreditedViews(clip);
    const selected = incomingViews > existingViews ? clip : existing;
    const suppressed = selected === clip ? existing : clip;
    const conflicts = ['userId', 'campaignId', 'cycle', 'status'].some(field => String(existing[field] ?? '') !== String(clip[field] ?? '')) || Boolean(existing.payout?.history?.length) !== Boolean(clip.payout?.history?.length) || isPayoutEligibleClip(existing) !== isPayoutEligibleClip(clip);
    const merged = { ...selected, payout: { ...(selected.payout || {}) }, _accountingIdentityKey: key };
    merged.views = Math.max(existingViews, incomingViews);
    merged.currentViews = Math.max(existingViews, incomingViews);
    merged.payout.paidViews = Math.max(getFiniteNonNegativeNumber(existing.payout?.paidViews), getFiniteNonNegativeNumber(clip.payout?.paidViews));
    merged.payout.paidMoney = Math.max(getFiniteNonNegativeNumber(existing.payout?.paidMoney), getFiniteNonNegativeNumber(clip.payout?.paidMoney));
    if ((!merged.payout.history || !merged.payout.history.length) && (existing.payout?.history?.length || clip.payout?.history?.length)) merged.payout.history = existing.payout?.history?.length ? existing.payout.history : clip.payout.history;
    unique.set(key, merged);
    if (process.env.DEBUG_CLIP_ACCOUNTING === 'true') console.warn('[Clip Accounting duplicate]', { scope: diagnosticContext.scope, campaignId: diagnosticContext.campaignId, identity: key, selectedId: selected.id, suppressedId: suppressed.id, conflicts });
  }
  return [...unique.values()];
}

function calculateClipCollectionAccounting(clips, campaign, diagnosticContext = {}) {
  let paidViews = 0, unpaidViews = 0, paidMoney = 0, unpaidMoney = 0, accountedVideos = 0;
  const userIds = new Set();
  const uniqueClips = getUniqueClipRecords(clips, diagnosticContext);
  for (const clip of uniqueClips) {
    const accounting = getClipAccounting(clip, campaign);
    const counted = accounting.eligible || accounting.paidViews > 0 || accounting.paidMoney > 0;
    if (process.env.DEBUG_CLIP_ACCOUNTING === 'true') console.log('[Clip Accounting]', { scope: diagnosticContext.scope, campaignId: diagnosticContext.campaignId, requestedUserId: diagnosticContext.userId, id: clip.id, identity: clip._accountingIdentityKey || getClipIdentityKey(clip), userId: clip.userId, platform: clip.platform, videoId: clip.videoId, cycle: clip.cycle, status: clip.status, eligible: accounting.eligible, totalViews: accounting.totalViews, rawPaidViews: accounting.rawPaidViews, paidViews: accounting.paidViews, unpaidViews: accounting.unpaidViews, counted, exclusionReason: counted ? null : 'not_eligible_and_no_historical_payment' });
    if (!counted) continue;
    paidViews += accounting.paidViews;
    unpaidViews += accounting.unpaidViews;
    paidMoney += accounting.paidMoney;
    unpaidMoney += accounting.unpaidMoney;
    accountedVideos++;
    if (clip.userId) userIds.add(String(clip.userId));
  }
  const result = { users: userIds.size, videos: accountedVideos, paidViews, unpaidViews, totalViews: paidViews + unpaidViews, paidMoney, unpaidMoney, totalMoney: paidMoney + unpaidMoney };
  if (process.env.DEBUG_CLIP_ACCOUNTING === 'true') console.log('[Clip Accounting summary]', { scope: diagnosticContext.scope, campaignId: diagnosticContext.campaignId, userId: diagnosticContext.userId, inputRecords: (clips || []).length, uniqueVideoGroups: uniqueClips.length, duplicatesSuppressed: (clips || []).length - uniqueClips.length, ...result });
  return result;
}

function getClipCurrentRunLedgerViews(clip, campaign) {
  if (String(clip?.budgetTracking?.runLedgerCompleteFor || '') !== String(getCampaignEarningRunKey(campaign))) {
    return null;
  }
  const earningStart = getCampaignEarningStart(campaign);
  const earningEnd = getCampaignEarningEnd(campaign);
  const creditsByWeek = new Map();
  for (const entry of clip?.budgetTracking?.history || []) {
    const weekTimestamp = Date.parse(entry?.weekKey || '');
    if (!Number.isFinite(weekTimestamp) || weekTimestamp < earningStart || weekTimestamp >= earningEnd) continue;
    creditsByWeek.set(entry.weekKey, Math.max(Number(entry.creditedViews) || 0, 0));
  }
  const currentWeekKey = clip?.budgetTracking?.budgetCycleKey;
  const currentWeekTimestamp = Date.parse(currentWeekKey || '');
  if (Number.isFinite(currentWeekTimestamp) && currentWeekTimestamp >= earningStart && currentWeekTimestamp < earningEnd) {
    creditsByWeek.set(currentWeekKey, Math.max(Number(clip.budgetTracking.creditedViewsThisCycle) || 0, 0));
  }
  return [...creditsByWeek.values()].reduce((sum, views) => sum + views, 0);
}

function getCurrentRunAccountingClips(data, campaignId, userId = null) {
  const campaign = CAMPAIGNS[campaignId];
  if (!campaign) return [];
  return Object.values(data?.clips || {}).filter(clip =>
    String(clip.campaignId) === String(campaignId) &&
    (userId === null || String(clip.userId) === String(userId)) &&
    (campaign.separateEarningLifecycle
      ? isClipInCampaignEarningRun(clip, campaign)
      : isClipInCurrentBudgetCycle(clip, campaign))
  ).map(clip => {
    if (!campaign.separateEarningLifecycle) return clip;
    const ledgerViews = getClipCurrentRunLedgerViews(clip, campaign);
    if (ledgerViews === null) return clip;
    const rawPaidViews = Math.max(Number(clip.payout?.paidViews) || 0, 0);
    const paidViews = Math.min(rawPaidViews, ledgerViews);
    const rawPaidMoney = Math.max(Number(clip.payout?.paidMoney) || 0, 0);
    const paidMoney = rawPaidViews > 0 && paidViews < rawPaidViews
      ? rawPaidMoney * (paidViews / rawPaidViews)
      : rawPaidMoney;
    return {
      ...clip,
      campaignCreditedViews: ledgerViews,
      views: ledgerViews,
      payout: { ...(clip.payout || {}), paidViews, paidMoney }
    };
  });
}

function getCampaignCurrentRunAccounting(data, campaignId) {
  const campaign = CAMPAIGNS[campaignId];
  if (!campaign) return null;
  const clips = getCurrentRunAccountingClips(data, campaignId);
  return {
    earningRunKey: campaign.separateEarningLifecycle ? getCampaignEarningRunKey(campaign) : null,
    ...calculateClipCollectionAccounting(clips, campaign, { scope: 'current_run', campaignId })
  };
}

function getUserCurrentRunAccounting(data, campaignId, userId) {
  const campaign = CAMPAIGNS[campaignId];
  if (!campaign) return null;
  const clips = getCurrentRunAccountingClips(data, campaignId, userId);
  return {
    earningRunKey: campaign.separateEarningLifecycle ? getCampaignEarningRunKey(campaign) : null,
    ...calculateClipCollectionAccounting(clips, campaign, { scope: 'user_current_run', campaignId, userId })
  };
}

function getUserAllTimeCreditedViews(data, userId) {
  return Object.values(CAMPAIGNS).reduce((total, campaign) => {
    const clips = Object.values(data.clips || {}).filter(clip =>
      String(clip.userId) === String(userId) && String(clip.campaignId) === String(campaign.id)
    );
    const accounting = calculateClipCollectionAccounting(clips, campaign, { scope: 'leaderboard', campaignId: campaign.id, userId });
    return total + (Number(accounting.totalViews) || 0);
  }, 0);
}

function getServerAllTimeCreditedViews(data) {
  return Object.values(CAMPAIGNS).reduce((total, campaign) => {
    const clips = Object.values(data.clips || {}).filter(clip => String(clip.campaignId) === String(campaign.id));
    const accounting = calculateClipCollectionAccounting(clips, campaign, { scope: 'server_stats', campaignId: campaign.id });
    return total + (Number(accounting.totalViews) || 0);
  }, 0);
}

function getClipStatsCycle(clip, campaign) {
  const storedCycleValue = clip?.cycle;
  if (storedCycleValue !== null && storedCycleValue !== undefined && storedCycleValue !== '') {
    const storedCycle = Number(storedCycleValue);
    if (Number.isFinite(storedCycle)) return storedCycle;
  }

  const fallbackDate = clip?.approvedAt || clip?.submittedAt || clip?.createdAt || Date.now();
  return getCampaignCycle(campaign, fallbackDate);
}

function isClipInCurrentCampaignCycle(clip, campaign) {
  return Number(getClipStatsCycle(clip, campaign)) === Number(getCampaignCycle(campaign));
}

function buildCampaignStatsEmbed(data, userRecord, campaignId, campaignName, userId) {
  const campaign = CAMPAIGNS[campaignId];

  if (!campaign) {
    return new EmbedBuilder()
      .setColor(0xff0000)
      .setDescription('❌ Campaign not found. Please rejoin the campaign or contact staff.');
  }

  const currentCycle = getCampaignBudgetCycleIndex(campaign);
  const payoutThreshold = getCampaignPayoutThresholdViews(campaign);

  const targetUserId =
    userId ||
    userRecord?.discordId ||
    userRecord?.userId ||
    userRecord?.id;

  if (!targetUserId) {
    return new EmbedBuilder()
      .setColor(0xff0000)
      .setDescription('❌ Could not resolve user identity context.');
  }

  const inStatsScope = clip => isStraightCampaign(campaign)
    ? true
    : campaign.separateEarningLifecycle
      ? isClipInCampaignEarningRun(clip, campaign)
      : isClipInCurrentBudgetCycle(clip, campaign);
  const matchesUserCampaign = clip =>
    String(clip.userId) === String(targetUserId) &&
    String(clip.campaignId) === String(campaignId);
  const currentRunClipRecords = Object.values(data.clips || {})
    .filter(clip => matchesUserCampaign(clip) && inStatsScope(clip));
  const currentReviewClips = Object.values(data.clipReviews || {})
    .filter(clip => matchesUserCampaign(clip) && inStatsScope(clip));
  const currentRunStatusRecords = getUniqueClipRecords([
    ...currentReviewClips,
    ...currentRunClipRecords
  ], { scope: 'my_stats_status_counts', campaignId, userId: targetUserId });
  // Status counts reflect the full review lifecycle. Financial accounting below
  // intentionally remains limited to payout-eligible approved clip records.
  const approvedClips = currentRunStatusRecords.filter(clip => clip.status === 'approved');
  const pendingClips = currentRunStatusRecords.filter(clip => clip.status === 'pending');
  const rejectedClips = currentRunStatusRecords.filter(clip => clip.status === 'rejected');
  const userCampaignClips = currentRunClipRecords;
  const accounting = campaign.separateEarningLifecycle
    ? getUserCurrentRunAccounting(data, campaignId, targetUserId)
    : calculateClipCollectionAccounting(userCampaignClips, campaign, { scope: 'my_stats', campaignId, userId: targetUserId });
  const { totalViews, paidViews, unpaidViews, totalMoney, paidMoney, unpaidMoney } = accounting;
  if (process.env.DEBUG_MY_STATS === 'true') {
    const records = [
      ...Object.values(data.clips || {}).map(clip => ({ clip, collection: 'clips' })),
      ...Object.values(data.clipReviews || {}).map(clip => ({ clip, collection: 'clipReviews' }))
    ].filter(({ clip }) => matchesUserCampaign(clip));
    console.log('[My Stats Diagnostic]', {
      userId: targetUserId,
      campaignId,
      campaignStart: campaign.startDate,
      campaignEnd: campaign.endDate,
      currentEarningRunKey: campaign.separateEarningLifecycle ? getCampaignEarningRunKey(campaign) : null,
      approvedRecordsFound: approvedClips.length,
      reviewRecordsFound: currentReviewClips.length
    });
    for (const { clip, collection } of records) {
      const belongsToCurrentRun = inStatsScope(clip);
      const submittedAt = getClipSubmissionTimestamp(clip);
      const exclusionReason = belongsToCurrentRun ? null :
        !Number.isFinite(submittedAt) ? 'missing_submission_timestamp' :
        campaign.separateEarningLifecycle && submittedAt < getCampaignEarningStart(campaign) ? 'before_campaign_earning_start' :
        campaign.separateEarningLifecycle && submittedAt >= getCampaignEarningEnd(campaign) ? 'after_campaign_earning_end' :
        campaign.separateEarningLifecycle && clip.earningRunKey ? 'earning_run_key_mismatch' : 'outside_current_budget_cycle';
      console.log('[My Stats Record]', {
        clipId: clip.id,
        collection,
        status: clip.status,
        submittedAt: clip.submittedAt,
        submittedTimestamp: clip.submittedTimestamp,
        earningRunKey: clip.earningRunKey,
        trackingStatus: clip.trackingStatus,
        belongsToCurrentRun,
        exclusionReason
      });
    }
  }
  if (process.env.DEBUG_CLIP_ACCOUNTING === 'true') {
    const campaignAudit = getCampaignTotals(data, campaignId);
    const difference = campaignAudit.views - totalViews;
    const onlyCreator = campaignAudit.users <= 1;
    console.log('[Clip Accounting cross-scope]', { campaignId, userId: targetUserId, myStatsViews: totalViews, campaignStatusViews: campaignAudit.views, difference, onlyCreator });
    if (totalViews > campaignAudit.views) console.warn('[Clip Accounting cross-scope anomaly]', { campaignId, userId: targetUserId, myStatsViews: totalViews, campaignStatusViews: campaignAudit.views });
  }

  const weeklyUserAccounting = campaign.separateEarningLifecycle
    ? getUserCurrentWeekAccounting(data, campaignId, targetUserId)
    : null;
  const weeklyUserViews = weeklyUserAccounting?.creditedViews ?? null;
  if (
    campaign.separateEarningLifecycle &&
    weeklyUserAccounting?.periodStart?.getTime() === getCampaignEarningStart(campaign) &&
    totalViews !== weeklyUserViews
  ) {
    console.warn('[Weekly Accounting User Mismatch]', {
      campaignId,
      userId: targetUserId,
      currentRunCreditedViews: totalViews,
      currentWeekCreditedViews: weeklyUserViews,
      reason: 'First-week persisted current-run credits differ from the current-week ledger; run !auditweekly for per-clip late-baseline diagnostics.'
    });
  }

  const currentPayoutCycle = getCampaignPayoutCycle(campaign);
  const payoutTracker = currentPayoutCycle
    ? data.payoutTrackers?.[getPayoutTrackerId(
        campaignId,
        targetUserId,
        currentPayoutCycle.earningRunKey,
        currentPayoutCycle.cycleStartAt,
        currentPayoutCycle.cycleEndAt
      )]
    : null;
  if (payoutTracker) calculateTrackerStats(payoutTracker, { data });
  const previousBalanceViews = Math.max((Number(payoutTracker?.carryInViews) || 0) - (Number(payoutTracker?.carryInPaidViews) || 0), 0);
  const previousBalanceAmount = Math.max((Number(payoutTracker?.carryInAmount) || 0) - (Number(payoutTracker?.carryInPaidAmount) || 0), 0);
  const totalUnpaidViews = unpaidViews + previousBalanceViews;
  const totalUnpaidMoney = unpaidMoney + previousBalanceAmount;
  const viewsNeeded = Math.max(payoutThreshold - totalUnpaidViews, 0);
  const payoutEligible = payoutThreshold > 0 && totalUnpaidViews >= payoutThreshold;
  const payoutStatus = payoutTracker?.status === 'issue' ? '⚠️ Payment on hold' :
    payoutTracker?.status === 'ready' ? '✅ Ready for payout' :
    payoutTracker?.status === 'pending' ? '⏳ Payment pending' :
    isNonMonsterlabCampaign(campaign) ? '✅ Ready for payout' : '✅ Eligible for payout';
  const payoutSection = payoutEligible
    ? `<a:Cash1:1504871843419521115> **Payout Status**\n${payoutStatus}\n\n`
    : `<a:Cash1:1504871843419521115> **Payout Target: ${formatPayoutThresholdViews(payoutThreshold)} Views**\nNeed **${formatPayoutThresholdViews(viewsNeeded)}** more unpaid views\n\n`;
  const carrySection = previousBalanceViews > 0
    ? `<a:Cash1:1504871843419521115> **Previous Balance**\n${formatNumber(previousBalanceViews)} views • $${previousBalanceAmount.toFixed(4)}\n\n` +
      `<a:chart1:1504773558415523931> **Current Cycle Earned**\n${formatNumber(totalViews)} views • $${totalMoney.toFixed(2)}\n\n` +
      `<a:flyin:1506234392920723546> **Total Unpaid**\n${formatNumber(totalUnpaidViews)} views • $${totalUnpaidMoney.toFixed(4)}\n\n`
    : '';

  return new EmbedBuilder()
    .setColor(0x7ED957)
    .setDescription(
      `<a:chart1:1504773558415523931> **Campaign Stats - ${campaignName}**\n\n` +

      `<a:rocket1:1504872045849346140> **${isStraightCampaign(campaign) ? 'Campaign Earned Views' : campaign.separateEarningLifecycle ? 'Monthly Earned Views' : 'Total Views'}**\n${formatNumber(totalViews)}\n\n` +
      (weeklyUserViews === null ? '' : `<a:chart1:1504773558415523931> **Current Week Views**\n${formatNumber(weeklyUserViews)}\n\n`) +
      `<a:good1:1504871589332914176> **Paid Views**\n${formatNumber(paidViews)}\n\n` +
      `<a:flyin:1506234392920723546> **Unpaid Views**\n${formatNumber(unpaidViews)}\n\n` +

      `<a:Cash1:1504871843419521115> **Total Earnings**\n$${totalMoney.toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      })}\n\n` +

      `<a:good1:1504871589332914176> **Paid Earnings**\n$${paidMoney.toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      })}\n\n` +

      `<a:flyin:1506234392920723546> **Unpaid Earnings**\n$${unpaidMoney.toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      })}\n\n` +

      carrySection +

      payoutSection +

      `<a:appr:1534931253952909453> **Approved Videos**\n${approvedClips.length}\n\n` +
      `<a:dot1:1508433228669780029> **Pending Videos**\n${pendingClips.length}\n\n` +
      `<a:cancel:1506235594303606794> **Rejected Videos**\n${rejectedClips.length}\n\n` +

      `🎞️ **View Your Clips**\nClick the button below to check the clips submitted for this campaign.`
    )
    .setFooter({ text: `Last update | ${new Date().toLocaleString()}` });
}

function buildApprovedClipUserEmbed(clip) {
  const currentViews = getSafeTrackedViews(clip, null);
  const creditedViews = getClipCreditedViews(clip);
  const currentMoney =
    clip.moneyMade != null
      ? Number(clip.moneyMade) || 0
      : ((creditedViews / 1000000) * ((CAMPAIGNS[clip.campaignId]?.ratePerMillion) || 0));

  const titleText =
    clip.title ||
    clip.videoTitle ||
    clip.caption ||
    "View Approved Clip";

  const embed = new EmbedBuilder()
    .setColor(0x57F287)
    .setAuthor({
      name: clip.campaignName || "Creators Elite"
    })
    .setTitle("Your video has been approved <a:appr:1534931253952909453>")
    .setDescription(`[${titleText}](${clip.videoUrl || clip.url})`)
    .addFields(
      {
        name: "<a:chart1:1504773558415523931> Current Views",
        value: `${formatNumber(currentViews)}`,
        inline: false
      },
      {
        name: "<a:Cash1:1504871843419521115> Current Earnings",
        value: `$${currentMoney.toFixed(2)}`,
        inline: false
      },
      {
        name: "🌐 Platform",
        value: `${formatPlatform(clip.platform)}`,
        inline: false
      }
    )
    .setFooter({
      text: "Creators Elite • Thank you for clipping ❤️",
      iconURL: "https://cdn.discordapp.com/emojis/1504904179905200148.png"
    })
    .setTimestamp();

  if (clip.thumbnailUrl) {
    embed.setThumbnail(clip.thumbnailUrl);
  }

  return embed;
}

const CLIP_APPEAL_WINDOW_MS = 12 * 60 * 60 * 1000;

function ensureClipAppealDeadline(clip, now = Date.now()) {
  const existingRejectedAt = Number(clip?.rejectedAt);
  const createsNewRejectionEvent = !Number.isFinite(existingRejectedAt) || existingRejectedAt <= 0;
  if (createsNewRejectionEvent) {
    clip.rejectedAt = Number(now);
  }
  const existingDeadline = Number(clip?.appealDeadline);
  if (createsNewRejectionEvent || !Number.isFinite(existingDeadline) || existingDeadline <= 0) {
    clip.appealDeadline = Number(clip.rejectedAt) + CLIP_APPEAL_WINDOW_MS;
  }
  return { rejectedAt: Number(clip.rejectedAt), appealDeadline: Number(clip.appealDeadline) };
}

function clearClipAppealWindow(clip) {
  clip.rejectedAt = null;
  clip.appealDeadline = null;
}

function isClipAppealWindowOpen(clip, now = Date.now()) {
  const deadline = Number(clip?.appealDeadline) || 0;
  return deadline > 0 && Number(now) <= deadline;
}

function getClipAppealHelpLink(guildId, helpChannelId = GET_HELP_CHANNEL_ID) {
  const normalizedGuildId = String(guildId || '').trim();
  const normalizedChannelId = String(helpChannelId || '').trim();
  if (!normalizedGuildId || !normalizedChannelId) return null;
  return `https://discord.com/channels/${normalizedGuildId}/${normalizedChannelId}`;
}

function buildRejectedClipUserEmbed(clip, reason, options = {}) {
  const campaign = CAMPAIGNS[clip.campaignId];
  const title = String(clip.title || clip.videoTitle || clip.caption || 'View Clip')
    .replace(/\\/g, '\\\\').replace(/\[/g, '\\[').replace(/\]/g, '\\]');
  const clipUrl = clip.videoUrl || clip.url || null;
  const views = getSafeTrackedViews(clip, null);
  const deadline = Number(clip.appealDeadline);
  const deadlineUnix = Number.isFinite(deadline) && deadline > 0 ? Math.floor(deadline / 1000) : null;
  const helpAvailable = options.helpAvailable !== false;
  const appealText = helpAvailable
    ? 'If you believe this rejection was made by mistake, you have **12 hours** to appeal. Open a ticket in **Get Help** and include this clip when contacting staff.'
    : 'If you believe this rejection was made by mistake, you have **12 hours** to appeal. Please contact staff through the server\'s Get Help section.';
  const embed = new EmbedBuilder()
    .setColor(0xED4245)
    .setAuthor({ name: campaign?.name || clip.campaignName || 'Creators Elite' })
    .setTitle('Your video has been rejected <a:cancel:1506235594303606794>')
    .setDescription(clipUrl ? `[${title}](${clipUrl})` : title)
    .addFields(
      { name: '📌 Rejection Reason', value: reason || clip.rejectReason || 'Not provided', inline: false },
      { name: '📈 Current Views', value: formatNumber(views), inline: true },
      { name: '🌐 Platform', value: formatPlatform(clip.platform), inline: true },
      { name: '⚠️ Appeal This Decision', value: appealText, inline: false },
      {
        name: '⏳ Appeal Deadline',
        value: deadlineUnix ? `<t:${deadlineUnix}:F>\n(<t:${deadlineUnix}:R>)` : 'Please contact staff for the appeal deadline.',
        inline: false
      }
    )
    .setFooter({ text: 'Creators Elite • Clip Review', iconURL: 'https://cdn.discordapp.com/emojis/1504904179905200148.png' })
    .setTimestamp(Number(clip.rejectedAt) || Date.now());
  if (clip.thumbnailUrl) embed.setThumbnail(clip.thumbnailUrl);
  return embed;
}

function buildRejectedClipUserDm(clip, reason, guildId, helpChannelId = GET_HELP_CHANNEL_ID) {
  const helpLink = getClipAppealHelpLink(guildId, helpChannelId);
  const components = helpLink
    ? [new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setLabel('Appeal This Rejection')
          .setEmoji('🎫')
          .setStyle(ButtonStyle.Link)
          .setURL(helpLink)
      )]
    : [];
  return {
    helpConfigured: Boolean(helpLink),
    payload: {
      embeds: [buildRejectedClipUserEmbed(clip, reason, { helpAvailable: Boolean(helpLink) })],
      components
    }
  };
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


function getCampaignPeriod(campaign) {

    if (campaign.campaignMode === "monthly") {

        const cycle = getCampaignCycle(campaign);

        const periodStart =
            new Date(campaign.startDate);

        periodStart.setUTCMonth(
            periodStart.getUTCMonth() + cycle
        );

        const periodEnd =
            new Date(periodStart);

        periodEnd.setUTCMonth(
            periodEnd.getUTCMonth() + 1
        );

        return {
            periodStart,
            periodEnd
        };

    }

    // Existing code ↓↓↓

    const cycle = getCampaignCycle(campaign);

    const periodStart = new Date(campaign.startDate);

    periodStart.setUTCDate(
        periodStart.getUTCDate() +
        cycle * (campaign.cycleWeeks || 1) * 7
    );

    const periodEnd = new Date(periodStart);

    periodEnd.setUTCDate(
        periodEnd.getUTCDate() +
        (campaign.cycleWeeks || 1) * 7
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

function getCampaignTotals(data, campaignId, now = new Date()) {
  const campaign = CAMPAIGNS[campaignId];

  if (!campaign) {
      return {
          users: 0,
          videos: 0,
          views: 0,
          payableViews: 0,
          payout: 0
      };
  }

  if (isStraightCampaign(campaign)) {
    const campaignClips = Object.values(data.clips || {}).filter(clip => String(clip.campaignId) === String(campaignId));
    const collectionAccounting = calculateClipCollectionAccounting(campaignClips, campaign, { scope: 'campaign_status', campaignId });
    const straightAccounting = getStraightCampaignAccounting(data, campaignId);
    const creditedViews = straightAccounting?.creditedViews || 0;
    const paidViews = Math.min(collectionAccounting.paidViews, creditedViews);
    const unpaidViews = Math.max(creditedViews - paidViews, 0);
    return {
      users: collectionAccounting.users,
      videos: collectionAccounting.videos,
      views: creditedViews,
      paidViews,
      unpaidViews,
      paidMoney: collectionAccounting.paidMoney,
      unpaidMoney: unpaidViews / 1_000_000 * (Number(campaign.ratePerMillion) || 0),
      payout: straightAccounting?.creditedMoney || 0,
      straightAccounting
    };
  }

  const campaignClips = Object.values(data.clips || {}).filter(clip =>
    String(clip.campaignId) === String(campaignId) &&
    (campaign.separateEarningLifecycle
      ? isClipInCampaignEarningPeriod(clip, campaign)
      : isClipInCurrentBudgetCycle(clip, campaign))
  );
  const accounting = calculateClipCollectionAccounting(campaignClips, campaign, { scope: 'campaign_status', campaignId });
  if (campaign.separateEarningLifecycle) {
    const currentRunAccounting = getCampaignCurrentRunAccounting(data, campaignId);
    const weeklyAccounting = getCampaignCurrentWeekAccounting(data, campaignId, now);
    return {
      users: currentRunAccounting.users,
      videos: currentRunAccounting.videos,
      views: weeklyAccounting.creditedViews,
      paidViews: currentRunAccounting.paidViews,
      unpaidViews: currentRunAccounting.unpaidViews,
      paidMoney: currentRunAccounting.paidMoney,
      unpaidMoney: currentRunAccounting.unpaidMoney,
      payout: weeklyAccounting.creditedMoney,
      weeklyAccounting,
      currentRunAccounting
    };
  }
  const viewCap = getCampaignViewCap(campaign);
  const creditedViews = viewCap === null ? accounting.totalViews : Math.min(accounting.totalViews, viewCap);
  const cappedPaidViews = Math.min(accounting.paidViews, creditedViews);
  const cappedUnpaidViews = Math.max(creditedViews - cappedPaidViews, 0);
  const cappedUnpaidMoney = cappedUnpaidViews / 1_000_000 * (Number(campaign.ratePerMillion) || 0);
  return {
    users: accounting.users,
    videos: accounting.videos,
    views: creditedViews,
    paidViews: cappedPaidViews,
    unpaidViews: cappedUnpaidViews,
    paidMoney: accounting.paidMoney,
    unpaidMoney: cappedUnpaidMoney,
    payout: accounting.paidMoney + cappedUnpaidMoney
  };
}

// Global tracking timestamp to block excessive name edits
let lastChannelUpdateTimestamp = 0;

async function updateServerStats(guild) {
    if (!guild) return;

    const data = loadData();
    const YEAR_GOAL = 100000; // Updated from your image configuration

    let totalPaid = 0;
    const totalViews = getServerAllTimeCreditedViews(data);
    for (const campaign of Object.values(CAMPAIGNS)) {
        const campaignClips = Object.values(data.clips || {}).filter(clip => String(clip.campaignId) === String(campaign.id));
        const accounting = calculateClipCollectionAccounting(campaignClips, campaign, { scope: 'server_stats', campaignId: campaign.id });
        totalPaid += accounting.paidMoney + accounting.unpaidMoney;
    }
    const activeCampaigns = Object.values(CAMPAIGNS).filter(c => getCampaignOperationalState(data, c).state === 'live').length;

    let availableMoney = 0;
    for (const campaign of Object.values(CAMPAIGNS)) {
        if (getCampaignOperationalState(data, campaign).state !== 'live') continue;
        if (isStraightCampaign(campaign)) {
            availableMoney += getStraightCampaignAccounting(data, campaign.id)?.remainingMoney || 0;
            continue;
        }
        const totals = getCampaignTotals(data, campaign.id);
        availableMoney += Math.max((campaign.campaignBudget || 0) - totals.payout, 0);
    }

    // Format metrics into clean visual target strings
    const goalText = `🎯・2026 Goal: $${YEAR_GOAL.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    const paidText = `🏦・Paid: $${totalPaid.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    const availText = `💰・Available: $${availableMoney.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    const viewsText = `📈・Views: ${formatNumber(totalViews)}`;
    const activeText = `🚀・Active Campaigns: ${activeCampaigns}`;

    // Target arrays mapping channels to their desired names safely
    const updates = [
        { id: process.env.GOAL_CHANNEL_ID || GOAL_CHANNEL_ID, name: goalText },
        { id: process.env.PAID_CHANNEL_ID || PAID_CHANNEL_ID, name: paidText },
        { id: process.env.AVAILABLE_CHANNEL_ID || AVAILABLE_CHANNEL_ID, name: availText },
        { id: process.env.VIEWS_CHANNEL_ID || VIEWS_CHANNEL_ID, name: viewsText },
        { id: process.env.ACTIVE_CAMPAIGNS_CHANNEL_ID || ACTIVE_CAMPAIGNS_CHANNEL_ID, name: activeText }
    ];

    // Fire the name updates sequentially with micro-delays to eliminate Discord API rate-limiting blocks
    for (let i = 0; i < updates.length; i++) {
        const target = updates[i];
        if (!target.id) continue;
        
        const channel = guild.channels.cache.get(target.id);
        if (channel && channel.name !== target.name) {
            // Introduce a 500ms separation delay per channel change execution loop
            await new Promise(resolve => setTimeout(resolve, 500));
            await channel.setName(target.name).catch(err => console.error(`⚠️ Channel update failed for ID ${target.id}:`, err.message));
        }
    }
    console.log("📈 Counter display sync completed successfully!");
}

function buildCampaignStatusEmbed(campaign, data, now = new Date()) {
  if (isStraightCampaign(campaign)) {
    const totals = getCampaignTotals(data, campaign.id, now);
    const accounting = getStraightCampaignAccounting(data, campaign.id);
    const operationalState = getCampaignOperationalState(data, campaign, now);
    const finished = operationalState.state === 'finished';
    const statusText = finished
      ? 'Finished — Campaign Budget Fulfilled'
      : operationalState.state === 'not_launched'
        ? (operationalState.reason === 'launch_not_configured' ? 'Not Live — Launch Not Configured' : 'Scheduled — Not Yet Launched')
        : 'Live';
    return new EmbedBuilder()
      .setColor(finished || operationalState.state === 'not_launched' ? 0xED4245 : 0x7ED957)
      .setTitle(campaign.name)
      .setDescription(
        `<a:redalert:1504777207648620595> **Campaign Status**\n` +
        `**Status:** ${statusText}\n\n` +
        `<a:rocket1:1504872045849346140> **Performance Metrics**\n` +
        `**Users:** ${totals.users}\n` +
        `**Videos:** ${totals.videos}\n` +
        `**Views:** ${formatNumber(accounting.creditedViews)} / ${formatNumber(accounting.viewCap)}\n\n` +
        `<a:Cash1:1504871843419521115> **Payout & Budget**\n` +
        `**Campaign Budget:** $${formatNumber(accounting.budget)}\n` +
        `**Fulfilled:** $${formatNumber(accounting.creditedMoney)} (${accounting.fulfilledPercent.toFixed(1)}%)\n` +
        `**Remaining:** $${formatNumber(accounting.remainingMoney)}\n\n` +
        `<:whiteCE:1504904179905200148> Powered by Creators Elite | ${new Date().toLocaleString()}`
      );
  }
  const { periodStart, periodEnd } = getCampaignBudgetPeriod(campaign, now);
  const earningPeriod = getCampaignEarningPeriod(campaign);
  const totals = getCampaignTotals(data, campaign.id, now);
  const viewCap = getCampaignViewCap(campaign);
  const fulfilled = viewCap !== null && totals.views >= viewCap;
  const statusText = campaign.separateEarningLifecycle
    ? (fulfilled ? 'Paused — Weekly View Cap Reached' : 'Live')
    : (fulfilled ? 'Fulfilled' : 'Active');
  const viewsLabel = campaign.separateEarningLifecycle ? 'Weekly Views' : 'Total Views';
  console.log(`[Campaign Accounting] ${campaign.id}`, { users: totals.users, videos: totals.videos, paidViews: totals.paidViews, unpaidViews: totals.unpaidViews, totalViews: totals.views, payout: totals.payout });
  if (campaign.separateEarningLifecycle) {
    const audit = getWeeklyAccountingAudit(data, campaign.id, now);
    if (audit.flags.length) {
      console.warn('[Weekly Accounting Audit]', {
        campaignId: campaign.id,
        flags: audit.flags,
        currentRunCreditedViews: audit.currentRunCreditedViews,
        campaignCurrentWeekCreditedViews: audit.campaignCurrentWeekCreditedViews,
        rawCampaignCurrentWeekCreditedViews: audit.rawCampaignCurrentWeekCreditedViews
      });
    }
  }

  const cappedPayout = campaign.separateEarningLifecycle
    ? Number(totals.weeklyAccounting?.creditedMoney) || 0
    : Math.min(Number(totals.payout) || 0, Number(campaign.campaignBudget) || 0);

  const remaining = Math.max(
    (Number(campaign.campaignBudget) || 0) - cappedPayout,
    0
  );

  const fulfilledPercent = Number(campaign.campaignBudget) > 0
    ? Math.min((cappedPayout / Number(campaign.campaignBudget)) * 100, 100)
    : 0;

  return new EmbedBuilder()
    .setColor(0x7ED957)
    .setTitle(campaign.name)
    .setDescription(
      `<a:redalert:1504777207648620595> **Campaign Status**\n` +
      `**Status:** ${statusText}\n\n` +

      (campaign.separateEarningLifecycle
        ? `📅 **Earning Period**\n${formatDateShort(earningPeriod.periodStart)} - ${formatDateShort(earningPeriod.periodEnd)}\n\n` +
          `📆 **Current Weekly Budget Period**\n${formatDateShort(periodStart)} - ${formatDateShort(periodEnd)}\n` +
          `**Next Weekly Reset:** ${formatDateShort(periodEnd)}, 07:00 UTC\n\n`
        : `📅 **Campaign Period**\n${formatDateShort(periodStart)} - ${formatDateShort(periodEnd)}\n\n`) +

      `<a:rocket1:1504872045849346140> **Performance Metrics**\n` +
      `**Users:** ${totals.users}\n` +
      `**Videos:** ${totals.videos}\n` +
      `**${viewsLabel}:** ${viewCap === null ? formatNumber(totals.views) : `${formatNumber(totals.views)} / ${formatNumber(viewCap)}`}\n` +
      `**${campaign.separateEarningLifecycle ? 'Current-Run Paid Views' : 'Paid Views'}:** ${formatNumber(totals.paidViews)}\n` +
      `**${campaign.separateEarningLifecycle ? 'Current-Run Unpaid Views' : 'Unpaid Views'}:** ${formatNumber(totals.unpaidViews)}\n\n` +

      `<a:Cash1:1504871843419521115> **Payout & Budget**\n` +
      `**${campaign.separateEarningLifecycle ? 'Weekly Budget' : 'Campaign Budget'}:** $${formatNumber(campaign.campaignBudget)}\n` +
      `**${campaign.separateEarningLifecycle ? 'Current-Run Paid' : 'Already Paid'}:** $${formatNumber(totals.paidMoney)}\n` +
      `**${campaign.separateEarningLifecycle ? 'Current-Run Unpaid' : 'Current Unpaid'}:** $${formatNumber(totals.unpaidMoney)}\n` +
      `**${campaign.separateEarningLifecycle ? 'Weekly Fulfilled' : 'Total Fulfilled'}:** $${formatNumber(cappedPayout)} (${fulfilledPercent.toFixed(1)}%)\n` +
      `**${campaign.separateEarningLifecycle ? 'Weekly Remaining' : 'Remaining'}:** $${formatNumber(remaining)}\n\n` +

      `<a:warning:1504774411280973864> Once we hit the **${formatNumber(campaign.viewCap)} view cap**, any views after that won't be paid, so post early to secure your payout.\n\n` +
      `<:whiteCE:1504904179905200148> Powered by Creators Elite | ${new Date().toLocaleString()}`
  );
}

function getWeeklyAccountingAudit(data, campaignId, now = new Date()) {
  const campaign = CAMPAIGNS[campaignId];
  if (!campaign) return null;
  const weekly = getCampaignCurrentWeekAccounting(data, campaignId, now);
  const currentRun = getCampaignCurrentRunAccounting(data, campaignId);
  const earningStart = getCampaignEarningStart(campaign);
  const earningEnd = getCampaignEarningEnd(campaign);
  const firstWeek = earningStart === weekly.periodStart.getTime();
  const currentRunClips = Object.values(data?.clips || {}).filter(clip =>
    String(clip.campaignId) === String(campaignId) && isClipInCampaignEarningRun(clip, campaign)
  );
  const currentRunReviews = Object.values(data?.clipReviews || {}).filter(clip =>
    String(clip.campaignId) === String(campaignId) && isClipInCampaignEarningRun(clip, campaign)
  );
  const allCurrentRunRecords = getUniqueClipRecords([...currentRunClips, ...currentRunReviews]);
  const userIds = new Set([
    ...allCurrentRunRecords.map(clip => String(clip.userId || '')).filter(Boolean),
    ...weekly.entries.map(entry => String(entry.clip.userId || '')).filter(Boolean)
  ]);
  const users = [...userIds].sort().map(userId => {
    const run = getUserCurrentRunAccounting(data, campaignId, userId);
    const week = getUserCurrentWeekAccounting(data, campaignId, userId, now);
    return {
      userId,
      currentRunCreditedViews: run.totalViews,
      currentWeekCreditedViews: week.creditedViews,
      currentRunPaidViews: run.paidViews,
      currentRunUnpaidViews: run.unpaidViews
    };
  });
  const sumUserCurrentWeekCreditedViews = users.reduce((sum, user) => sum + user.currentWeekCreditedViews, 0);
  const expectedWeeklyMoney = weekly.creditedViews / 1_000_000 * (Number(campaign.ratePerMillion) || 0);
  const flags = [];
  if (sumUserCurrentWeekCreditedViews !== weekly.creditedViews) flags.push('WEEKLY_SUM_MISMATCH');
  if (firstWeek && currentRun.totalViews !== weekly.creditedViews) flags.push('FIRST_WEEK_MONTHLY_WEEK_MISMATCH');
  if (Math.abs(expectedWeeklyMoney - weekly.creditedMoney) > 0.005) flags.push('WEEKLY_BUDGET_MISMATCH');
  if (weekly.rawCreditedViews > weekly.weeklyCap || (firstWeek && currentRun.totalViews > weekly.weeklyCap)) flags.push('CAP_OVERFLOW');
  if (Object.values(data?.clips || {}).some(clip =>
    String(clip.campaignId) === String(campaignId) &&
    !isClipInCampaignEarningRun(clip, campaign) &&
    String(clip.earningRunKey || '') === String(getCampaignEarningRunKey(campaign)) &&
    getClipCreditedViews(clip) > 0
  )) flags.push('OLD_RUN_INCLUDED');
  if (firstWeek && allCurrentRunRecords.some(clip =>
    String(clip.budgetTracking?.runLedgerCompleteFor || '') !== String(getCampaignEarningRunKey(campaign)) &&
    clip.budgetTracking?.budgetCycleKey === weekly.weekKey &&
    getClipCreditedViews(clip) > Math.max(Number(clip.budgetTracking?.creditedViewsThisCycle) || 0, 0) &&
    Math.max(Number(clip.budgetTracking?.baselinePublicViews) || 0, 0) > 0
  )) flags.push('LATE_BASELINE_RESET');
  if (allCurrentRunRecords.some(clip => !clip.budgetTracking?.budgetCycleKey)) flags.push('MISSING_WEEK_KEY');

  const clips = allCurrentRunRecords.map(clip => ({
    clipId: clip.id,
    userId: clip.userId,
    submittedAt: clip.submittedAt || clip.submittedTimestamp || null,
    earningRunKey: clip.earningRunKey || null,
    trackingStatus: clip.trackingStatus || null,
    publicViews: Math.max(Number(clip.publicViews) || 0, 0),
    approvalViews: clip.approvalViews ?? null,
    campaignCreditedViews: getClipCreditedViews(clip),
    weekKey: clip.budgetTracking?.budgetCycleKey || null,
    weeklyBaselineViews: clip.budgetTracking?.baselinePublicViews ?? null,
    currentWeekCreditedViews: clip.budgetTracking?.budgetCycleKey === weekly.weekKey
      ? Math.max(Number(clip.budgetTracking?.creditedViewsThisCycle) || 0, 0)
      : 0
  }));
  const legacyBackfill = data?.storageMigrations?.augustFirstWeekLegacyWeeklyBackfillV1 || null;
  if (legacyBackfill?.legitimateTotalBeforeCap > weekly.weeklyCap && !flags.includes('CAP_OVERFLOW')) {
    flags.push('CAP_OVERFLOW');
  }

  return {
    campaignId,
    earningRunKey: getCampaignEarningRunKey(campaign),
    earningStart: Number.isFinite(earningStart) ? new Date(earningStart).toISOString() : null,
    earningEnd: Number.isFinite(earningEnd) ? new Date(earningEnd).toISOString() : null,
    weekKey: weekly.weekKey,
    weekStart: weekly.periodStart.toISOString(),
    weekEnd: weekly.periodEnd.toISOString(),
    weeklyCap: weekly.weeklyCap,
    campaignCurrentWeekCreditedViews: weekly.creditedViews,
    rawCampaignCurrentWeekCreditedViews: weekly.rawCreditedViews,
    sumUserCurrentWeekCreditedViews,
    currentRunCreditedViews: currentRun.totalViews,
    currentRunPaidViews: currentRun.paidViews,
    currentRunUnpaidViews: currentRun.unpaidViews,
    weeklyFulfilledMoney: weekly.creditedMoney,
    weeklyRemainingMoney: weekly.remainingBudget,
    flags,
    preUpgradeFirstWeekClips: legacyBackfill?.clips?.filter(clip => clip.inferredPreUpgrade) || [],
    preUpgradeFirstWeekTotals: legacyBackfill ? {
      clipCount: legacyBackfill.inferredPreUpgradeClipCount,
      creditedViews: legacyBackfill.preUpgradeCreditedViews,
      storedWeeklyViewsBefore: legacyBackfill.preUpgradeStoredWeeklyViews,
      missingWeeklyViews: legacyBackfill.preUpgradeMissingWeeklyViews
    } : null,
    postUpgradeFirstWeekTotals: legacyBackfill ? {
      clipCount: legacyBackfill.inferredPostUpgradeClipCount,
      creditedViews: legacyBackfill.postUpgradeCreditedViews,
      storedWeeklyViewsBefore: legacyBackfill.postUpgradeStoredWeeklyViews
    } : null,
    augustFirstWeekBackfill: legacyBackfill ? {
      status: legacyBackfill.status,
      week1StoredTotalBefore: legacyBackfill.week1StoredTotalBefore,
      legitimateTotalBeforeCap: legacyBackfill.legitimateTotalBeforeCap,
      displayedTotalAfterCap: legacyBackfill.displayedTotalAfterCap,
      screenshotCandidateUser: legacyBackfill.screenshotCandidateUser,
      allocationMethod: legacyBackfill.allocationMethod,
      allocationWarning: legacyBackfill.allocationWarning
    } : null,
    users,
    clips
  };
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

async function migratePayoutSystem() {

    const data = loadData();

    const guild = client.guilds.cache.first();

    if (!guild) {
        console.log("❌ Guild not found.");
        return;
    }

    // Create payout object on old clips
    for (const clip of Object.values(data.clips || {})) {

        if (!clip.payout) {

            clip.payout = {
                paidViews: 0,
                paidMoney: 0,
                lastPaidAt: null
            };

        }

    }

    saveData(data);

    let cardsCreated = 0;

    const cycleOwners = new Map();
    for (const clip of Object.values(data.clips || {})) {
        if (String(clip.status).toLowerCase() !== 'approved') continue;
        const campaign = CAMPAIGNS[clip.campaignId];
        const cycle = getCampaignPayoutCycle(campaign, { clip });
        if (!cycle) continue;
        cycleOwners.set(`${clip.campaignId}|${clip.userId}|${cycle.earningRunKey}`, {
            campaignId: clip.campaignId,
            userId: clip.userId,
            earningRunKey: cycle.earningRunKey
        });
    }
    for (const owner of cycleOwners.values()) {
        await syncPayoutCard(guild, owner.campaignId, owner.userId, { earningRunKey: owner.earningRunKey });
        cardsCreated++;
    }

    console.log(`✅ Payout migration complete.`);
    console.log(`💰 ${cardsCreated} payout cards created.`);

}

async function addMissingPayoutChannels() {

    const data = loadData();

    const guild = client.guilds.cache.first();

    if (!guild) return console.log("Guild not found.");

    for (const campaignId of Object.keys(data.campaignStaffChannels || {})) {

        const staff = data.campaignStaffChannels[campaignId];

        if (staff.payouts) {
            console.log(`${campaignId} already has a payout channel.`);
            continue;
        }

        const category = guild.channels.cache.get(staff.category);

        if (!category) {
            console.log(`Category missing for ${campaignId}`);
            continue;
        }

        const payoutChannel = await guild.channels.create({
            name: "💰┃payout-queue",
            type: ChannelType.GuildText,
            parent: category.id
        });

        staff.payouts = payoutChannel.id;

        console.log(`✅ Created payout channel for ${campaignId}`);
    }

    saveData(data);

    console.log("✅ Missing payout channels created.");
}

function getCampaignConnectAccountLink(guildId, campaign) {
  const channelId = campaign?.connectAccountChannelId;
  if (!guildId || !channelId) return null;
  return `https://discord.com/channels/${guildId}/${channelId}`;
}

function getCampaignRulesLink(guildId, campaign) {
  const channelId = campaign?.rulesChannelId;
  if (!guildId || !channelId) return null;
  return `https://discord.com/channels/${guildId}/${channelId}`;
}

function buildCampaignRulesRow(guildId, campaign) {
  const url = getCampaignRulesLink(guildId, campaign);
  if (!url) return null;
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setLabel('Campaign Rules')
      .setEmoji('📋')
      .setStyle(ButtonStyle.Link)
      .setURL(url)
  );
}

function buildPreLaunchSubmissionEmbed(campaign, platform, publishedAt, campaignLaunch) {
  return new EmbedBuilder()
    .setColor(0xED4245)
    .setTitle('Video Posted Before Campaign Launch ❌')
    .setDescription(
      `This video was published before the **${campaign.name}** started and is not eligible for this campaign.\n\n` +
      'Only videos posted after the campaign launch time can be submitted.'
    )
    .addFields(
      { name: '🌐 Platform', value: formatPlatform(platform), inline: true },
      { name: '📅 Video Published', value: `<t:${Math.floor(publishedAt / 1000)}:F>`, inline: false },
      { name: '🚀 Campaign Launched', value: `<t:${Math.floor(campaignLaunch / 1000)}:F>`, inline: false }
    )
    .setFooter({ text: 'Creators Elite • Campaign Submission' });
}

function buildCampaignConnectAccountRow(guildId, campaign, options = {}) {
  const url = getCampaignConnectAccountLink(guildId, campaign);
  if (!url) return null;
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setLabel(options.label || 'Connect Account')
      .setEmoji('🔗')
      .setStyle(ButtonStyle.Link)
      .setURL(url)
  );
}

function buildCampaignJoinSuccessEmbed(interaction, campaign, options = {}) {
  const displayName = interaction?.member?.displayName || interaction?.user?.globalName || interaction?.user?.username || 'Creator';
  const alreadyJoined = options.alreadyJoined === true;
  const connectAvailable = options.connectAvailable !== false;
  const accountReady = options.accountReady === true;
  const accountGuidance = accountReady
    ? 'Make sure you read the campaign rules before posting or submitting clips. 👇'
    : (connectAvailable ? 'Before submitting clips, connect at least one social media account using the button below. ⤵️' : 'Campaign joined successfully, but the account connection channel is currently unavailable. Please contact staff.');
  const description = alreadyJoined
    ? `You're already part of the **${campaign.name}**. Your campaign access and roles have been checked.\n\n` +
      (accountReady ? accountGuidance : (connectAvailable ? 'Before submitting clips, make sure at least one social account is connected and verified using the button below. ⤵️' : 'The account connection channel is currently unavailable. Please contact staff.'))
    : `You've successfully joined the **${campaign.name}**!\n\n${accountReady ? "You're now part of the campaign and ready to start clipping." : "You're now part of the campaign and have access to the campaign channels."}\n\n` +
      accountGuidance;
  return new EmbedBuilder()
    .setColor(0x57F287)
    .setAuthor({ name: 'Creators Elite', iconURL: interaction?.guild?.iconURL?.() || undefined })
    .setTitle(`Let's Get Clipping, ${displayName} ${accountReady ? '🔥' : '<a:fire1:1504871649491554487>'}`)
    .setDescription(description)
    .setFooter({ 
      text: 'Creators Elite',
      iconURL: 'https://cdn.discordapp.com/emojis/1504904179905200148.png'
    })
    .setTimestamp();
}

function getCampaignJoinBlockReason(campaign, data, now = new Date()) {
  if (!campaign) return 'Campaign not found.';
  const operationalState = getCampaignOperationalState(data, campaign, now);
  if (operationalState.state === 'not_launched') {
    return operationalState.reason === 'launch_not_configured'
      ? 'This campaign is not live yet. Its launch time has not been configured.'
      : 'This campaign has not launched yet.';
  }
  if (isStraightCampaign(campaign) && operationalState.state === 'finished') {
    return 'This campaign budget has been fulfilled and is no longer accepting members.';
  }
  const permanentlyFinished = data?.campaignStatus?.[campaign.id]?.status === 'finished' ||
    data?.campaigns?.[campaign.id]?.status === 'finished' ||
    campaign.status === 'finished';
  if (permanentlyFinished) return 'This campaign has permanently finished and is no longer accepting members.';
  if (campaign.separateEarningLifecycle && !isCampaignEarningActive(campaign, now)) {
    return 'This campaign earning period has ended and is no longer accepting members.';
  }
  // A weekly view-cap pause does not block campaign membership; it only pauses
  // new clip submissions/tracking under the existing cap rules.
  return null;
}

function getCampaignOperationalState(data, campaign, now = new Date()) {
  if (!campaign) return { state: 'finished', weeklyAccounting: null };
  const time = new Date(now).getTime();
  const earningEnd = getCampaignEarningEnd(campaign);
  const persistedStatus = data?.campaignStatus?.[campaign.id]?.status || data?.campaigns?.[campaign.id]?.status;
  const permanentlyFinished = persistedStatus === 'finished' ||
    data?.campaigns?.[campaign.id]?.status === 'finished' ||
    campaign.status === 'finished';
  if (isStraightCampaign(campaign)) {
    const straightAccounting = getStraightCampaignAccounting(data, campaign.id);
    const budgetFinished = persistedStatus === 'finished_budget' || straightAccounting?.capReached;
    if (permanentlyFinished || budgetFinished) {
      return { state: 'finished', weeklyAccounting: null, straightAccounting };
    }
    if (isNonMonsterlabCampaign(campaign)) {
      const launchTimestamp = getCampaignLaunchTimestamp(campaign);
      if (launchTimestamp === null) {
        return { state: 'not_launched', reason: 'launch_not_configured', weeklyAccounting: null, straightAccounting };
      }
      if (time < launchTimestamp) {
        return { state: 'not_launched', reason: 'launch_scheduled', launchTimestamp, weeklyAccounting: null, straightAccounting };
      }
    }
    return {
      state: 'live',
      weeklyAccounting: null,
      straightAccounting
    };
  }
  if (permanentlyFinished || (campaign.separateEarningLifecycle && Number.isFinite(earningEnd) && time >= earningEnd)) {
    return { state: 'finished', weeklyAccounting: null };
  }
  const weeklyAccounting = getCampaignCurrentWeekAccounting(data, campaign.id, now);
  if (weeklyAccounting?.capReached) return { state: 'weekly_paused', weeklyAccounting };
  return { state: 'live', weeklyAccounting };
}

function buildCampaignSubmitClipButton(campaign, data, now = new Date()) {
  const { state } = getCampaignOperationalState(data, campaign, now);
  const button = new ButtonBuilder().setCustomId(`submit_clip:${campaign.id}`);
  if (state === 'not_launched') {
    return button
      .setLabel('Campaign Not Started')
      .setEmoji('⏳')
      .setStyle(ButtonStyle.Danger)
      .setDisabled(true);
  }
  if (state === 'finished') {
    return button
      .setLabel('Campaign Finished')
      .setEmoji('🏁')
      .setStyle(ButtonStyle.Danger)
      .setDisabled(true);
  }
  if (state === 'weekly_paused') {
    return button
      .setLabel('Submissions Paused')
      .setEmoji('⛔')
      .setStyle(ButtonStyle.Danger)
      .setDisabled(true);
  }
  return button
    .setLabel('Submit Clip')
    .setEmoji('⬆️')
    .setStyle(ButtonStyle.Success)
    .setDisabled(false);
}

function getCampaignSubmissionBlockMessage(campaignState) {
  if (campaignState.state === 'not_launched') {
    return '❌ This campaign has not launched yet and is not accepting submissions.';
  }
  if (campaignState.state === 'finished') {
    return '❌ This campaign has finished and is no longer accepting submissions.';
  }
  if (campaignState.state === 'weekly_paused') {
    return '❌ Submissions are temporarily paused because this campaign has reached its weekly view cap. Submissions reopen after the next weekly reset.';
  }
  return null;
}

function buildCampaignSubmissionPanelComponents(campaign, data, now = new Date()) {
  const row1 = new ActionRowBuilder().addComponents(
    buildCampaignSubmitClipButton(campaign, data, now),
    new ButtonBuilder()
      .setCustomId(`campaign_stats:${campaign.id}`)
      .setLabel('👥My Stats')
      .setStyle(ButtonStyle.Secondary)
  );
  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`remove_clip:${campaign.id}`)
      .setLabel('🗑️Remove Clip')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`manage_account:${campaign.id}`)
      .setLabel('⚙️Manage Account')
      .setStyle(ButtonStyle.Secondary)
  );
  const row3 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`leave_campaign:${campaign.id}`)
      .setLabel('Leave Campaign')
      .setEmoji('1504774239679676416')
      .setStyle(ButtonStyle.Danger)
  );
  return [row1, row2, row3];
}

function applyCampaignMembership(userRecord, campaign, joinedAt = Date.now()) {
  userRecord.campaigns ||= [];
  const alreadyJoined = userRecord.campaigns.includes(campaign.id);
  if (!alreadyJoined) userRecord.campaigns.push(campaign.id);
  userRecord.campaignMemberships ||= {};
  userRecord.campaignMemberships[campaign.id] ||= {
    joinedAt,
    joinedRunKey: !isStraightCampaign(campaign) && typeof getCampaignEarningRunKey === 'function'
      ? getCampaignEarningRunKey(campaign)
      : null
  };
  userRecord.campaignAccounts ||= {};
  userRecord.campaignAccounts[campaign.id] ||= {};
  return { alreadyJoined };
}

async function assignCampaignJoinRoles(guild, member, campaign, options = {}) {
  const campaignRole = campaign?.roleId ? guild?.roles?.cache?.get(campaign.roleId) : null;
  if (!campaignRole) return { ok: false, error: 'The campaign role is not configured correctly. Please contact staff.' };
  const clipperRoleId = options.clipperRoleId ?? CLIPPER_ROLE_ID;
  const clipperRole = clipperRoleId ? guild?.roles?.cache?.get(clipperRoleId) : null;
  if (clipperRoleId && !clipperRole) return { ok: false, error: 'The Clipper role is not configured correctly. Please contact staff.' };

  const addedRoles = [];
  try {
    if (!member.roles.cache.has(campaignRole.id)) {
      await member.roles.add(campaignRole);
      addedRoles.push(campaignRole);
    }
    if (clipperRole && !member.roles.cache.has(clipperRole.id)) {
      await member.roles.add(clipperRole);
      addedRoles.push(clipperRole);
    }
    return { ok: true, campaignRoleAdded: addedRoles.includes(campaignRole), clipperRoleAdded: addedRoles.includes(clipperRole) };
  } catch (error) {
    for (const role of addedRoles.reverse()) await member.roles.remove(role).catch(() => {});
    console.error('[Campaign Join] Could not assign roles:', error.message);
    return { ok: false, error: 'I could not assign the campaign roles. Please contact staff.' };
  }
}

function getCampaignPanelFulfilledPercent(campaign, data, now = new Date()) {
  if (isStraightCampaign(campaign)) {
    return getStraightCampaignAccounting(data, campaign.id)?.fulfilledPercent || 0;
  }
  const weeklyAccounting = getCampaignCurrentWeekAccounting(data, campaign.id, now);
  const weeklyCap = getCampaignViewCap(campaign) || 0;
  const creditedViews = Math.min(
    Math.max(Number(weeklyAccounting?.creditedViews) || 0, 0),
    weeklyCap
  );
  return weeklyCap > 0
    ? Math.min(creditedViews / weeklyCap * 100, 100)
    : 0;
}

function buildCampaignPanelButtons(campaign, data, now = new Date()) {
  const fulfilledPercent = getCampaignPanelFulfilledPercent(campaign, data, now);

  // 🟢 FIX: Dynamic fallbacks to check both the state tree and the raw campaign object properties safely
  const operationalState = getCampaignOperationalState(data, campaign, now).state;
  const isFinished = operationalState === 'finished';
  const joinDisabled = isFinished || operationalState === 'not_launched';

  console.log(`📊 Campaign UI Build [${campaign.name || campaign.id}] - Weekly Fulfilled: ${fulfilledPercent.toFixed(1)}% | Finished: ${isFinished}`);

  const components = [
    new ButtonBuilder()
      .setCustomId(`join_campaign:${campaign.id}`)
      .setLabel("Join Campaign")
      .setEmoji("<a:flyin:1506234392920723546>")
      .setStyle(ButtonStyle.Success)
      .setDisabled(joinDisabled),

    new ButtonBuilder()
      .setCustomId(`campaign_status:${campaign.id}`)
      .setLabel(isFinished ? "Campaign Finished" : "Campaign Status")
      .setEmoji(isFinished ? "🏁" : "<a:chart1:1504773558415523931>")
      .setStyle(isFinished ? ButtonStyle.Secondary : ButtonStyle.Primary)
      .setDisabled(isFinished),

    new ButtonBuilder()
      .setCustomId(`campaign_fulfilled:${campaign.id}`)
      .setLabel(`Fulfilled: ${fulfilledPercent.toFixed(1)}%`)
      .setEmoji("<a:Loadin:1506234461459714100>")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(true)
  ];

  const row = new ActionRowBuilder().addComponents(...components);
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

  try {
    await updateCampaignSubmissionPanelMessage(guild, campaignId);
  } catch (error) {
    console.error(`Could not refresh submission panel ${campaignId}:`, error.message);
  }

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
    content: getCampaignPanelText(campaign),
    components: buildCampaignPanelButtons(campaign, data)
  });
  
  console.log('Panel updated successfully');

}

function messageHasCampaignSubmitButton(message, campaignId) {
  return (message?.components || []).some(row =>
    (row.components || []).some(component => component.customId === `submit_clip:${campaignId}`)
  );
}

function getCampaignSubmitButtonFromMessage(message, campaignId) {
  for (const row of message?.components || []) {
    const button = (row.components || []).find(component => component.customId === `submit_clip:${campaignId}`);
    if (button) return button;
  }
  return null;
}

async function findCampaignSubmissionPanelMessagesInChannel(channel, campaignId, botUserId = client.user?.id, maxPages = 10) {
  const matches = [];
  let before = null;
  for (let page = 0; page < maxPages; page++) {
    const batch = await channel.messages.fetch({ limit: 100, ...(before ? { before } : {}) }).catch(() => null);
    if (!batch) break;
    const messages = typeof batch.values === 'function' ? [...batch.values()] : [];
    matches.push(...messages.filter(message =>
      (!botUserId || message.author?.id === botUserId) && messageHasCampaignSubmitButton(message, campaignId)
    ));
    if (messages.length < 100) break;
    before = messages[messages.length - 1]?.id || null;
    if (!before) break;
  }
  return matches;
}

async function findCampaignSubmissionPanelMessage(channel, campaignId, botUserId = client.user?.id, maxPages = 10) {
  return (await findCampaignSubmissionPanelMessagesInChannel(channel, campaignId, botUserId, maxPages))[0] || null;
}

async function findAllCampaignSubmissionPanelMessages(guild, campaignId, options = {}) {
  const campaign = CAMPAIGNS[campaignId];
  if (!campaign || !guild) return [];
  const botUserId = options.botUserId ?? client.user?.id;
  const channelCollection = await guild.channels.fetch().catch(() => null);
  const channels = new Map();
  for (const channel of guild.channels.cache?.values?.() || []) {
    if (channel?.messages) channels.set(channel.id, channel);
  }
  for (const channel of channelCollection?.values?.() || []) {
    if (channel?.messages) channels.set(channel.id, channel);
  }

  const configuredChannelIds = new Set([
    options.storedChannelId,
    campaign.submitPanelChannelId,
    campaign.entryChannelId
  ].filter(Boolean).map(String));
  const campaignNameTokens = [campaign.id, campaign.name]
    .flatMap(value => String(value || '').toLowerCase().split(/[^a-z0-9]+/))
    .filter(token => token.length >= 3);
  const matches = [];
  for (const channel of channels.values()) {
    const channelName = String(channel.name || '').toLowerCase();
    const isConfigured = configuredChannelIds.has(String(channel.id));
    const isCampaignNamed = campaignNameTokens.some(token => channelName.includes(token));
    const maxPages = isConfigured || isCampaignNamed ? 10 : 1;
    const found = await findCampaignSubmissionPanelMessagesInChannel(channel, campaignId, botUserId, maxPages);
    for (const message of found) {
      matches.push({ channel, message });
    }
  }

  const unique = new Map();
  for (const match of matches) unique.set(String(match.message.id), match);
  return [...unique.values()].sort((a, b) =>
    Number(Boolean(b.message.pinned)) - Number(Boolean(a.message.pinned)) ||
    (Number(b.message.createdTimestamp) || 0) - (Number(a.message.createdTimestamp) || 0)
  );
}

async function updateCampaignSubmissionPanelMessage(guild, campaignId, options = {}) {
  const campaign = CAMPAIGNS[campaignId];
  if (!campaign || !guild) return false;
  const data = options.data || loadData();
  const storedPanel = data.campaignSubmissionPanels?.[campaignId] || null;
  const panels = [];
  if (storedPanel?.channelId && storedPanel?.messageId) {
    const storedChannel = guild.channels.cache.get(storedPanel.channelId) || await guild.channels.fetch(storedPanel.channelId).catch(() => null);
    const storedMessage = storedChannel?.messages
      ? await storedChannel.messages.fetch(storedPanel.messageId).catch(() => null)
      : null;
    if (storedChannel && storedMessage && messageHasCampaignSubmitButton(storedMessage, campaignId)) {
      panels.push({ channel: storedChannel, message: storedMessage });
    }
  }
  if (!panels.length) {
    panels.push(...await findAllCampaignSubmissionPanelMessages(guild, campaignId, {
      botUserId: options.botUserId,
      storedChannelId: storedPanel?.channelId
    }));
  }
  if (!panels.length) {
    console.error(`[Campaign Submit Panel] No existing ${campaignId} Submit Clip panel could be located.`);
    return false;
  }

  const components = buildCampaignSubmissionPanelComponents(campaign, data, options.now || new Date());
  const renderedButton = components[0].components[0].data;
  const results = [];
  for (const { channel, message } of panels) {
    const previousButton = getCampaignSubmitButtonFromMessage(message, campaignId);
    try {
      const editedMessage = await message.edit({ components });
      const verifiedMessage = await channel.messages.fetch(message.id).catch(() => editedMessage);
      const verifiedButton = getCampaignSubmitButtonFromMessage(verifiedMessage || editedMessage, campaignId);
      if (!verifiedButton || verifiedButton.label !== renderedButton.label || verifiedButton.disabled !== (renderedButton.disabled === true)) {
        throw new Error('Discord returned a Submit panel whose rendered button state did not match the canonical components.');
      }
      results.push({
        channelId: channel.id,
        messageId: message.id,
        messageUrl: `https://discord.com/channels/${guild.id}/${channel.id}/${message.id}`,
        createdAt: Number(message.createdTimestamp) ? new Date(message.createdTimestamp).toISOString() : null,
        pinned: message.pinned === true,
        previousLabel: previousButton?.label || null,
        previousDisabled: previousButton?.disabled === true,
        renderedLabel: verifiedButton.label,
        renderedDisabled: verifiedButton.disabled === true,
        edited: true
      });
    } catch (error) {
      results.push({
        channelId: channel.id,
        messageId: message.id,
        messageUrl: `https://discord.com/channels/${guild.id}/${channel.id}/${message.id}`,
        edited: false,
        error: { message: error.message, code: error.code || null, status: error.status || null }
      });
    }
  }

  const canonical = panels[0];
  const canonicalEdited = results.find(result => String(result.messageId) === String(canonical.message.id))?.edited === true;
  if (!canonicalEdited) {
    const failure = results.find(result => String(result.messageId) === String(canonical.message.id));
    throw new Error(`Could not edit canonical ${campaignId} Submit panel: ${failure?.error?.message || 'Unknown Discord API error'}`);
  }

  if (
    storedPanel?.guildId !== guild.id ||
    storedPanel?.channelId !== canonical.channel.id ||
    storedPanel?.messageId !== canonical.message.id
  ) {
    data.campaignSubmissionPanels ||= {};
    data.campaignSubmissionPanels[campaignId] = {
      guildId: guild.id,
      channelId: canonical.channel.id,
      messageId: canonical.message.id,
      updatedAt: Date.now()
    };
    (options.saveData || saveData)(data);
  }
  console.log('[Campaign Submit Panel Refresh]', { campaignId, canonicalMessageId: canonical.message.id, panels: results });
  return { updated: true, canonical: results.find(result => String(result.messageId) === String(canonical.message.id)), panels: results };
}

async function refreshAllCampaignPanelMessages(guild) {
  for (const campaignId of Object.keys(CAMPAIGNS)) {
    try {
      await updateCampaignPanelMessage(guild, campaignId);
    } catch (error) {
      console.error(`Could not refresh campaign panel ${campaignId}:`, error.message);
    }
  }
}

function scheduleNextWeeklyCampaignPanelRefresh(guildId) {
  const now = new Date();
  const nowMs = now.getTime();
  const refreshBoundaries = Object.values(CAMPAIGNS)
    .filter(campaign => campaign.separateEarningLifecycle)
    .flatMap(campaign => [
      getCampaignBudgetPeriod(campaign, now).periodEnd.getTime(),
      getCampaignEarningEnd(campaign)
    ])
    .filter(boundary => Number.isFinite(boundary) && boundary > nowMs);
  const nextRefreshAt = Math.min(...refreshBoundaries);
  if (!Number.isFinite(nextRefreshAt)) return;
  const delay = Math.max(nextRefreshAt - nowMs + 1000, 1000);
  setTimeout(async () => {
    const guild = client.guilds.cache.get(guildId);
    if (guild) await refreshAllCampaignPanelMessages(guild);
    scheduleNextWeeklyCampaignPanelRefresh(guildId);
  }, delay);
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

function getCampaignPlatformsForUser(userRecord, campaignId) {
  const campaignStats = userRecord.campaignStats?.[campaignId] || {};
  return Object.keys(campaignStats).filter(platform => campaignStats[platform]);
}

function ensureCampaignAccount(userRecord, campaignId, platform, username = '') {
  const normalizedPlatform = normalizeTypedSocialPlatform(platform) || String(platform || '').toLowerCase();
  const cleanUsername = normalizeUsername(username);
  userRecord.campaignAccounts ||= {};
  userRecord.campaignAccounts[campaignId] ||= {};
  const stored = userRecord.campaignAccounts[campaignId][normalizedPlatform];
  const accounts = !stored
    ? []
    : Array.isArray(stored)
      ? stored
      : typeof stored === 'object' && ('username' in stored || 'verified' in stored || 'status' in stored)
        ? [stored]
        : Object.values(stored || {}).filter(Boolean);
  userRecord.campaignAccounts[campaignId][normalizedPlatform] = accounts;

  let account = cleanUsername
    ? accounts.find(candidate =>
        !['removed', 'unlinked', 'revoked'].includes(String(candidate?.status || '').toLowerCase()) &&
        normalizeSocialKey(normalizedPlatform, candidate?.username) === normalizeSocialKey(normalizedPlatform, cleanUsername)
      )
    : accounts.find(candidate => candidate && !['removed', 'unlinked', 'revoked'].includes(String(candidate.status || '').toLowerCase()));
  if (!account) {
    account = {
      id: `cga_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`,
      platform: normalizedPlatform,
      username: cleanUsername,
      verified: false,
      bioCode: null,
      addedAt: new Date().toISOString()
    };
    accounts.push(account);
  }
  account.id ||= getCampaignAccountStableId(account, campaignId, normalizedPlatform);
  account.platform ||= normalizedPlatform;
  if (cleanUsername && !account.username) account.username = cleanUsername;
  return account;
}

function ensureCampaignAccountIds(userRecord, campaignId) {
  const campaignAccounts = userRecord?.campaignAccounts?.[campaignId];
  if (!campaignAccounts || typeof campaignAccounts !== 'object') return false;
  let changed = false;
  for (const platform of Object.keys(campaignAccounts)) {
    const stored = campaignAccounts[platform];
    const accounts = Array.isArray(stored)
      ? stored
      : typeof stored === 'object' && ('username' in stored || 'verified' in stored || 'status' in stored)
        ? [stored]
        : Object.values(stored || {}).filter(Boolean);
    if (!Array.isArray(stored)) {
      campaignAccounts[platform] = accounts;
      changed = true;
    }
    for (const account of accounts) {
      if (!account.id) {
        account.id = getCampaignAccountStableId(account, campaignId, platform);
        changed = true;
      }
      if (!account.platform) {
        account.platform = platform;
        changed = true;
      }
    }
  }
  return changed;
}

function removeCampaignAccount({ data, userId, campaignId, platform, accountId = null, username: requestedUsername = null, removedBy, removedAt = Date.now() }) {
  const userRecord = data?.users?.[userId];
  const normalizedPlatform = normalizeTypedSocialPlatform(platform) || String(platform || '').toLowerCase();
  const accounts = getCampaignAccountCandidates(userRecord, campaignId, normalizedPlatform, { activeOnly: true });
  const account = accounts.find(candidate =>
    (accountId && getCampaignAccountStableId(candidate, campaignId, normalizedPlatform) === String(accountId)) ||
    (requestedUsername && normalizeSocialKey(normalizedPlatform, candidate.username) === normalizeSocialKey(normalizedPlatform, requestedUsername))
  ) || (!accountId && !requestedUsername && accounts.length === 1 ? accounts[0] : null);

  if (!account) {
    return { removed: false, username: null, requestsMarkedRemoved: 0 };
  }

  const username = account.username;
  account.status = 'unlinked';
  account.verified = false;
  account.unlinkedAt = removedAt;
  account.unlinkedBy = removedBy;
  account.removedAt = removedAt;
  account.removedBy = removedBy;

  const normalizedUsername = normalizeSocialKey(platform, username);
  let requestsMarkedRemoved = 0;

  for (const request of Object.values(data.campaignAccountRequests || {})) {
    const status = String(request?.status || '').toLowerCase();
    const matchesRemovedAccount =
      String(request?.userId) === String(userId) &&
      String(request?.campaignId) === String(campaignId) &&
      String(request?.platform).toLowerCase() === String(normalizedPlatform).toLowerCase() &&
      normalizeSocialKey(request.platform, request.username) === normalizedUsername;

    if (!matchesRemovedAccount || TERMINAL_ACCOUNT_REQUEST_STATUSES.has(status)) {
      continue;
    }

    request.status = 'removed';
    request.removedAt = removedAt;
    request.removedBy = removedBy;
    requestsMarkedRemoved += 1;
  }

  return { removed: true, username, requestsMarkedRemoved, demographicsPreserved: Boolean(account.demographics) };
}

function buildSubmitClipModal(campaignId) {
  const modal = new ModalBuilder()
    .setCustomId(`submit_clip_modal:${campaignId}`)
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
  return modal;
}

function buildSubmissionAccountConnectRow(guildId, campaign) {
  if (getCampaignAccountMode(campaign) === 'global_auto_verify') {
    return new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`global_social_link:${campaign.id}`)
        .setLabel('Link Account')
        .setEmoji('➕')
        .setStyle(ButtonStyle.Success)
    );
  }
  const url = getCampaignConnectAccountLink(guildId, campaign);
  if (!url) return null;
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setLabel('Connect Account')
      .setEmoji('➕')
      .setStyle(ButtonStyle.Link)
      .setURL(url)
  );
}

function buildClipSubmissionValidationResponse(guildId, campaign, validation) {
  const accountMode = getCampaignAccountMode(campaign);
  const author = validation?.authorIdentity?.displayName || 'this account';
  if (validation?.code === 'ACCOUNT_NOT_CONNECTED') {
    const global = accountMode === 'global_auto_verify';
    return {
      embed: new EmbedBuilder()
        .setColor(0xED4245)
        .setTitle(global ? 'Social Account Not Connected ❌' : 'Campaign Account Not Connected ❌')
        .setDescription(global
          ? `This clip was posted by **@${author}**, but that account is not connected and verified with your Creators Elite account.\n\nConnect and verify **@${author}** before submitting this clip.`
          : `This clip was posted by **@${author}**, but that account has not been verified for this campaign.\n\nConnect and verify this account before submitting clips from it.`),
      components: [buildSubmissionAccountConnectRow(guildId, campaign)].filter(Boolean)
    };
  }
  if (validation?.code === 'ACCOUNT_OWNED_BY_ANOTHER_CREATOR') {
    return {
      embed: new EmbedBuilder()
        .setColor(0xED4245)
        .setTitle('Social Account Already Registered ❌')
        .setDescription('This social account is already registered to another Creators Elite creator.'),
      components: []
    };
  }
  if (validation?.code === 'PROVIDER_OWNER_MISSING') {
    return {
      embed: new EmbedBuilder()
        .setColor(0xED4245)
        .setTitle('Unable to Verify Clip Owner ❌')
        .setDescription("We couldn't reliably identify the account that posted this clip.\n\nPlease try again shortly or contact support if the issue continues."),
      components: []
    };
  }
  if (validation?.code === 'PROVIDER_UNAVAILABLE') {
    return {
      embed: new EmbedBuilder()
        .setColor(0xFEE75C)
        .setTitle('Clip Verification Temporarily Unavailable')
        .setDescription("We couldn't verify this clip right now.\n\nPlease try again shortly."),
      components: []
    };
  }
  if (validation?.code === 'DEMOGRAPHICS_NOT_ELIGIBLE') {
    const response = buildMissingCampaignDemographicsResponse(guildId, campaign);
    const username = validation?.matchedAccount?.username || validation?.authorIdentity?.displayName || 'this account';
    response.embeds[0].setDescription(
      `Approved audience demographics for **@${username}** are required before submitting clips to **${campaign.name}**.\n\n` +
      'Verify the demographics for this exact account before trying again.'
    );
    return { embed: response.embeds[0], components: response.components };
  }
  return null;
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
  const accounts = getAllCampaignAccounts(userRecord, campaignId, { activeOnly: true });
  if (accounts.length === 0) {
    return 'No campaign accounts assigned yet.';
  }
  return accounts.map(account => {
    const verifiedText = account.verified ? '✅ Verified' : '⏳ Pending';
    return `• **${formatPlatform(account.platform)}** — @${account.username} (${verifiedText})`;
  }).join('\n');
}

function getVerifiedCampaignPlatforms(userRecord, campaignId) {
  return [...new Set(getAllCampaignAccounts(userRecord, campaignId, { activeOnly: true, verifiedOnly: true }).map(account => account.platform))];
}

function buildCampaignAccountLinkModal(campaign, selectedPlatform = null) {
  const normalizedSelectedPlatform = normalizeTypedSocialPlatform(selectedPlatform);
  const allowedPlatforms = (campaign?.allowedPlatforms || [])
    .map(normalizeTypedSocialPlatform)
    .filter(Boolean);
  const platformSelect = new StringSelectMenuBuilder()
    .setCustomId('campaign_social_platform')
    .setPlaceholder('Select a platform')
    .setMinValues(1)
    .setMaxValues(1)
    .addOptions(allowedPlatforms.map(platform => ({
      label: `Connect ${formatPlatform(platform)}`,
      value: platform,
      emoji: { tiktok: '<:tiktok1:1504871476485029979>', instagram: '<:ig1:1504871708664922162>', youtube: '<:Yt1:1504872145464070245>' }[platform],
      default: normalizedSelectedPlatform === platform
    })));
  const modal = new ModalBuilder()
    .setCustomId(`campaign_connect_modal:${campaign.id}`)
    .setTitle('Connect your account');
  modal.addLabelComponents(
    new LabelBuilder()
      .setLabel('Select a platform to connect your account')
      .setStringSelectMenuComponent(platformSelect),
    new LabelBuilder()
      .setLabel('Enter your account name')
      .setTextInputComponent(new TextInputBuilder()
        .setCustomId('campaign_username')
        .setPlaceholder('@username')
        .setStyle(TextInputStyle.Short)
        .setRequired(true))
  );
  return modal;
}

function buildCampaignAccountRemovePage(userRecord, campaign, requestedPage = 0, pageSize = 25) {
  const accounts = getAllCampaignAccounts(userRecord, campaign.id, { activeOnly: true });
  if (!accounts.length) {
    return { page: 0, totalPages: 0, totalAccounts: 0, content: "📭 You don't have any accounts linked to this campaign.", components: [] };
  }
  const totalPages = Math.ceil(accounts.length / pageSize);
  const page = Math.min(Math.max(Number(requestedPage) || 0, 0), totalPages - 1);
  const pageAccounts = accounts.slice(page * pageSize, (page + 1) * pageSize);
  const select = new StringSelectMenuBuilder()
    .setCustomId(`campaign_connect_remove_select:${campaign.id}:${page}`)
    .setPlaceholder('Select a campaign account to remove')
    .addOptions(pageAccounts.map(account => ({
      label: `${formatPlatform(account.platform)} — @${account.username}`.slice(0, 100),
      description: `Unlinks only this account from ${campaign.name.replace(/<a?:\w+:\d+>/g, '').trim()}`.slice(0, 100),
      value: `${account.platform}|${getCampaignAccountStableId(account.source, campaign.id, account.platform)}`
    })));
  const components = [new ActionRowBuilder().addComponents(select)];
  if (totalPages > 1) {
    components.push(new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`campaign_connect_remove_page:${campaign.id}:${page - 1}`).setLabel('Previous').setStyle(ButtonStyle.Secondary).setDisabled(page === 0),
      new ButtonBuilder().setCustomId(`campaign_connect_remove_page:${campaign.id}:${page + 1}`).setLabel('Next').setStyle(ButtonStyle.Secondary).setDisabled(page === totalPages - 1)
    ));
  }
  return {
    page,
    totalPages,
    totalAccounts: accounts.length,
    content: `🗑️ **Select which account you want to remove from this campaign:**${totalPages > 1 ? `\n\nPage ${page + 1} / ${totalPages}` : ''}`,
    components
  };
}

function buildLegacyCampaignAccountViewPage(userRecord, campaign, requestedPage = 0, pageSize = 10) {
  const accounts = getAllCampaignAccounts(userRecord, campaign.id, { activeOnly: true });
  if (!accounts.length) {
    return {
      page: 0,
      totalPages: 0,
      totalAccounts: 0,
      embeds: [new EmbedBuilder().setColor(0x5865F2).setTitle(`${campaign.name} — Accounts`).setDescription('No campaign accounts assigned yet.')],
      components: []
    };
  }
  const totalPages = Math.ceil(accounts.length / pageSize);
  const page = Math.min(Math.max(Number(requestedPage) || 0, 0), totalPages - 1);
  const pageAccounts = accounts.slice(page * pageSize, (page + 1) * pageSize);
  const groups = new Map();
  for (const account of pageAccounts) {
    if (!groups.has(account.platform)) groups.set(account.platform, []);
    groups.get(account.platform).push(`@${account.username} — ${account.verified ? '✅ Verified' : '⏳ Pending'}`);
  }
  const embed = new EmbedBuilder()
    .setColor(0x5865F2)
    .setTitle(`${campaign.name} — Accounts`)
    .addFields(
      ...[...groups.entries()].map(([platform, lines]) => ({ name: formatPlatform(platform), value: lines.join('\n'), inline: false })),
      { name: 'Total Connected Accounts', value: String(accounts.length), inline: false }
    )
    .setFooter({ text: `Creators Elite • Campaign Accounts${totalPages > 1 ? ` • Page ${page + 1}/${totalPages}` : ''}` });
  const components = totalPages > 1
    ? [new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`campaign_connect_view_page:${campaign.id}:${page - 1}`).setLabel('Previous').setStyle(ButtonStyle.Secondary).setDisabled(page === 0),
        new ButtonBuilder().setCustomId(`campaign_connect_view_page:${campaign.id}:${page + 1}`).setLabel('Next').setStyle(ButtonStyle.Secondary).setDisabled(page === totalPages - 1)
      )]
    : [];
  return { page, totalPages, totalAccounts: accounts.length, embeds: [embed], components };
}

function getCampaignAccountAnalytics(data, userId, campaignId, account) {
  const platform = normalizeTypedSocialPlatform(account?.platform);
  const username = normalizeSocialUsername(account?.username);
  const accountId = getCampaignAccountStableId(account?.source || account, campaignId, platform);
  const uniqueClips = new Map();
  for (const clip of [...Object.values(data?.clips || {}), ...Object.values(data?.clipReviews || {})]) {
    if (!clip || String(clip.userId) !== String(userId) || String(clip.campaignId) !== String(campaignId)) continue;
    const storedAccountId = clip.campaignAccountId || clip.selectedCampaignAccountId || null;
    const clipPlatform = normalizeTypedSocialPlatform(clip.platform);
    const linkedByAccountId = storedAccountId && clipPlatform === platform && String(storedAccountId) === String(accountId);
    const linkedByLegacyIdentity = !storedAccountId &&
      clipPlatform === platform &&
      normalizeSocialUsername(clip.username || clip.platformAuthorName) === username;
    if (!linkedByAccountId && !linkedByLegacyIdentity) continue;
    const key = String(clip.id || clip.clipId || clip.videoUrl || clip.url || uniqueClips.size);
    uniqueClips.set(key, clip);
  }
  const clips = [...uniqueClips.values()];
  const sumMetric = resolver => clips.reduce((total, clip) => total + Math.max(0, Number(resolver(clip)) || 0), 0);
  return {
    totalClips: clips.length,
    totalViews: sumMetric(clip => getStoredPublicViews(clip)),
    totalLikes: sumMetric(clip => clip.likes ?? clip.likeCount ?? clip.likesCount),
    totalComments: sumMetric(clip => clip.comments ?? clip.commentCount ?? clip.commentsCount)
  };
}

function buildCampaignAccountViewNotice(title, description, color = 0xED4245) {
  return {
    content: null,
    embeds: [],
    components: [new ContainerBuilder()
      .setAccentColor(color)
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(`## ${title}`),
        new TextDisplayBuilder().setContent(description)
      )]
  };
}

function buildCampaignAccountViewPage(userRecord, campaign, requestedPage = 0, options = {}) {
  ensureCampaignAccountIds(userRecord, campaign.id);
  const accounts = getAllCampaignAccounts(userRecord, campaign.id, { activeOnly: true });
  if (!accounts.length) {
    const emptyContainer = new ContainerBuilder()
      .setAccentColor(0x5865F2)
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent('## No Campaign Accounts Connected'),
        new TextDisplayBuilder().setContent(`You haven't connected any accounts to **${campaign.name}** yet.\n\nUse **Link Account** on the campaign Connect Accounts panel to get started.`),
        new TextDisplayBuilder().setContent('-# Powered by Creators Elite')
      );
    return {
      page: 0,
      totalPages: 0,
      totalAccounts: 0,
      embeds: [],
      components: [emptyContainer],
      flags: MessageFlags.IsComponentsV2
    };
  }
  const totalPages = accounts.length;
  const page = Math.min(Math.max(Number(requestedPage) || 0, 0), totalPages - 1);
  const account = accounts[page];
  const analytics = getCampaignAccountAnalytics(options.data, options.userId, campaign.id, account);
  const demographicDisplay = getVerifiedCeDemographicDisplay(account);
  const verified = account.verified === true || ['approved', 'verified'].includes(String(account.status || '').toLowerCase());
  const cleanUsername = normalizeUsername(account.username);
  const profileUrl = {
    tiktok: `https://www.tiktok.com/@${cleanUsername}`,
    instagram: `https://www.instagram.com/${cleanUsername}`,
    youtube: `https://www.youtube.com/@${cleanUsername}`
  }[normalizeTypedSocialPlatform(account.platform)];
  const usernameDisplay = profileUrl ? `[@${cleanUsername}](${profileUrl})` : `@${cleanUsername}`;
  const platformEmoji = { tiktok: '<:tiktok1:1504871476485029979>', instagram: '<:ig1:1504871708664922162>', youtube: '<:Yt1:1504872145464070245>' }[normalizeTypedSocialPlatform(account.platform)] || '🔗';
  const accountText =
    `${platformEmoji} **${formatPlatform(account.platform)}**\n` +
    `${usernameDisplay}\n\n` +
    `**Campaign:** ${campaign.name.replace(/<a?:\w+:\d+>/g, '').trim()}\n` +
    `**Verification Status:** ${verified ? '✅ Verified' : '⏳ Pending Verification'}\n` +
    `**Tier:** ${demographicDisplay.tier}\n` +
    `**Page Type:** ${demographicDisplay.pageType}\n` +
    `**Total Clips:** ${formatAccountCardMetric(analytics.totalClips)}\n` +
    `**Total Views:** ${formatAccountCardMetric(analytics.totalViews)}\n` +
    `**Total Likes:** ${formatAccountCardMetric(analytics.totalLikes)}\n` +
    `**Total Comments:** ${formatAccountCardMetric(analytics.totalComments)}`;
  const accountId = getCampaignAccountStableId(account.source, campaign.id, account.platform);
  const container = new ContainerBuilder()
    .setAccentColor(0x00D26A)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent('## Your Connected Campaign Accounts'),
      new TextDisplayBuilder().setContent(accountText)
    )
    .addActionRowComponents(new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`campaign_connect_disconnect:${campaign.id}:${account.platform}:${accountId}:${page}`)
        .setLabel('Disconnect')
        .setEmoji('🗑️')
        .setStyle(ButtonStyle.Danger)
    ))
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true));
  const optionPageSize = 25;
  const optionPage = Math.floor(page / optionPageSize);
  const optionPageCount = Math.ceil(accounts.length / optionPageSize);
  const optionPageAccounts = accounts.slice(optionPage * optionPageSize, (optionPage + 1) * optionPageSize);
  container.addActionRowComponents(new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(`campaign_connect_view_select:${campaign.id}:${optionPage}`)
      .setPlaceholder('Click here to switch account preview')
      .addOptions(optionPageAccounts.map(candidate => {
        const candidateId = getCampaignAccountStableId(candidate.source, campaign.id, candidate.platform);
        return {
          label: `${formatPlatform(candidate.platform)} — @${candidate.username}`.slice(0, 100),
          value: `${candidate.platform}|${candidateId}`,
          emoji: { tiktok: '<:tiktok1:1504871476485029979>', instagram: '<:ig1:1504871708664922162>', youtube: '<:Yt1:1504872145464070245>' }[normalizeTypedSocialPlatform(candidate.platform)],
          default: candidateId === accountId
        };
      }))
  ));
  if (optionPageCount > 1) {
    container.addActionRowComponents(new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`campaign_connect_view_options_page:${campaign.id}:${optionPage - 1}`).setLabel('Previous Accounts').setStyle(ButtonStyle.Secondary).setDisabled(optionPage === 0),
      new ButtonBuilder().setCustomId(`campaign_connect_view_options_page:${campaign.id}:${optionPage + 1}`).setLabel('Next Accounts').setStyle(ButtonStyle.Secondary).setDisabled(optionPage === optionPageCount - 1)
    ));
  }
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(`Showing account ${page + 1} of ${totalPages}`),
    new TextDisplayBuilder().setContent('-# Powered by Creators Elite')
  );
  return {
    page,
    totalPages,
    totalAccounts: accounts.length,
    account,
    analytics,
    embeds: [],
    components: [container],
    flags: MessageFlags.IsComponentsV2
  };
}

function buildCampaignAccountDisconnectConfirmation(campaign, account, page = 0) {
  const accountId = getCampaignAccountStableId(account.source || account, campaign.id, account.platform);
  const container = new ContainerBuilder()
    .setAccentColor(0xED4245)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent('## Disconnect Campaign Account?'),
      new TextDisplayBuilder().setContent(`Are you sure you want to disconnect **${formatPlatform(account.platform)} @${account.username}** from **${campaign.name}**?\n\nHistorical clips and payments will be preserved.`)
    )
    .addActionRowComponents(new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`campaign_connect_disconnect_confirm:${campaign.id}:${account.platform}:${accountId}:${page}`).setLabel('Disconnect').setEmoji('🗑️').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId(`campaign_connect_view_page:${campaign.id}:${page}`).setLabel('Cancel').setStyle(ButtonStyle.Secondary)
    ));
  return {
    content: null,
    embeds: [],
    components: [container],
    flags: MessageFlags.IsComponentsV2
  };
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

function escapeDiscordMarkdown(value) {
  return String(value ?? '').replace(/([\\`*_{}\[\]()<>#+\-.!|~])/g, '\\$1');
}

function buildCampaignAccountApprovedEmbed(request) {
  const campaign = CAMPAIGNS[request?.campaignId];
  const campaignName = campaign?.name || request?.campaignName || 'Campaign';
  const platform = formatPlatform(request?.platform || 'Unknown');
  const username = `@${escapeDiscordMarkdown(normalizeUsername(request?.username || 'Unknown'))}`;
  return new EmbedBuilder()
    .setColor(0x57F287)
    .setAuthor({ name: 'Creators Elite' })
    .setTitle('Account Verified ✅')
    .setDescription(
      `**${escapeDiscordMarkdown(campaignName)}**\n\n` +
      `Your **${escapeDiscordMarkdown(platform)}** account **${username}** has been successfully verified.\n\n` +
      'You can now submit eligible clips from this account for this campaign.'
    )
    .addFields(
      { name: '🌐 Platform', value: platform, inline: true },
      { name: '👤 Account', value: username, inline: true },
      { name: '✅ Status', value: 'Verified', inline: true }
    )
    .setFooter({
      text: 'Creators Elite • Account Verification',
      iconURL: 'https://cdn.discordapp.com/emojis/1504904179905200148.png'
    })
    .setTimestamp();
}

function buildCampaignAccountRejectedEmbed(request, reason) {
  const campaign = CAMPAIGNS[request?.campaignId];
  const campaignName = campaign?.name || request?.campaignName || 'Campaign';
  const platform = formatPlatform(request?.platform || 'Unknown');
  const username = `@${escapeDiscordMarkdown(normalizeUsername(request?.username || 'Unknown'))}`;
  const safeReason = escapeDiscordMarkdown(reason || 'No reason was provided.');
  return new EmbedBuilder()
    .setColor(0xED4245)
    .setAuthor({ name: 'Creators Elite' })
    .setTitle('Account Verification Rejected ❌')
    .setDescription(
      `**${escapeDiscordMarkdown(campaignName)}**\n\n` +
      `Your **${escapeDiscordMarkdown(platform)}** account **${username}** could not be verified.\n\n` +
      'Review the reason below and connect another account or correct the issue before trying again.\n\n' +
      'You are still part of the campaign and can connect another account.'
    )
    .addFields(
      { name: '🌐 Platform', value: platform, inline: true },
      { name: '👤 Account', value: username, inline: true },
      { name: '❌ Status', value: 'Rejected', inline: true },
      { name: '📌 Reason', value: safeReason, inline: false }
    )
    .setFooter({
      text: 'Creators Elite • Account Verification',
      iconURL: 'https://cdn.discordapp.com/emojis/1504904179905200148.png'
    })
    .setTimestamp();
}

function buildCampaignAccountStaffButtons(id, status) {
  // 1. Initial State: Show "Send Code"
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

  // 2. Waiting State: Staff sent code, waiting for user to update bio
  if (status === 'waiting_confirm') {
    return [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`campaign_wait:${id}`)
          .setLabel('⏳ Waiting for User...')
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(true)
      )
    ];
  }

  // 3. Review State: User confirmed bio code! Show "Accept" and "Reject"
  if (status === 'verifying' || status === 'ready_for_review' || status === 'bio_updated') {
    return [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`campaign_staff_accept:${id}`)
          .setLabel('✅ Accept')
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId(`campaign_staff_reject:${id}`)
          .setLabel('❌ Reject')
          .setStyle(ButtonStyle.Danger)
      )
    ];
  }

  // 4. Approved Final State
  if (status === 'approved') {
    return [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`campaign_approved:${id}`)
          .setLabel('✅ Account Approved')
          .setStyle(ButtonStyle.Success)
          .setDisabled(true)
      )
    ];
  }

  // 5. Rejected Final State
  if (status === 'rejected') {
    return [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`campaign_rejected:${id}`)
          .setLabel('❌ Account Rejected')
          .setStyle(ButtonStyle.Danger)
          .setDisabled(true)
      )
    ];
  }

  return [];
}

async function updateCampaignAccountStaffMessage(guild, request) {
  if (!guild || !request) return;

  const data = loadData();

  // 🟢 4-TIER FALLBACK CHANNEL RESOLUTION
  const campaignStaffMap = data.campaignStaffChannels?.[request.campaignId];
  const channelId = request.staffChannelId 
                 || campaignStaffMap?.linkAccount 
                 || campaignStaffMap?.accountLinking 
                 || CAMPAIGNS[request.campaignId]?.staffChannelId;

  if (!channelId || !request.staffMessageId) {
    console.log(`⚠️ Missing channelId (${channelId}) or staffMessageId (${request.staffMessageId}) for request ${request.id}`);
    return;
  }

  // Backfill missing staffChannelId into request so future checks find it instantly
  request.staffChannelId = channelId;

  const ch = guild.channels.cache.get(channelId);
  if (!ch) {
    console.log(`⚠️ Could not find channel with ID ${channelId} in guild cache.`);
    return;
  }

  try {
    const msg = await ch.messages.fetch(request.staffMessageId);
    if (msg) {
      await msg.edit({
        content: renderCampaignAccountStaffContent(request),
        components: buildCampaignAccountStaffButtons(request.id, request.status)
      });
      console.log(`✅ Successfully updated staff message for request ${request.id}`);
    }
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
  return (await fetchClipMetadata({ platform: 'tiktok', url })).views;
}

function getYouTubeVideoId(url) {
  const match = url.match(/(?:shorts\/|watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
  return match ? match[1] : null;
}

async function getYouTubeViews(url) {
  return (await fetchClipMetadata({ platform: 'youtube', url })).views;
}

async function fetchClipMetadata(clip) {
  const clipUrl = clip.videoUrl || clip.url;
  if (clip.platform === 'instagram') {
    const metadata = await fetchApifyInstagramReelMetadata(clipUrl);
    return {
      views: metadata.views,
      likes: metadata.likes,
      title: metadata.title,
      thumbnailUrl: metadata.thumbnailUrl,
      authorName: metadata.authorUsername,
      authorId: metadata.authorId || null,
      durationSeconds: metadata.durationSeconds,
      publishedAt: metadata.publishedTimestamp ? new Date(metadata.publishedTimestamp).toISOString() : null,
      publishedTimestamp: metadata.publishedTimestamp || null
    };
  }
  if (clip.platform === 'tiktok') {
    const res = await axios.get(`https://www.tikwm.com/api/?url=${encodeURIComponent(clipUrl)}`, { timeout: 15000 });
    const item = res.data?.data || {};
    return {
      views: Number(item.play_count) || 0,
      likes: getFirstFiniteNonNegativeValue([item.digg_count, item.like_count, item.likeCount, item.likes]),
      title: item.title || '',
      thumbnailUrl: item.cover || item.origin_cover || null,
      authorName: item.author?.nickname || item.author?.unique_id || null,
      durationSeconds: normalizeVideoDurationSeconds(item.duration),
      publishedAt: Number(item.create_time) > 0 ? new Date(Number(item.create_time) * 1000).toISOString() : null,
      publishedTimestamp: Number(item.create_time) > 0 ? Number(item.create_time) * 1000 : null
    };
  }

  if (clip.platform !== 'youtube') return { views: Number(clip.currentViews) || 0, title: clip.title || '', thumbnailUrl: clip.thumbnailUrl || null, authorName: clip.platformAuthorName || null };
  const videoId = getYouTubeVideoId(clipUrl);
  if (!videoId) return { views: 0, title: '', thumbnailUrl: null, authorName: null };

  const res = await axios.get('https://www.googleapis.com/youtube/v3/videos', {
    timeout: 15000,
    params: {
      part: 'statistics,snippet,contentDetails',
      id: videoId,
      key: process.env.YOUTUBE_API_KEY
    }
  });

  const item = res.data?.items?.[0] || {};
  const thumbs = item.snippet?.thumbnails || {};
  return {
    views: Number(item.statistics?.viewCount) || 0,
    likes: getFirstFiniteNonNegativeValue([item.statistics?.likeCount]),
    title: item.snippet?.title || '',
    thumbnailUrl: thumbs.maxres?.url || thumbs.standard?.url || thumbs.high?.url || thumbs.medium?.url || thumbs.default?.url || null,
    authorName: item.snippet?.channelTitle || null,
    durationSeconds: normalizeVideoDurationSeconds(item.contentDetails?.duration),
    publishedAt: item.snippet?.publishedAt || null,
    publishedTimestamp: Number.isFinite(Date.parse(item.snippet?.publishedAt || '')) ? Date.parse(item.snippet.publishedAt) : null
  };
}

async function fetchSubmissionMetadata(platform, canonicalUrl, videoId) {
  if (platform === 'instagram') {
    const metadata = await fetchApifyInstagramReelMetadata(canonicalUrl);
    return {
      ...metadata,
      authorName: metadata.authorDisplayName || metadata.authorUsername || null,
      publishedAt: metadata.publishedTimestamp ? new Date(metadata.publishedTimestamp).toISOString() : null
    };
  }

  if (platform === 'tiktok') {
    const response = await axios.get(
      `https://www.tikwm.com/api/?url=${encodeURIComponent(canonicalUrl)}`,
      { timeout: 15000 }
    );
    const data = response.data?.data;
    if (!data) throw new Error('TikTok video could not be found or is not publicly available.');

    const createdAt = Number(data.create_time);
    const authorUsername = data?.author?.unique_id || data?.author?.uniqueId || data?.author?.username || data?.author_name || null;
    const authorDisplayName = data?.author?.nickname || data?.author?.name || null;
    return {
      authorUsername,
      authorId: data.author?.id || data.author?.uid || null,
      platformAccountId: data.author?.id || data.author?.uid || null,
      authorDisplayName,
      authorName: authorDisplayName || authorUsername,
      title: data.title || '',
      views: Number(data.play_count) || 0,
      likes: getFirstFiniteNonNegativeValue([data.digg_count, data.like_count, data.likeCount, data.likes]),
      thumbnailUrl: data.cover || data.origin_cover || null,
      durationSeconds: normalizeVideoDurationSeconds(data.duration),
      publishedTimestamp: Number.isFinite(createdAt) && createdAt > 0 ? createdAt * 1000 : null,
      publishedAt: Number.isFinite(createdAt) && createdAt > 0 ? new Date(createdAt * 1000).toISOString() : null
    };
  }

  if (platform === 'youtube') {
    const id = videoId || getYouTubeVideoId(canonicalUrl);
    if (!id) throw new Error('Invalid YouTube video ID.');

    const response = await axios.get('https://www.googleapis.com/youtube/v3/videos', {
      timeout: 15000,
      params: { part: 'snippet,statistics,contentDetails', id, key: process.env.YOUTUBE_API_KEY }
    });
    const item = response.data?.items?.[0];
    if (!item) throw new Error('This YouTube video could not be found or is not publicly available.');

    const snippet = item.snippet || {};
    const thumbnails = snippet.thumbnails || {};
    const publishedTimestamp = Date.parse(snippet.publishedAt || '');
    return {
      authorUsername: null,
      authorId: snippet.channelId || null,
      platformAccountId: snippet.channelId || null,
      channelId: snippet.channelId || null,
      authorDisplayName: snippet.channelTitle || null,
      authorName: snippet.channelTitle || null,
      title: snippet.title || '',
      views: Number(item.statistics?.viewCount) || 0,
      likes: getFirstFiniteNonNegativeValue([item.statistics?.likeCount]),
      thumbnailUrl: thumbnails.maxres?.url || thumbnails.standard?.url || thumbnails.high?.url || thumbnails.medium?.url || thumbnails.default?.url || null,
      durationSeconds: normalizeVideoDurationSeconds(item.contentDetails?.duration),
      publishedTimestamp: Number.isFinite(publishedTimestamp) ? publishedTimestamp : null,
      publishedAt: snippet.publishedAt || null
    };
  }

  throw new Error('Unsupported social platform.');
}

function buildShortCampaignPanelText(campaign) {
  const platforms = (campaign.allowedPlatforms || []).map(formatPlatform).join(', ') || 'See campaign configuration';
  const countryTiers = Array.isArray(campaign.countryTiers) ? campaign.countryTiers.join(', ') : (campaign.countryTiers || 'See campaign rules');
  const ratePerThousand = (Number(campaign.ratePerMillion) || 0) / 1000;
  const allocationViews = getCampaignViewCap(campaign) || 0;
  const payoutExamples = `$${ratePerThousand.toFixed(2)} per 1,000 views / $${(ratePerThousand * 100).toFixed(0)} per 100,000 views`;
  const payoutThresholdViews = getCampaignPayoutThresholdViews(campaign);
  const minimumPayout = payoutThresholdViews > 0
    ? `\n> **Minimum Payout:** ${formatPayoutThresholdViews(payoutThresholdViews)} eligible unpaid views`
    : '';
  return `# 🔥 Earn Money Posting Clips & Edits – ${campaign.name}\n\n` +
    `${campaign.shortDescription || campaign.description || 'Create eligible clips and edits for this campaign.'}\n\n` +
    `## ⚠️ Campaign Details\n\n` +
    `• **Clips:** ${campaign.clipRequirement || campaign.rulesSummary || 'Follow the configured campaign rules'}\n` +
    `• **Platforms:** ${platforms}\n` +
    `• **Country Tier:** ${countryTiers}\n` +
    `• **Minimum Video Duration:** ${campaign.minimumVideoDuration || 'See campaign rules'}\n\n` +
    `## 💸 Payment Details\n\n` +
    `> **Payout:** ${payoutExamples}\n` +
    `> **Budget:** $${formatNumber(campaign.campaignBudget)} — Up to ${formatNumber(allocationViews)} Total Eligible Views${minimumPayout}\n\n` +
    `## ➜ Join the Campaign\n\n` +
    `Click the button below to start clipping and earning.`;
}

function getCampaignPanelText(campaign) {
  if (campaign.panelText) return campaign.panelText;
  return isStraightCampaign(campaign) ? buildShortCampaignPanelText(campaign) : '';
}

async function fetchPublicSocialProfile(platform, username) {
  const normalizedPlatform = normalizeTypedSocialPlatform(platform);
  const cleanUsername = normalizeUsername(username);
  if (!normalizedPlatform) throw new Error('Unsupported platform. Please enter TikTok, Instagram, or YouTube.');
  if (!cleanUsername) throw new Error('Username / Handle cannot be empty.');

  if (normalizedPlatform === 'tiktok') {
    const response = await axios.get('https://www.tikwm.com/api/user/info', {
      timeout: 15000,
      params: { unique_id: cleanUsername }
    });
    const user = response.data?.data?.user;
    if (!user || !normalizeSocialUsername(user.uniqueId || user.unique_id)) {
      throw new Error('TikTok profile could not be retrieved.');
    }
    const stats = response.data?.data?.stats || response.data?.data?.statsV2 || {};
    return {
      platform: 'tiktok',
      username: user.uniqueId || user.unique_id,
      displayName: user.nickname || user.uniqueId || cleanUsername,
      bio: String(user.signature || ''),
      profileUrl: `https://www.tiktok.com/@${normalizeUsername(user.uniqueId || user.unique_id)}`,
      avatarUrl: user.avatarLarger || user.avatarMedium || user.avatarThumb || null,
      followers: Number(stats.followerCount ?? stats.follower_count) || 0,
      externalAccountId: user.id ? String(user.id) : null,
      rawProvider: 'tikwm'
    };
  }

  if (normalizedPlatform === 'youtube') {
    let channelId = null;
    let handle = cleanUsername;
    try {
      const parsed = /^https?:\/\//i.test(cleanUsername) ? new URL(cleanUsername) : null;
      const channelMatch = parsed?.pathname?.match(/\/channel\/(UC[\w-]{20,})/i);
      const handleMatch = parsed?.pathname?.match(/@([^/?#]+)/);
      if (/^UC[\w-]{20,}$/i.test(cleanUsername)) channelId = cleanUsername;
      else if (channelMatch) channelId = channelMatch[1];
      else if (handleMatch) handle = handleMatch[1];
    } catch {}
    const params = { part: 'snippet,statistics', key: process.env.YOUTUBE_API_KEY };
    if (channelId) params.id = channelId;
    else params.forHandle = handle;
    let response = await axios.get('https://www.googleapis.com/youtube/v3/channels', { timeout: 15000, params });
    let item = response.data?.items?.[0];
    if (!item && !channelId) {
      response = await axios.get('https://www.googleapis.com/youtube/v3/channels', {
        timeout: 15000,
        params: { part: 'snippet,statistics', forUsername: handle, key: process.env.YOUTUBE_API_KEY }
      });
      item = response.data?.items?.[0];
    }
    if (!item) throw new Error('YouTube channel could not be retrieved.');
    const thumbnails = item.snippet?.thumbnails || {};
    return {
      platform: 'youtube',
      username: handle,
      displayName: item.snippet?.title || handle,
      bio: String(item.snippet?.description || ''),
      profileUrl: `https://www.youtube.com/channel/${item.id}`,
      avatarUrl: thumbnails.high?.url || thumbnails.medium?.url || thumbnails.default?.url || null,
      followers: Number(item.statistics?.subscriberCount) || 0,
      externalAccountId: item.id || null,
      rawProvider: 'youtube_data_api_v3'
    };
  }

  return fetchInstagramPublicProfile(cleanUsername);
}

function bioContainsExactVerificationCode(bio, verificationCode) {
  if (typeof bio !== 'string' || typeof verificationCode !== 'string' || !verificationCode) return false;
  const escapedCode = verificationCode.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[^A-Za-z0-9-])${escapedCode}(?=$|[^A-Za-z0-9-])`).test(bio);
}

async function verifyGlobalSocialVerificationRequest(data, requestId, options = {}) {
  const now = Number(options.now ?? Date.now());
  const request = data.globalSocialVerificationRequests?.[requestId];
  if (!request) return { verified: false, code: 'NOT_FOUND', message: 'Verification request not found.' };
  if (options.requestingUserId !== undefined && String(options.requestingUserId) !== String(request.userId)) {
    return { verified: false, code: 'NOT_REQUEST_OWNER', message: 'This verification request belongs to another creator.' };
  }
  if (request.status !== 'pending' || request.usedAt) {
    return { verified: false, code: 'ALREADY_USED', message: 'This verification request has already been used.' };
  }
  if (!Number.isFinite(Number(request.expiresAt)) || now > Number(request.expiresAt)) {
    request.status = 'expired';
    return { verified: false, code: 'EXPIRED', message: 'This verification code has expired. Start a new Link Account request.' };
  }
  const existingOwner = findVerifiedGlobalSocialOwner(data, request.platform, request.username, request.userId);
  if (existingOwner) {
    return { verified: false, code: 'OWNED_BY_ANOTHER_USER', message: 'This social account is already verified to another creator.', request };
  }
  const alreadyConnected = getVerifiedGlobalSocials(data.users?.[request.userId]).find(social =>
    normalizeTypedSocialPlatform(social.platform) === request.platform &&
    normalizeSocialUsername(social.normalizedUsername || social.username) === request.normalizedUsername
  );
  if (alreadyConnected) {
    return { verified: false, code: 'ALREADY_CONNECTED', message: 'This exact social account is already connected to your creator profile.', request, social: alreadyConnected };
  }
  if (request.platform === 'instagram' && Number.isFinite(Number(request.lastVerificationAttemptAt))) {
    const retryAfterMs = INSTAGRAM_PROFILE_VERIFICATION_COOLDOWN_MS - (now - Number(request.lastVerificationAttemptAt));
    if (retryAfterMs > 0) {
      return { verified: false, code: 'COOLDOWN', message: 'Please wait before checking this Instagram profile again.', retryAfterMs, request };
    }
  }

  const fetchProfile = options.fetchProfile || fetchPublicSocialProfile;
  if (request.platform === 'instagram') {
    request.lastVerificationAttemptAt = now;
    request.verificationAttemptCount = Math.max(0, Number(request.verificationAttemptCount) || 0) + 1;
  }
  let profile;
  try {
    profile = await fetchProfile(request.platform, request.username);
  } catch (error) {
    return { verified: false, code: 'PROFILE_UNAVAILABLE', message: 'The public profile could not be retrieved.', request };
  }
  if (!profile || normalizeTypedSocialPlatform(profile.platform) !== request.platform) {
    return { verified: false, code: 'PROFILE_UNAVAILABLE', message: 'The provider did not return a valid public profile.', request };
  }
  if (normalizeSocialUsername(profile.username) !== request.normalizedUsername) {
    return { verified: false, code: 'PROFILE_MISMATCH', message: 'The retrieved public profile does not match this verification request.', request };
  }
  if (request.platform === 'instagram' && profile.private === true) {
    return { verified: false, code: 'PRIVATE_PROFILE', message: 'Private Instagram profiles cannot be verified automatically.', request, profile };
  }
  const verificationCodeFound = request.platform === 'instagram'
    ? bioContainsExactVerificationCode(profile.bio, request.verificationCode)
    : String(profile.bio || '').includes(request.verificationCode);
  if (!verificationCodeFound) {
    return { verified: false, code: 'CODE_NOT_FOUND', message: 'Verification code was not found in the public profile bio. Add the code and try again.', request, profile };
  }

  const platformAccountId = profile.platformAccountId || profile.externalAccountId || null;
  const providerOwner = findVerifiedGlobalSocialOwner(
    data,
    request.platform,
    profile.username,
    request.userId,
    platformAccountId
  );
  if (providerOwner) {
    return { verified: false, code: 'OWNED_BY_ANOTHER_USER', message: 'This social account is already verified to another creator.', request, profile };
  }

  const userRecord = data.users?.[request.userId];
  if (!userRecord) return { verified: false, code: 'USER_NOT_FOUND', message: 'Creator record not found.', request };
  ensureUserSocials(data, request.userId);
  const sameIdentity = getVerifiedGlobalSocials(userRecord).find(candidate => {
    if (normalizeTypedSocialPlatform(candidate.platform) !== request.platform) return false;
    const candidateStableId = candidate.platformAccountId || candidate.externalAccountId || null;
    return normalizeSocialUsername(candidate.normalizedUsername || candidate.username) === request.normalizedUsername ||
      (platformAccountId && candidateStableId && String(candidateStableId) === String(platformAccountId));
  });
  if (sameIdentity) {
    return { verified: false, code: 'ALREADY_CONNECTED', message: 'This exact social account is already connected to your creator profile.', request, profile, social: sameIdentity };
  }
  let social = getVerifiedGlobalSocials(userRecord).find(candidate =>
    normalizeTypedSocialPlatform(candidate.platform) === request.platform &&
    (
      normalizeSocialUsername(candidate.normalizedUsername || candidate.username) === request.normalizedUsername ||
      (platformAccountId && String(candidate.platformAccountId || candidate.externalAccountId || '') === String(platformAccountId))
    )
  );
  const storedPlatformAccountId = social?.platformAccountId || social?.externalAccountId || null;
  if (social && storedPlatformAccountId && platformAccountId && String(storedPlatformAccountId) !== String(platformAccountId)) {
    return { verified: false, code: 'PROFILE_ID_MISMATCH', message: 'The profile identity does not match the previously verified account.', request, profile };
  }
  if (!social) {
    social = {
      id: `gsa_${now}_${crypto.randomBytes(3).toString('hex')}`,
      platform: request.platform,
      username: request.username,
      normalizedUsername: request.normalizedUsername,
      status: 'verified',
      verified: true,
      verificationMethod: 'bio_code_api',
      verificationCode: request.verificationCode,
      verificationRequestedAt: request.verificationRequestedAt,
      verifiedAt: now,
      lastVerifiedAt: now,
      profileUrl: profile.profileUrl || null,
      avatarUrl: profile.avatarUrl || null,
      followers: Number(profile.followers) || 0,
      platformAccountId,
      externalAccountId: platformAccountId,
      provider: profile.rawProvider || null
    };
    userRecord.socials.push(social);
  } else {
    social.lastVerifiedAt = now;
    social.profileUrl = profile.profileUrl || social.profileUrl || null;
    social.avatarUrl = profile.avatarUrl || social.avatarUrl || null;
    social.followers = Number(profile.followers) || social.followers || 0;
    if (!storedPlatformAccountId && platformAccountId) {
      social.platformAccountId = platformAccountId;
      social.externalAccountId = platformAccountId;
    }
  }
  request.status = 'verified';
  request.usedAt = now;
  request.verifiedAt = now;
  request.socialId = social.id;
  return { verified: true, request, social, profile };
}

async function fetchClipViews(clip) {
  if (clip.platform === 'tiktok' || clip.platform === 'youtube' || clip.platform === 'instagram') return (await fetchClipMetadata(clip)).views;
  return clip.rawViews || 0;
}

let trackingRunning = false;
const campaignTrackingLocks = new Map();

async function withCampaignTrackingLock(campaignId, task) {
  const key = String(campaignId || 'unknown');
  const previous = campaignTrackingLocks.get(key) || Promise.resolve();
  let release;
  const current = new Promise(resolve => { release = resolve; });
  const queued = previous.then(() => current);
  campaignTrackingLocks.set(key, queued);
  await previous;
  try {
    return await task();
  } finally {
    release();
    if (campaignTrackingLocks.get(key) === queued) campaignTrackingLocks.delete(key);
  }
}

async function joinCampaignMember(data, guild, member, campaign, options = {}) {
  const roleResult = await assignCampaignJoinRoles(guild, member, campaign, options);
  if (!roleResult.ok) return { ok: false, error: roleResult.error, alreadyJoined: false };
  const userRecord = ensureUser(data, member);
  const membership = applyCampaignMembership(userRecord, campaign);
  return { ok: true, alreadyJoined: membership.alreadyJoined, userRecord, roleResult };
}

async function autoJoinReturnCampaignAfterGlobalVerification(data, guild, member, request, options = {}) {
  const campaign = request?.returnCampaignId ? CAMPAIGNS[request.returnCampaignId] : null;
  if (!campaign || !member || getCampaignAccountMode(campaign) !== 'global_auto_verify') {
    return { joinedCampaign: null, joinResult: null };
  }
  const userRecord = data.users?.[String(request.userId)];
  if (!getCampaignAccountEligibility(userRecord, campaign).eligible) {
    return { joinedCampaign: null, joinResult: null };
  }
  if (!getCampaignDemographicEligibility(userRecord, campaign).eligible) {
    return { joinedCampaign: null, joinResult: null };
  }
  if (getCampaignOperationalState(data, campaign, options.now ?? new Date()).state !== 'live') {
    return { joinedCampaign: null, joinResult: null };
  }
  const joinResult = await joinCampaignMember(data, guild, member, campaign, options);
  return {
    joinedCampaign: joinResult.ok ? campaign : null,
    joinResult
  };
}

async function refillStraightCampaign(data, campaignId, addBudget, addViewCap, options = {}) {
  const campaign = CAMPAIGNS[campaignId];
  if (!campaign || !isStraightCampaign(campaign)) throw new Error('Campaign is not a straight-budget campaign.');
  const fetchMetadata = options.fetchMetadata || fetchClipMetadata;
  const baselineViews = {};
  for (const clip of Object.values(data.clips || {})) {
    if (String(clip.campaignId) !== String(campaignId) || !isPayoutEligibleClip(clip)) continue;
    try {
      const metadata = await fetchMetadata(clip);
      const fetchedViews = Number(metadata?.views);
      if (Number.isFinite(fetchedViews) && fetchedViews >= 0) baselineViews[clip.id] = fetchedViews;
    } catch (error) {
      console.warn(`[Campaign Refill] Fresh baseline pending for ${clip.id}:`, error.message);
    }
  }
  return applyStraightCampaignRefill(data, campaignId, addBudget, addViewCap, {
    ...options,
    baselineViews
  });
}

async function autoTrackClipViews() {
  if (trackingRunning) return;
  trackingRunning = true;

  try {
    const data = loadData();
    const guild = client.guilds.cache.first();

    let changed = finalizeExpiredBudgetCycleClips(data);
    changed = finalizeOutOfRunClips(data, Date.now()).changed || changed;
    const closedPayoutTrackerIds = closeExpiredPayoutTrackers(data, Date.now());
    changed = closedPayoutTrackerIds.length > 0 || changed;
    for (const campaign of Object.values(CAMPAIGNS)) {
      if (isStraightCampaign(campaign)) changed = finalizeStraightCampaignIfFulfilled(data, campaign.id) || changed;
    }
    const updatedCampaignIds = new Set();
    const updatedPayoutPairs = new Map();
    const approvedClipIds = new Set(Object.entries(data.clips || {})
      .filter(([, clip]) => clip.status === 'approved')
      .map(([clipId]) => clipId));

    for (const [clipId, clip] of Object.entries(data.clipReviews || {})) {
      if (clip.trackingStatus === 'completed') continue;
      const campaign = CAMPAIGNS[clip.campaignId];
      if (campaign?.separateEarningLifecycle && !isClipInCampaignEarningRun(clip, campaign)) {
        clip.trackingStatus = 'completed';
        clip.completedAt ||= Date.now();
        clip.completedReason = 'campaign_earning_period_ended';
        clip.nextCheckAt = null;
        clip.trackingRetryAt = null;
        changed = true;
        continue;
      }
      if (approvedClipIds.has(clipId)) {
        console.warn(`Duplicate clip lifecycle record detected: ${clipId}`);
        continue;
      }
      if (!isTrackableReviewClip(clip) || !isClipTrackingDue(clip)) continue;
      if (!shouldTrackClip(clip, campaign, data)) continue;
      try {
        await withCampaignTrackingLock(clip.campaignId, async () => {
          if (!shouldTrackClip(clip, campaign, data)) return;
          const metadata = await fetchClipMetadata(clip);
          updatePendingReviewTracking(clip, metadata, data);
          data.clipReviews[clipId] = clip;
          changed = true;
          if (guild) {
            try { await updateClipStaffMessage(guild, clip); }
            catch (error) { console.error(`Could not update pending staff message ${clipId}:`, error.message); }
          }
        });
      } catch (error) {
        recordClipTrackingFailure(clip, error);
        data.clipReviews[clipId] = clip;
        changed = true;
        console.error(`Pending clip tracking failed ${clipId}:`, error.message);
      }
      await delayBetweenPlatformRequests();
    }

    for (const [clipId, clip] of Object.entries(data.clips || {})) {
      if (clip.trackingStatus === 'completed') continue;
      const campaign = CAMPAIGNS[clip.campaignId];
      if (campaign?.separateEarningLifecycle && !isClipInCampaignEarningRun(clip, campaign)) {
        clip.trackingStatus = 'completed';
        clip.completedAt ||= Date.now();
        clip.completedReason = 'campaign_earning_period_ended';
        clip.nextCheckAt = null;
        clip.trackingRetryAt = null;
        changed = true;
        continue;
      }
      if (!isTrackableApprovedClip(clip) || !isClipTrackingDue(clip)) continue;
      if (!shouldTrackClip(clip, campaign, data)) continue;
      try {
        await withCampaignTrackingLock(clip.campaignId, async () => {
          if (!shouldTrackClip(clip, campaign, data)) return;
          const metadata = await fetchClipMetadata(clip);
          updateApprovedClipTracking(clip, metadata, data);
          data.clips[clipId] = clip;
          changed = true;
          updatedCampaignIds.add(clip.campaignId);
          const payoutCycle = getCampaignPayoutCycle(campaign, { clip });
          if (payoutCycle) updatedPayoutPairs.set(`${clip.campaignId}|${clip.userId}|${payoutCycle.earningRunKey}`, {
            campaignId: clip.campaignId,
            userId: clip.userId,
            earningRunKey: payoutCycle.earningRunKey
          });
          if (guild) {
            try { await updateClipStaffMessage(guild, clip); }
            catch (error) { console.error(`Could not update approved staff message ${clipId}:`, error.message); }
          }
        });
      } catch (error) {
        recordClipTrackingFailure(clip, error);
        data.clips[clipId] = clip;
        changed = true;
        console.error(`Approved clip tracking failed ${clipId}:`, error.message);
      }
      await delayBetweenPlatformRequests();
    }

    if (changed) saveData(data);

    if (guild && updatedCampaignIds.size > 0) {
      for (const campaignId of updatedCampaignIds) {
        try { await updateCampaignPanelMessage(guild, campaignId); }
        catch (error) { console.error(`Could not refresh campaign panel ${campaignId}:`, error.message); }
      }
      try { await updateLeaderboardMessage(guild); }
      catch (error) { console.error('Could not refresh leaderboard:', error.message); }
      try { await updateServerStats(guild); }
      catch (error) { console.error('Could not refresh server counters:', error.message); }
    }

    if (guild) {
      for (const pair of updatedPayoutPairs.values()) {
        try { await syncPayoutCard(guild, pair.campaignId, pair.userId, { earningRunKey: pair.earningRunKey }); }
        catch (error) { console.error(`Could not refresh payout card ${pair.campaignId}:${pair.userId}:${pair.earningRunKey}:`, error.message); }
      }
      for (const trackerId of closedPayoutTrackerIds) {
        const tracker = data.payoutTrackers?.[trackerId];
        if (!tracker) continue;
        try { await syncPayoutCard(guild, tracker.campaignId, tracker.userId, { trackerId }); }
        catch (error) { console.error(`Could not close payout card ${trackerId}:`, error.message); }
      }
    }

    console.log('Auto tracking completed.');
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

client.once(Events.ClientReady, async () => {
    
    console.log(`Online as ${client.user.tag}`);
    const instagramConfig = getInstagramConfigurationStatus();
    console.log(instagramConfig.configured
      ? 'Instagram API configuration: ready'
      : `Instagram API configuration missing: ${instagramConfig.missing.join(', ')}`);

    const guild = client.guilds.cache.first();
    if (guild) {
      await syncElephantJulyReconciliationCards(guild);
      await syncCrowderHistoricalReconciliationCards(guild);
    }

    autoTrackClipViews();
    setInterval(autoTrackClipViews, CLIP_TRACK_SCHEDULER_MS);

    archiveFinishedCampaigns();
    setInterval(archiveFinishedCampaigns, 5 * 60 * 1000);
});

client.on('messageCreate', async message => {
  if (message.author.bot || !message.guild || !message.content.toLowerCase().startsWith('!auditcliptracking')) return;
  if (!isAdmin(message.member)) {
    await message.reply('❌ You need administrator permissions to audit clip tracking.');
    return;
  }
  const requestedClipId = message.content.trim().split(/\s+/)[1] || null;
  const data = loadData();
  const records = [
    ...Object.values(data.clips || {}),
    ...Object.values(data.clipReviews || {})
  ].filter(clip => !requestedClipId || String(clip.id) === String(requestedClipId));
  if (!records.length) {
    await message.reply(requestedClipId ? `❌ Clip ${requestedClipId} was not found.` : 'No clip records were found.');
    return;
  }
  const audits = records.map(clip => getClipTrackingAudit(clip));
  const problems = audits.filter(audit => audit.problemFlags.length);
  const selected = requestedClipId ? audits : problems;
  const header = `Clip tracking audit: ${records.length} checked, ${problems.length} with problems.`;
  const blocks = selected.map(audit => '```json\n' + JSON.stringify(audit, null, 2).slice(0, 1700) + '\n```');
  if (!blocks.length) {
    await message.reply(header + '\n✅ No lifecycle invariant violations found.');
    return;
  }
  await message.reply(header + '\n' + blocks[0]);
  for (const block of blocks.slice(1, 10)) await message.channel.send(block);
  if (blocks.length > 10) await message.channel.send(`…and ${blocks.length - 10} more. Use !auditcliptracking <clipId> for a targeted report.`);
});

client.on('messageCreate', async message => {
  if (message.author.bot || !message.guild || !message.content.toLowerCase().startsWith('!auditweekly')) return;
  if (!isAdmin(message.member)) {
    await message.reply('❌ You need administrator permissions to audit weekly accounting.');
    return;
  }

  const campaignId = message.content.trim().split(/\s+/)[1]?.toLowerCase();
  if (!campaignId || !CAMPAIGNS[campaignId]?.separateEarningLifecycle) {
    await message.reply('❌ Use `!auditweekly elephant` or `!auditweekly crowder`.');
    return;
  }

  const audit = getWeeklyAccountingAudit(loadData(), campaignId, new Date());
  const report = JSON.stringify(audit, null, 2);
  const flagSummary = audit.flags.length ? audit.flags.join(', ') : 'none';
  await message.reply({
    content: `Weekly accounting audit for \`${campaignId}\`. Flags: **${flagSummary}**`,
    files: [{ attachment: Buffer.from(report, 'utf8'), name: `weekly-audit-${campaignId}.json` }]
  });
});

client.on('messageCreate', async message => {
  const command = message.content.toLowerCase().split(/\s+/)[0];
  const isAudit = command === '!auditrejectedcredits';
  const isReconcile = command === '!reconcilerejectedcredits';
  if (message.author.bot || !message.guild || (!isAudit && !isReconcile)) return;
  if (!isAdmin(message.member)) {
    await message.reply('❌ You need administrator permissions to manage rejected clip credits.');
    return;
  }
  const campaignId = message.content.trim().split(/\s+/)[1]?.toLowerCase();
  if (!campaignId || !CAMPAIGNS[campaignId]) {
    await message.reply(`❌ Provide a configured campaign ID, for example: \`${command} elephant\`.`);
    return;
  }
  if (isAudit) {
    const audit = getRejectedCreditAudit(loadData(), campaignId, new Date());
    const summary = [
      `Rejected-credit audit for **${audit.campaignName}** (read-only).`,
      `Post-approval rejected clips: **${audit.rejectedPostApprovalClips}**`,
      `Historical rejected credit: **${formatNumber(audit.historicalRejectedCredit)}**`,
      `Already paid: **${formatNumber(audit.paidRejectedCredit)}**`,
      `Unpaid rejected credit: **${formatNumber(audit.unpaidRejectedCredit)}**`,
      `Incorrect active credit in current scope: **${formatNumber(audit.incorrectRejectedCredit)}**`,
      `Current → corrected campaign credit: **${formatNumber(audit.incorrectCurrentCampaignActiveCredit)} → ${formatNumber(audit.correctedCampaignActiveCredit)}**`,
      `Fulfilled: **${audit.currentFulfilledPercent.toFixed(2)}% → ${audit.correctedFulfilledPercent.toFixed(2)}%**`,
      `Should reopen: **${audit.shouldReopen ? 'Yes' : 'No'}**`
    ].join('\n');
    await message.reply({
      content: summary,
      files: [{ attachment: Buffer.from(JSON.stringify(audit, null, 2), 'utf8'), name: `rejected-credit-audit-${campaignId}.json` }]
    });
    return;
  }

  const data = loadData();
  const result = reconcileRejectedCredits(data, campaignId, { appliedBy: message.author.id, now: Date.now() });
  if (result.changed) saveData(data);
  try { await updateCampaignPanelMessage(message.guild, campaignId); }
  catch (error) { console.error(`Could not refresh campaign panels after rejected-credit reconciliation ${campaignId}:`, error.message); }
  for (const affected of result.affectedPayoutCycles) {
    try { await syncPayoutCard(message.guild, campaignId, affected.userId, { earningRunKey: affected.earningRunKey }); }
    catch (error) { console.error(`Could not refresh payout card ${campaignId}:${affected.userId}:${affected.earningRunKey}:`, error.message); }
  }
  try { await updateLeaderboardMessage(message.guild); }
  catch (error) { console.error('Could not refresh leaderboard after rejected-credit reconciliation:', error.message); }
  try { await updateServerStats(message.guild); }
  catch (error) { console.error('Could not refresh server counters after rejected-credit reconciliation:', error.message); }
  await message.reply(
    `✅ Rejected-credit reconciliation complete for **${CAMPAIGNS[campaignId].name}**.\n` +
    `Clip reversals created: **${result.changedClips}**\n` +
    `Corrected active credit: **${formatNumber(result.after.correctedCampaignActiveCredit)}**\n` +
    `Corrected Fulfilled: **${result.after.correctedFulfilledPercent.toFixed(2)}%**\n` +
    `Campaign state: **${result.campaignState.state?.state || 'unchanged'}**\n` +
    (result.changed ? 'Persistent panels and payout summaries were refreshed.' : 'No new changes were needed; the command is idempotent.')
  );
});

client.on('messageCreate', async message => {
  if (message.author.bot || !message.guild || !message.content.toLowerCase().startsWith('!testinstagramprofile')) return;
  if (!isAdmin(message.member)) {
    await message.reply('❌ You need administrator permissions to test Instagram profiles.');
    return;
  }
  const username = normalizeSocialUsername(message.content.trim().replace(/^!testinstagramprofile\b/i, ''));
  if (!username || !/^[a-z0-9._]+$/i.test(username)) {
    await message.reply('❌ Provide one Instagram username, for example: `!testinstagramprofile creatorselite`');
    return;
  }
  const now = Date.now();
  const lastRun = apifyInstagramProfileTestCooldowns.get(message.author.id) || 0;
  if (now - lastRun < 30_000) {
    await message.reply('Please wait before running the Instagram profile test again.');
    return;
  }
  apifyInstagramProfileTestCooldowns.set(message.author.id, now);

  const loadingMessage = await message.reply('⏳ Retrieving the public Instagram profile through Apify…');
  try {
    const profile = await fetchInstagramPublicProfile(username);
    const embed = new EmbedBuilder()
      .setColor(profile.private ? 0xFEE75C : 0x57F287)
      .setTitle('Instagram Profile Provider Test')
      .addFields(
        { name: 'Username', value: `@${profile.username}`, inline: true },
        { name: 'Profile ID', value: profile.platformAccountId || 'Not returned', inline: true },
        { name: 'Public/Private', value: profile.private ? 'Private' : 'Public', inline: true },
        { name: 'Bio Found', value: profile.bio ? 'Yes' : 'No', inline: true },
        { name: 'Followers', value: Number(profile.followers || 0).toLocaleString('en-US'), inline: true }
      )
      .setFooter({ text: 'Safe provider fields only • Creators Elite' });
    await loadingMessage.edit({ content: null, embeds: [embed] });
  } catch {
    await loadingMessage.edit('❌ The Instagram profile provider could not retrieve a usable profile. Please try again shortly.');
  }
});

// ==========================================
// 🛠️ AUTOMATED STAFF CHANNEL CREATOR
// ==========================================
client.on('messageCreate', async message => {
    if (message.author.bot || !message.guild) return;

    // Command structure: !setupcampaignstaff elephant
    if (!message.content.startsWith('!setupcampaignstaff')) return;

    // Check for administrator permissions
    if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
        return message.reply("❌ You need Administrator permissions to run this setup command.");
    }

    const args = message.content.split(' ');
    const campaignId = args[1]?.toLowerCase();

    if (!campaignId || !CAMPAIGNS[campaignId]) {
        const available = Object.keys(CAMPAIGNS).join(', ') || 'None';
        return message.reply(`❌ Invalid or missing campaign ID. Available campaigns: \`${available}\``);
    }

    const campaign = CAMPAIGNS[campaignId];
    const statusMsg = await message.reply(`⏳ Generating staff category & review channels for **${campaign.name}**...`);

    try {
        // 1. Create Private Staff Category
        const category = await message.guild.channels.create({
            name: `🔒 ${campaign.name} Staff`,
            type: ChannelType.GuildCategory,
            permissionOverwrites: [
                {
                    id: message.guild.id, // @everyone role
                    deny: [PermissionFlagsBits.ViewChannel] // Hide from regular members
                }
            ]
        });

        // 2. Create the 4 channel destinations inside the category
        const linkChan = await message.guild.channels.create({
            name: '🔗・link-accounts',
            type: ChannelType.GuildText,
            parent: category.id,
            topic: `Account linking verification requests for ${campaign.name}`
        });

        const igChan = await message.guild.channels.create({
            name: '📸・ig-clips',
            type: ChannelType.GuildText,
            parent: category.id,
            topic: `Instagram Reels review queue for ${campaign.name}`
        });

        const ttChan = await message.guild.channels.create({
            name: '🎵・tiktok-clips',
            type: ChannelType.GuildText,
            parent: category.id,
            topic: `TikTok clip review queue for ${campaign.name}`
        });

        const ytChan = await message.guild.channels.create({
            name: '📺・yt-clips',
            type: ChannelType.GuildText,
            parent: category.id,
            topic: `YouTube Shorts review queue for ${campaign.name}`
        });

        const payChan = await message.guild.channels.create({
            name: '💵・payout-queue',
            type: ChannelType.GuildText,
            parent: category.id,
            topic: `Payout review queue for ${campaign.name}`
        });

        // 3. Save directly into data.json runtime structure
        const data = loadData();
        if (!data.campaignStaffChannels) data.campaignStaffChannels = {};

        data.campaignStaffChannels[campaignId] = {
            category: category.id,
            linkAccount: linkChan.id,
            instagram: igChan.id,
            tiktok: ttChan.id,
            youtube: ytChan.id,
            payouts: payChan.id,
        };
        saveData(data);

        // 4. Confirm Setup Completion
        await statusMsg.edit({
            content: `✅ **Staff Channels Successfully Created for ${campaign.name}!**\n\n` +
                     `**Category:** <#${category.id}>\n` +
                     `• **Account Linking:** <#${linkChan.id}> (\`${linkChan.id}\`)\n` +
                     `• **Instagram Clips:** <#${igChan.id}> (\`${igChan.id}\`)\n` +
                     `• **TikTok Clips:** <#${ttChan.id}> (\`${ttChan.id}\`)\n` +
                     `• **Payout Queue:** <#${payChan.id}> (\`${payChan.id}\`)\n\n` +
                     `*Channel IDs have been registered automatically to your database!*`
        });

    } catch (err) {
        console.error("⚠️ Failed to generate campaign staff channels:", err);
        await statusMsg.edit(`❌ An error occurred while creating channels: \`${err.message}\``);
    }
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

    if (message.content.trim().toLowerCase() === '!testinstagram') {
      if (!isAdmin(message.member)) {
        await message.reply('❌ You are not allowed to do this.');
        return;
      }

      const configuration = getInstagramConfigurationStatus();
      if (!configuration.configured) {
        await message.reply(`❌ Instagram API configuration missing: ${configuration.missing.join(', ')}`);
        return;
      }

      try {
        const identity = await fetchInstagramTestIdentity();
        const embed = new EmbedBuilder()
          .setColor(0x57F287)
          .setTitle('Instagram API Connection')
          .addFields(
            { name: 'Status', value: '✅ Connected', inline: true },
            { name: 'Username', value: identity.username ? `@${identity.username}` : 'Not returned', inline: true },
            { name: 'Instagram User ID', value: identity.instagramUserId, inline: true },
            { name: 'Account Type', value: identity.accountType || 'Not returned', inline: true },
            { name: 'API Version', value: INSTAGRAM_API_VERSION, inline: true }
          );
        await message.reply({ embeds: [embed] });
      } catch (error) {
        const details = getInstagramApiErrorDetails(error);
        await message.reply(
          `❌ Instagram API connection failed.\nHTTP Status: ${details.status ?? 'Not available'}\nMeta Error Code: ${details.code ?? 'Not available'}\nMessage: ${details.message}`
        );
      }
      return;
    }

    if (message.content.trim().toLowerCase() === '!testinstagrammedia') {
      if (!isAdmin(message.member)) {
        await message.reply('❌ You are not allowed to do this.');
        return;
      }
      const now = Date.now();
      const lastRun = instagramMediaTestCooldowns.get(message.author.id) || 0;
      if (now - lastRun < 30_000) {
        await message.reply('Please wait before running the Instagram media test again.');
        return;
      }
      instagramMediaTestCooldowns.set(message.author.id, now);
      const loadingMessage = await message.reply('⏳ Testing Instagram media access…');
      try {
        const { identity, media, pagesInspected, partialError } = await fetchInstagramTestMedia(25);
        const reels = media.filter(isInstagramReel).slice(0, 5);
        const classifications = media.map(getInstagramMediaClassification);
        const mediaTypeCounts = classifications.reduce((counts, item) => ({ ...counts, [item.mediaType]: (counts[item.mediaType] || 0) + 1 }), {});
        const productTypeCounts = classifications.reduce((counts, item) => ({ ...counts, [item.productType]: (counts[item.productType] || 0) + 1 }), {});
        const videoItems = media.filter(item => getInstagramMediaClassification(item).mediaType === 'VIDEO');
        const reelPermalinks = media.filter(item => /\/reels?\//i.test(String(item.permalink || ''))).length;
        console.log('[Instagram Media Diagnostic]', { username: identity.username, mediaInspected: media.length, pagesInspected, reelsFound: reels.length, videoItemsFound: videoItems.length, mediaTypeCounts, productTypeCounts });
        if (!reels.length) {
          const summary = `Media inspected: ${media.length}\nPages inspected: ${pagesInspected}\nMedia types: ${Object.entries(mediaTypeCounts).map(([type, count]) => `${type}: ${count}`).join(', ') || 'None'}\nProduct types: ${Object.entries(productTypeCounts).map(([type, count]) => `${type}: ${count}`).join(', ') || 'None'}\nVideo posts found: ${videoItems.length}\nPermalinks containing /reel/: ${reelPermalinks}`;
          if (!videoItems.length) {
            await loadingMessage.edit(`Instagram media access works, but no API-visible video or Reel media was found among the inspected records.\n\n${summary}${partialError ? '\n\nA later page could not be retrieved.' : ''}`);
            return;
          }
          const diagnosticEmbed = new EmbedBuilder().setColor(0xF1C40F).setTitle('Instagram Media API Diagnostic').setDescription(`Instagram media access works, but none of the inspected VIDEO records were identified as Reels.\n\n${summary}${partialError ? '\n\nA later page could not be retrieved.' : ''}`);
          for (const item of videoItems.slice(0, 5)) {
            const classification = getInstagramMediaClassification(item);
            const title = getInstagramMediaTitle(item).replace(/[\[\]\\]/g, '\\$&');
            const pathType = /\/reels?\//i.test(String(item.permalink || '')) ? 'Reel' : String(item.permalink || '').includes('/p/') ? 'Post' : 'Unknown';
            diagnosticEmbed.addFields({ name: title, value: `${item.permalink ? `[Open Media](${item.permalink})\n` : ''}Media ID: ${item.id}\nMedia Type: ${classification.mediaType}\nProduct Type: ${classification.productType}\nPermalink Path: ${pathType}\nTimestamp: ${item.timestamp || 'Not returned'}`.slice(0, 1024) });
          }
          await loadingMessage.edit({ content: null, embeds: [diagnosticEmbed] });
          return;
          await loadingMessage.edit('✅ Instagram media access works, but no recent Reels were found in the first 10 media items.');
          return;
        }

        const tested = [];
        for (const reel of reels) {
          const insights = await fetchInstagramTestMediaInsights(reel);
          tested.push({ reel, insights });
          for (const insightError of insights.errors) {
            console.warn('[Instagram Media Insight Test]', { mediaId: reel.id, metric: insightError.metric, status: insightError.status, code: insightError.code, message: insightError.message });
          }
          await new Promise(resolve => setTimeout(resolve, 500));
        }
        const insightSuccesses = tested.filter(item => item.insights.views !== null).length;
        const insightFailures = tested.length - insightSuccesses;
        console.log('[Instagram Media Test]', { username: identity.username, mediaFound: media.length, reelsFound: media.filter(isInstagramReel).length, reelsTested: tested.length, insightSuccesses, insightFailures });
        if (!insightSuccesses) {
          await loadingMessage.edit('⚠️ Instagram media access works, but the API did not return a supported views or plays metric for the tested Reels.');
          return;
        }

        const embed = new EmbedBuilder()
          .setColor(0x57F287)
          .setTitle('Instagram Media API Test')
          .setDescription(`**Status:** ✅ Media retrieved\n**Account:** @${identity.username || 'Unknown'}\n**Recent Media Found:** ${media.length}\n**Reels Found:** ${media.filter(isInstagramReel).length}\n**Reels Tested:** ${tested.length}\n**Successful insight checks:** ${insightSuccesses}\n**Unavailable or failed:** ${insightFailures}`);
        for (const { reel, insights } of tested) {
          const title = getInstagramMediaTitle(reel).replace(/[\[\]\\]/g, '\\$&');
          const metric = insights.metrics.views !== undefined ? 'views' : insights.metrics.plays !== undefined ? 'plays' : 'none';
          const published = reel.timestamp ? new Date(reel.timestamp).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : 'Not returned';
          embed.addFields({ name: title, value: `${reel.permalink ? `[Open Reel](${reel.permalink})\n` : ''}Media ID: ${reel.id}\nPublished: ${published}\nViews: ${insights.views === null ? 'Not available' : insights.views.toLocaleString()}\nMetric: ${metric}`.slice(0, 1024) });
        }
        const thumbnail = tested.map(item => item.reel.thumbnail_url || item.reel.media_url).find(url => /^https:\/\//i.test(url || ''));
        if (thumbnail) embed.setThumbnail(thumbnail);
        await loadingMessage.edit({ content: null, embeds: [embed] });
      } catch (error) {
        const details = error.instagramApiError || getInstagramApiErrorDetails(error);
        await loadingMessage.edit(`❌ Instagram media retrieval failed.\nHTTP Status: ${details.status ?? 'Not available'}\nMeta Error Code: ${details.code ?? 'Not available'}\nMessage: ${details.message || error.message}`);
      }
      return;
    }

    if (message.content.trim().toLowerCase().startsWith('!testapifyinstagram')) {
      if (!isAdmin(message.member)) {
        await message.reply('❌ You are not allowed to do this.');
        return;
      }

      const reelInput = message.content.trim().replace(/^!testapifyinstagram\b/i, '').trim();
      const parsedReel = parsePublicInstagramReelUrl(reelInput);
      if (!parsedReel) {
        await message.reply('❌ Provide one public Instagram Reel URL, for example: `!testapifyinstagram https://www.instagram.com/reel/ABC123/`');
        return;
      }

      const now = Date.now();
      const lastRun = apifyInstagramTestCooldowns.get(message.author.id) || 0;
      if (now - lastRun < 30_000) {
        await message.reply('Please wait before running the Apify Instagram test again.');
        return;
      }
      apifyInstagramTestCooldowns.set(message.author.id, now);

      const loadingMessage = await message.reply('⏳ Retrieving public Instagram Reel metadata through Apify…');
      try {
        const items = await fetchInstagramPublicReelMetadata(parsedReel.canonicalUrl);
        const matchingItem = items.find(item => {
          const itemUrl = parsePublicInstagramReelUrl(item?.inputUrl || item?.reelUrl || item?.url || item?.permalink);
          return itemUrl?.shortcode === parsedReel.shortcode || String(item?.shortcode || item?.shortCode || '') === parsedReel.shortcode;
        }) || items[0];

        if (!matchingItem) throw new Error('Instagram Reel data could not be retrieved.');
        const diagnostics = getSafeApifyInstagramDiagnostics(matchingItem);
        if (process.env.DEBUG_APIFY_INSTAGRAM === 'true') {
          console.log('[Apify Instagram Fields]', Object.keys(matchingItem || {}));
          console.log('[Apify Instagram Metric Diagnostics]', diagnostics);
        }

        const reel = normalizeApifyInstagramReel(matchingItem, parsedReel.canonicalUrl);
        if (process.env.DEBUG_APIFY_INSTAGRAM === 'true') {
          console.log('[Apify Instagram Normalized]', {
            shortcode: reel.shortcode,
            username: reel.username,
            views: reel.views,
            source: reel.source
          });
        }

        const safeTitle = reel.title.replace(/[\\[\]]/g, '\\$&');
        const published = reel.publishedTimestamp
          ? new Date(reel.publishedTimestamp).toLocaleString()
          : 'Unknown';
        const diagnosticLines = Object.entries(diagnostics)
          .slice(0, 15)
          .map(([field, value]) => `${field}: ${String(value)}`);
        const diagnosticChunks = [];
        let diagnosticChunk = '';
        for (const line of diagnosticLines) {
          const nextChunk = diagnosticChunk ? `${diagnosticChunk}\n${line}` : line;
          if (nextChunk.length > 1000 && diagnosticChunk) {
            diagnosticChunks.push(diagnosticChunk);
            diagnosticChunk = line;
          } else {
            diagnosticChunk = nextChunk;
          }
        }
        if (diagnosticChunk) diagnosticChunks.push(diagnosticChunk);
        const embed = new EmbedBuilder()
          .setColor(0x57F287)
          .setTitle('Apify Instagram Reel Test')
          .setDescription(`[${safeTitle}](${reel.url})`)
          .addFields(
            { name: 'Status', value: '✅ Reel retrieved', inline: true },
            { name: 'Owner', value: `@${reel.username}`, inline: true },
            { name: 'Views', value: reel.views === null ? 'Not available' : reel.views.toLocaleString(), inline: true },
            { name: 'View field', value: reel.viewMetricField || 'Not available', inline: true },
            { name: 'Likes', value: reel.likes === null ? 'Not available' : reel.likes.toLocaleString(), inline: true },
            { name: 'Comments', value: reel.comments === null ? 'Not available' : reel.comments.toLocaleString(), inline: true },
            { name: 'Published', value: published, inline: true },
            { name: 'Source', value: 'Apify', inline: true },
            { name: 'Potential view/count fields', value: diagnosticChunks.shift() || 'No safe candidate metrics returned.' }
          );
        if (reel.thumbnailUrl) embed.setThumbnail(reel.thumbnailUrl);
        await loadingMessage.edit({ content: null, embeds: [embed] });
        if (diagnosticChunks.length) {
          await message.reply({
            embeds: [new EmbedBuilder()
              .setColor(0x5865F2)
              .setTitle('Apify Instagram Reel Test — Additional Diagnostics')
              .setDescription(diagnosticChunks.join('\n\n'))]
          });
        }
      } catch (error) {
        const messageText = error?.apifyInstagramError?.message || error?.message || 'Instagram Reel data could not be retrieved.';
        await loadingMessage.edit(`❌ ${messageText}`);
      }
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
      const leaderboard = buildLeaderboardEmbed(message.guild, data, 1, 10);

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

    if (message.content.trim().toLowerCase() === '!socialpanel') {
      if (!isAdmin(message.member)) {
        await message.reply('❌ You must be an admin to use this command.');
        return;
      }
      await message.delete().catch(() => {});
      await message.channel.send(buildGlobalSocialPanel(message.guild.id));
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
            .setURL(`https://discordapp.com/channels/${message.guild.id}/${CONNECT_ACCOUNTS_CHANNEL_ID}`)
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

    if (message.content.toLowerCase().startsWith('!refillcampaign')) {
      if (!isAdmin(message.member)) {
        await message.reply('❌ You must be an admin to use this command.');
        return;
      }
      const [, campaignId, budgetValue, viewCapValue] = message.content.trim().split(/\s+/);
      const campaign = CAMPAIGNS[campaignId];
      const addBudget = Number(budgetValue);
      const addViewCap = Number(viewCapValue);
      if (!campaign || !isStraightCampaign(campaign) || !Number.isFinite(addBudget) || addBudget <= 0 || !Number.isFinite(addViewCap) || addViewCap <= 0) {
        await message.reply('❌ Usage: `!refillcampaign CAMPAIGN_ID BUDGET VIEW_CAP` for a refillable straight-budget campaign.');
        return;
      }
      try {
        const accounting = await withCampaignTrackingLock(campaignId, async () => {
          const data = loadData();
          const result = await refillStraightCampaign(data, campaignId, addBudget, addViewCap, {
            refilledBy: message.author.id
          });
          saveData(data);
          return result;
        });
        await updateCampaignPanelMessage(message.guild, campaignId);
        await message.reply(
          `✅ Refilled **${campaign.name}**. Total allocation: **$${formatNumber(accounting.budget)}** and **${formatNumber(accounting.viewCap)} views**.`
        );
      } catch (error) {
        await message.reply(`❌ Campaign refill failed: ${error.message}`);
      }
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

      const panelData = loadData();
      const panelMessage = await message.channel.send({
        embeds: [embed],
        components: buildCampaignSubmissionPanelComponents(campaign, panelData)
      });
      panelData.campaignSubmissionPanels ||= {};
      panelData.campaignSubmissionPanels[campaignId] = {
        guildId: message.guild.id,
        channelId: message.channel.id,
        messageId: panelMessage.id,
        updatedAt: Date.now()
      };
      saveData(panelData);

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
    `## ${campaignName}

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

      try {
        await message.delete().catch(() => {});

        await message.channel.send({
          content: getCampaignPanelText(campaign),
          components: buildCampaignPanelButtons(campaign, panelData)
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
    if (!guild || !clip) return;

    if (!clip.staffChannelId || !clip.staffMessageId) {
        console.warn(`Missing staff message reference for clip ${clip.id}`);
        return;
    }

    const ch = guild.channels.cache.get(clip.staffChannelId);
    if (!ch) {
        console.warn(`Could not locate staff channel for clip ${clip.id}`);
        return;
    }

    try {
        const msg = await ch.messages.fetch(clip.staffMessageId);
        if (msg) {
            await msg.edit({
                embeds: [buildClipStaffEmbed(clip)],
                components: buildClipStaffButtons(clip)
            });
            console.log(`✅ Updated staff message for clip ${clip.id}`);
        }
    } catch (error) {
        console.warn(`Could not update clip staff message ${clip.id}:`, error.message);
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
      const leaderboard = buildLeaderboardEmbed(interaction.guild, data, newPage, 10);

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
      const leaderboard = buildLeaderboardEmbed(interaction.guild, data, newPage, 10);

      await interaction.update({
        embeds: [leaderboard.embed],
        components: buildLeaderboardButtons(leaderboard.page, leaderboard.totalPages)
      });

      return;
    }
     
    if (interaction.isButton() && interaction.customId === 'view_your_clips') {
      await interaction.reply({
        content: '📂 Clip history is not connected yet. This button will show all your submitted clips once clip tracking is added.',
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    if (interaction.isButton() && interaction.customId === 'open_ticket') {
      try {
        const userId = interaction.user.id;

        if (!STAFF_ROLE_ID) {
          await interaction.reply({ content: '❌ STAFF_ROLE_ID is missing.', flags: MessageFlags.Ephemeral });
          return;
        }

        if (!TICKET_CATEGORY_ID) {
          await interaction.reply({ content: '❌ TICKET_CATEGORY_ID is missing.',  flags: MessageFlags.Ephemeral });
          return;
        }

        const category = interaction.guild.channels.cache.get(TICKET_CATEGORY_ID);
        if (!category) {
          await interaction.reply({ content: '❌ Ticket category not found. Check TICKET_CATEGORY_ID.', flags: MessageFlags.Ephemeral });
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
            flags: MessageFlags.Ephemeral
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
          flags: MessageFlags.Ephemeral
        });

        return;
      } catch (err) {
        console.error('OPEN TICKET ERROR:', err);

        await interaction.reply({
          content: `❌ Ticket error: ${err.message}`,
          flags: MessageFlags.Ephemeral
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

    if (interaction.isButton() && interaction.customId.startsWith("payout_resolve_issue:")) {
        const trackerId = interaction.customId.split(':')[1];
        const data = loadData();
        const tracker = data.payoutTrackers?.[trackerId];
        const campaign = CAMPAIGNS[tracker?.campaignId];
        if (!tracker || !campaign) return interaction.reply({ content: 'Payout tracker not found.', flags: MessageFlags.Ephemeral });
        tracker.issueReason = null;
        tracker.issueAt = null;
        tracker.status = tracker.currentUnpaidViews === 0 ? 'paid' : tracker.currentUnpaidViews >= getCampaignPayoutThresholdViews(campaign) ? 'ready' : 'waiting';
        tracker.updatedAt = Date.now();
        savePayoutTracker(tracker);
        await syncPayoutCard(interaction.guild, tracker.campaignId, tracker.userId, { trackerId });
        return interaction.reply({ content: 'Payout issue resolved.', flags: MessageFlags.Ephemeral });
    }

    if (interaction.isButton() && interaction.customId.startsWith("payout_refresh:")) {
        const trackerId = interaction.customId.split(':')[1];
        const data = loadData();
        const tracker = data.payoutTrackers?.[trackerId];

        if (!tracker) {
            return interaction.reply({ content: 'Payout tracker not found.', flags: MessageFlags.Ephemeral });
        }

        await syncPayoutCard(interaction.guild, tracker.campaignId, tracker.userId, { trackerId });
        await interaction.reply({ content: 'Payout tracker refreshed.', flags: MessageFlags.Ephemeral });
        return;
    }

    if (interaction.customId.startsWith("pay:")) {

        const payoutId = interaction.customId.split(":")[1];

        const data = loadData();

        const payout = data.payoutTrackers?.[payoutId];

        if (!payout) {
            return interaction.reply({
                content: "❌ Payout request not found.",
                flags: MessageFlags.Ephemeral
            });
        }

        const campaignId = payout.campaignId;
        const userId = payout.userId;

        const campaign = CAMPAIGNS[campaignId];
        const guild = interaction.guild;
        const userRecord = data.users?.[userId];
        const exchange = userRecord?.paymentDetails?.exchange;
        const paymentLabel = exchange
            ? `${exchange.charAt(0).toUpperCase()}${exchange.slice(1)} ID`
            : "Payment ID";
        const paymentValue = userRecord?.paymentDetails?.paymentId || "Not Set";

        if (!campaign) {
            return interaction.reply({
                content: "❌ Campaign not found.",
                flags: MessageFlags.Ephemeral
            });
        }

        calculateTrackerStats(payout, { data });
        if (payout.status !== "ready") {
            return interaction.reply({
                content: "❌ This creator has not reached the payout threshold yet.",
                flags: MessageFlags.Ephemeral
            });
        }

        const payoutCycle = getTrackerCycle(payout);
        if (!payoutCycle) {
            return interaction.reply({
                content: "❌ This legacy payout tracker has no verified campaign cycle and cannot be paid automatically.",
                flags: MessageFlags.Ephemeral
            });
        }
        const reconstructedAllocation = getReconciledCreatorAllocation(data, payout);
        const approvedClips = reconstructedAllocation ? [] : Object.values(data.clips).filter(c =>
            String(c.userId) === String(userId) &&
            String(c.campaignId) === String(campaignId) &&
            String(getCampaignPayoutCycle(campaign, { clip: c })?.earningRunKey || '') === String(payoutCycle.earningRunKey) &&
            isPayoutEligibleClip(c)
        );

        let paidViews = 0;
        let paidMoney = 0;
        const paidAt = Date.now();
        const paymentId = createStablePaymentReference(`${payoutId}:${paidAt}`);

        payout.paymentHistory ||= [];
        const carrySettlement = settleTrackerCarryBalances(payout, campaign, { paidAt, paymentId });
        paidViews += carrySettlement.paidViews;
        paidMoney += carrySettlement.paidMoney;
        if (reconstructedAllocation) {
            const reconciledSettlement = settleReconciledTrackerAllocation(data, payout, campaign, { paidAt, paymentId });
            paidViews += reconciledSettlement.paidViews;
            paidMoney += reconciledSettlement.paidMoney;
        }

        approvedClips.forEach(clip => {

            if (!clip.payout) {
                clip.payout = {
                    paidViews: 0,
                    paidMoney: 0,
                    history: []
                };
            }

            const cycleCreditedViews = campaign.separateEarningLifecycle &&
                String(payoutCycle.earningRunKey) === String(getCampaignEarningRunKey(campaign))
                ? (getClipCurrentRunLedgerViews(clip, campaign) ?? getApprovedClipViews(clip))
                : getApprovedClipViews(clip);
            const newViews = Math.max(
                cycleCreditedViews - (Number(clip.payout.paidViews) || 0),
                0
            );

            if (newViews <= 0) return;

            const money =
                newViews / 1000000 *
                campaign.ratePerMillion;

            clip.payout.history.push({
                date: new Date(paidAt).toISOString(),
                paidAt,
                paymentId,
                campaignId,
                campaignName: campaign.name,
                payoutTrackerId: payoutId,
                earningRunKey: payout.earningRunKey,
                cycleStartAt: payout.cycleStartAt,
                cycleEndAt: payout.cycleEndAt,
                ratePerMillion: campaign.ratePerMillion,
                status: 'paid',
                paymentSource: 'canonical_real_payment',
                views: newViews,
                amount: money
            });

            clip.payout.paidViews += newViews;
            clip.payout.paidMoney += money;

            paidViews += newViews;
            paidMoney += money;

        });

        payout.status = "paid";
        payout.paidAt = Date.now();
        payout.paidViews = paidViews;
        payout.paidMoney = paidMoney;
        payout.paidViewsForCycle = (Number(payout.paidViewsForCycle) || 0) + paidViews;
        payout.paidAmountForCycle = (Number(payout.paidAmountForCycle) || 0) + paidMoney;
        payout.lifetimePaid = payout.paidAmountForCycle;
        payout.currentUnpaidViews = 0;
        payout.currentUnpaidMoney = 0;
        payout.lastPaidAt = Date.now();
        payout.updatedAt = Date.now();
 
        saveData(data);

        try {

            const member = await interaction.guild.members.fetch(userId);

            const row = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setStyle(ButtonStyle.Link)
                        .setLabel("Share Payment Result")
                        .setEmoji('📸')
                        .setURL("https://discord.com/channels/1413113505565118524/1533850271292199143")
                );

            const dmEmbed = new EmbedBuilder()
                .setColor(0x57F287)
                .setAuthor({
                    name: `${campaign.name}`,
                    iconURL: guild.iconURL()
                })
                .setTitle("<a:flyin:1506234392920723546> You just got paid!")
                .setDescription(
            `Thanks for participating in **${campaign.name}**.

            Your payment has been successfully processed and sent to your **${paymentLabel.replace(" ID","")}** account.

            <a:chart1:1504773558415523931> **Views Paid**
            ${formatNumber(paidViews)}

            <a:Cash1:1504871843419521115> **Amount Paid**
            **$${paidMoney.toFixed(2)}**

            🏦 **Destination**
            \`${paymentValue}\`

            🗓️ **Payment Date**
            <t:${Math.floor(Date.now()/1000)}:F>

            <a:warning:1504774411280973864> Notes
            Network fees may apply depending on your exchange or wallet.`
                )
                .setFooter({
                    text: "Creators Elite • Thank you for clipping ❤️",
                    iconURL: "https://cdn.discordapp.com/emojis/1504904179905200148.png"
                })
                .setTimestamp();
 
            await member.send({
                embeds: [dmEmbed],
                components: [row]
            });

        } catch (err) {

            console.error("❌ OUTER ERROR");
            console.error(err);

        }

        await syncPayoutCard(interaction.guild, campaignId, userId, { trackerId: payoutId });

        await interaction.reply({
            content: 'Payment recorded and payout tracker refreshed.',
            flags: MessageFlags.Ephemeral
        });
        return;

   }

   if (interaction.customId.startsWith("issue:")) {

       const payoutId = interaction.customId.split(":")[1];

       const data = loadData();

       const payout = data.payoutTrackers?.[payoutId];

       if (!payout) {
           return interaction.reply({
               content: "❌ Payout request not found.",
               flags: MessageFlags.Ephemeral
           });
       }

       await interaction.showModal(

           new ModalBuilder()
               .setCustomId(`issue_modal:${payoutId}`)
               .setTitle("Payment Issue")
               .addComponents(

                   new ActionRowBuilder().addComponents(

                       new TextInputBuilder()
                           .setCustomId("reason")
                           .setLabel("Reason")
                           .setStyle(TextInputStyle.Paragraph)
                           .setRequired(true)

                   )

               )

       );

   }

   if (
       interaction.isModalSubmit() &&
       interaction.customId.startsWith("issue_modal:")
   ) {

       const payoutId = interaction.customId.split(":")[1];

       const data = loadData();

       const payout = data.payoutTrackers?.[payoutId];

       if (!payout) {
           return interaction.reply({
               content: "❌ Payout request not found.",
               flags: MessageFlags.Ephemeral
           });
       }

       const campaignId = payout.campaignId;
       const userId = payout.userId;

       const campaign = CAMPAIGNS[campaignId];
       const user = data.users?.[userId];
       const exchange = user?.paymentDetails?.exchange;
       const paymentLabel = exchange
           ? `${exchange.charAt(0).toUpperCase()}${exchange.slice(1)} ID`
           : 'Payment ID';
       const paymentValue = user?.paymentDetails?.paymentId || 'Not Set';
       const unpaidViews = Number(payout.currentUnpaidViews) || 0;
       const unpaidMoney = Number(payout.currentUnpaidMoney) || 0;

       const reason = interaction.fields.getTextInputValue("reason");

       payout.status = "issue";
       payout.issueReason = reason;
       payout.issueAt = Date.now();
       payout.currentUnpaidViews = Number(payout.currentUnpaidViews) || 0;
       payout.currentUnpaidMoney = Number(payout.currentUnpaidMoney) || 0;
       payout.lastIssueAt = Date.now();
       payout.updatedAt = Date.now();

       saveData(data);

       // DM creator
       try {

           const member = await interaction.guild.members.fetch(userId);

           const issueEmbed = new EmbedBuilder()
    .setColor(0xF39C12)
    .setTitle(`<a:warning:1504774411280973864> Payment Issue With Your ${paymentLabel.replace(" ID","")} Account`)
    .setDescription(
`Your payment for the **${campaign.name}** campaign could not be completed.

This issue is related to your **${paymentLabel.replace(" ID","")}** account rather than the Creators Elite payment system.

<a:chart1:1504773558415523931> **Views Affected**
${formatNumber(unpaidViews)}

<a:Cash1:1504871843419521115> **Expected Payout**
**$${unpaidMoney.toFixed(2)}**

🏦 **${paymentLabel}**
\`${paymentValue}\`

### Reason
${reason}

### What to do next

1. Verify that your **${paymentLabel.replace(" ID","")}** account details are correct.
2. Update your payment ID if necessary.
3. Once resolved, open a ticket in <#1492888887452762313>.

> Your payout has **NOT** been lost. It will remain pending until the issue is resolved.`
    )
    .setFooter({
        text: "Creators Elite • Thank you for clipping ❤️",
        iconURL: "https://cdn.discordapp.com/emojis/1504904179905200148.png"
    })
    .setTimestamp();

           await member.send({ embeds: [issueEmbed] });

       } catch (err) {
           console.log("Couldn't DM user.");
       }

       await syncPayoutCard(interaction.guild, campaignId, userId, { trackerId: payoutId });

       await interaction.reply({
           content: 'Payout issue recorded and tracker refreshed.',
           flags: MessageFlags.Ephemeral
       });
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

      // Use the same canonical records and accounting as the leaderboard and
      // campaign overview. Rejected clips remain in clipReviews, so looking at
      // data.clips alone made the denied count permanently read as zero.
      const userClipRecords = Object.values(data.clips || {}).filter(
        clip => String(clip.userId) === String(interaction.user.id)
      );
      const userReviewRecords = Object.values(data.clipReviews || {}).filter(
        clip => String(clip.userId) === String(interaction.user.id)
      );
      const statusRecords = getUniqueClipRecords(
        [...userReviewRecords, ...userClipRecords],
        { scope: 'account_analytics_status_counts', userId: interaction.user.id }
      );
      const approvedCount = statusRecords.filter(clip => clip.status === 'approved').length;
      const rejectedCount = statusRecords.filter(clip => clip.status === 'rejected').length;

      const liveTotalViews = getUserAllTimeCreditedViews(data, interaction.user.id);
      const liveTotalEarned = Object.values(CAMPAIGNS).reduce((total, campaign) => {
        const campaignClips = userClipRecords.filter(
          clip => String(clip.campaignId) === String(campaign.id)
        );
        const accounting = calculateClipCollectionAccounting(campaignClips, campaign, {
          scope: 'account_analytics',
          campaignId: campaign.id,
          userId: interaction.user.id
        });
        return total + accounting.totalMoney;
      }, 0);

      const embed = new EmbedBuilder()
        .setColor(0x7ED957)
        .setAuthor({
          name: hiddenName,
          iconURL: interaction.user.displayAvatarURL()
        })
        .setDescription(
          `All-time Clipping Analytics\n\n` +
          `<a:rocket1:1504872045849346140> **Leaderboard**\n${rankString}\n` + 
          `<a:Cash1:1504871843419521115> **Total Earned**\n$${liveTotalEarned.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}\n` +
          `<a:fire1:1504871649491554487> **Campaigns Joined**\n${userRecord.campaigns?.length || 0}\n` +
          `<a:chart1:1504773558415523931> **Total Views**\n${formatNumber(liveTotalViews)}\n` +
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
        flags: MessageFlags.Ephemeral
      });

      return;
    }

    if (interaction.isButton() && interaction.customId.startsWith('view_user_clips:')) {
      const [, ownerUserId, pageStr] = interaction.customId.split(':');
      const isPaginationClick = Boolean(ownerUserId);
      if (isPaginationClick && String(interaction.user.id) !== String(ownerUserId)) {
        return interaction.reply({
          content: '❌ This clip overview belongs to another user.',
          flags: MessageFlags.Ephemeral
        });
      }

      const page = Number.isInteger(Number(pageStr)) ? Number(pageStr) : 0;
      const pageData = buildUserClipsPage({
        data: loadData(),
        userId: ownerUserId || interaction.user.id,
        page,
        perPage: 2,
        displayName: interaction.user.username
      });

      if (isPaginationClick) {
        await interaction.update({ embeds: [pageData.embed], components: pageData.components });
      } else {
        await interaction.reply({
          embeds: [pageData.embed],
          components: pageData.components,
          flags: MessageFlags.Ephemeral
        });
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
        flags: MessageFlags.Ephemeral
      });

      return;
    }

    if (interaction.isButton() && interaction.customId === "account_payouts") {

        const data = loadData();
        const userRecord = ensureUser(data, interaction.member);

        const approvedClips = Object.values(data.clips || {}).filter(
            c =>
                c.userId === interaction.user.id &&
                c.status === "approved"
        );

        let totalEarned = 0;
        let totalPaid = 0;
        let totalPending = 0;

        approvedClips.forEach(clip => {

            totalEarned += Number(clip.totalMoneyMade || 0);

            totalPaid += clip.payout?.paidMoney || 0;

        });

        totalPending = Math.max(
            totalEarned - totalPaid,
            0
        );

        let paymentLabel = "USDT ID";
        let paymentValue = "Not set";

        if (userRecord.paymentDetails?.exchange) {

            const exchange =
                userRecord.paymentDetails.exchange;

            paymentLabel =
                `${exchange.charAt(0).toUpperCase()}${exchange.slice(1)} ID`;

            paymentValue =
                `\`${userRecord.paymentDetails.paymentId}\``;

        }

        const embed = new EmbedBuilder()

            .setColor(0x7ED957)

            .setAuthor({

                name: interaction.user.username,

                iconURL: interaction.user.displayAvatarURL()

            })

            .setDescription(

    `## <a:flyin:1506234392920723546> Your Payments

    <a:Cash1:1504871843419521115> **Total Earned**
    $${formatNumber(totalEarned)}

    <a:good1:1504871589332914176> **Already Paid**
    $${formatNumber(totalPaid)}

    <a:dot1:1508433228669780029> **Current Unpaid**
    $${formatNumber(totalPending)}

    <a:fire1:1504871649491554487> **Campaigns Joined**
    ${userRecord.campaigns?.length || 0}

    <:usdt1:1504872188317012098> **${paymentLabel}**
    ${paymentValue}

    <a:warning:1504774411280973864> Network fees may apply depending on the payout network.`

            );

        const row = new ActionRowBuilder()

            .addComponents(

                new ButtonBuilder()

                    .setCustomId("payout_detailed_overview")

                    .setLabel("Detailed Overview")

                    .setEmoji("📄")

                    .setStyle(ButtonStyle.Secondary),

                new ButtonBuilder()

                    .setCustomId("edit_usdt_address")

                    .setLabel("Edit ID")

                    .setEmoji("<:usdt1:1504872188317012098>")

                    .setStyle(ButtonStyle.Secondary)

            );

        await interaction.reply({

            embeds: [embed],

            components: [row],

            flags: MessageFlags.Ephemeral

        });

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
         flags: MessageFlags.Ephemeral
       });

       return;
    }

    if (interaction.isStringSelectMenu() && interaction.customId === 'demographics_country') {
      const data = loadData();
      const session = data.demographicsSessions?.[interaction.user.id];

      if (!session) {
        await interaction.reply({ content: '❌ Session expired.', flags: MessageFlags.Ephemeral });
        return;
      }
 
      session.country = interaction.values[0];
      session.status = 'pending_account';
      const userRecord = ensureUser(data, interaction.member);
      ensureGlobalSocialAccountIds(userRecord);
      for (const campaignId of Object.keys(userRecord.campaignAccounts || {})) {
        ensureCampaignAccountIds(userRecord, campaignId);
      }
      saveData(data);
      const accountPage = buildDemographicsAccountSelectionPage(userRecord, 0);

      await interaction.update({
        content: accountPage.content,
        components: accountPage.components
      });

      return;
    }

    if (interaction.isButton() && interaction.customId.startsWith('demographics_account_page:')) {
      const data = loadData();
      const session = data.demographicsSessions?.[interaction.user.id];
      if (!session) return interaction.update({ content: '❌ Session expired.', components: [] });
      const userRecord = data.users?.[interaction.user.id] || { socials: [], campaignAccounts: {} };
      const page = Number(interaction.customId.split(':')[1]) || 0;
      const accountPage = buildDemographicsAccountSelectionPage(userRecord, page);
      await interaction.update({ content: accountPage.content, components: accountPage.components });
      return;
    }

    if (interaction.isStringSelectMenu() && interaction.customId === 'demographics_account') {
      const data = loadData();
      const session = data.demographicsSessions?.[interaction.user.id];

      if (!session) {
        await interaction.reply({ content: '❌ Session expired.', flags: MessageFlags.Ephemeral });
        return;
      }

      const userRecord = data.users?.[interaction.user.id] || { socials: [], campaignAccounts: {} };
      const resolved = resolveDemographicsAccountSelection(userRecord, interaction.values[0]);
      if (!resolved) {
        await interaction.update({ content: '❌ That account is no longer available. Start again.', components: [] });
        return;
      }

      session.account = resolved.identity;
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
        content: `✅ Account selected: **${formatPlatform(session.account.platform)} @${session.account.username}**\nNow select campaign.`,
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
          flags: MessageFlags.Ephemeral
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

          const staffMessage = await staffChannel.send({
            embeds: [embed],
            components: [row]
          });
          submission.staffChannelId = staffChannel.id;
          submission.staffMessageId = staffMessage.id;
          saveData(data);
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

    if (interaction.isButton() && interaction.customId.startsWith('demo_approve:')) {
      if (!isAdmin(interaction.member)) {
        return interaction.reply({ content: '❌ You are not allowed to approve demographic applications.', flags: MessageFlags.Ephemeral });
      }
      const submissionId = interaction.customId.split(':')[1];
      const submission = loadData().demographicsSubmissions?.[submissionId];
      if (!submission) {
        return interaction.reply({ content: '❌ Demographic application not found.', flags: MessageFlags.Ephemeral });
      }
      if (submission.status === 'approved') {
        return interaction.reply({ content: '❌ This demographic application has already been approved.', flags: MessageFlags.Ephemeral });
      }
      if (submission.status !== 'pending') {
        return interaction.reply({ content: '❌ This demographic application is no longer pending review.', flags: MessageFlags.Ephemeral });
      }
      const tierMenu = new StringSelectMenuBuilder()
        .setCustomId(`demographic_tier_select:${submissionId}`)
        .setPlaceholder('Choose the approved demographic tier')
        .addOptions(
          { label: 'Tier 1', value: 'Tier 1' },
          { label: 'Tier 2', value: 'Tier 2' },
          { label: 'Tier 3', value: 'Tier 3' }
        );
      await interaction.reply({
        content: 'Select the demographic tier before approving this application.',
        components: [new ActionRowBuilder().addComponents(tierMenu)],
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    if (interaction.isStringSelectMenu() && interaction.customId.startsWith('demographic_tier_select:')) {
      if (!isAdmin(interaction.member)) {
        return interaction.reply({ content: '❌ You are not allowed to approve demographic applications.', flags: MessageFlags.Ephemeral });
      }
      const submissionId = interaction.customId.split(':')[1];
      const selectedTier = interaction.values[0];
      if (!['Tier 1', 'Tier 2', 'Tier 3'].includes(selectedTier)) {
        return interaction.reply({ content: '❌ Invalid demographic tier.', flags: MessageFlags.Ephemeral });
      }

      const data = loadData();
      const submission = data.demographicsSubmissions?.[submissionId];
      if (!submission) {
        return interaction.reply({ content: '❌ Demographic application not found.', flags: MessageFlags.Ephemeral });
      }
      if (submission.status === 'approved') {
        return interaction.reply({ content: '❌ This demographic application has already been approved.', flags: MessageFlags.Ephemeral });
      }
      if (submission.status !== 'pending') {
        return interaction.reply({ content: '❌ This demographic application is no longer pending review.', flags: MessageFlags.Ephemeral });
      }

      const approvedAt = Date.now();
      const targetMember = await interaction.guild.members.fetch(submission.userId).catch(() => null);
      if (targetMember) ensureUser(data, targetMember);
      const accountApproval = applyDemographicsApprovalToAccount(data, submission, {
        tier: selectedTier,
        pageType: submission.pageType || null,
        approvedAt,
        approvedBy: interaction.user.id
      });
      if (!accountApproval.applied) {
        return interaction.update({
          content: '❌ Could not safely associate this demographics submission with one exact account. Nothing was approved.',
          components: []
        });
      }
      submission.demographicTier = selectedTier;
      submission.tierAssignedBy = interaction.user.id;
      submission.tierAssignedAt = approvedAt;
      submission.status = 'approved';
      submission.approvedBy = interaction.user.id;
      submission.approvedAt = approvedAt;

      saveData(data);
      await updateDemographicStaffReviewMessage(interaction.guild, submission, interaction.user).catch(error => {
        console.error(`Could not update demographic review ${submissionId}:`, error.message);
      });
      await sendDemographicApprovalDM(submission.userId, submission);
      await interaction.update({ content: `✅ Approved as **${selectedTier}**.`, components: [] });
      return;
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

      if (guild) {
          updateServerStats(guild);
      }

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

      if (guild) {
          updateServerStats(guild);
      }

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

      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

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
          flags: MessageFlags.Ephemeral
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
        flags: MessageFlags.Ephemeral
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

    if (interaction.isButton() && interaction.customId === "payout_detailed_overview") {
        const payments = getUserPaymentReceipts(loadData(), interaction.user.id);
        const page = 0;
        await interaction.reply({
            ...buildPaymentReceiptPage(interaction, payments, page),
            flags: MessageFlags.Ephemeral
        });
        return;
    }

    if (interaction.isButton() && interaction.customId.startsWith("payout_receipt_page:")) {
        const requestedPage = Number(interaction.customId.split(":")[1]);
        const payments = getUserPaymentReceipts(loadData(), interaction.user.id);
        const page = Math.min(Math.max(Number.isInteger(requestedPage) ? requestedPage : 0, 0), Math.max(payments.length - 1, 0));
        await interaction.update(buildPaymentReceiptPage(interaction, payments, page));
        return;
    }

    if (interaction.isButton() && interaction.customId.startsWith('global_social_link:')) {
      const returnCampaignId = interaction.customId.split(':')[1];
      await interaction.showModal(buildGlobalSocialLinkModal(returnCampaignId === 'none' ? null : returnCampaignId));
      return;
    }

    if (interaction.isButton() && interaction.customId.startsWith('global_social_link_from_view:')) {
      const returnCampaignId = interaction.customId.split(':')[1];
      await interaction.showModal(buildGlobalSocialLinkModal(returnCampaignId === 'none' ? null : returnCampaignId));
      return;
    }

    if (interaction.isButton() && interaction.customId.startsWith('global_social_link_platform:')) {
      const [, platform, returnCampaignIdValue] = interaction.customId.split(':');
      const returnCampaignId = returnCampaignIdValue === 'none' ? null : returnCampaignIdValue;
      await interaction.showModal(buildGlobalSocialLinkModal(returnCampaignId, platform));
      return;
    }

    if (interaction.isModalSubmit() && interaction.customId.startsWith('global_social_link_modal:')) {
      const modalIdParts = interaction.customId.split(':');
      const legacyPlatform = modalIdParts.length >= 3 ? normalizeTypedSocialPlatform(modalIdParts[1]) : null;
      const returnCampaignIdValue = legacyPlatform ? modalIdParts[2] : modalIdParts[1];
      const returnCampaignId = returnCampaignIdValue === 'none' ? null : returnCampaignIdValue;
      const username = normalizeUsername(interaction.fields.getTextInputValue('global_social_username'));
      const platform = legacyPlatform || normalizeTypedSocialPlatform(interaction.fields.getStringSelectValues('global_social_platform')[0]);
      if (!platform) {
        await interaction.reply({ content: 'Unsupported platform. Please enter TikTok, Instagram, or YouTube.', flags: MessageFlags.Ephemeral });
        return;
      }
      if (!username) {
        await interaction.reply({ content: '❌ Username / Handle cannot be empty.', flags: MessageFlags.Ephemeral });
        return;
      }
      const data = loadData();
      const member = await interaction.guild?.members.fetch(interaction.user.id).catch(() => null);
      if (!member) {
        await interaction.reply({ content: '❌ Could not load your server profile.', flags: MessageFlags.Ephemeral });
        return;
      }
      const userRecord = ensureUser(data, member);
      ensureUserSocials(data, interaction.user.id);
      const existingOwner = findVerifiedGlobalSocialOwner(data, platform, username, interaction.user.id);
      if (existingOwner) {
        await interaction.reply({ content: '❌ This social account is already verified to another creator.', flags: MessageFlags.Ephemeral });
        return;
      }
      const alreadyVerified = getVerifiedGlobalSocials(userRecord).find(social =>
        normalizeTypedSocialPlatform(social.platform) === platform &&
        normalizeSocialUsername(social.username) === normalizeSocialUsername(username)
      );
      if (alreadyVerified) {
        await interaction.reply({ content: `✅ @${username} is already verified on your account.`, flags: MessageFlags.Ephemeral });
        return;
      }
      const request = createGlobalSocialVerificationRequest(data, {
        userId: interaction.user.id,
        platform,
        username,
        returnCampaignId
      });
      saveData(data);
      await interaction.reply({ ...buildGlobalSocialVerificationPrompt(request), flags: MessageFlags.Ephemeral });
      return;
    }

    if (interaction.isButton() && interaction.customId.startsWith('global_social_verify:')) {
      const requestId = interaction.customId.split(':')[1];
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const data = loadData();
      const result = await verifyGlobalSocialVerificationRequest(data, requestId, {
        requestingUserId: interaction.user.id
      });
      if (!result.verified) {
        saveData(data);
        const instagramFailure = result.request?.platform === 'instagram'
          ? buildInstagramVerificationFailureResponse(result)
          : null;
        await interaction.editReply(instagramFailure || { content: `❌ ${result.message}`, embeds: [], components: [] });
        return;
      }

      const member = await interaction.guild?.members.fetch(interaction.user.id).catch(() => null);
      const autoJoin = await autoJoinReturnCampaignAfterGlobalVerification(
        data,
        interaction.guild,
        member,
        result.request
      );
      const joinedCampaign = autoJoin.joinedCampaign;
      const joinWarning = autoJoin.joinResult && !autoJoin.joinResult.ok ? autoJoin.joinResult.error : null;
      saveData(data);
      const rulesRow = joinedCampaign ? buildCampaignRulesRow(interaction.guild?.id, joinedCampaign) : null;
      if (joinedCampaign && !rulesRow) console.warn(`[Campaign Join]\nMissing rulesChannelId for ${joinedCampaign.id}`);
      if (result.social.platform === 'instagram') {
        const embeds = [buildInstagramVerificationSuccessEmbed(result.social)];
        if (joinedCampaign) {
          embeds.push(buildCampaignJoinSuccessEmbed(interaction, joinedCampaign, {
            accountReady: true,
            alreadyJoined: autoJoin.joinResult?.alreadyJoined === true
          }));
        }
        await interaction.editReply({
          content: joinWarning ? `⚠️ ${joinWarning}` : null,
          embeds,
          components: rulesRow ? [rulesRow] : []
        });
        return;
      }
      const joinedText = joinedCampaign
        ? ` and you've successfully joined **${joinedCampaign.name}**`
        : '';
      await interaction.editReply({
        content: `✅ **Account Verified**\n\nYour ${formatPlatform(result.social.platform)} account **@${result.social.username}** has been verified${joinedText}.${joinWarning ? `\n\n⚠️ ${joinWarning}` : ''}`,
        components: rulesRow ? [rulesRow] : []
      });
      return;
    }

    if (interaction.isButton() && interaction.customId === 'global_social_view') {
      const data = loadData();
      const userRecord = data.users?.[interaction.user.id] || { socials: [] };
      const identityBackfill = ensureGlobalSocialAccountIds(userRecord);
      if (data.users?.[interaction.user.id] && identityBackfill.changed) saveData(data);
      const viewPage = buildGlobalSocialViewPage(userRecord, 0, { data, userId: interaction.user.id });
      await interaction.reply({
        embeds: viewPage.embeds,
        components: viewPage.components,
        flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2
      });
      return;
    }

    if (interaction.isButton() && interaction.customId.startsWith('global_social_view_page:')) {
      const page = Number(interaction.customId.split(':')[1]) || 0;
      const data = loadData();
      const userRecord = data.users?.[interaction.user.id] || { socials: [] };
      const identityBackfill = ensureGlobalSocialAccountIds(userRecord);
      if (data.users?.[interaction.user.id] && identityBackfill.changed) saveData(data);
      const viewPage = buildGlobalSocialViewPage(userRecord, page, { data, userId: interaction.user.id });
      await interaction.update({ content: null, embeds: viewPage.embeds, components: viewPage.components });
      return;
    }

    if (interaction.isStringSelectMenu() && interaction.customId.startsWith('global_social_view_select:')) {
      const data = loadData();
      const userRecord = data.users?.[interaction.user.id] || { socials: [] };
      const identityBackfill = ensureGlobalSocialAccountIds(userRecord);
      if (data.users?.[interaction.user.id] && identityBackfill.changed) saveData(data);
      const socials = getActiveGlobalSocials(userRecord);
      const selectedIndex = socials.findIndex(social => getGlobalSocialInteractionId(social) === String(interaction.values[0]));
      if (selectedIndex < 0) return interaction.update(buildGlobalSocialViewNotice('Account Unavailable', 'This social account was not found or has already been disconnected.'));
      const viewPage = buildGlobalSocialViewPage(userRecord, selectedIndex, { data, userId: interaction.user.id });
      await interaction.update({ content: null, embeds: viewPage.embeds, components: viewPage.components });
      return;
    }

    if (interaction.isButton() && interaction.customId.startsWith('global_social_view_options_page:')) {
      const optionPage = Math.max(Number(interaction.customId.split(':')[1]) || 0, 0);
      const data = loadData();
      const userRecord = data.users?.[interaction.user.id] || { socials: [] };
      const identityBackfill = ensureGlobalSocialAccountIds(userRecord);
      if (data.users?.[interaction.user.id] && identityBackfill.changed) saveData(data);
      const viewPage = buildGlobalSocialViewPage(userRecord, optionPage * 25, { data, userId: interaction.user.id });
      await interaction.update({ content: null, embeds: viewPage.embeds, components: viewPage.components });
      return;
    }

    if (interaction.isButton() && interaction.customId.startsWith('global_social_disconnect:')) {
      const [, socialInteractionId, pageValue] = interaction.customId.split(':');
      const data = loadData();
      const userRecord = data.users?.[interaction.user.id];
      const social = findGlobalSocialByInteractionId(userRecord, socialInteractionId, { activeOnly: true });
      if (!social) return interaction.update(buildGlobalSocialViewNotice('Account Unavailable', 'This social account was not found or has already been disconnected.'));
      await interaction.update(buildGlobalSocialRemoveConfirmation(social, { fromView: true, page: Number(pageValue) || 0 }));
      return;
    }

    if (interaction.isButton() && interaction.customId.startsWith('global_social_disconnect_confirm:')) {
      const [, socialInteractionId, pageValue] = interaction.customId.split(':');
      const data = loadData();
      const userRecord = data.users?.[interaction.user.id];
      const social = findGlobalSocialByInteractionId(userRecord, socialInteractionId, { activeOnly: true });
      const removal = social ? removeGlobalSocialAccount(userRecord, social.id, interaction.user.id) : { removed: false };
      if (!removal.removed) return interaction.update(buildGlobalSocialViewNotice('Account Unavailable', 'This social account was not found or has already been disconnected.'));
      saveData(data);
      const viewPage = buildGlobalSocialViewPage(userRecord, Number(pageValue) || 0, { data, userId: interaction.user.id });
      await interaction.update({
        content: null,
        embeds: viewPage.embeds,
        components: viewPage.components
      });
      return;
    }

    if (interaction.isButton() && interaction.customId === 'global_social_remove') {
      const data = loadData();
      const userRecord = data.users?.[interaction.user.id] || { socials: [] };
      const identityBackfill = ensureGlobalSocialAccountIds(userRecord);
      if (data.users?.[interaction.user.id] && identityBackfill.changed) saveData(data);
      const removePage = buildGlobalSocialRemovePage(userRecord);
      await interaction.reply({
        content: removePage.content,
        embeds: removePage.embeds,
        components: removePage.components,
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    if (interaction.isButton() && interaction.customId.startsWith('global_social_remove_page:')) {
      const page = Number(interaction.customId.split(':')[1]) || 0;
      const data = loadData();
      const userRecord = data.users?.[interaction.user.id] || { socials: [] };
      const identityBackfill = ensureGlobalSocialAccountIds(userRecord);
      if (data.users?.[interaction.user.id] && identityBackfill.changed) saveData(data);
      const removePage = buildGlobalSocialRemovePage(userRecord, page);
      await interaction.update({ content: removePage.content, embeds: removePage.embeds, components: removePage.components });
      return;
    }

    if (interaction.isStringSelectMenu() && interaction.customId.startsWith('global_social_remove_select:')) {
      const data = loadData();
      const userRecord = data.users?.[interaction.user.id];
      const social = findGlobalSocialByInteractionId(userRecord, interaction.values[0], { activeOnly: true });
      if (!social) {
        await interaction.update({ content: '❌ Social account not found or already unlinked.', embeds: [], components: [] });
        return;
      }
      await interaction.update(buildGlobalSocialRemoveConfirmation(social));
      return;
    }

    if (interaction.isButton() && interaction.customId.startsWith('global_social_remove_confirm:')) {
      const socialInteractionId = interaction.customId.slice('global_social_remove_confirm:'.length);
      const data = loadData();
      const userRecord = data.users?.[interaction.user.id];
      const social = findGlobalSocialByInteractionId(userRecord, socialInteractionId, { activeOnly: true });
      const removal = social
        ? removeGlobalSocialAccount(userRecord, social.id, interaction.user.id)
        : { removed: false };
      if (!removal.removed) {
        await interaction.update({ content: '❌ Social account not found or already unlinked.', embeds: [], components: [] });
        return;
      }
      saveData(data);
      await interaction.update({
        content: `✅ Unlinked **${formatPlatform(removal.social.platform)} @${removal.social.username}**. Historical clips, payments, and analytics were preserved.`,
        embeds: [],
        components: []
      });
      return;
    }

    if (interaction.isButton() && interaction.customId === 'global_social_remove_cancel') {
      await interaction.update({ content: 'Account removal cancelled.', embeds: [], components: [] });
      return;
    }

    if (interaction.isButton() && interaction.customId.startsWith('campaign_connect_view:')) {
      const campaignId = interaction.customId.split(':')[1];
      const campaign = CAMPAIGNS[campaignId];

      if (!campaign) {
        await interaction.reply({ content: '❌ Campaign not found.', flags: MessageFlags.Ephemeral });
        return;
      }

      const data = loadData();
      const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);

      if (!member) {
        await interaction.reply({ content: '❌ Could not load your account.', flags: MessageFlags.Ephemeral });
        return;
      }

      const userRecord = ensureUser(data, member);
      const viewPage = buildCampaignAccountViewPage(userRecord, campaign, 0, { data, userId: interaction.user.id });
      await interaction.reply({
        embeds: viewPage.embeds,
        components: viewPage.components,
        flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2
      });

      return;
    }

    if (interaction.isButton() && interaction.customId.startsWith('campaign_connect_view_page:')) {
      const [, campaignId, pageValue] = interaction.customId.split(':');
      const campaign = CAMPAIGNS[campaignId];
      if (!campaign) return interaction.update(buildCampaignAccountViewNotice('Campaign Unavailable', 'This campaign could not be found.'));
      const data = loadData();
      const userRecord = data.users?.[interaction.user.id] || { campaignAccounts: {} };
      const viewPage = buildCampaignAccountViewPage(userRecord, campaign, Number(pageValue) || 0, { data, userId: interaction.user.id });
      await interaction.update({ content: null, embeds: viewPage.embeds, components: viewPage.components });
      return;
    }

    if (interaction.isStringSelectMenu() && interaction.customId.startsWith('campaign_connect_view_select:')) {
      const [, campaignId] = interaction.customId.split(':');
      const campaign = CAMPAIGNS[campaignId];
      if (!campaign) return interaction.update(buildCampaignAccountViewNotice('Campaign Unavailable', 'This campaign could not be found.'));
      const [platform, accountId] = interaction.values[0].split('|');
      const data = loadData();
      const userRecord = data.users?.[interaction.user.id] || { campaignAccounts: {} };
      const accounts = getAllCampaignAccounts(userRecord, campaignId, { activeOnly: true });
      const page = accounts.findIndex(account =>
        account.platform === platform &&
        getCampaignAccountStableId(account.source, campaignId, account.platform) === accountId
      );
      if (page < 0) return interaction.update(buildCampaignAccountViewNotice('Account Unavailable', 'This campaign account was not found or has already been disconnected.'));
      const viewPage = buildCampaignAccountViewPage(userRecord, campaign, page, { data, userId: interaction.user.id });
      await interaction.update({ content: null, embeds: viewPage.embeds, components: viewPage.components });
      return;
    }

    if (interaction.isButton() && interaction.customId.startsWith('campaign_connect_view_options_page:')) {
      const [, campaignId, optionPageValue] = interaction.customId.split(':');
      const campaign = CAMPAIGNS[campaignId];
      if (!campaign) return interaction.update(buildCampaignAccountViewNotice('Campaign Unavailable', 'This campaign could not be found.'));
      const data = loadData();
      const userRecord = data.users?.[interaction.user.id] || { campaignAccounts: {} };
      const accountPage = Math.max(0, (Number(optionPageValue) || 0) * 25);
      const viewPage = buildCampaignAccountViewPage(userRecord, campaign, accountPage, { data, userId: interaction.user.id });
      await interaction.update({ content: null, embeds: viewPage.embeds, components: viewPage.components });
      return;
    }

    if (interaction.isButton() && interaction.customId.startsWith('campaign_connect_disconnect:')) {
      const [, campaignId, platform, accountId, pageValue] = interaction.customId.split(':');
      const campaign = CAMPAIGNS[campaignId];
      if (!campaign) return interaction.update(buildCampaignAccountViewNotice('Campaign Unavailable', 'This campaign could not be found.'));
      const data = loadData();
      const userRecord = data.users?.[interaction.user.id];
      const account = getCampaignAccountCandidates(userRecord, campaignId, platform, { activeOnly: true })
        .find(candidate => getCampaignAccountStableId(candidate, campaignId, platform) === accountId);
      if (!account) return interaction.update(buildCampaignAccountViewNotice('Account Unavailable', 'This campaign account was not found or has already been disconnected.'));
      await interaction.update(buildCampaignAccountDisconnectConfirmation(campaign, { ...account, platform }, Number(pageValue) || 0));
      return;
    }

    if (interaction.isButton() && interaction.customId.startsWith('campaign_connect_disconnect_confirm:')) {
      const [, campaignId, platform, accountId, pageValue] = interaction.customId.split(':');
      const campaign = CAMPAIGNS[campaignId];
      if (!campaign) return interaction.update(buildCampaignAccountViewNotice('Campaign Unavailable', 'This campaign could not be found.'));
      const data = loadData();
      const removal = removeCampaignAccount({
        data,
        userId: interaction.user.id,
        campaignId,
        platform,
        accountId,
        removedBy: interaction.user.id
      });
      if (!removal.removed) return interaction.update(buildCampaignAccountViewNotice('Account Unavailable', 'This campaign account was not found or has already been disconnected.'));
      saveData(data);
      const userRecord = data.users?.[interaction.user.id] || { campaignAccounts: {} };
      const nextPage = Math.min(Math.max(Number(pageValue) || 0, 0), Math.max(0, getAllCampaignAccounts(userRecord, campaignId, { activeOnly: true }).length - 1));
      const viewPage = buildCampaignAccountViewPage(userRecord, campaign, nextPage, { data, userId: interaction.user.id });
      await interaction.update({ content: null, embeds: viewPage.embeds, components: viewPage.components });
      return;
    }

    if (interaction.isButton() && interaction.customId.startsWith('campaign_status:')) {
      const campaignId = interaction.customId.split(':')[1];
      const campaign = CAMPAIGNS[campaignId];

      if (!campaign) {
        await interaction.reply({
          content: '❌ Campaign not found.',
          flags: MessageFlags.Ephemeral
        });
        return;
      }

      const data = loadData();
      const embed = buildCampaignStatusEmbed(campaign, data);

      await interaction.reply({
        embeds: [embed],
        flags: MessageFlags.Ephemeral
      });

      return;
    }

    if (interaction.isButton() && interaction.customId.startsWith('campaign_connect_link:')) {
      const campaignId = interaction.customId.split(':')[1];
      const campaign = CAMPAIGNS[campaignId];

      if (!campaign) {
        await interaction.reply({ content: '❌ Campaign not found.', flags: MessageFlags.Ephemeral });
        return;
      }

      await interaction.showModal(buildCampaignAccountLinkModal(campaign));

      return;
    }

    if (interaction.isStringSelectMenu() && interaction.customId.startsWith('campaign_connect_platform:')) {
      const campaignId = interaction.customId.split(':')[1];
      const platform = interaction.values[0];
      const campaign = CAMPAIGNS[campaignId];
 
      if (!campaign) {
        await interaction.reply({ content: '❌ Campaign not found.', flags: MessageFlags.Ephemeral });
        return;
      }

      await interaction.showModal(buildCampaignAccountLinkModal(campaign, platform));
      return;
    }

    if (interaction.isModalSubmit() && interaction.customId.startsWith('campaign_connect_modal:')) {
      const [, campaignId, legacyPlatform] = interaction.customId.split(':');
      const campaign = CAMPAIGNS[campaignId];

      if (!campaign) {
        await interaction.reply({ content: '❌ Campaign not found.', flags: MessageFlags.Ephemeral });
        return;
      }

      const platform = normalizeTypedSocialPlatform(legacyPlatform || interaction.fields.getStringSelectValues('campaign_social_platform')[0]);
      const username = normalizeUsername(
        interaction.fields.getTextInputValue('campaign_username')
      );

      if (!username) {
        await interaction.reply({ content: '❌ Username cannot be empty.', flags: MessageFlags.Ephemeral });
        return;
      }

      const data = loadData();
      const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);

      if (!member) {
        await interaction.reply({ content: '❌ User not found.', flags: MessageFlags.Ephemeral });
        return;
      }

      const userRecord = ensureUser(data, member);
      
      const validation = validateAccountSubmission(
        interaction.user.id, 
        campaignId, 
        platform, 
        username,
        data
      );

      if (!validation.isValid) {
        return await interaction.reply({ content: validation.message, flags: MessageFlags.Ephemeral });
      }

      // --- FIX START: ALLOW MULTIPLE ACCOUNTS, ONLY BLOCK EXPLICIT DUPLICATES ---
      const cleanInputUsername = username.trim().toLowerCase().replace(/^@/, '');
      
      let handleExistsGlobally = false;
      let claimedBySomeoneElse = false;

      // 1. Scan all existing users in the database to check handles safely
      for (const [userId, record] of Object.entries(data.users || {})) {
        // Historical campaignStats do not represent an actively linked account.
        const campaignAccounts = getCampaignAccountCandidates(record, campaignId, platform, { activeOnly: true });
        for (const account of campaignAccounts) {
          const savedName = normalizeSocialUsername(account.username);
          if (savedName === normalizeSocialUsername(cleanInputUsername)) {
            handleExistsGlobally = true;
            if (userId !== interaction.user.id) {
              claimedBySomeoneElse = true;
            }
            break;
          }
        }
        if (handleExistsGlobally) break;
      }

      // 2. Scan active staff request items so users cannot submit the same handle twice concurrently
      const activeRequests = Object.values(data.campaignAccountRequests || {});
      const duplicatePending = activeRequests.find(req => {
        const status = String(req?.status || '').toLowerCase();
        return req.campaignId === campaignId &&
          req.platform === platform &&
          normalizeSocialKey(req.platform, req.username) === normalizeSocialKey(platform, cleanInputUsername) &&
          ACTIVE_ACCOUNT_REQUEST_STATUSES.has(status) &&
          (status !== 'approved' || isApprovedAccountRequestStillLinked(data, req));
      });

      // Rule Check A: Stolen account
      if (handleExistsGlobally && claimedBySomeoneElse) {
        await interaction.reply({
          content: `❌ The account **@${username}** has already been linked by another creator.`,
          flags: MessageFlags.Ephemeral
        });
        return;
      }

      // Rule Check B: User duplicate linking attempt
      if ((handleExistsGlobally && !claimedBySomeoneElse) || duplicatePending) {
        await interaction.reply({
          content: `❌ You have already linked or submitted a pending request for **@${username}**!`,
          flags: MessageFlags.Ephemeral
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

       // 2. Fetch staff channel mapping for this campaign
      const campaignStaffMap = data.campaignStaffChannels?.[campaignId];

      // 3. Fallback check for linkAccount (supports both data.json and static campaign fallback)
      const staffChannelId = campaignStaffMap?.linkAccount 
          || campaignStaffMap?.accountLinking 
          || campaign?.staffChannels?.linkAccount 
          || campaign?.staffChannelId;

      const staffChannel = interaction.guild.channels.cache.get(staffChannelId);

      if (!staffChannel) {
          return interaction.reply({ content: '❌ Staff channel not found.', flags: MessageFlags.Ephemeral });
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
        flags: MessageFlags.Ephemeral
      });

      return;
    }

    if (interaction.isButton() && interaction.customId.startsWith('campaign_staff_send_code:')) {
      if (!interaction.guild || !isAdmin(interaction.member)) {
        await interaction.reply({ content: '❌ You are not allowed to do this.', flags: MessageFlags.Ephemeral });
        return;
      }

      const requestId = interaction.customId.split(':')[1];
      const data = loadData();
      const request = data.campaignAccountRequests[requestId];

      if (!request) {
        await interaction.reply({ content: '❌ Request not found.', flags: MessageFlags.Ephemeral });
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
        await interaction.reply({ content: '❌ You are not allowed to do this.', flags: MessageFlags.Ephemeral });
        return;
      }

      const requestId = interaction.customId.split(':')[1];
      const data = loadData();
      const request = data.campaignAccountRequests[requestId];

      if (!request) {
        await interaction.reply({ content: '❌ Request not found.', flags: MessageFlags.Ephemeral });
        return;
      }

      const code = interaction.fields.getTextInputValue('campaign_staff_code_input').trim();

      // Update state data
      request.bioCode = code;
      request.status = 'waiting_confirm';
      request.staffChannelId = interaction.channelId; // 🟢 Save staff channel ID
      request.staffMessageId = interaction.message?.id || request.messageId; // 🟢 Save staff message ID
      data.campaignAccountRequests[requestId] = request;
      saveData(data);

      // 1. Send DM to user with confirmation button
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

      // 2. 🟢 UPDATE THE STAFF MESSAGE BUTTON IN #link-accounts TO "Waiting for User"
      const waitingRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('waiting_btn')
          .setLabel('⏳ Waiting for User...')
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(true)
      );

      if (interaction.message) {
        await interaction.update({ components: [waitingRow] });
        await interaction.followUp({ content: `✅ Bio code sent to <@${request.userId}> via DM.`, flags: MessageFlags.Ephemeral });
      } else {
        await updateCampaignAccountStaffMessage(interaction.guild, request);
        await interaction.reply({ content: `✅ Bio code sent to <@${request.userId}> via DM.`, flags: MessageFlags.Ephemeral });
      }

      return;
    }

    if (interaction.isButton() && interaction.customId.startsWith('campaign_open_code:')) {
      const requestId = interaction.customId.split(':')[1];
      const data = loadData();
      const request = data.campaignAccountRequests[requestId];

      if (!request) {
        await interaction.reply({ content: '❌ Request not found.', flags: MessageFlags.Ephemeral });
        return;
      }

      if (interaction.user.id !== request.userId) {
        await interaction.reply({ content: '❌ This code is not for you.', flags: MessageFlags.Ephemeral });
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
        flags: MessageFlags.Ephemeral
      });

      return;
    }

    // ==========================================
    // 📩 USER DM CONFIRMATION HANDLER
    // ==========================================
    if (interaction.isButton() && interaction.customId.startsWith('campaign_user_confirm:')) {
      const requestId = interaction.customId.split(':')[1];
      const data = loadData();
      const request = data.campaignAccountRequests[requestId];

      if (!request) {
        await interaction.reply({ content: '❌ Account verification request not found or expired.', flags: MessageFlags.Ephemeral });
        return;
      }

      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      // 1. Update status to trigger Accept/Reject buttons
      request.status = 'ready_for_review';
      data.campaignAccountRequests[requestId] = request;
      saveData(data);

      // 2. Fetch target guild and update staff channel message in #link-accounts
      const guild = interaction.client.guilds.cache.get(process.env.GUILD_ID);

      if (guild) {
        await updateCampaignAccountStaffMessage(guild, request);
      } else {
        console.error("⚠️ Could not locate main guild during DM user confirmation.");
      }

      // 3. Confirm back to user in DM
      await interaction.editReply({
        content: '✅ **Bio Code Confirmed!**\n\nStaff has been notified and will review your profile bio shortly. You will receive a DM once your account is approved.'
      });

      return;
    }

    if (interaction.isButton() && interaction.customId.startsWith('campaign_staff_accept:')) {
      if (!interaction.guild || !isAdmin(interaction.member)) {
        await interaction.reply({ content: '❌ You are not allowed to do this.', flags: MessageFlags.Ephemeral });
        return;
      }

      const requestId = interaction.customId.split(':')[1];
      const data = loadData();
      const request = data.campaignAccountRequests[requestId];

      if (!request) {
        await interaction.reply({ content: '❌ Request not found.', flags: MessageFlags.Ephemeral });
        return;
      }

      const member = await interaction.guild.members.fetch(request.userId).catch(() => null);
      if (!member) {
        await interaction.reply({ content: '❌ User not found in server.', flags: MessageFlags.Ephemeral });
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

      saveData(data);
     
      // 🟢 Fixed app.userId reference error -> request.userId
      console.log("Approved user:", request.userId);
      console.log(JSON.stringify(data.users[request.userId], null, 2));
     
      await updateCampaignAccountStaffMessage(interaction.guild, request);
     
      await member.send({
        embeds: [buildCampaignAccountApprovedEmbed(request)],
        components: []
      }).catch(() => {});

      await interaction.reply({
        content: `✅ Approved **${formatPlatform(request.platform)}** account **@${request.username}** for **${request.campaignName}**.`,
        flags: MessageFlags.Ephemeral
      });

      return;
    }

    if (interaction.isButton() && interaction.customId.startsWith('campaign_staff_reject:')) {
        if (!interaction.guild || !isAdmin(interaction.member)) {
            return interaction.reply({ content: '❌ You are not allowed to do this.', flags: MessageFlags.Ephemeral });
        }

        const requestId = interaction.customId.split(':')[1];

        const modal = new ModalBuilder()
            .setCustomId(`campaign_staff_reject_modal:${requestId}`)
            .setTitle('Account Rejection Reason');

        modal.addComponents(
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId('campaign_reject_reason_input')
                    .setLabel('Reason for Rejection')
                    .setPlaceholder('e.g. Bio code was not found, account is private, etc.')
                    .setStyle(TextInputStyle.Paragraph)
                    .setRequired(true)
            )
        );

        await interaction.showModal(modal);
        return;
    }

    if (interaction.isModalSubmit() && interaction.customId.startsWith('campaign_staff_reject_modal:')) {
        if (!interaction.guild || !isAdmin(interaction.member)) {
            return interaction.reply({ content: '❌ You are not allowed to do this.', flags: MessageFlags.Ephemeral });
        }

        const requestId = interaction.customId.split(':')[1];
        const data = loadData();
        const request = data.campaignAccountRequests[requestId];

        if (!request) {
            return interaction.reply({ content: '❌ Request not found.', flags: MessageFlags.Ephemeral });
        }

        const reason = interaction.fields.getTextInputValue('campaign_reject_reason_input').trim();

        request.status = 'rejected';
        request.rejectReason = reason;
        data.campaignAccountRequests[requestId] = request;
        saveData(data);

        // Update staff message components to show rejected state
        const rejectedRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('rejected_btn')
                .setLabel('❌ Account Rejected')
                .setStyle(ButtonStyle.Danger)
                .setDisabled(true)
        );

        const updatedEmbed = EmbedBuilder.from(interaction.message ? interaction.message.embeds[0] : {})
            .setColor('#EF4444')
            .addFields({ name: '❌ Rejection Reason', value: reason, inline: false });

        if (interaction.message) {
            await interaction.update({ embeds: [updatedEmbed], components: [rejectedRow] });
        } else {
        await interaction.reply({ content: `❌ Account request rejected with reason: "${reason}"`, flags: MessageFlags.Ephemeral });
        }

        // Send creator-facing account decision without changing campaign membership.
        const targetMember = await interaction.guild.members.fetch(request.userId).catch(() => null);
        if (targetMember) {
            const campaign = CAMPAIGNS[request.campaignId];
            const connectAccountRow = buildCampaignConnectAccountRow(
                interaction.guild.id,
                campaign || { id: request.campaignId },
                { label: 'Connect Another Account' }
            );
            await targetMember.send({
                embeds: [buildCampaignAccountRejectedEmbed(request, reason)],
                components: connectAccountRow ? [connectAccountRow] : []
            }).catch(() => {});
        }

        return interaction.followUp({ content: `❌ Rejected account request for <@${request.userId}>. Reason: "${reason}"`, flags: MessageFlags.Ephemeral });
    }

    if (interaction.isButton() && interaction.customId.startsWith('campaign_connect_remove:')) {
      const campaignId = interaction.customId.split(':')[1];
      const campaign = CAMPAIGNS[campaignId];

      if (!campaign) {
        return interaction.reply({ content: '❌ Campaign not found.', flags: MessageFlags.Ephemeral });
      }

      const data = loadData();
      const userRecord = data.users?.[interaction.user.id];
      const idsChanged = ensureCampaignAccountIds(userRecord, campaignId);
      if (idsChanged) saveData(data);
      const removePage = buildCampaignAccountRemovePage(userRecord, campaign);
      await interaction.reply({
        content: removePage.content,
        components: removePage.components,
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    if (interaction.isButton() && interaction.customId.startsWith('campaign_connect_remove_page:')) {
      const [, campaignId, pageValue] = interaction.customId.split(':');
      const campaign = CAMPAIGNS[campaignId];
      if (!campaign) return interaction.update({ content: '❌ Campaign not found.', components: [] });
      const data = loadData();
      const userRecord = data.users?.[interaction.user.id];
      if (ensureCampaignAccountIds(userRecord, campaignId)) saveData(data);
      const removePage = buildCampaignAccountRemovePage(userRecord, campaign, Number(pageValue) || 0);
      await interaction.update({ content: removePage.content, components: removePage.components });
      return;
    }

    if (interaction.isStringSelectMenu() && interaction.customId.startsWith('campaign_connect_remove_select:')) {
      const campaignId = interaction.customId.split(':')[1];
      const [platform, accountId] = interaction.values[0].split('|');

      const data = loadData();
      const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);

      if (!member) {
        await interaction.reply({ content: '❌ Could not load your account.', flags: MessageFlags.Ephemeral });
        return;
      }

      const removal = removeCampaignAccount({
        data,
        userId: interaction.user.id,
        campaignId,
        platform,
        accountId,
        removedBy: interaction.user.id
      });

      if (!removal.removed) {
        await interaction.reply({ content: '❌ Campaign account not found.', flags: MessageFlags.Ephemeral });
        return;
      }

      saveData(data);

      await interaction.reply({
        content: `✅ Removed **${formatPlatform(platform)}** account **@${removal.username}** from this campaign.`,
        flags: MessageFlags.Ephemeral
      });

      return;
    }

    if (interaction.isButton() && interaction.customId.startsWith('submit_clip:')) {
      const campaignId = interaction.customId.split(':')[1];
      const campaign = CAMPAIGNS[campaignId];

      if (!campaign) {
        await interaction.reply({ content: '❌ Campaign not found.', flags: MessageFlags.Ephemeral });
        return;
      }

      const data = loadData();
      const campaignState = getCampaignOperationalState(data, campaign);
      const submissionBlockMessage = getCampaignSubmissionBlockMessage(campaignState);
      if (submissionBlockMessage) {
        if (interaction.message && messageHasCampaignSubmitButton(interaction.message, campaignId)) {
          await interaction.message.edit({ components: buildCampaignSubmissionPanelComponents(campaign, data) }).catch(() => {});
        }
        await interaction.reply({ content: submissionBlockMessage, flags: MessageFlags.Ephemeral });
        return;
      }
      const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);

      if (!member) {
        await interaction.reply({ content: '❌ Could not load your account.', flags: MessageFlags.Ephemeral });
        return;
      }

      const userRecord = ensureUser(data, member);
      if (getCampaignAccountMode(campaign) === 'global_auto_verify' && !userRecord.campaigns?.includes(campaignId)) {
        await interaction.reply({ content: '❌ Join this campaign before submitting clips.', flags: MessageFlags.Ephemeral });
        return;
      }
      const accountIdsChanged = getCampaignAccountMode(campaign) === 'global_auto_verify'
        ? ensureGlobalSocialAccountIds(userRecord).changed
        : ensureCampaignAccountIds(userRecord, campaignId);
      if (accountIdsChanged) saveData(data);
      const submissionAccounts = getCampaignSubmissionAccounts(userRecord, campaign);
      if (submissionAccounts.length === 0) {
        const connectButtonRow = buildSubmissionAccountConnectRow(interaction.guild.id, campaign);
        await interaction.reply({
          content: '❌ You need to connect and verify at least one eligible account before submitting clips.',
          components: connectButtonRow ? [connectButtonRow] : [],
          flags: MessageFlags.Ephemeral
        });
        return;
      }

      await interaction.showModal(buildSubmitClipModal(campaignId));
      return;
    }

    if (interaction.isModalSubmit() && interaction.customId.startsWith('submit_clip_modal:')) {
        const [, campaignId] = interaction.customId.split(':');
        const campaign = CAMPAIGNS[campaignId];

        if (!campaign) {
            await interaction.reply({ content: '❌ Campaign not found.', flags: MessageFlags.Ephemeral });
            return;
        }

        const data = loadData();
        const submissionBlockMessage = getCampaignSubmissionBlockMessage(getCampaignOperationalState(data, campaign));
        if (submissionBlockMessage) {
            await interaction.reply({ content: submissionBlockMessage, flags: MessageFlags.Ephemeral });
            return;
        }

        const rawLinks = interaction.fields.getTextInputValue('clip_links');
        const links = extractLinksFromText(rawLinks);

        if (links.length === 0) {
            await interaction.reply({ content: '❌ Please paste at least one link.', flags: MessageFlags.Ephemeral });
            return;
        } 

        if (links.length > 20) {
            await interaction.reply({ content: '❌ You can submit up to 20 links at once.', flags: MessageFlags.Ephemeral });
            return;
        }

        const invalidLinks = links.filter(link => !isValidUrl(link));
        if (invalidLinks.length > 0) {
            await interaction.reply({
                content: `❌ Some links are invalid.\n\nFirst invalid link:\n${invalidLinks[0]}`,
                flags: MessageFlags.Ephemeral
            });
            return;
        }

        const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);

        if (!member) {
            await interaction.reply({ content: '❌ User not found.', flags: MessageFlags.Ephemeral });
            return;
        }

        const userRecord = ensureUser(data, member);
        if (getCampaignAccountMode(campaign) === 'global_auto_verify' && !userRecord.campaigns?.includes(campaignId)) {
            await interaction.reply({ content: '❌ Join this campaign before submitting clips.', flags: MessageFlags.Ephemeral });
            return;
        }

        let submittedCount = 0;
        let duplicateCount = 0;
        const rejectedResults = [];
        const batchVideoKeys = new Set();

        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        for (const originalLink of links) {
            const validation = await validateClipBeforeSubmission({
                data,
                userId: interaction.user.id,
                campaignId,
                submittedUrl: originalLink
            });

            if (!validation.valid) {
                if (validation.code === 'DUPLICATE_CLIP') duplicateCount++;
                else {
                    const validationResponse = buildClipSubmissionValidationResponse(interaction.guild.id, campaign, validation);
                    rejectedResults.push({
                        link: originalLink,
                        reason: validation.message || 'Validation failed.',
                        responseEmbed: validation.responseEmbed || validationResponse?.embed || null,
                        responseComponents: validationResponse?.components || []
                    });
                }
                continue;
            }

            const videoKey = getClipVideoKey(validation.platform, validation.videoId);
            if (videoKey && batchVideoKeys.has(videoKey)) {
                duplicateCount++;
                continue;
            }
            if (videoKey) batchVideoKeys.add(videoKey);

            const metadata = validation.metadata;
            const matchedAccount = validation.matchedAccount;
            const matchedAccountId = String(matchedAccount.id);
            const matchedUsername = matchedAccount.username || validation.authorIdentity?.authorUsername || metadata.authorUsername || metadata.authorDisplayName;
            const platformStats = ensureCampaignPlatformStats(userRecord, campaignId, validation.platform, matchedUsername);
            const campaignStaffMap = data.campaignStaffChannels?.[campaignId];
            const targetChannelId = campaignStaffMap?.[validation.platform] || campaign.staffChannelId;
            const staffChannel = interaction.guild.channels.cache.get(targetChannelId);
            const clipId = makeClipId();
            const submittedTimestamp = Date.now();
            const payoutCycle = getCampaignPayoutCycle(campaign, { now: submittedTimestamp });
            const submissionBudgetCycle = isStraightCampaign(campaign)
                ? null
                : getCampaignBudgetCycleIndex(campaign, new Date(submittedTimestamp));
            const initialViewState = getInitialSubmissionViewState(metadata, campaign);
            const publicViews = initialViewState.publicViews;
            const fetchedLikes = Number(metadata?.likes);
            const fetchedComments = Number(metadata?.comments ?? metadata?.commentCount ?? metadata?.commentsCount);
            const currentViews = initialViewState.currentViews;
            const initialCreditedViews = initialViewState.views;
            const estimatedEarnings = initialCreditedViews / 1000000 * (Number(campaign.ratePerMillion) || 0);
            const clip = {
                id: clipId,
                userId: interaction.user.id,
                campaignId,
                campaignName: campaign.name,
                platform: validation.platform,
                username: matchedUsername,
                socialId: getCampaignAccountMode(campaign) === 'global_auto_verify' ? matchedAccountId : null,
                globalSocialId: getCampaignAccountMode(campaign) === 'global_auto_verify' ? matchedAccountId : null,
                campaignAccountId: getCampaignAccountMode(campaign) === 'campaign_staff_code' ? matchedAccountId : null,
                url: validation.canonicalUrl,
                videoUrl: validation.canonicalUrl,
                originalSubmittedUrl: originalLink,
                videoId: validation.videoId,
                authorUsername: validation.authorIdentity?.authorUsername || metadata.authorUsername || null,
                normalizedAuthorUsername: validation.authorIdentity?.normalizedAuthorUsername || null,
                platformAccountId: validation.authorIdentity?.platformAccountId || null,
                platformAuthorId: metadata.authorId || null,
                platformAuthorName: metadata.authorUsername || metadata.authorDisplayName || null,
                durationSeconds: Number.isFinite(Number(metadata.durationSeconds)) ? Number(metadata.durationSeconds) : null,
                publishedAt: metadata.publishedAt || null,
                publishedTimestamp: metadata.publishedTimestamp || null,
                title: metadata.title || validation.canonicalUrl,
                thumbnailUrl: metadata.thumbnailUrl || null,
                ...(Number.isFinite(fetchedLikes) && fetchedLikes >= 0 ? { likes: fetchedLikes } : {}),
                ...(Number.isFinite(fetchedComments) && fetchedComments >= 0 ? { comments: fetchedComments } : {}),
                publicViews,
                currentViews,
                submissionViews: publicViews,
                views: initialCreditedViews,
                campaignCreditedViews: initialViewState.campaignCreditedViews,
                budgetTracking: campaign.separateEarningLifecycle ? {
                    budgetCycleKey: getCampaignBudgetCycleKey(campaign, new Date(submittedTimestamp)),
                    baselinePublicViews: publicViews,
                    lastPublicViews: publicViews,
                    creditedViewsThisCycle: 0,
                    pausedBaselineViews: null,
                    initializedAt: submittedTimestamp,
                    runLedgerCompleteFor: getCampaignEarningRunKey(campaign)
                } : undefined,
                straightTracking: isStraightCampaign(campaign) ? {
                    baselinePublicViews: publicViews,
                    lastPublicViews: publicViews,
                    creditedViews: 0,
                    baselinePending: false,
                    initializedAt: submittedTimestamp
                } : undefined,
                estimatedEarnings,
                status: 'pending',
                payoutEligible: false,
                wasEverApproved: false,
                submittedTimestamp,
                budgetCycleIndex: submissionBudgetCycle,
                earningRunKey: payoutCycle?.earningRunKey,
                payoutCycleStartAt: payoutCycle?.cycleStartAt || null,
                payoutCycleEndAt: payoutCycle?.cycleEndAt || null,
                trackingStatus: campaign.separateEarningLifecycle || isStraightCampaign(campaign) ? 'active' : undefined,
                budgetCycleSubmittedAt: submittedTimestamp,
                submittedAt: new Date(submittedTimestamp).toISOString(),
                createdAt: new Date(submittedTimestamp).toISOString(),
                lastChecked: submittedTimestamp,
                nextCheckAt: submittedTimestamp + CLIP_TRACK_INTERVAL_MS,
                cycle: isStraightCampaign(campaign) ? undefined : getCampaignCycle(campaign, new Date()),
                staffChannelId: staffChannel ? staffChannel.id : null,
                staffMessageId: null,
                payout: { paidViews: 0, paidMoney: 0, lastPaidAt: null, history: [] }
            };
            ensureClipPayoutLimitSnapshot(clip, campaign, data);

            data.clipReviews ||= {};
            if (!staffChannel) {
                rejectedResults.push({ link: originalLink, reason: '❌ Staff review channel is unavailable. Please try again.' });
                continue;
            }
            try {
                const staffMessage = await staffChannel.send({
                    embeds: [buildClipStaffEmbed(clip)],
                    components: buildClipStaffButtons(clip)
                });
                clip.staffChannelId = staffChannel.id;
                clip.staffMessageId = staffMessage.id;
            } catch (error) {
                console.error(`Could not create staff review message for ${clipId}:`, error.message);
                rejectedResults.push({ link: originalLink, reason: '❌ The clip was verified, but its staff review message could not be created. Please try again.' });
                continue;
            }

            initializeClipTrackingFields(clip);
            data.clipReviews[clipId] = clip;
            platformStats.videosPosted++;
            userRecord.stats.videosPosted++;
            submittedCount++;
        }

        saveData(data);

        let responseMessage = '✅ **Accepted:** ' + submittedCount + '\n⚠️ **Duplicates:** ' + duplicateCount + '\n❌ **Rejected:** ' + rejectedResults.length;
        if (rejectedResults.length) {
            responseMessage += '\n\n**Rejected links:**\n' + rejectedResults.slice(0, 5).map((item, index) => (index + 1) + '. ' + item.reason).join('\n');
        }
        if (rejectedResults.length > 5) responseMessage += '\n…and ' + (rejectedResults.length - 5) + ' more.';

        const singleDetailedRejection = submittedCount === 0 && duplicateCount === 0 && rejectedResults.length === 1
            ? rejectedResults[0]
            : null;
        const firstResponseComponents = rejectedResults.find(item => item.responseComponents?.length)?.responseComponents || [];
        await interaction.editReply(singleDetailedRejection?.responseEmbed
            ? { content: null, embeds: [singleDetailedRejection.responseEmbed], components: singleDetailedRejection.responseComponents || [] }
            : { content: responseMessage, components: firstResponseComponents });
        return;    }

    if (interaction.isButton() && interaction.customId.startsWith('campaign_stats:')) {
      const campaignId = interaction.customId.split(':')[1];
      const campaign = CAMPAIGNS[campaignId];

      if (!campaign) {
        await interaction.reply({ content: '❌ Campaign not found.', flags: MessageFlags.Ephemeral });
        return;
      }

      const data = loadData();
      const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);

      if (!member) {
        await interaction.reply({ content: '❌ Could not load your stats.', flags: MessageFlags.Ephemeral });
        return;
      }

      const userRecord = ensureUser(data, member);
      const embed = buildCampaignStatsEmbed(
        data,
        userRecord,
        campaignId,
        campaign.name,
        interaction.user.id
      );

      saveData(data);

      await interaction.reply({
        embeds: [embed],
        flags: MessageFlags.Ephemeral
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
               flags: MessageFlags.Ephemeral
           });
       }

       const campaignId = interaction.customId.split(":")[1];

       const campaign = CAMPAIGNS[campaignId];

       if (!campaign)
           return interaction.reply({
               content: "Campaign not found.",
               flags: MessageFlags.Ephemeral
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

       const guild = client.guilds.cache.get(process.env.GUILD_ID);

       if (guild) {
           updateServerStats(guild);
       }

       campaign.status = "finished"

       await updateCampaignPanelMessage(
           interaction.guild,
           campaignId
       );

       await interaction.reply({
           content:
               "🏁 Campaign finished.\nIt will automatically move in 24 hours.",
           flags: MessageFlags.Ephemeral
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
                flags: MessageFlags.Ephemeral
            });
        }

        const campaignId =
            interaction.customId.split(":")[1];

        const campaign =
            CAMPAIGNS[campaignId];

        if (!campaign)
            return interaction.reply({
                content: "Campaign not found.",
                flags: MessageFlags.Ephemeral
           });

        campaign.status = "active";

        const data = loadData();

        if (data.campaignStatus?.[campaignId]) {
            data.campaignStatus[campaignId].status = "active";
            delete data.campaignStatus[campaignId].finishedAt;
            data.campaignStatus[campaignId].archived = false;
        }

        saveData(data);

        if (guild) {
            updateServerStats(guild);
        }

        campaign.status = "active";

        await updateCampaignPanelMessage(
            interaction.guild,
            campaignId
        );

        await interaction.reply({
            content: "✅ Campaign reopened.",
            flags: MessageFlags.Ephemeral
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
          flags: MessageFlags.Ephemeral
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
        flags: MessageFlags.Ephemeral
      });

      return;
    }

    if (interaction.isStringSelectMenu() && interaction.customId.startsWith('remove_clip_select:')) {
      const campaignId = interaction.customId.split(':')[1];
      const clipId = interaction.values[0];
      const data = loadData();

      if (!data.clips || !data.clips[clipId]) {
        await interaction.reply({ content: '❌ Clip not found.', flags: MessageFlags.Ephemeral });
        return;
      }

      const clip = data.clips[clipId];

      if (clip.userId !== interaction.user.id) {
        await interaction.reply({ content: '❌ You can only remove your own clips.', flags: MessageFlags.Ephemeral });
        return;
      }

      const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
      if (!member) {
        await interaction.reply({ content: '❌ User not found.', flags: MessageFlags.Ephemeral });
        return;
      }

      const userRecord = ensureUser(data, member);
      const platformStats = userRecord.campaignStats?.[campaignId]?.[clip.platform];

      if (platformStats) {
        platformStats.videosPosted = Math.max(0, (platformStats.videosPosted || 0) - 1);

        if (clip.status === 'approved') {
          platformStats.videosApproved = Math.max(0, (platformStats.videosApproved || 0) - 1);
          platformStats.totalViews = Math.max(0, (platformStats.totalViews || 0) - (clip.views || 0));
          platformStats.moneyMade = Math.max(0, (platformStats.moneyMade || 0) - (clip.totalMoneyMade || 0));

          userRecord.stats.videosApproved = Math.max(0, (userRecord.stats.videosApproved || 0) - 1);
          userRecord.stats.totalViews = Math.max(0, (userRecord.stats.totalViews || 0) - (clip.views || 0));
          userRecord.stats.moneyMade = Math.max(0, (userRecord.stats.moneyMade || 0) - (clip.totalMoneyMade || 0));
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
        flags: MessageFlags.Ephemeral
      });

      return;
    }
    
    if (interaction.isButton() && interaction.customId.startsWith('leave_campaign:')) {
      const campaignId = interaction.customId.split(':')[1];
      const campaign = CAMPAIGNS[campaignId];

      if (!campaign) {
        await interaction.reply({ content: '❌ Campaign not found.', flags: MessageFlags.Ephemeral });
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
        flags: MessageFlags.Ephemeral
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

      if (userRecord.campaignMemberships?.[campaignId]) {
        delete userRecord.campaignMemberships[campaignId];
      }

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
        await interaction.reply({ content: '❌ Campaign not found.', flags: MessageFlags.Ephemeral });
        return;
      }
 
      const data = loadData();
      const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);

      if (!member) {
        await interaction.reply({ content: '❌ Could not load your account.', flags: MessageFlags.Ephemeral });
        return;
      }

      const userRecord = ensureUser(data, member);
      const accountText = renderCampaignAssignedAccounts(userRecord, campaignId);

      await interaction.reply({
        content:
          `⚙️ **Manage Campaign Account - ${campaign.name}**\n\n` +
          `**Current campaign accounts:**\n${accountText}\n\n` +
          `Use the campaign connect-accounts channel to add or remove accounts for this campaign.`,
        flags: MessageFlags.Ephemeral
      });

      return;
    }

    if (interaction.isButton() && interaction.customId.startsWith('clip_approve:')) {
      if (!interaction.guild || !isAdmin(interaction.member)) {
        return interaction.reply({ content: '❌ You are not allowed to do this.', flags: MessageFlags.Ephemeral });
      }

      const clipId = interaction.customId.split(':')[1];
      const data = loadData();
      const located = findClipRecord(data, clipId);

      if (!located) {
        return interaction.reply({ content: '❌ Clip not found.', flags: MessageFlags.Ephemeral });
      }

      const clip = located.clip;
      const sourceCollection = located.collection;

      if (clip.status === 'approved') {
        return interaction.reply({ content: '❌ This clip is already approved.', flags: MessageFlags.Ephemeral });
      }

      if (clip.status !== 'pending') {
        return interaction.reply({ content: '❌ Only pending clips can be approved.', flags: MessageFlags.Ephemeral });
      }

      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      const campaign = CAMPAIGNS[clip.campaignId];
      if (!campaign) {
        return interaction.editReply({ content: '❌ Campaign not found.' });
      }

      if (!clip.staffChannelId) {
        clip.staffChannelId = interaction.channelId;
      }

      if (!clip.staffMessageId && interaction.message) {
        clip.staffMessageId = interaction.message.id;
      }

      let latestPublicViews = getStoredPublicViews(clip);

      const completedOrOutOfRun = clip.trackingStatus === 'completed' ||
        (campaign.separateEarningLifecycle && !isClipInCampaignEarningRun(clip, campaign));
      if (!completedOrOutOfRun) {
        try {
          const metadata = await fetchClipMetadata(clip);
          if (Number.isFinite(Number(metadata?.views)) && Number(metadata.views) >= 0) {
            latestPublicViews = Math.max(latestPublicViews, Number(metadata.views));
          }

          if (campaign.separateEarningLifecycle) {
            applyTrackedMetadata(clip, metadata, data);
            latestPublicViews = Math.max(latestPublicViews, Number(clip.publicViews) || 0);
          }

          if (metadata?.title) clip.title = metadata.title;
          if (metadata?.thumbnailUrl) clip.thumbnailUrl = metadata.thumbnailUrl;
          if (metadata?.authorName) clip.platformAuthorName = metadata.authorName;
        } catch (err) {
          console.error(`Could not refresh clip ${clipId} before approval:`, err.message);
        }
      }

      const approvedAt = Date.now();
      const latestViews = applyApprovalSnapshotAccounting(clip, campaign, data, latestPublicViews, approvedAt);
      clip.status = 'approved';
      clip.payoutEligible = true;
      clip.wasEverApproved = true;
      clip.approvedAt = approvedAt;
      if (isStraightCampaign(campaign)) finalizeStraightCampaignIfFulfilled(data, campaign.id, approvedAt);
      clip.budgetCycleIndex = isStraightCampaign(campaign)
        ? null
        : Number.isFinite(Number(clip.budgetCycleIndex))
        ? Number(clip.budgetCycleIndex)
        : getClipBudgetCycleIndex(clip, campaign);
      clip.approvalCycleIndex = isStraightCampaign(campaign)
        ? null
        : getCampaignBudgetCycleIndex(campaign, new Date(approvedAt));
      clip.lastChecked = approvedAt;
      logClipViewLifecycle(clip);

      data.clips ||= {};
      data.clipReviews ||= {};
      data.clips[clipId] = clip;
      if (sourceCollection === 'clipReviews') {
        delete data.clipReviews[clipId];
      }

      const userRecord = data.users?.[clip.userId];
      if (userRecord) {
        userRecord.stats ||= {};
        userRecord.stats.videosApproved = (Number(userRecord.stats.videosApproved) || 0) + 1;
        const platformStats = ensureCampaignPlatformStats(
          userRecord,
          clip.campaignId,
          clip.platform,
          clip.username || ''
        );
        platformStats.videosApproved = (Number(platformStats.videosApproved) || 0) + 1;
      }

      saveData(data);

      try {
        await updateClipStaffMessage(interaction.guild, clip);
      } catch (err) {
        console.error(`Could not update approved staff message ${clipId}:`, err.message);
      }

      try {
        const member = await interaction.guild.members.fetch(clip.userId);

        await member.send({
          embeds: [buildApprovedClipUserEmbed(clip)]
        });
      } catch (err) {
        console.error("❌ Failed to send approval DM:", err.message);
      }

      try {
        await syncPayoutCard(interaction.guild, clip.campaignId, clip.userId, { earningRunKey: clip.earningRunKey });
      } catch (err) {
        console.error(`Could not sync payout card for approved clip ${clipId}:`, err.message);
      }

      const guild = client.guilds.cache.get(process.env.GUILD_ID) || interaction.guild;
      if (guild && typeof updateServerStats === 'function') {
        updateServerStats(guild).catch(err => console.error('Server stats update error:', err.message));
      }
      if (guild && typeof updateLeaderboardMessage === 'function') {
        updateLeaderboardMessage(guild).catch(err => console.error('Leaderboard update error:', err.message));
      }
      if (guild && typeof updateCampaignPanelMessage === 'function') {
        try {
          await updateCampaignPanelMessage(guild, clip.campaignId);
        } catch (err) {
          console.error(`Could not refresh campaign panel ${clip.campaignId}:`, err.message);
        }
      }

      await interaction.editReply({
        content: `✅ Clip approved at ${formatNumber(latestPublicViews)} public views (${formatNumber(latestViews)} campaign-credited).`
      });
      return;
    }

    if (interaction.customId.startsWith("update_views:")) {

        const clipId = interaction.customId.split(":")[1];
        const data = loadData();
        const clip = data.clips?.[clipId];
        if (!interaction.guild || !isAdmin(interaction.member)) {
            return interaction.reply({ content: "❌ You are not allowed to do this.", flags: MessageFlags.Ephemeral });
        }
        if (!clip) {
            return interaction.reply({ content: "❌ Clip not found.", flags: MessageFlags.Ephemeral });
        }
        if (clip.trackingStatus === 'completed') {
            return interaction.reply({ content: "❌ Completed clips cannot be updated or reactivated.", flags: MessageFlags.Ephemeral });
        }

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
                flags: MessageFlags.Ephemeral
            });

        }

        if (!interaction.guild || !isAdmin(interaction.member)) {
            return interaction.reply({ content: "❌ You are not allowed to do this.", flags: MessageFlags.Ephemeral });
        }

        if (clip.trackingStatus === 'completed') {
            return interaction.reply({ content: "❌ Completed clips cannot be updated or reactivated.", flags: MessageFlags.Ephemeral });
        }

        const campaign = CAMPAIGNS[clip.campaignId];

        const newViews = Number(
            interaction.fields.getTextInputValue("views")
        );

        if (isNaN(newViews) || newViews < 0) {

            return interaction.reply({
                content: "❌ Invalid view count.",
                flags: MessageFlags.Ephemeral
            });

        }

        updateApprovedClipTracking(clip, { views: newViews }, data);

        data.clips[clipId] = clip;

        saveData(data);

        const guild = client.guilds.cache.get(process.env.GUILD_ID);

        if (guild) {
            updateServerStats(guild);
        }

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

            flags: MessageFlags.Ephemeral

        });

        return;
    }

    if (interaction.isButton() && interaction.customId.startsWith('clip_reject:')) {
      if (!interaction.guild || !isAdmin(interaction.member)) {
        await interaction.reply({
          content: '❌ You are not allowed to do this.',
          flags: MessageFlags.Ephemeral
        });
        return;
      }

      const clipId = interaction.customId.split(':')[1];
      const data = loadData();
      const located = findClipRecord(data, clipId);

      if (!located) {
        await interaction.reply({
          content: '❌ Clip not found.',
          flags: MessageFlags.Ephemeral
        });
        return;
      }
      const clip = located.clip;

      if (clip.status === 'rejected') {
        await interaction.reply({
          content: '❌ This clip is already rejected.',
          flags: MessageFlags.Ephemeral
        });
        return;
      }

      if (clip.status !== 'pending' && clip.status !== 'approved') {
        await interaction.reply({ content: '❌ Only pending or approved clips can be rejected.', flags: MessageFlags.Ephemeral });
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
          flags: MessageFlags.Ephemeral
        });
        return;
      }

      const clipId = interaction.customId.split(':')[1];
      const reason = interaction.fields.getTextInputValue('reject_reason').trim();

      const data = loadData();
      const located = findClipRecord(data, clipId);

      if (!located) {
        await interaction.reply({
          content: '❌ Clip not found.',
          flags: MessageFlags.Ephemeral
        });
        return;
      }
      const clip = located.clip;

      if (clip.status === 'rejected') {
        await interaction.reply({
          content: '❌ This clip is already rejected.',
          flags: MessageFlags.Ephemeral
        });
        return;
      }

      if (clip.status !== 'pending' && clip.status !== 'approved') {
        await interaction.reply({ content: '❌ Only pending or approved clips can be rejected.', flags: MessageFlags.Ephemeral });
        return;
      }

      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      const userRecord = data.users?.[clip.userId];
      const rejectionStage = getClipRejectionStage(clip, located.collection);

      clip.status = 'rejected';
      clip.payoutEligible = false;
      clip.wasEverApproved = rejectionStage === 'post_approval';
      clip.rejectionStage = rejectionStage;
      clip.rejectReason = reason;
      ensureClipAppealDeadline(clip);
      clip.rejectedBy = interaction.user.id;
      clip.trackingRetryAt = null;

      if (rejectionStage === 'pre_approval') {
        data.clipReviews ||= {};
        data.clipReviews[clipId] = clip;
        delete data.clips[clipId];
      } else {
        clip.rejectedAtViews = Math.max(Number(clip.views) || 0, Number(clip.currentViews) || 0, Number(clip.approvalViews) || 0);
        applyPostApprovalCreditReversal(clip, {
          now: clip.rejectedAt || Date.now(),
          appliedBy: interaction.user.id,
          reason
        });
        data.clips ||= {};
        data.clips[clipId] = clip;
      }

      reconcileCampaignFulfillmentAfterCreditChange(data, clip.campaignId, Date.now());

      if (userRecord) {
        if (!userRecord.stats) userRecord.stats = {};
        userRecord.stats.videosRejected = (userRecord.stats.videosRejected || 0) + 1;
        const platformStats = ensureCampaignPlatformStats(userRecord, clip.campaignId, clip.platform, clip.username || '');
        platformStats.videosRejected = (Number(platformStats.videosRejected) || 0) + 1;
      }

      saveData(data);

      try { await updateClipStaffMessage(interaction.guild, clip); }
      catch (error) { console.error(`Could not update rejected staff message ${clipId}:`, error.message); }

      if (rejectionStage === 'post_approval') {
        try { await updateCampaignPanelMessage(interaction.guild, clip.campaignId); } catch (error) { console.error(`Could not refresh campaign panel ${clip.campaignId}:`, error.message); }
        try { await updateLeaderboardMessage(interaction.guild); } catch (error) { console.error('Could not refresh leaderboard:', error.message); }
        try { await updateServerStats(interaction.guild); } catch (error) { console.error('Could not refresh server counters:', error.message); }
        try { await syncPayoutCard(interaction.guild, clip.campaignId, clip.userId, { earningRunKey: clip.earningRunKey }); } catch (error) { console.error(`Could not refresh payout card ${clip.campaignId}:${clip.userId}:`, error.message); }
      }

      const member = await interaction.guild.members.fetch(clip.userId).catch(() => null);

      if (member) {
        const rejectionDm = buildRejectedClipUserDm(clip, reason, interaction.guild.id);
        if (!rejectionDm.helpConfigured) {
          console.warn('[Clip Rejection]\nGet Help channel not configured.');
        }
        try {
          await member.send(rejectionDm.payload);
        } catch (error) {
          console.error(`[Clip Rejection] Could not DM rejected clip ${clipId} to ${clip.userId}:`, error.message);
        }
      }

      await interaction.editReply({
        content: `✅ Clip rejected.\nReason: ${reason}`,
        flags: MessageFlags.Ephemeral
      });
   
      return;
    }

    if (interaction.isButton() && interaction.customId.startsWith("restore_clip:")) {
        if (!interaction.guild || !isAdmin(interaction.member)) {
            return interaction.reply({ content: "❌ You are not allowed to do this.", flags: MessageFlags.Ephemeral });
        }

        const clipId = interaction.customId.split(":")[1];
        const data = loadData();
        const located = findClipRecord(data, clipId);
        if (!located) {
            return interaction.reply({ content: "❌ Clip not found.", flags: MessageFlags.Ephemeral });
        }
        const clip = located.clip;
        if (clip.status !== 'rejected') {
            return interaction.reply({ content: "❌ Only rejected clips can be restored.", flags: MessageFlags.Ephemeral });
        }

        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const rejectionStage = getClipRejectionStage(clip, located.collection);
        const campaign = CAMPAIGNS[clip.campaignId];
        const userRecord = data.users?.[clip.userId];
        const restoredAt = Date.now();
        clip.rejectionStage = null;
        clip.rejectReason = null;
        clearClipAppealWindow(clip);
        clip.rejectedBy = null;
        clip.restoredAt = restoredAt;
        clip.restoredBy = interaction.user.id;
        clip.lastTrackingError = null;
        clip.lastTrackingErrorAt = null;
        clip.trackingRetryAt = null;

        if (rejectionStage === 'post_approval' || clip.trackingStatus !== 'completed') {
            try {
                const metadata = await fetchClipMetadata(clip);
                if (rejectionStage === 'pre_approval') updatePendingReviewTracking(clip, metadata, data);
                else applyTrackedMetadata(clip, metadata, data);
            } catch (error) {
                console.error(`Could not refresh restored clip ${clipId}:`, error.message);
            }
        }

        if (rejectionStage === 'pre_approval') {
            clip.status = 'pending';
            clip.payoutEligible = false;
            clip.wasEverApproved = false;
            data.clipReviews ||= {};
            data.clipReviews[clipId] = clip;
            delete data.clips[clipId];
        } else {
            restorePostApprovalCreditReversal(clip, { restoredAt, restoredBy: interaction.user.id, now: restoredAt });
            data.clips ||= {};
            data.clips[clipId] = clip;
            delete data.clipReviews[clipId];
        }

        reconcileCampaignFulfillmentAfterCreditChange(data, clip.campaignId, restoredAt);

        if (userRecord) {
            userRecord.stats ||= {};
            userRecord.stats.videosRejected = Math.max((Number(userRecord.stats.videosRejected) || 0) - 1, 0);
            const platformStats = ensureCampaignPlatformStats(userRecord, clip.campaignId, clip.platform, clip.username || '');
            platformStats.videosRejected = Math.max((Number(platformStats.videosRejected) || 0) - 1, 0);
        }

        saveData(data);
        try { await updateClipStaffMessage(interaction.guild, clip); }
        catch (error) { console.error(`Could not update restored staff message ${clipId}:`, error.message); }

        if (rejectionStage === 'post_approval') {
            try { await updateCampaignPanelMessage(interaction.guild, clip.campaignId); } catch (error) { console.error(`Could not refresh campaign panel ${clip.campaignId}:`, error.message); }
            try { await updateLeaderboardMessage(interaction.guild); } catch (error) { console.error('Could not refresh leaderboard:', error.message); }
            try { await updateServerStats(interaction.guild); } catch (error) { console.error('Could not refresh server counters:', error.message); }
            try { await syncPayoutCard(interaction.guild, clip.campaignId, clip.userId, { earningRunKey: clip.earningRunKey }); } catch (error) { console.error(`Could not refresh payout card ${clip.campaignId}:${clip.userId}:`, error.message); }
        }

        await interaction.editReply({ content: "✅ Clip restored successfully." });
        return;
    }

    if (interaction.isStringSelectMenu() && interaction.customId.startsWith('campaign_account_select:')) {
       const campaignId = interaction.customId.split(':')[1];
       const campaign = CAMPAIGNS[campaignId];

       if (!campaign) {
         await interaction.reply({
           content: '❌ Campaign not found.',
           flags: MessageFlags.Ephemeral
         });
         return;
       }

       const [platform, username] = interaction.values[0].split(':');
       const data = loadData();

       const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
       if (!member) {
         await interaction.reply({
           content: '❌ Could not load your account.',
           flags: MessageFlags.Ephemeral
         });
         return;
       }

       const userRecord = ensureUser(data, member);

       ensureCampaignAccount(userRecord, campaignId, platform, username);
       ensureCampaignPlatformStats(userRecord, campaignId, platform, username);

       saveData(data);

       await interaction.reply({
         content: `✅ Assigned **${formatPlatform(platform)}** account **@${username}** to **${campaign.name}**.`,
         flags: MessageFlags.Ephemeral
       });

       return;
    }

    if (interaction.isButton() && interaction.customId === 'verify_human') {
      if (!interaction.guild) {
        await interaction.reply({
          content: '❌ This can only be used in the server.',
         flags: MessageFlags.Ephemeral
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
          flags: MessageFlags.Ephemeral
        });
        return;
      }

      if (!clipperRole) {
        await interaction.reply({
          content: '❌ CLIPPER_ROLE_ID is missing or wrong.',
          flags: MessageFlags.Ephemeral
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
          flags: MessageFlags.Ephemeral
        });
      } catch (error) {
        console.error('Role add error:', error);

        await interaction.reply({
          content:
            '❌ Verification saved, but I could not add the role.\n\n' +
            'Check: bot has Manage Roles permission, bot role is above Clipper role, and role IDs are correct.',
          flags: MessageFlags.Ephemeral
        });
      }

      return;
    }

    if (interaction.isButton() && interaction.customId.startsWith('join_campaign:')) {
      const campaignId = interaction.customId.split(':')[1];
      const campaign = CAMPAIGNS[campaignId];

      if (!interaction.guild) {
        await interaction.reply({
          content: '❌ Campaigns can only be joined from the Creators Elite server.',
          flags: MessageFlags.Ephemeral
        });
        return;
      }

      const data = loadData();
      const blockReason = getCampaignJoinBlockReason(campaign, data);
      if (blockReason) {
        await interaction.reply({
          content: `❌ ${blockReason}`,
          flags: MessageFlags.Ephemeral
        });
        return;
      }

      const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
      if (!member) {
        await interaction.reply({ content: '❌ Could not load your server profile.', flags: MessageFlags.Ephemeral });
        return;
      }

      const userRecord = ensureUser(data, member);
      const accountMode = getCampaignAccountMode(campaign);
      const accountEligibility = getCampaignAccountEligibility(userRecord, campaign);
      if (accountMode === 'global_auto_verify' && !accountEligibility.eligible) {
        await interaction.reply({ ...buildMissingGlobalAccountResponse(campaign), flags: MessageFlags.Ephemeral });
        return;
      }
      const demographicEligibility = getCampaignDemographicEligibility(userRecord, campaign);
      if (!demographicEligibility.eligible) {
        await interaction.reply({ ...buildMissingCampaignDemographicsResponse(interaction.guild.id, campaign), flags: MessageFlags.Ephemeral });
        return;
      }

      const joinResult = await joinCampaignMember(data, interaction.guild, member, campaign);
      if (!joinResult.ok) {
        console.warn('[Campaign Join]', { campaignId, userId: interaction.user.id, roleError: joinResult.error });
        await interaction.reply({ content: `⚠️ ${joinResult.error}`, flags: MessageFlags.Ephemeral });
        return;
      }
      saveData(data);

      const connectButtonRow = accountMode === 'campaign_staff_code'
        ? buildCampaignConnectAccountRow(interaction.guild.id, campaign)
        : buildCampaignRulesRow(interaction.guild.id, campaign);
      if (accountMode === 'campaign_staff_code' && !connectButtonRow) console.warn(`[Campaign Join] Missing connectAccountChannelId for campaign: ${campaignId}`);
      if (accountMode === 'global_auto_verify' && !connectButtonRow) console.warn(`[Campaign Join]\nMissing rulesChannelId for ${campaignId}`);

      await interaction.reply({
        embeds: [buildCampaignJoinSuccessEmbed(interaction, campaign, {
          alreadyJoined: joinResult.alreadyJoined,
          connectAvailable: Boolean(connectButtonRow),
          accountReady: accountMode === 'global_auto_verify'
        })],
        components: connectButtonRow ? [connectButtonRow] : [],
        flags: MessageFlags.Ephemeral
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
          flags: MessageFlags.Ephemeral
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
          flags: MessageFlags.Ephemeral
        });
        return;
      }

      const username = normalizeUsername(
        interaction.fields.getTextInputValue('campaign_username_input')
      );

      if (!username) {
        await interaction.reply({
          content: '❌ Username cannot be empty.',
          flags: MessageFlags.Ephemeral
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

      // 2. Fetch staff channel mapping for this campaign
      const campaignStaffMap = data.campaignStaffChannels?.[campaignId];

      // 3. Fallback check for linkAccount (supports both data.json and static campaign fallback)
      const staffChannelId = campaignStaffMap?.linkAccount 
          || campaignStaffMap?.accountLinking 
          || campaign?.staffChannels?.linkAccount 
          || campaign?.staffChannelId;

      const staffChannel = interaction.guild.channels.cache.get(staffChannelId);

      if (!staffChannel) {
          return interaction.reply({ content: '❌ Staff channel not found.', flags: MessageFlags.Ephemeral });
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
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    if (interaction.isButton() && interaction.customId.startsWith('staff_send_code:')) {
      if (!interaction.guild || !isAdmin(interaction.member)) {
        await interaction.reply({
          content: '❌ You are not allowed to do this.',
          flags: MessageFlags.Ephemeral
        });
        return;
      }

      const appId = interaction.customId.split(':')[1];
      const data = loadData();
      const app = data.applications[appId];

      if (!app) {
        await interaction.reply({
          content: '❌ Application not found.',
          flags: MessageFlags.Ephemeral
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
          flags: MessageFlags.Ephemeral
        });
        return;
      }

      const appId = interaction.customId.split(':')[1];
      const data = loadData();
      const app = data.applications[appId];

      if (!app) {
        await interaction.reply({
          content: '❌ Application not found.',
          flags: MessageFlags.Ephemeral
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
          flags: MessageFlags.Ephemeral
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
        flags: MessageFlags.Ephemeral
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
          flags: MessageFlags.Ephemeral
        });
        return;
      }

      if (interaction.user.id !== app.userId) {
        await interaction.reply({
          content: '❌ This confirmation is not for you.',
          flags: MessageFlags.Ephemeral
        });
        return;
      }

      app.status = 'verifying';
      data.applications[appId] = app;
      saveData(data);

      await updateStaffMessage(interaction.guild, app);

      await interaction.reply({
        content: '✅ Submitted. Staff reviewing.',
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    if (interaction.isButton() && interaction.customId.startsWith('staff_accept:')) {
      if (!interaction.guild || !isAdmin(interaction.member)) {
        await interaction.reply({
          content: '❌ You are not allowed to do this.',
          flags: MessageFlags.Ephemeral
        });
        return;
      }

      const appId = interaction.customId.split(':')[1];
      const data = loadData();
      const app = data.applications[appId];

      if (!app) {
        await interaction.reply({
          content: '❌ Application not found.',
          flags: MessageFlags.Ephemeral
        });
        return;
      }

      const member = await interaction.guild.members.fetch(app.userId).catch(() => null);
      if (!member) {
        await interaction.reply({
          content: '❌ User not found in server.',
          flags: MessageFlags.Ephemeral
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
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    if (interaction.isButton() && interaction.customId.startsWith('staff_reject:')) {
      if (!interaction.guild || !isAdmin(interaction.member)) {
        await interaction.reply({
          content: '❌ You are not allowed to do this.',
          flags: MessageFlags.Ephemeral
        });
        return;
      }

      const appId = interaction.customId.split(':')[1];
      const data = loadData();
      const app = data.applications[appId];

      if (!app) {
        await interaction.reply({
          content: '❌ Application not found.',
          flags: MessageFlags.Ephemeral
        });
        return;
      }

      app.status = 'rejected';
      data.applications[appId] = app;
      saveData(data);

      await updateStaffMessage(interaction.guild, app);

      await interaction.reply({
        content: `❌ <@${app.userId}> was rejected for **${app.campaignName}**.`,
        flags: MessageFlags.Ephemeral
      });
      return;
    }
  } catch (e) {
    console.error('Interaction error:', e);

    if (interaction.isRepliable()) {
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({
          content: `❌ Error: ${e.message}`,
          flags: MessageFlags.Ephemeral
        }).catch(() => {});
      } else {
        await interaction.reply({
          content: `❌ Error: ${e.message}`,
          flags: MessageFlags.Ephemeral
        }).catch(() => {});
      }
    }
  }
});

// connectMongo();

// ==========================================
// 🌐 OAUTH2 WEB SERVER FOR FORCED JOINING
// ==========================================

app.get('/health/instagram', (req, res) => {
  const configuration = getInstagramConfigurationStatus();
  res.json({ configured: configuration.configured, missing: configuration.missing });
});

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
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`🌐 OAuth Web Server internally listening on port ${PORT}`);
  });
}

client.once('ready', async () => {
    console.log(`🤖 Online and registered as ${client.user.tag}`);

    // Fetch target server cleanly via environment key arrays
    const targetGuildId = process.env.GUILD_ID;
    if (!targetGuildId) {
        console.error("❌ Startup aborted: GUILD_ID environment variable is missing inside .env");
        return;
    }

    const mainGuild = client.guilds.cache.get(targetGuildId);
    if (mainGuild) {
        // Execute initial load
        await updateServerStats(mainGuild);
        await refreshAllCampaignPanelMessages(mainGuild);
        scheduleNextWeeklyCampaignPanelRefresh(targetGuildId);

        // Run the timer every 5 minutes passing the cached mainGuild variable layout
        setInterval(async () => {
            const freshGuildRef = client.guilds.cache.get(targetGuildId);
            if (freshGuildRef) {
                await updateServerStats(freshGuildRef);
            }
        }, 5 * 60 * 1000);
    } else {
        console.error(`❌ Bot could not locate or access server with matching ID: ${targetGuildId}`);
    }
});

// ==========================================
// 1. SELECT & DELETE PENDING ACCOUNTS
// Command: !pendingaccounts
// ==========================================
client.on('messageCreate', async message => {
    if (message.author.bot || !message.guild) return;
    if (!message.content.startsWith('!pendingaccounts')) return;

    if (!isAdmin(message.member)) {
        return message.reply("❌ You do not have permission to use staff commands.");
    }

    const data = loadData();
    const requests = Object.values(data.campaignAccountRequests || {});

    // Filter only pending/waiting requests
    const pendingList = requests.filter(r => r.status === 'pending' || r.status === 'waiting_confirm' || r.status === 'ready_for_review');

    if (pendingList.length === 0) {
        return message.reply("✅ There are currently no pending account verification requests.");
    }

    // Build select menu options (Limit max 25 options for Discord API limits)
    const options = pendingList.slice(0, 25).map(req => ({
        label: `@${req.username} (${formatPlatform(req.platform)})`,
        value: req.id,
        description: `User: <@${req.userId}> | Campaign: ${req.campaignName || req.campaignId}`,
        emoji: '⏳'
    }));

    const selectMenu = new StringSelectMenuBuilder()
        .setCustomId('staff_delete_pending_select')
        .setPlaceholder('Select a pending request to delete...')
        .addOptions(options);

    const row = new ActionRowBuilder().addComponents(selectMenu);

    return message.reply({
        content: `📋 **Pending Account Requests (${pendingList.length})**\nSelect a request from the dropdown below to delete it:`,
        components: [row]
    });
});

// Handle pending request deletion selection
client.on('interactionCreate', async interaction => {
    if (!interaction.isStringSelectMenu() || interaction.customId !== 'staff_delete_pending_select') return;

    if (!isAdmin(interaction.member)) {
        return interaction.reply({ content: '❌ You are not allowed to do this.', flags: MessageFlags.Ephemeral });
    }

    const requestId = interaction.values[0];
    const data = loadData();
    const request = data.campaignAccountRequests?.[requestId];

    if (!request) {
        return interaction.reply({ content: '❌ Selected request was not found or already deleted.', flags: MessageFlags.Ephemeral });
    }

    // Clean up staff review message if it exists
    if (request.staffChannelId && request.staffMessageId) {
        const channel = await interaction.guild.channels.fetch(request.staffChannelId).catch(() => null);
        if (channel) {
            const msg = await channel.messages.fetch(request.staffMessageId).catch(() => null);
            if (msg) await msg.delete().catch(() => {});
        }
    }

    // Remove from database
    delete data.campaignAccountRequests[requestId];
    saveData(data);

    return interaction.reply({
        content: `✅ Successfully deleted pending request for **@${request.username}** (<@${request.userId}>) on **${formatPlatform(request.platform)}**.`,
        flags: MessageFlags.Ephemeral
    });
});

// ==========================================
// 2. SELECT & DELETE LINKED ACCOUNTS BY CAMPAIGN + PLATFORM
// Command: !listaccounts <campaignID> <platform>
// Example: !listaccounts elephant youtube
// ==========================================
client.on('messageCreate', async message => {
    if (message.author.bot || !message.guild) return;
    if (!message.content.startsWith('!listaccounts')) return;

    if (!isAdmin(message.member)) {
        return message.reply("❌ You do not have permission to use staff commands.");
    }

    const args = message.content.split(' ').filter(Boolean);
    if (args.length < 3) {
        return message.reply("❌ **Usage:** `!listaccounts <campaignID> <platform>`\n**Example:** `!listaccounts elephant youtube`");
    }

    const campaignId = args[1].toLowerCase();
    const platformRaw = args[2].toLowerCase();

    // Standardize platform key
    const platformKey = platformRaw.includes('ig') || platformRaw.includes('instagram') ? 'instagram'
                     : platformRaw.includes('tiktok') ? 'tiktok'
                     : platformRaw.includes('youtube') || platformRaw.includes('yt') ? 'youtube'
                     : platformRaw;

    const data = loadData();
    const matches = [];

    // Search users for matching linked accounts
    for (const userId in data.users) {
        const userObj = data.users[userId];
        for (const account of getCampaignAccountCandidates(userObj, campaignId, platformKey, { activeOnly: true, verifiedOnly: true })) {
            matches.push({
                userId,
                username: account.username,
                campaignId,
                platform: platformKey,
                accountId: getCampaignAccountStableId(account, campaignId, platformKey)
            });
        }
    }

    if (matches.length === 0) {
        return message.reply(`❌ No verified accounts found for campaign \`${campaignId}\` on **${formatPlatform(platformKey)}**.`);
    }

    // Build select menu options (Max 25 items)
    const options = matches.slice(0, 25).map(item => ({
        label: `@${item.username}`,
        value: `${item.userId}:${item.campaignId}:${item.platform}:${item.accountId}`,
        description: `User ID: ${item.userId}`,
        emoji: '👤'
    }));

    const selectMenu = new StringSelectMenuBuilder()
        .setCustomId('staff_delete_account_select')
        .setPlaceholder(`Select a ${formatPlatform(platformKey)} account to remove...`)
        .addOptions(options);

    const row = new ActionRowBuilder().addComponents(selectMenu);

    return message.reply({
        content: `🔍 **Verified Accounts for \`${campaignId}\` (${formatPlatform(platformKey)})** — Found ${matches.length}:\nSelect an account from the dropdown below to delete it:`,
        components: [row]
    });
});

// Handle account deletion selection
client.on('interactionCreate', async interaction => {
    if (!interaction.isStringSelectMenu() || interaction.customId !== 'staff_delete_account_select') return;

    if (!isAdmin(interaction.member)) {
        return interaction.reply({ content: '❌ You are not allowed to do this.', flags: MessageFlags.Ephemeral });
    }

    const [userId, campaignId, platform, accountId] = interaction.values[0].split(':');
    const data = loadData();
    const userRecord = data.users?.[userId];

    if (!userRecord) {
        return interaction.reply({ content: '❌ Selected account was not found in database.', flags: MessageFlags.Ephemeral });
    }

    const removal = removeCampaignAccount({
        data,
        userId,
        campaignId,
        platform,
        accountId,
        removedBy: interaction.user.id
    });

    if (!removal.removed) {
        return interaction.reply({ content: '❌ Selected account was not found in database.', flags: MessageFlags.Ephemeral });
    }

    saveData(data);

    return interaction.reply({
        content: `✅ Successfully removed **@${removal.username}** (<@${userId}>) from campaign \`${campaignId}\` on **${formatPlatform(platform)}**.`,
        flags: MessageFlags.Ephemeral
    });
});

client.on('messageCreate', async message => {
    if (message.author.bot || !message.content.startsWith('!fixlegacychannels')) return;
    if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) return;

    const data = loadData();
    let updatedAccounts = 0;
    let updatedClips = 0;

    // Fix legacy Account Requests
    for (const reqId in data.campaignAccountRequests) {
        const req = data.campaignAccountRequests[reqId];
        if (!req.staffChannelId) {
            const campaignStaffMap = data.campaignStaffChannels?.[req.campaignId];
            req.staffChannelId = campaignStaffMap?.linkAccount || CAMPAIGNS[req.campaignId]?.staffChannelId || null;
            updatedAccounts++;
        }
    }

    // Fix legacy Clips
    for (const clipId in data.clips) {
        const clip = data.clips[clipId];
        if (!clip.staffChannelId) {
            const platformKey = (clip.platform || '').toLowerCase();
            const channelKey = platformKey.includes('ig') || platformKey.includes('instagram') ? 'instagram'
                             : platformKey.includes('tiktok') ? 'tiktok'
                             : platformKey.includes('youtube') || platformKey.includes('yt') ? 'youtube'
                             : platformKey;

            const campaignStaffMap = data.campaignStaffChannels?.[clip.campaignId];
            clip.staffChannelId = campaignStaffMap?.[channelKey] || CAMPAIGNS[clip.campaignId]?.staffChannelId || null;
            updatedClips++;
        }
    }

    saveData(data);
    await message.reply(`✅ Migration complete! Backfilled channel IDs for **${updatedAccounts}** account requests and **${updatedClips}** clips.`);
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
function buildUserClipsPage({ data, userId, page = 0, perPage = 2, displayName }) {
  const getClipTimestamp = clip => {
    const numericTimestamp = Number(clip?.submittedTimestamp);
    if (Number.isFinite(numericTimestamp) && numericTimestamp > 0) return numericTimestamp;
    const parsedTimestamp = Date.parse(clip?.submittedAt || clip?.createdAt || '');
    return Number.isFinite(parsedTimestamp) ? parsedTimestamp : 0;
  };
  const getStatusEmoji = status => ({
    approved: '🟢',
    pending_update: '⏳',
    pending: '🟡',
    rejected: '🔴',
    removed: '⚫'
  })[String(status || '').toLowerCase()] || '⚪';
  const userClips = Object.values(data.clips || {})
    .filter(clip => String(clip.userId) === String(userId))
    .sort((a, b) => getClipTimestamp(b) - getClipTimestamp(a));

  if (!userClips.length) {
    return {
      embed: new EmbedBuilder()
        .setColor(0x7ED957)
        .setDescription("❌ You haven't submitted any video clips to track yet."),
      components: [],
      page: 0,
      totalPages: 0
    };
  }

  const totalPages = Math.ceil(userClips.length / perPage);
  const currentPage = Math.min(Math.max(Number(page) || 0, 0), totalPages - 1);
  const startIndex = currentPage * perPage;
  const pageClips = userClips.slice(startIndex, startIndex + perPage);
  const pendingUpdateCount = userClips.filter(clip => clip.status === 'pending_update').length;
  let descriptionText = `### Videos submitted by ${displayName || 'you'}\n\n`;
  descriptionText += `📊 **${userClips.length} clips total** · ${pendingUpdateCount} pending update\n\n`;

  pageClips.forEach((clip, index) => {
    const globalIndex = startIndex + index + 1;
    const platformName = clip.platform ? clip.platform.charAt(0).toUpperCase() + clip.platform.slice(1) : 'Video';
    const timeAgoText = clip.updatedAt ? 'Updated recently' : 'No recent updates';
    const likes = getClipLikes(clip);
    descriptionText += `${getStatusEmoji(clip.status)} **${globalIndex}. @${clip.username || 'user'}: [${platformName} Link](${clip.link || '#'})**\n`;
    descriptionText += `↳ **Views:** ${formatNumber(clip.views || 0)} · **Likes:** ${likes === null ? 'Not available' : formatNumber(likes)} · **$${formatNumber(clip.totalMoneyMade || 0)}** earned\n`;
    descriptionText += `*${timeAgoText}*\n\n`;
  });
  descriptionText += '**Status Legend**\n';
  descriptionText += '🟢 Updated  ⏳ Pending Update  🟡 Pending  🔴 Rejected  ⚫ Removed\n';

  const embed = new EmbedBuilder()
    .setColor(0x7ED957)
    .setDescription(descriptionText)
    .setFooter({ text: `Page ${currentPage + 1}/${totalPages}` })
    .setTimestamp();
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`view_user_clips:${userId}:${currentPage - 1}`)
      .setLabel('Previous')
      .setStyle(ButtonStyle.Primary)
      .setDisabled(currentPage === 0),
    new ButtonBuilder()
      .setCustomId(`view_user_clips:${userId}:${currentPage + 1}`)
      .setLabel('Next')
      .setStyle(ButtonStyle.Primary)
      .setDisabled(currentPage === totalPages - 1)
  );
  return { embed, components: [row], page: currentPage, totalPages };
}

function buildDemographicStaffReviewEmbed(submission, approvedBy) {
  const campaignName = CAMPAIGNS[submission.campaignId]?.name || submission.campaignName || `Archived Campaign (${submission.campaignId})`;
  const account = submission.account || {};
  const approverText = approvedBy ? `<@${approvedBy.id}>` : (submission.approvedBy ? `<@${submission.approvedBy}>` : 'Unknown');
  return new EmbedBuilder()
    .setColor(submission.status === 'approved' ? 0x57F287 : 0xF1C40F)
    .setTitle('🌍 Demographics Submission')
    .setDescription(
      `**User:** <@${submission.userId}> (${submission.userId})\n` +
      `**Country:** ${submission.country || 'Not recorded'}\n` +
      `**Account:** ${account.platform ? `${formatPlatform(account.platform)} ` : ''}@${account.username || 'Unknown'}\n` +
      `**Campaign:** ${cleanDropdownLabel(campaignName)}\n` +
      `**Video:** ${submission.videoUrl || 'Not recorded'}\n` +
      `**Status:** ${submission.status === 'approved' ? '✅ Approved' : 'Pending'}` +
      (submission.status === 'approved'
        ? `\n**Assigned Tier:** ${submission.demographicTier || 'Not recorded'}\n**Approved By:** ${approverText}`
        : '')
    );
}

async function updateDemographicStaffReviewMessage(guild, submission, approvedBy) {
  if (!submission.staffChannelId || !submission.staffMessageId) return;
  const channel = await guild.channels.fetch(submission.staffChannelId).catch(() => null);
  if (!channel?.messages) return;
  const message = await channel.messages.fetch(submission.staffMessageId).catch(() => null);
  if (!message) return;
  await message.edit({
    embeds: [buildDemographicStaffReviewEmbed(submission, approvedBy)],
    components: []
  });
}

async function sendDemographicApprovalDM(userId, submission) {
  try {
    const user = await client.users.fetch(userId);
    const username = `@${submission.account?.username || 'unknown'}`;
    const tier = submission.demographicTier || 'Unknown tier';
    const embed = new EmbedBuilder()
      .setColor(0x57F287)
      .setAuthor({
        name: 'Creators Elite',
        iconURL: 'https://cdn.discordapp.com/emojis/1504904179905200148.png'
      })
      .setTitle('Your application got approved <a:appr:1534931253952909453>')
      .setDescription(
        `Your account ${username} has been verified and marked as part of a **${tier}** country demographic.\n\n` +
        'Your campaign earnings will depend on the audience type.\n\n' +
        '**Note:** This tier is based on your current audience demographics and may be adjusted later if we find it is incorrect.\n\n' +
        `If you believe your assigned tier is wrong, please open a ticket in <#${GET_HELP_CHANNEL_ID}> so our support team can review it.`
      )
      .setFooter({
        text: 'Creators Elite',
        iconURL: 'https://cdn.discordapp.com/emojis/1504904179905200148.png'
      })
      .setTimestamp();
    await user.send({ embeds: [embed] });
  } catch {
    console.warn(`Could not DM demographic approval to ${userId}`);
  }
}

function formatPaymentReceiptViews(value) {
  const views = Number(value);
  if (!Number.isFinite(views) || views < 0) return 'Not recorded';
  return new Intl.NumberFormat('en-US', {
    notation: 'compact',
    maximumFractionDigits: views >= 1_000_000 ? 1 : 0
  }).format(views);
}

function createStablePaymentReference(value) {
  let hash = 2166136261;
  for (const character of String(value)) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return `CE-${(hash >>> 0).toString(36).toUpperCase().padStart(6, '0').slice(-6)}`;
}

function getUserPaymentReceipts(data, userId) {
  const grouped = new Map();
  const clipCollections = [
    ...Object.values(data.clips || {}),
    ...Object.values(data.clipReviews || {})
  ];

  for (const clip of clipCollections) {
    if (String(clip?.userId) !== String(userId)) continue;
    const canonicalCrowderSettlementActive = String(clip.campaignId) === 'crowder' &&
      Boolean(data.storageMigrations?.[CROWDER_HISTORICAL_RECONCILIATION.migrationName]);
    const rawHistory = Array.isArray(clip.payout?.history) ? clip.payout.history : [];
    const history = canonicalCrowderSettlementActive
      ? rawHistory.filter(payment => payment?.paymentSource === 'canonical_real_payment')
      : rawHistory;
    const legacyHistory = history.length ? history :
      (!canonicalCrowderSettlementActive && (Number(clip.payout?.paidViews) > 0 || Number(clip.payout?.paidMoney) > 0) ? [{
        views: clip.payout.paidViews,
        amount: clip.payout.paidMoney,
        paidAt: clip.payout.lastPaidAt,
        status: 'paid'
      }] : []);

    legacyHistory.forEach((payment, index) => {
      const campaignId = payment?.campaignId || clip.campaignId || 'unknown';
      const campaign = CAMPAIGNS[campaignId];
      const derivedCycle = payment?.earningRunKey
        ? getCampaignPayoutCycle(campaign, { earningRunKey: payment.earningRunKey })
        : getCampaignPayoutCycle(campaign, { clip });
      const earningRunKey = payment?.earningRunKey || derivedCycle?.earningRunKey || null;
      const cycleStartAt = payment?.cycleStartAt || derivedCycle?.cycleStartAt || null;
      const cycleEndAt = payment?.cycleEndAt || derivedCycle?.cycleEndAt || null;
      const timestampValue = payment?.paidAt || payment?.completedAt || payment?.createdAt || payment?.timestamp || payment?.date || null;
      const timestamp = Number.isFinite(Number(timestampValue))
        ? Number(timestampValue)
        : Date.parse(timestampValue || '');
      const paymentId = payment?.paymentId || payment?.transactionId || payment?.id || null;
      const groupKey = paymentId
        ? `id:${campaignId}:${earningRunKey || 'unresolved'}:${paymentId}`
        : Number.isFinite(timestamp)
          ? `time:${campaignId}:${earningRunKey || 'unresolved'}:${Math.floor(timestamp / 1000)}`
          : `legacy:${campaignId}:${clip.id || clip.videoUrl || index}:${index}`;
      const ratePerMillion = Number(payment?.ratePerMillion ?? payment?.payoutRate ?? CAMPAIGNS[campaignId]?.ratePerMillion);
      const views = Number(payment?.views ?? payment?.paidViews ?? 0) || 0;
      const amount = Number(payment?.amount ?? payment?.paidMoney ?? payment?.money ?? payment?.payoutAmount ?? 0) || 0;
      const existing = grouped.get(groupKey) || {
        campaignId,
        campaignName: payment?.campaignName || clip.campaignName,
        earningRunKey,
        cycleStartAt,
        cycleEndAt,
        paymentId,
        timestamp: Number.isFinite(timestamp) ? timestamp : null,
        timestampValue,
        views: 0,
        amount: 0,
        ratePerMillion: Number.isFinite(ratePerMillion) ? ratePerMillion : null,
        status: payment?.status || 'paid',
        reason: payment?.reason || payment?.error || payment?.issueReason || null,
        clips: new Set(),
        sourceKeys: []
      };
      existing.views += Math.max(views, 0);
      existing.amount += Math.max(amount, 0);
      if (!existing.campaignName) existing.campaignName = payment?.campaignName || clip.campaignName;
      if (!existing.earningRunKey && earningRunKey) existing.earningRunKey = earningRunKey;
      if (!existing.cycleStartAt && cycleStartAt) existing.cycleStartAt = cycleStartAt;
      if (!existing.cycleEndAt && cycleEndAt) existing.cycleEndAt = cycleEndAt;
      if (!existing.paymentId && paymentId) existing.paymentId = paymentId;
      if (!Number.isFinite(existing.timestamp) && Number.isFinite(timestamp)) {
        existing.timestamp = timestamp;
        existing.timestampValue = timestampValue;
      }
      if (!Number.isFinite(existing.ratePerMillion) && Number.isFinite(ratePerMillion)) existing.ratePerMillion = ratePerMillion;
      if (existing.status === 'paid' && payment?.status) existing.status = payment.status;
      if (!existing.reason) existing.reason = payment?.reason || payment?.error || payment?.issueReason || null;
      existing.clips.add(clip.id || clip.videoUrl || `${campaignId}:${index}`);
      existing.sourceKeys.push(`${clip.id || clip.videoUrl || 'legacy'}:${index}:${timestampValue || ''}:${views}:${amount}`);
      grouped.set(groupKey, existing);
    });
  }

  for (const tracker of Object.values(data.payoutTrackers || {})) {
    if (String(tracker?.userId) !== String(userId) || !Array.isArray(tracker.paymentHistory)) continue;
    tracker.paymentHistory.forEach((payment, index) => {
      const campaignId = payment?.campaignId || tracker.campaignId || 'unknown';
      const earningRunKey = payment?.earningRunKey || tracker.earningRunKey || null;
      const timestampValue = payment?.paidAt || payment?.date || null;
      const timestamp = Number.isFinite(Number(timestampValue)) ? Number(timestampValue) : Date.parse(timestampValue || '');
      const paymentId = payment?.paymentId || null;
      const groupKey = paymentId ? `id:${campaignId}:${earningRunKey || 'unresolved'}:${paymentId}` : `tracker:${tracker.id}:${index}`;
      const existing = grouped.get(groupKey) || {
        campaignId, campaignName: payment?.campaignName, earningRunKey,
        cycleStartAt: payment?.cycleStartAt || tracker.cycleStartAt || null,
        cycleEndAt: payment?.cycleEndAt || tracker.cycleEndAt || null,
        paymentId, timestamp: Number.isFinite(timestamp) ? timestamp : null, timestampValue,
        views: 0, amount: 0, ratePerMillion: Number(payment?.ratePerMillion) || null,
        status: payment?.status || 'paid', reason: payment?.reason || null,
        clips: new Set(), sourceKeys: []
      };
      existing.views += Math.max(Number(payment?.views) || 0, 0);
      existing.amount += Math.max(Number(payment?.amount) || 0, 0);
      existing.sourceKeys.push(`${tracker.id}:${index}:${timestampValue || ''}`);
      grouped.set(groupKey, existing);
    });
  }

  return [...grouped.values()]
    .map(payment => ({
      ...payment,
      clips: payment.clips.size,
      paymentReference: payment.paymentId || createStablePaymentReference([
        payment.campaignId,
        payment.timestampValue || '',
        ...payment.sourceKeys.sort()
      ].join('|'))
    }))
    .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
}

function buildPaymentReceiptPage(interaction, payments, page) {
  const authorName = interaction.member?.displayName || interaction.user.globalName || interaction.user.username;
  const author = { name: authorName, iconURL: interaction.user.displayAvatarURL() };
  if (!payments.length) {
    return {
      embeds: [new EmbedBuilder()
        .setColor(0x5865F2)
        .setAuthor(author)
        .setTitle('Detailed Overview of Your Payments')
        .setDescription("You don't have any payment history yet.\n\nOnce you receive a payout, your payment receipts will appear here.")
        .setFooter({ text: 'Powered by Creators Elite', iconURL: 'https://cdn.discordapp.com/emojis/1504904179905200148.png' })],
      components: []
    };
  }

  const payment = payments[page];
  const campaign = CAMPAIGNS[payment.campaignId];
  const campaignName = campaign?.name || payment.campaignName || `Archived Campaign (${payment.campaignId})`;
  const statusDetails = {
    paid: { label: '<a:appr:1534931253952909453> Paid', color: 0x57F287 },
    pending: { label: '⏳ Payment Pending', color: 0xFEE75C },
    waiting: { label: '⏳ Payment Pending', color: 0xFEE75C },
    ready: { label: '🟡 Ready for Payment', color: 0xFEE75C },
    issue: { label: '<a:cancel:1506235594303606794> Payment Error', color: 0xED4245 },
    failed: { label: '<a:cancel:1506235594303606794> Payment Error', color: 0xED4245 },
    rejected: { label: '<a:cancel:1506235594303606794> Payment Rejected', color: 0xED4245 }
  }[String(payment.status || '').toLowerCase()] || { label: '⚪ Unknown', color: 0x99AAB5 };
  const dateText = Number.isFinite(payment.timestamp)
    ? new Intl.DateTimeFormat('en-US', { month: 'long', day: 'numeric', year: 'numeric' }).format(new Date(payment.timestamp))
    : 'Not recorded';
  const ratePerThousand = Number.isFinite(payment.ratePerMillion) ? payment.ratePerMillion / 1000 : null;
  const reason = payment.reason ? `\n\n**Reason:** ${String(payment.reason).replace(/[\r\n]+/g, ' ').slice(0, 500)}` : '';
  const clipCount = payment.clips > 1 ? `\n**Clips:** ${payment.clips}` : '';
  const cycleText = payment.cycleStartAt || payment.cycleEndAt || payment.earningRunKey
    ? `\n**Campaign Cycle:** ${formatPayoutCycleLabel(payment)}`
    : '\n**Campaign Cycle:** Legacy cycle unresolved';
  const embed = new EmbedBuilder()
    .setColor(statusDetails.color)
    .setAuthor(author)
    .setTitle('Detailed Overview of Your Payments')
    .setDescription(
      `**${campaignName}**${cycleText}\n\n` +
      `**Expected:** $${payment.amount.toFixed(2)}\n` +
      `**Status:** ${statusDetails.label}\n` +
      `**Date:** ${dateText}\n\n` +
      `**Views Paid:** ${formatPaymentReceiptViews(payment.views)}\n` +
      `**Rate:** ${ratePerThousand === null ? 'Not recorded' : `$${ratePerThousand.toFixed(2)} / 1K Views`}\n` +
      `**Payment ID:** \`${payment.paymentReference}\`` + clipCount + reason
    )
    .setFooter({
      text: `Powered by Creators Elite • Page ${page + 1}/${payments.length}`,
      iconURL: 'https://cdn.discordapp.com/emojis/1504904179905200148.png'
    });
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`payout_receipt_page:${page - 1}`).setLabel('Previous').setStyle(ButtonStyle.Secondary).setDisabled(page === 0),
    new ButtonBuilder().setCustomId(`payout_receipt_page:${page + 1}`).setLabel('Next').setStyle(ButtonStyle.Secondary).setDisabled(page === payments.length - 1)
  );
  return { embeds: [embed], components: [row] };
}

if (require.main === module) client.login(process.env.TOKEN);

module.exports.__clipLifecycleTest = {
  applyDemographicsApprovalToAccount,
  applyCampaignMembership,
  applyApprovalSnapshotAccounting,
  applyPostApprovalCreditReversal,
  applyStraightCampaignRefill,
  applyTrackedMetadata,
  applyCrowderHistoricalReconciliation,
  applyElephantJulyReconciliation,
  assignCampaignJoinRoles,
  autoJoinReturnCampaignAfterGlobalVerification,
  bioContainsExactVerificationCode,
  buildApifyInstagramProfileInput,
  buildCampaignConnectAccountRow,
  buildCampaignRulesRow,
  buildCampaignAccountApprovedEmbed,
  buildCampaignAccountRejectedEmbed,
  buildCampaignAccountDisconnectConfirmation,
  buildCampaignAccountLinkModal,
  buildCampaignAccountRemovePage,
  buildCampaignAccountViewPage,
  buildDemographicsAccountSelectionPage,
  buildCampaignJoinSuccessEmbed,
  buildCampaignPanelButtons,
  buildCampaignSubmitClipButton,
  buildCampaignSubmissionPanelComponents,
  buildCampaignStatsEmbed,
  buildCampaignStatusEmbed,
  buildClipStaffEmbed,
  buildClipStaffButtons,
  buildGlobalSocialLinkModal,
  buildGlobalSocialPanel,
  buildGlobalSocialRemoveConfirmation,
  buildGlobalSocialRemovePage,
  buildGlobalSocialViewPage,
  getCampaignAccountAnalytics,
  getGlobalSocialAccountAnalytics,
  buildGlobalSocialVerificationPrompt,
  buildInstagramVerificationFailureResponse,
  buildInstagramVerificationSuccessEmbed,
  buildCrowderHistoricalReconciliationDryRun,
  buildElephantJulyReconciliationDryRun,
  buildMissingGlobalAccountResponse,
  buildMissingCampaignDemographicsResponse,
  buildPreLaunchSubmissionEmbed,
  buildRejectedClipUserDm,
  buildRejectedClipUserEmbed,
  buildShortCampaignPanelText,
  buildSubmitClipModal,
  buildClipSubmissionValidationResponse,
  clearClipAppealWindow,
  createGlobalSocialVerificationRequest,
  ensureClipAppealDeadline,
  finalizeOutOfRunClips,
  finalizeStraightCampaignIfFulfilled,
  fetchInstagramPublicProfile,
  fetchPublicSocialProfile,
  findOtherVerifiedClipAccountOwner,
  findAllCampaignSubmissionPanelMessages,
  findCampaignSubmissionPanelMessage,
  getClipTrackingAudit,
  getClipActiveCreditedViews,
  getClipActiveWeekCreditedViews,
  getProviderClipAuthorIdentity,
  getCampaignConnectAccountLink,
  getCampaignRulesLink,
  getCampaignAccountEligibility,
  getAccountDemographics,
  getCampaignDemographicEligibility,
  getCampaignAccountMode,
  getCampaignBudgetMode,
  getCampaignJoinBlockReason,
  getCampaignOperationalState,
  getCampaignPanelFulfilledPercent,
  getCampaignPanelText,
  getCampaignPayoutCycle,
  getCampaignPayoutThresholdViews,
  getCampaignSubmissionBlockMessage,
  getRejectedCreditAudit,
  getCampaignCurrentRunAccounting,
  getCampaignCurrentWeekAccounting,
  getCampaignSubmissionAccounts,
  getCampaignSubmitButtonFromMessage,
  getStraightCampaignAccounting,
  getPayoutCycleClips,
  getPayoutTrackerId,
  getOldestFirstTrackerCarryBalances,
  settleReconciledTrackerAllocation,
  settleTrackerCarryBalances,
  calculateTrackerStats,
  closeExpiredPayoutTrackers,
  formatPayoutCycleLabel,
  getCampaignPerClipPayoutLimit,
  getUserCurrentRunAccounting,
  getUserCurrentWeekAccounting,
  getUserPaymentReceipts,
  getWeeklyAccountingAudit,
  getInitialSubmissionViewState,
  getClipAppealHelpLink,
  getSafeTrackedViews,
  initializeClipTrackingFields,
  isClipAppealWindowOpen,
  isStraightCampaign,
  isNonMonsterlabCampaign,
  joinCampaignMember,
  repairApprovalSnapshotInvariants,
  repairAugustFirstWeekLegacyWeeklyAccounting,
  migratePayoutTrackerCycles,
  reconcileCampaignFulfillmentAfterCreditChange,
  reconcileRejectedCredits,
  restorePostApprovalCreditReversal,
  getVerifiedCampaignPlatforms,
  getActiveGlobalSocials,
  getVerifiedGlobalSocials,
  getVerifiedGlobalSocialsForPlatforms,
  ensureCampaignAccount,
  ensureCampaignAccountIds,
  ensureGlobalSocialAccountIds,
  removeCampaignAccount,
  removeGlobalSocialAccount,
  resolveDemographicsSubmissionAccount,
  refillStraightCampaign,
  renderGlobalSocialAccounts,
  normalizeTypedSocialPlatform,
  normalizeApifyInstagramProfile,
  normalizeVideoDurationSeconds,
  userHasEligibleGlobalSocial,
  validateCampaignPublicationDate,
  validateCampaignVideoDuration,
  validateAccountSubmission,
  validateVideoOwnership,
  verifyGlobalSocialVerificationRequest,
  shouldTrackClip,
  updateApprovedClipTracking,
  updateCampaignSubmissionPanelMessage,
  updatePendingReviewTracking,
  CAMPAIGNS
};
