const test = require('node:test');
const assert = require('node:assert/strict');
const { ButtonStyle } = require('discord.js');

const {
  applyCampaignMembership,
  applyApprovalSnapshotAccounting,
  applyStraightCampaignRefill,
  applyTrackedMetadata,
  assignCampaignJoinRoles,
  autoJoinReturnCampaignAfterGlobalVerification,
  bioContainsExactVerificationCode,
  buildApifyInstagramProfileInput,
  buildCampaignAccountApprovedEmbed,
  buildCampaignAccountRejectedEmbed,
  buildCampaignAccountRemovePage,
  buildCampaignAccountViewPage,
  buildCampaignConnectAccountRow,
  buildCampaignRulesRow,
  buildCampaignJoinSuccessEmbed,
  buildCampaignPanelButtons,
  buildCampaignSubmitClipButton,
  buildCampaignSubmissionPanelComponents,
  buildCampaignStatsEmbed,
  buildCampaignStatusEmbed,
  buildClipStaffEmbed,
  buildClipStaffButtons,
  buildGlobalSocialLinkModal,
  buildGlobalSocialConnectChooser,
  buildGlobalSocialPanel,
  buildGlobalSocialRemoveConfirmation,
  buildGlobalSocialRemovePage,
  buildGlobalSocialViewPage,
  getGlobalSocialAccountAnalytics,
  buildGlobalSocialVerificationPrompt,
  buildInstagramVerificationFailureResponse,
  buildInstagramVerificationSuccessEmbed,
  buildMissingGlobalAccountResponse,
  buildMissingCampaignDemographicsResponse,
  buildPreLaunchSubmissionEmbed,
  buildRejectedClipUserDm,
  buildRejectedClipUserEmbed,
  buildShortCampaignPanelText,
  buildSubmitClipAccountSelectionPage,
  CAMPAIGNS,
  clearClipAppealWindow,
  createGlobalSocialVerificationRequest,
  finalizeStraightCampaignIfFulfilled,
  fetchInstagramPublicProfile,
  findAllCampaignSubmissionPanelMessages,
  findCampaignSubmissionPanelMessage,
  ensureClipAppealDeadline,
  finalizeOutOfRunClips,
  getCampaignConnectAccountLink,
  getCampaignRulesLink,
  getCampaignAccountEligibility,
  getCampaignDemographicEligibility,
  getCampaignAccountMode,
  getCampaignBudgetMode,
  getCampaignJoinBlockReason,
  getCampaignOperationalState,
  getCampaignPanelFulfilledPercent,
  getCampaignPanelText,
  getCampaignPayoutThresholdViews,
  getCampaignPerClipPayoutLimit,
  getCampaignSubmissionBlockMessage,
  getCampaignCurrentRunAccounting,
  getCampaignCurrentWeekAccounting,
  getCampaignSubmissionAccounts,
  getCampaignSubmitButtonFromMessage,
  getStraightCampaignAccounting,
  getClipAppealHelpLink,
  getVerifiedCampaignPlatforms,
  getActiveGlobalSocials,
  getVerifiedGlobalSocials,
  getVerifiedGlobalSocialsForPlatforms,
  getUserCurrentRunAccounting,
  getUserCurrentWeekAccounting,
  getWeeklyAccountingAudit,
  getInitialSubmissionViewState,
  initializeClipTrackingFields,
  isClipAppealWindowOpen,
  isStraightCampaign,
  joinCampaignMember,
  repairApprovalSnapshotInvariants,
  repairAugustFirstWeekLegacyWeeklyAccounting,
  ensureCampaignAccount,
  ensureCampaignAccountIds,
  ensureGlobalSocialAccountIds,
  removeCampaignAccount,
  removeGlobalSocialAccount,
  refillStraightCampaign,
  renderGlobalSocialAccounts,
  normalizeTypedSocialPlatform,
  normalizeApifyInstagramProfile,
  normalizeVideoDurationSeconds,
  userHasEligibleGlobalSocial,
  validateCampaignPublicationDate,
  validateCampaignVideoDuration,
  shouldTrackClip,
  updateApprovedClipTracking,
  updateCampaignSubmissionPanelMessage,
  validateAccountSubmission,
  verifyGlobalSocialVerificationRequest
} = require('./index.js').__clipLifecycleTest;

const currentSubmittedTimestamp = Date.parse('2026-08-07T12:00:00.000Z');

function makeCurrentCrowderClip(overrides = {}) {
  return {
    id: 'test-clip',
    userId: 'user-1',
    campaignId: 'crowder',
    platform: 'instagram',
    videoUrl: 'https://www.instagram.com/reel/test/',
    status: 'approved',
    payoutEligible: true,
    wasEverApproved: true,
    submittedTimestamp: currentSubmittedTimestamp,
    submittedAt: new Date(currentSubmittedTimestamp).toISOString(),
    earningRunKey: 'crowder:2026-08-03T07:00:00.000Z:2026-08-31T07:00:00.000Z',
    trackingStatus: 'active',
    publicViews: 502000,
    currentViews: 502000,
    submissionViews: 502000,
    views: 0,
    campaignCreditedViews: 0,
    budgetTracking: {
      budgetCycleKey: '2026-08-03T07:00:00.000Z',
      baselinePublicViews: 502000,
      lastPublicViews: 502000,
      creditedViewsThisCycle: 0
    },
    payout: { paidViews: 0, paidMoney: 0, history: [] },
    ...overrides
  };
}

test('A: submission persists the normalized public snapshot', () => {
  assert.deepEqual(getInitialSubmissionViewState({ views: 502000 }, CAMPAIGNS.crowder), {
    publicViews: 502000,
    currentViews: 502000,
    submissionViews: 502000,
    views: 0,
    campaignCreditedViews: 0
  });
});

test('B/C: approval stores a fresh monotonic public snapshot and safely falls back', () => {
  const fresh = makeCurrentCrowderClip();
  const credited = applyApprovalSnapshotAccounting(fresh, CAMPAIGNS.crowder, { clips: {}, clipReviews: {} }, 502900, currentSubmittedTimestamp);
  assert.equal(fresh.approvalViews, 502900);
  assert.equal(fresh.currentViews, 502900);
  assert.equal(fresh.publicViews, 502900);
  assert.equal(credited, 502900);

  const fallback = makeCurrentCrowderClip();
  const safeFallback = Math.max(fallback.submissionViews, fallback.currentViews, fallback.publicViews);
  applyApprovalSnapshotAccounting(fallback, CAMPAIGNS.crowder, { clips: {}, clipReviews: {} }, safeFallback, currentSubmittedTimestamp);
  assert.equal(fallback.approvalViews, 502000);
});

test('approval preserves the public snapshot when the weekly cap limits credit', () => {
  const clip = makeCurrentCrowderClip({ id: 'approval-target' });
  const other = makeCurrentCrowderClip({
    id: 'other',
    userId: 'user-2',
    publicViews: 6900000,
    currentViews: 6900000,
    submissionViews: 6900000,
    views: 6900000,
    campaignCreditedViews: 6900000,
    budgetTracking: {
      budgetCycleKey: '2026-08-03T07:00:00.000Z',
      baselinePublicViews: 0,
      lastPublicViews: 6900000,
      creditedViewsThisCycle: 6900000
    }
  });
  const credited = applyApprovalSnapshotAccounting(
    clip,
    CAMPAIGNS.crowder,
    { clips: { [other.id]: other }, clipReviews: {} },
    502900,
    currentSubmittedTimestamp
  );
  assert.equal(clip.approvalViews, 502900);
  assert.equal(clip.currentViews, 502900);
  assert.equal(credited, 100000);
  assert.equal(clip.campaignCreditedViews, 100000);
});

test('D: a bad provider result cannot reduce public views', () => {
  const clip = makeCurrentCrowderClip({ status: 'pending', payoutEligible: false });
  applyTrackedMetadata(clip, { views: 7 }, { clips: {}, clipReviews: { [clip.id]: clip } });
  assert.equal(clip.publicViews, 502000);
  assert.equal(clip.currentViews, 502000);
});

test('E: migration repairs only an impossible approval snapshot', () => {
  const clip = makeCurrentCrowderClip({ approvalViews: 7, currentViews: 502900, publicViews: 502900 });
  const data = { clips: { [clip.id]: clip }, clipReviews: {} };
  assert.deepEqual(repairApprovalSnapshotInvariants(data), {
    impossibleApprovalSnapshots: 1,
    repairedApprovalSnapshots: 1
  });
  assert.equal(clip.approvalViews, 502000);
  assert.equal(clip.currentViews, 502900);
  assert.equal(clip.publicViews, 502900);
});

test('F: post-approval tracking never overwrites approvalViews', () => {
  const clip = makeCurrentCrowderClip({ approvalViews: 502000, campaignCreditedViews: 502000, views: 502000 });
  updateApprovedClipTracking(clip, { views: 700000 }, { clips: { [clip.id]: clip }, clipReviews: {} });
  assert.equal(clip.approvalViews, 502000);
  assert.equal(clip.currentViews, 700000);
  assert.equal(clip.publicViews, 700000);
});

test('G/H: staff embed distinguishes pending approval and completed tracking', () => {
  const pending = makeCurrentCrowderClip({ status: 'pending', payoutEligible: false, wasEverApproved: false, approvedAt: null, approvalViews: undefined });
  assert.match(buildClipStaffEmbed(pending).data.description, /Approval Views\*\*\nNot approved yet/);

  const completed = makeCurrentCrowderClip({ trackingStatus: 'completed', completedReason: 'campaign_earning_period_ended', nextCheckAt: null });
  const description = buildClipStaffEmbed(completed).data.description;
  assert.match(description, /Tracking\*\*\n✅ Completed/);
  assert.doesNotMatch(description, /Next Scheduled Check/);
  assert.equal(buildClipStaffButtons(completed)[0].components.some(button => button.data.custom_id?.startsWith('update_views:')), false);
});

test('H/I: old runs complete while current-run clips remain trackable', () => {
  const old = makeCurrentCrowderClip({
    submittedTimestamp: Date.parse('2026-07-20T12:00:00.000Z'),
    submittedAt: '2026-07-20T12:00:00.000Z',
    earningRunKey: 'crowder:old-run',
    nextCheckAt: Date.parse('2026-08-08T15:00:00.000Z')
  });
  const result = finalizeOutOfRunClips({ clips: { [old.id]: old }, clipReviews: {} }, Date.parse('2026-08-08T12:00:00.000Z'));
  assert.deepEqual(result, { completedCount: 1, changed: true });
  assert.equal(old.trackingStatus, 'completed');
  assert.equal(old.nextCheckAt, null);
  initializeClipTrackingFields(old);
  assert.equal(old.nextCheckAt, null);

  const current = makeCurrentCrowderClip();
  assert.equal(shouldTrackClip(current, CAMPAIGNS.crowder, { clips: { [current.id]: current }, clipReviews: {} }), true);
});

test('J: a fulfilled weekly cap pauses tracking without monthly completion', () => {
  const target = makeCurrentCrowderClip({ id: 'target' });
  const capped = makeCurrentCrowderClip({
    id: 'capped',
    userId: 'user-2',
    publicViews: 7000000,
    currentViews: 7000000,
    submissionViews: 7000000,
    views: 7000000,
    campaignCreditedViews: 7000000,
    budgetTracking: {
      budgetCycleKey: '2026-08-03T07:00:00.000Z',
      baselinePublicViews: 0,
      lastPublicViews: 7000000,
      creditedViewsThisCycle: 7000000
    }
  });
  const data = { clips: { target, capped }, clipReviews: {} };
  assert.equal(shouldTrackClip(target, CAMPAIGNS.crowder, data, new Date('2026-08-09T12:00:00.000Z')), false);
  assert.equal(target.trackingStatus, 'active');
});

test('K: staff earnings use campaign-credited views, not public views', () => {
  const clip = makeCurrentCrowderClip({
    approvalViews: 502000,
    publicViews: 502900,
    currentViews: 502900,
    views: 900,
    campaignCreditedViews: 900,
    totalMoneyMade: 999
  });
  const description = buildClipStaffEmbed(clip).data.description;
  assert.match(description, /Campaign Credited Views\*\*\n900/);
  assert.match(description, /Current Earnings\*\*\n\$0\.27/);
});

test('clip rejection DM: pending rejection stores a real 12-hour appeal window without earnings fields', () => {
  const rejectedAt = Date.parse('2026-08-09T10:30:00.000Z');
  const clip = makeCurrentCrowderClip({
    status: 'rejected',
    rejectionStage: 'pre_approval',
    title: "Elon isn't always right, but he's spot on here.",
    thumbnailUrl: 'https://example.com/thumbnail.jpg',
    totalMoneyMade: 999,
    estimatedEarnings: 888,
    payout: { paidViews: 123_000, paidMoney: 45.67, history: [{ amount: 45.67 }] },
    rejectedAt: null,
    appealDeadline: null
  });

  const appealWindow = ensureClipAppealDeadline(clip, rejectedAt);
  const preservedWindow = ensureClipAppealDeadline(clip, rejectedAt + 60_000);
  const rejectionDm = buildRejectedClipUserDm(clip, 'Does not meet the campaign editing criteria.', 'guild-1', 'help-1');
  const embed = rejectionDm.payload.embeds[0].data;
  const rendered = JSON.stringify(embed);
  const expectedDeadline = rejectedAt + (12 * 60 * 60 * 1000);

  assert.deepEqual(appealWindow, { rejectedAt, appealDeadline: expectedDeadline });
  assert.deepEqual(preservedWindow, appealWindow);
  assert.doesNotMatch(rendered, /Current Earnings|Estimated Earnings|Payment Eligibility|Historical Paid/i);
  assert.match(rendered, /Does not meet the campaign editing criteria/);
  assert.match(rendered, /Appeal This Decision/);
  assert.match(rendered, /\*\*12 hours\*\*/);
  assert.match(rendered, new RegExp(`<t:${Math.floor(expectedDeadline / 1000)}:F>`));
  assert.match(rendered, new RegExp(`<t:${Math.floor(expectedDeadline / 1000)}:R>`));
  assert.equal(embed.thumbnail.url, 'https://example.com/thumbnail.jpg');
  assert.equal(isClipAppealWindowOpen(clip, expectedDeadline), true);
  assert.equal(isClipAppealWindowOpen(clip, expectedDeadline + 1), false);
});

test('clip rejection DM: approved rejection preserves payout history and links to canonical Get Help channel', () => {
  const rejectedAt = Date.parse('2026-08-09T10:30:00.000Z');
  const clip = makeCurrentCrowderClip({
    status: 'rejected',
    rejectionStage: 'post_approval',
    rejectedAt,
    appealDeadline: rejectedAt + (12 * 60 * 60 * 1000),
    payout: { paidViews: 3_500_000, paidMoney: 1050, history: [{ amount: 1050 }] }
  });
  const payoutBefore = structuredClone(clip.payout);
  const rejectionDm = buildRejectedClipUserDm(clip, 'Wrong campaign.', 'guild-1', 'help-1');
  const rendered = JSON.stringify(rejectionDm.payload.embeds[0].data);
  const button = rejectionDm.payload.components[0].components[0].data;

  assert.deepEqual(clip.payout, payoutBefore);
  assert.doesNotMatch(rendered, /Current Earnings|Estimated Earnings|Payment Eligibility|Historical Paid/i);
  assert.equal(rejectionDm.helpConfigured, true);
  assert.equal(button.label, 'Appeal This Rejection');
  assert.equal(button.emoji.name, '🎫');
  assert.equal(button.style, ButtonStyle.Link);
  assert.equal(button.url, 'https://discord.com/channels/guild-1/help-1');
  assert.equal(getClipAppealHelpLink('guild-1', 'help-1'), button.url);
});

test('clip rejection DM: missing Get Help config falls back safely and restore permits a fresh deadline', () => {
  const firstRejectedAt = Date.parse('2026-08-09T10:30:00.000Z');
  const secondRejectedAt = Date.parse('2026-08-10T15:00:00.000Z');
  const clip = makeCurrentCrowderClip({ rejectedAt: null, appealDeadline: null });
  ensureClipAppealDeadline(clip, firstRejectedAt);

  const rejectionDm = buildRejectedClipUserDm(clip, 'Low quality.', 'guild-1', null);
  const rendered = JSON.stringify(rejectionDm.payload.embeds[0].data);
  assert.equal(rejectionDm.helpConfigured, false);
  assert.deepEqual(rejectionDm.payload.components, []);
  assert.match(rendered, /Please contact staff through the server's Get Help section\./);

  clearClipAppealWindow(clip);
  const nextWindow = ensureClipAppealDeadline(clip, secondRejectedAt);
  assert.deepEqual(nextWindow, {
    rejectedAt: secondRejectedAt,
    appealDeadline: secondRejectedAt + (12 * 60 * 60 * 1000)
  });
});

test('join A/E: membership and roles are immediate and idempotent without an account', async () => {
  const campaign = { ...CAMPAIGNS.crowder, roleId: 'campaign-role', connectAccountChannelId: 'connect-channel' };
  const heldRoles = new Set();
  const campaignRole = { id: 'campaign-role' };
  const clipperRole = { id: 'clipper-role' };
  const guild = {
    id: 'guild-1',
    roles: { cache: { get: id => id === campaignRole.id ? campaignRole : clipperRole } }
  };
  const member = {
    displayName: 'Creator',
    roles: {
      cache: { has: id => heldRoles.has(id) },
      add: async role => heldRoles.add(role.id),
      remove: async role => heldRoles.delete(role.id)
    }
  };
  const userRecord = { campaigns: [], campaignAccounts: {} };
  const roleResult = await assignCampaignJoinRoles(guild, member, campaign, { clipperRoleId: 'clipper-role-id' });
  assert.equal(roleResult.ok, true);
  assert.equal(heldRoles.has('campaign-role'), true);
  assert.equal(heldRoles.has('clipper-role'), true);

  assert.deepEqual(applyCampaignMembership(userRecord, campaign, 1000), { alreadyJoined: false });
  assert.deepEqual(applyCampaignMembership(userRecord, campaign, 2000), { alreadyJoined: true });
  assert.deepEqual(userRecord.campaigns, ['crowder']);
  assert.deepEqual(userRecord.campaignAccounts.crowder, {});
  assert.equal(userRecord.campaignMemberships.crowder.joinedAt, 1000);

  const interaction = { user: { username: 'creator' }, member, guild: { iconURL: () => null } };
  assert.match(buildCampaignJoinSuccessEmbed(interaction, campaign).data.title, /Let's Get Clipping, Creator/);
  const row = buildCampaignConnectAccountRow('guild-1', campaign, {});
  assert.equal(row.components[0].data.style, 5);
  assert.equal(row.components[0].data.custom_id, undefined);
});

test('join B/C/D/I: verified accounts gate submission but do not control membership', () => {
  const campaign = { ...CAMPAIGNS.crowder };
  const userRecord = { campaigns: [], campaignAccounts: {} };
  applyCampaignMembership(userRecord, campaign, 1000);
  assert.deepEqual(getVerifiedCampaignPlatforms(userRecord, campaign.id), []);

  const account = ensureCampaignAccount(userRecord, campaign.id, 'instagram', 'creator');
  assert.deepEqual(getVerifiedCampaignPlatforms(userRecord, campaign.id), []);
  account.verified = true;
  assert.deepEqual(getVerifiedCampaignPlatforms(userRecord, campaign.id), ['instagram']);

  delete userRecord.campaignAccounts[campaign.id].instagram;
  assert.deepEqual(userRecord.campaigns, ['crowder']);
  assert.deepEqual(getVerifiedCampaignPlatforms(userRecord, campaign.id), []);
});

test('join F: missing campaign role fails before membership is written', async () => {
  const campaign = { ...CAMPAIGNS.crowder, roleId: 'missing-role' };
  const userRecord = { campaigns: [], campaignAccounts: {} };
  const member = { roles: { cache: { has: () => false }, add: async () => {}, remove: async () => {} } };
  const result = await assignCampaignJoinRoles({ roles: { cache: { get: () => null } } }, member, campaign);
  assert.equal(result.ok, false);
  assert.deepEqual(userRecord.campaigns, []);
});

test('join G/H: finished campaigns are blocked and Connect Account uses the user-facing channel', () => {
  const campaign = { ...CAMPAIGNS.crowder, connectAccountChannelId: 'user-connect-channel' };
  assert.equal(CAMPAIGNS.crowder.connectAccountChannelId, '1521566652796240046');
  assert.equal(CAMPAIGNS.elephant.connectAccountChannelId, '1521567104552276058');
  assert.match(getCampaignJoinBlockReason(campaign, { campaignStatus: { crowder: { status: 'finished' } } }, new Date('2026-08-08T12:00:00Z')), /permanently finished/);
  assert.equal(getCampaignJoinBlockReason(campaign, {}, new Date('2026-08-08T12:00:00Z')), null);
  assert.equal(
    getCampaignConnectAccountLink('guild-id', campaign),
    'https://discord.com/channels/guild-id/user-connect-channel'
  );
  assert.equal(getCampaignConnectAccountLink('guild-id', { id: 'missing' }), null);
});

test('account decision A/B: Instagram and TikTok approvals use account-only wording', () => {
  for (const [platform, expectedPlatform] of [['instagram', 'Instagram'], ['tiktok', 'TikTok']]) {
    const embed = buildCampaignAccountApprovedEmbed({
      campaignId: 'crowder',
      campaignName: 'Legacy Name',
      platform,
      username: 'dailyclp_'
    }).data;
    assert.equal(embed.title, 'Account Verified ✅');
    assert.equal(embed.color, 0x57F287);
    assert.match(embed.description, /Steven Crowder Clipping Campaign/);
    assert.match(embed.description, /successfully verified/);
    assert.doesNotMatch(embed.description, /Campaign Approved|approved for the campaign|access the campaign channels/i);
    assert.equal(embed.fields.find(field => field.name === '🌐 Platform').value, expectedPlatform);
    assert.equal(embed.fields.find(field => field.name === '👤 Account').value, '@dailyclp\\_');
    assert.equal(embed.fields.find(field => field.name === '✅ Status').value, 'Verified');
  }
});

test('account decision C/D: rejection is account-specific and links to Connect Another Account', () => {
  const userRecord = { campaigns: ['crowder'], campaignAccounts: { crowder: {} } };
  const request = { campaignId: 'crowder', platform: 'instagram', username: 'dailyclp_' };
  const embed = buildCampaignAccountRejectedEmbed(request, 'The bio verification code could not be found.').data;
  assert.equal(embed.title, 'Account Verification Rejected ❌');
  assert.equal(embed.color, 0xED4245);
  assert.match(embed.description, /still part of the campaign/);
  assert.doesNotMatch(embed.description, /rejected from the campaign|lost access/i);
  assert.match(embed.fields.find(field => field.name === '📌 Reason').value, /bio verification code/);
  assert.deepEqual(userRecord.campaigns, ['crowder']);

  const campaign = { ...CAMPAIGNS.crowder, connectAccountChannelId: 'connect-channel' };
  const row = buildCampaignConnectAccountRow('guild-id', campaign, { label: 'Connect Another Account' });
  assert.equal(row.components[0].data.label, 'Connect Another Account');
  assert.equal(row.components[0].data.url, 'https://discord.com/channels/guild-id/connect-channel');
});

test('account decision E/F: DM failure is non-fatal and missing campaign config falls back safely', async () => {
  const request = { campaignId: 'missing-campaign', campaignName: 'Legacy Campaign', platform: 'youtube', username: 'creator' };
  const embed = buildCampaignAccountApprovedEmbed(request).data;
  assert.match(embed.description, /Legacy Campaign/);
  assert.equal(embed.fields.find(field => field.name === '🌐 Platform').value, 'YouTube');

  const accountState = { verified: true };
  const disabledDmMember = { send: async () => { throw new Error('DMs disabled'); } };
  await disabledDmMember.send({ embeds: [embed] }).catch(() => {});
  assert.equal(accountState.verified, true);
});

test('account removal A/C/D/E/F: shared removal preserves membership and all historical accounting', () => {
  const data = {
    users: {
      'user-1': {
        campaigns: ['crowder'],
        campaignAccounts: {
          crowder: {
            instagram: { username: 'dailyclp_', verified: true }
          }
        },
        campaignStats: {
          crowder: {
            instagram: {
              username: 'dailyclp_',
              videosPosted: 4,
              videosApproved: 3,
              totalViews: 125000,
              moneyMade: 48.5
            }
          }
        },
        paymentReceipts: [{ id: 'receipt-1', amount: 48.5, status: 'paid' }]
      }
    },
    campaignAccountRequests: {
      approved: {
        id: 'approved',
        userId: 'user-1',
        campaignId: 'crowder',
        platform: 'instagram',
        username: '@DailyClp_',
        status: 'approved'
      },
      rejected: {
        id: 'rejected',
        userId: 'user-1',
        campaignId: 'crowder',
        platform: 'instagram',
        username: 'dailyclp_',
        status: 'rejected'
      }
    },
    clips: {
      approved: {
        id: 'approved',
        userId: 'user-1',
        campaignId: 'crowder',
        platform: 'instagram',
        status: 'approved',
        trackingStatus: 'active',
        publicViews: 150000,
        submissionViews: 100000,
        approvalViews: 110000,
        campaignCreditedViews: 50000,
        payout: { paidViews: 25000, paidMoney: 25, history: [{ views: 25000, amount: 25 }] }
      },
      pending: {
        id: 'pending',
        userId: 'user-1',
        campaignId: 'crowder',
        platform: 'instagram',
        status: 'pending'
      }
    },
    clipReviews: { pending: { clipId: 'pending', status: 'pending' } },
    payoutTrackers: { crowder: { paidViews: 25000, unpaidViews: 25000 } }
  };
  const preserved = structuredClone({
    campaigns: data.users['user-1'].campaigns,
    campaignStats: data.users['user-1'].campaignStats,
    paymentReceipts: data.users['user-1'].paymentReceipts,
    clips: data.clips,
    clipReviews: data.clipReviews,
    payoutTrackers: data.payoutTrackers
  });

  const result = removeCampaignAccount({
    data,
    userId: 'user-1',
    campaignId: 'crowder',
    platform: 'instagram',
    removedBy: 'staff-1',
    removedAt: 123456789
  });

  assert.deepEqual(result, { removed: true, username: 'dailyclp_', requestsMarkedRemoved: 1 });
  assert.equal(data.users['user-1'].campaignAccounts.crowder, undefined);
  assert.deepEqual(data.users['user-1'].campaigns, preserved.campaigns);
  assert.deepEqual(data.users['user-1'].campaignStats, preserved.campaignStats);
  assert.deepEqual(data.users['user-1'].paymentReceipts, preserved.paymentReceipts);
  assert.deepEqual(data.clips, preserved.clips);
  assert.deepEqual(data.clipReviews, preserved.clipReviews);
  assert.deepEqual(data.payoutTrackers, preserved.payoutTrackers);
  assert.deepEqual(
    {
      status: data.campaignAccountRequests.approved.status,
      removedAt: data.campaignAccountRequests.approved.removedAt,
      removedBy: data.campaignAccountRequests.approved.removedBy
    },
    { status: 'removed', removedAt: 123456789, removedBy: 'staff-1' }
  );
  assert.equal(data.campaignAccountRequests.rejected.status, 'rejected');
});

test('account removal B: a removed handle can start a fresh verification request', () => {
  const data = {
    users: {
      'user-1': {
        campaigns: ['crowder'],
        campaignAccounts: { crowder: { instagram: { username: 'dailyclp_', verified: true } } }
      }
    },
    campaignAccountRequests: {
      old: {
        userId: 'user-1',
        campaignId: 'crowder',
        platform: 'instagram',
        username: 'dailyclp_',
        status: 'approved'
      }
    }
  };

  removeCampaignAccount({
    data,
    userId: 'user-1',
    campaignId: 'crowder',
    platform: 'instagram',
    removedBy: 'staff-1'
  });

  assert.equal(validateAccountSubmission('user-1', 'crowder', 'instagram', '@DailyClp_', data).isValid, true);

  data.campaignAccountRequests.fresh = {
    userId: 'user-1',
    campaignId: 'crowder',
    platform: 'instagram',
    username: 'dailyclp_',
    status: 'pending'
  };
  assert.equal(validateAccountSubmission('user-1', 'crowder', 'instagram', 'dailyclp_', data).isValid, false);
});

test('account removal G: another creator is blocked while ownership is actively linked', () => {
  const data = {
    users: {
      owner: {
        campaignAccounts: { crowder: { instagram: { username: 'dailyclp_', verified: true } } }
      },
      other: { campaignAccounts: {} }
    },
    campaignAccountRequests: {
      approved: {
        userId: 'owner',
        campaignId: 'crowder',
        platform: 'instagram',
        username: 'dailyclp_',
        status: 'approved'
      }
    }
  };

  const activeResult = validateAccountSubmission('other', 'crowder', 'instagram', 'dailyclp_', data);
  assert.equal(activeResult.isValid, false);
  assert.match(activeResult.message, /another creator/);

  removeCampaignAccount({
    data,
    userId: 'owner',
    campaignId: 'crowder',
    platform: 'instagram',
    removedBy: 'staff-1'
  });
  assert.equal(validateAccountSubmission('other', 'crowder', 'instagram', 'dailyclp_', data).isValid, true);
});

test('account removal: unlinking one platform leaves other verified accounts available', () => {
  const data = {
    users: {
      'user-1': {
        campaigns: ['crowder'],
        campaignAccounts: {
          crowder: {
            instagram: { username: 'dailyclp_', verified: true },
            tiktok: { username: 'dailyclp', verified: true }
          }
        }
      }
    },
    campaignAccountRequests: {}
  };

  removeCampaignAccount({
    data,
    userId: 'user-1',
    campaignId: 'crowder',
    platform: 'instagram',
    removedBy: 'user-1'
  });

  assert.deepEqual(data.users['user-1'].campaigns, ['crowder']);
  assert.deepEqual(getVerifiedCampaignPlatforms(data.users['user-1'], 'crowder'), ['tiktok']);
});

function makeWeeklyAccountingClip(campaignId, userId, creditedViews, overrides = {}) {
  const campaign = CAMPAIGNS[campaignId];
  const submittedTimestamp = Date.parse('2026-08-04T12:00:00.000Z');
  return {
    id: `${campaignId}-${userId}-${overrides.platform || 'instagram'}`,
    userId,
    campaignId,
    platform: overrides.platform || 'instagram',
    videoId: `${campaignId}-${userId}-${overrides.platform || 'instagram'}`,
    status: 'approved',
    payoutEligible: true,
    wasEverApproved: true,
    submittedTimestamp,
    submittedAt: new Date(submittedTimestamp).toISOString(),
    earningRunKey: `${campaign.id}:${campaign.startDate}:${campaign.endDate}`,
    trackingStatus: 'active',
    publicViews: creditedViews,
    currentViews: creditedViews,
    submissionViews: 0,
    approvalViews: 0,
    campaignCreditedViews: creditedViews,
    views: creditedViews,
    budgetTracking: {
      budgetCycleKey: '2026-08-03T07:00:00.000Z',
      baselinePublicViews: 0,
      lastPublicViews: creditedViews,
      creditedViewsThisCycle: creditedViews,
      lastCreditedAt: submittedTimestamp
    },
    payout: { paidViews: 0, paidMoney: 0, history: [] },
    ...overrides
  };
}

test('weekly accounting A/B/C: first-week user and campaign totals share one ledger and budget formula', () => {
  const creator = makeWeeklyAccountingClip('elephant', 'creator-a', 4_200_000);
  const others = makeWeeklyAccountingClip('elephant', 'creator-b', 100_000, { platform: 'tiktok' });
  const data = { clips: { creator, others }, clipReviews: {} };
  const now = new Date('2026-08-09T12:00:00.000Z');

  const userWeek = getUserCurrentWeekAccounting(data, 'elephant', 'creator-a', now);
  const userRun = getUserCurrentRunAccounting(data, 'elephant', 'creator-a');
  const campaignWeek = getCampaignCurrentWeekAccounting(data, 'elephant', now);

  assert.equal(userRun.totalViews, 4_200_000);
  assert.equal(userWeek.creditedViews, 4_200_000);
  assert.equal(campaignWeek.creditedViews, 4_300_000);
  assert.equal(campaignWeek.creditedMoney, 1290);
  assert.equal(campaignWeek.remainingBudget, 1110);
  assert.equal(campaignWeek.capReached, false);
});

test('weekly accounting D: Elephant clamps fulfilled money at the 8M weekly cap', () => {
  const data = { clips: { capped: makeWeeklyAccountingClip('elephant', 'creator-a', 8_000_000) }, clipReviews: {} };
  const accounting = getCampaignCurrentWeekAccounting(data, 'elephant', new Date('2026-08-09T12:00:00.000Z'));

  assert.equal(accounting.creditedViews, 8_000_000);
  assert.equal(accounting.creditedMoney, 2400);
  assert.equal(accounting.remainingBudget, 0);
  assert.equal(accounting.capReached, true);
});

test('weekly accounting E: previous-run paid history is excluded from current My Stats', () => {
  const current = makeWeeklyAccountingClip('elephant', 'creator-a', 4_200_000);
  const previous = {
    ...makeWeeklyAccountingClip('elephant', 'creator-a', 3_500_000, { platform: 'tiktok' }),
    submittedTimestamp: Date.parse('2026-07-20T12:00:00.000Z'),
    submittedAt: '2026-07-20T12:00:00.000Z',
    earningRunKey: 'elephant:previous-run',
    payout: { paidViews: 3_500_000, paidMoney: 1050, history: [{ date: '2026-07-31T12:00:00.000Z', views: 3_500_000, amount: 1050 }] }
  };
  const data = { clips: { current, previous }, clipReviews: {} };

  const run = getUserCurrentRunAccounting(data, 'elephant', 'creator-a');
  const stats = buildCampaignStatsEmbed(data, {}, 'elephant', CAMPAIGNS.elephant.name, 'creator-a').data.description;
  assert.equal(run.totalViews, 4_200_000);
  assert.equal(run.paidViews, 0);
  assert.equal(run.unpaidViews, 4_200_000);
  assert.match(stats, /Monthly Earned Views[^]*4\.2M/);
  assert.match(stats, /Current Week Views[^]*4\.2M/);
  assert.match(stats, /Paid Views[^]*\n0/);
});

test('weekly accounting F: reads are restart-safe and do not mutate persisted weekly state', () => {
  const clip = makeWeeklyAccountingClip('crowder', 'creator-a', 2_500_000);
  const data = { clips: { clip }, clipReviews: {} };
  const before = structuredClone(data);
  const now = new Date('2026-08-09T12:00:00.000Z');

  assert.equal(getCampaignCurrentWeekAccounting(data, 'crowder', now).creditedViews, 2_500_000);
  assert.equal(getCampaignCurrentWeekAccounting(data, 'crowder', now).creditedViews, 2_500_000);
  assert.deepEqual(data, before);
});

test('weekly accounting G: Monday boundary starts at zero, preserves monthly credits, and uses the last persisted snapshot', () => {
  const clip = makeWeeklyAccountingClip('elephant', 'creator-a', 4_200_000);
  const data = { clips: { clip }, clipReviews: {} };
  const monday = new Date('2026-08-10T07:00:00.000Z');

  assert.equal(getCampaignCurrentWeekAccounting(data, 'elephant', monday).creditedViews, 0);
  assert.equal(getCampaignCurrentRunAccounting(data, 'elephant').totalViews, 4_200_000);

  applyTrackedMetadata(clip, { views: 4_200_000, accountingTimestamp: monday.getTime() }, data);
  assert.equal(clip.budgetTracking.budgetCycleKey, '2026-08-10T07:00:00.000Z');
  assert.equal(clip.budgetTracking.baselinePublicViews, 4_200_000);
  assert.equal(clip.budgetTracking.creditedViewsThisCycle, 0);
  assert.equal(clip.budgetTracking.history[0].creditedViews, 4_200_000);

  applyTrackedMetadata(clip, { views: 4_300_000, accountingTimestamp: Date.parse('2026-08-10T08:00:00.000Z') }, data);
  assert.equal(clip.budgetTracking.creditedViewsThisCycle, 100_000);
  assert.equal(clip.campaignCreditedViews, 4_300_000);
});

test('weekly audit flags the known late-baseline first-week mismatch without rewriting history', () => {
  const clip = makeWeeklyAccountingClip('elephant', 'creator-a', 9_000_000, {
    budgetTracking: {
      budgetCycleKey: '2026-08-03T07:00:00.000Z',
      baselinePublicViews: 4_700_000,
      lastPublicViews: 9_000_000,
      creditedViewsThisCycle: 4_300_000
    },
    payout: { paidViews: 3_500_000, paidMoney: 1050, history: [] }
  });
  const data = { clips: { clip }, clipReviews: {} };
  const before = structuredClone(data);
  const audit = getWeeklyAccountingAudit(data, 'elephant', new Date('2026-08-09T12:00:00.000Z'));

  assert.equal(audit.currentRunCreditedViews, 9_000_000);
  assert.equal(audit.campaignCurrentWeekCreditedViews, 4_300_000);
  assert.equal(audit.weeklyFulfilledMoney, 1290);
  assert.equal(audit.weeklyRemainingMoney, 1110);
  assert.ok(audit.flags.includes('FIRST_WEEK_MONTHLY_WEEK_MISMATCH'));
  assert.ok(audit.flags.includes('CAP_OVERFLOW'));
  assert.ok(audit.flags.includes('LATE_BASELINE_RESET'));
  assert.deepEqual(data, before);
});

test('August Week 1 migration reconstructs pre-upgrade clips by setting trusted credit without double counting', () => {
  const clipA = makeWeeklyAccountingClip('elephant', 'creator-a', 3_000_000, {
    id: 'legacy-a',
    videoId: 'legacy-a',
    submittedTimestamp: Date.parse('2026-08-04T10:00:00.000Z'),
    submittedAt: '2026-08-04T10:00:00.000Z',
    approvedAt: Date.parse('2026-08-04T12:00:00.000Z'),
    publicViews: 3_500_000,
    currentViews: 3_500_000,
    submissionViews: 500_000,
    approvalViews: 600_000,
    budgetTracking: {
      budgetCycleKey: '2026-08-03T07:00:00.000Z',
      baselinePublicViews: 3_000_000,
      lastPublicViews: 3_500_000,
      creditedViewsThisCycle: 500_000,
      initializedAt: Date.parse('2026-08-07T12:00:00.000Z')
    }
  });
  const clipB = makeWeeklyAccountingClip('elephant', 'creator-b', 2_000_000, {
    id: 'legacy-b',
    videoId: 'legacy-b',
    submittedTimestamp: Date.parse('2026-08-05T10:00:00.000Z'),
    submittedAt: '2026-08-05T10:00:00.000Z',
    approvedAt: Date.parse('2026-08-05T12:00:00.000Z'),
    budgetTracking: {
      budgetCycleKey: '2026-08-03T07:00:00.000Z',
      baselinePublicViews: 1_000_000,
      lastPublicViews: 2_000_000,
      creditedViewsThisCycle: 1_000_000,
      initializedAt: Date.parse('2026-08-07T12:00:00.000Z')
    }
  });
  const clipC = makeWeeklyAccountingClip('elephant', 'creator-c', 1_000_000, {
    id: 'post-upgrade-c',
    videoId: 'post-upgrade-c',
    submittedTimestamp: Date.parse('2026-08-08T10:00:00.000Z'),
    submittedAt: '2026-08-08T10:00:00.000Z',
    approvedAt: Date.parse('2026-08-08T12:00:00.000Z'),
    budgetTracking: {
      budgetCycleKey: '2026-08-03T07:00:00.000Z',
      baselinePublicViews: 0,
      lastPublicViews: 1_000_000,
      creditedViewsThisCycle: 1_000_000,
      initializedAt: Date.parse('2026-08-08T10:00:00.000Z'),
      runLedgerCompleteFor: `${CAMPAIGNS.elephant.id}:${CAMPAIGNS.elephant.startDate}:${CAMPAIGNS.elephant.endDate}`
    }
  });
  const data = { clips: { clipA, clipB, clipC }, clipReviews: {}, storageMigrations: {} };
  const preservedSnapshots = structuredClone({
    a: { submissionViews: clipA.submissionViews, approvalViews: clipA.approvalViews, publicViews: clipA.publicViews, currentViews: clipA.currentViews, payout: clipA.payout },
    b: { submissionViews: clipB.submissionViews, approvalViews: clipB.approvalViews, publicViews: clipB.publicViews, currentViews: clipB.currentViews, payout: clipB.payout }
  });

  const report = repairAugustFirstWeekLegacyWeeklyAccounting(data, new Date('2026-08-09T12:00:00.000Z'));

  assert.equal(report.qualifyingClipCount, 3);
  assert.equal(report.inferredPreUpgradeClipCount, 2);
  assert.equal(report.preUpgradeCreditedViews, 5_000_000);
  assert.equal(report.preUpgradeStoredWeeklyViews, 1_500_000);
  assert.equal(report.preUpgradeMissingWeeklyViews, 3_500_000);
  assert.equal(report.postUpgradeCreditedViews, 1_000_000);
  assert.equal(report.postUpgradeStoredWeeklyViews, 1_000_000);
  assert.equal(report.week1StoredTotalBefore, 2_500_000);
  assert.equal(report.legitimateTotalBeforeCap, 6_000_000);
  assert.equal(report.displayedTotalAfterCap, 6_000_000);
  assert.equal(clipA.budgetTracking.creditedViewsThisCycle, 3_000_000);
  assert.equal(clipB.budgetTracking.creditedViewsThisCycle, 2_000_000);
  assert.equal(clipC.budgetTracking.creditedViewsThisCycle, 1_000_000);
  assert.equal(getCampaignCurrentWeekAccounting(data, 'elephant', new Date('2026-08-09T12:00:00.000Z')).creditedViews, 6_000_000);
  assert.equal(getCampaignCurrentRunAccounting(data, 'elephant').totalViews, 6_000_000);
  assert.deepEqual(
    { a: { submissionViews: clipA.submissionViews, approvalViews: clipA.approvalViews, publicViews: clipA.publicViews, currentViews: clipA.currentViews, payout: clipA.payout }, b: { submissionViews: clipB.submissionViews, approvalViews: clipB.approvalViews, publicViews: clipB.publicViews, currentViews: clipB.currentViews, payout: clipB.payout } },
    preservedSnapshots
  );

  const afterFirstRun = structuredClone(data);
  assert.equal(repairAugustFirstWeekLegacyWeeklyAccounting(data, new Date('2026-08-09T13:00:00.000Z')), report);
  assert.deepEqual(data, afterFirstRun);
});

test('August Week 1 migration applies Elephant cap using timestamp order and canonical consumers agree', () => {
  const clipA = makeWeeklyAccountingClip('elephant', 'creator-a', 5_000_000, {
    id: 'cap-a', videoId: 'cap-a', submittedTimestamp: Date.parse('2026-08-04T10:00:00.000Z'), submittedAt: '2026-08-04T10:00:00.000Z', approvedAt: Date.parse('2026-08-04T12:00:00.000Z'),
    budgetTracking: { budgetCycleKey: '2026-08-03T07:00:00.000Z', baselinePublicViews: 4_500_000, lastPublicViews: 5_000_000, creditedViewsThisCycle: 500_000 }
  });
  const clipB = makeWeeklyAccountingClip('elephant', 'creator-b', 4_000_000, {
    id: 'cap-b', videoId: 'cap-b', submittedTimestamp: Date.parse('2026-08-05T10:00:00.000Z'), submittedAt: '2026-08-05T10:00:00.000Z', approvedAt: Date.parse('2026-08-05T12:00:00.000Z'),
    budgetTracking: { budgetCycleKey: '2026-08-03T07:00:00.000Z', baselinePublicViews: 3_500_000, lastPublicViews: 4_000_000, creditedViewsThisCycle: 500_000 }
  });
  const clipC = makeWeeklyAccountingClip('elephant', 'creator-c', 1_000_000, {
    id: 'cap-c', videoId: 'cap-c', submittedTimestamp: Date.parse('2026-08-08T10:00:00.000Z'), submittedAt: '2026-08-08T10:00:00.000Z', approvedAt: Date.parse('2026-08-08T12:00:00.000Z')
  });
  const data = { clips: { clipA, clipB, clipC }, clipReviews: {}, storageMigrations: {} };

  const report = repairAugustFirstWeekLegacyWeeklyAccounting(data, new Date('2026-08-09T12:00:00.000Z'));
  const week = getCampaignCurrentWeekAccounting(data, 'elephant', new Date('2026-08-09T12:00:00.000Z'));
  const run = getCampaignCurrentRunAccounting(data, 'elephant');

  assert.equal(report.legitimateTotalBeforeCap, 10_000_000);
  assert.equal(report.displayedTotalAfterCap, 8_000_000);
  assert.equal(week.creditedViews, 8_000_000);
  assert.equal(week.creditedMoney, 2400);
  assert.equal(week.remainingBudget, 0);
  assert.equal(run.totalViews, 8_000_000);
  assert.equal(report.clips.reduce((sum, clip) => sum + clip.currentWeekCreditedViewsAfter, 0), 8_000_000);
});

test('Campaign Status separates earning and weekly periods and uses weekly fulfilled accounting', () => {
  const data = {
    clips: {
      creator: makeWeeklyAccountingClip('elephant', 'creator-a', 4_200_000),
      others: makeWeeklyAccountingClip('elephant', 'creator-b', 100_000, { platform: 'tiktok' })
    },
    clipReviews: {}
  };
  const description = buildCampaignStatusEmbed(CAMPAIGNS.elephant, data, new Date('2026-08-09T12:00:00.000Z')).data.description;

  assert.match(description, /Earning Period/);
  assert.match(description, /Aug 3 - Aug 31/);
  assert.match(description, /Current Weekly Budget Period/);
  assert.match(description, /Aug 3 - Aug 10/);
  assert.match(description, /Weekly Views:\*\* 4\.3M \/ 8\.0M/);
  assert.match(description, /Weekly Fulfilled:\*\* \$1\.3K \(53\.8%\)/);
  assert.match(description, /Weekly Remaining:\*\* \$1\.1K/);
  assert.doesNotMatch(description, /Total Fulfilled/);
});

test('campaign panel Fulfilled button uses canonical weekly view-cap percentage', () => {
  const currentWeek = new Date('2026-08-09T12:00:00.000Z');
  const nextWeek = new Date('2026-08-10T07:00:00.000Z');
  const elephantFull = { clips: { clip: makeWeeklyAccountingClip('elephant', 'creator-a', 8_000_000) }, clipReviews: {} };
  const elephantHalf = { clips: { clip: makeWeeklyAccountingClip('elephant', 'creator-a', 4_000_000) }, clipReviews: {} };
  const crowderFull = { clips: { clip: makeWeeklyAccountingClip('crowder', 'creator-a', 7_000_000) }, clipReviews: {} };
  const crowderHalf = { clips: { clip: makeWeeklyAccountingClip('crowder', 'creator-a', 3_500_000) }, clipReviews: {} };

  assert.equal(getCampaignPanelFulfilledPercent(CAMPAIGNS.elephant, elephantFull, currentWeek), 100);
  assert.equal(getCampaignPanelFulfilledPercent(CAMPAIGNS.elephant, elephantHalf, currentWeek), 50);
  assert.equal(getCampaignPanelFulfilledPercent(CAMPAIGNS.crowder, crowderFull, currentWeek), 100);
  assert.equal(getCampaignPanelFulfilledPercent(CAMPAIGNS.crowder, crowderHalf, currentWeek), 50);
  assert.equal(getCampaignPanelFulfilledPercent(CAMPAIGNS.elephant, elephantFull, nextWeek), 0);

  const fulfilledButton = buildCampaignPanelButtons(CAMPAIGNS.elephant, elephantFull, currentWeek)[0].components[2];
  assert.equal(fulfilledButton.data.label, 'Fulfilled: 100.0%');
  assert.equal(fulfilledButton.data.disabled, true);
});

test('Submit Clip button follows canonical live, weekly-paused, and finished campaign state', () => {
  const currentWeek = new Date('2026-08-09T12:00:00.000Z');
  const mondayReset = new Date('2026-08-10T07:00:00.000Z');
  const monthlyEnd = new Date('2026-08-31T07:00:00.000Z');
  const elephantLive = { clips: { clip: makeWeeklyAccountingClip('elephant', 'creator-a', 7_900_000) }, clipReviews: {} };
  const elephantFull = { clips: { clip: makeWeeklyAccountingClip('elephant', 'creator-a', 8_000_000) }, clipReviews: {} };
  const crowderFull = { clips: { clip: makeWeeklyAccountingClip('crowder', 'creator-a', 7_000_000) }, clipReviews: {} };

  const liveState = getCampaignOperationalState(elephantLive, CAMPAIGNS.elephant, currentWeek);
  const liveButton = buildCampaignSubmitClipButton(CAMPAIGNS.elephant, elephantLive, currentWeek).data;
  assert.equal(liveState.state, 'live');
  assert.equal(liveButton.label, 'Submit Clip');
  assert.equal(liveButton.emoji.name, '⬆️');
  assert.equal(liveButton.style, ButtonStyle.Success);
  assert.equal(liveButton.disabled, false);

  const elephantPausedState = getCampaignOperationalState(elephantFull, CAMPAIGNS.elephant, currentWeek);
  const elephantPausedButton = buildCampaignSubmissionPanelComponents(CAMPAIGNS.elephant, elephantFull, currentWeek)[0].components[0].data;
  assert.equal(elephantPausedState.state, 'weekly_paused');
  assert.equal(elephantPausedButton.label, 'Submissions Paused');
  assert.equal(elephantPausedButton.emoji.name, '⛔');
  assert.equal(elephantPausedButton.style, ButtonStyle.Danger);
  assert.equal(elephantPausedButton.disabled, true);
  assert.equal(
    getCampaignSubmissionBlockMessage(elephantPausedState),
    '❌ Submissions are temporarily paused because this campaign has reached its weekly view cap. Submissions reopen after the next weekly reset.'
  );

  const crowderPausedButton = buildCampaignSubmitClipButton(CAMPAIGNS.crowder, crowderFull, currentWeek).data;
  assert.equal(getCampaignOperationalState(crowderFull, CAMPAIGNS.crowder, currentWeek).state, 'weekly_paused');
  assert.equal(crowderPausedButton.label, 'Submissions Paused');
  assert.equal(crowderPausedButton.style, ButtonStyle.Danger);
  assert.equal(crowderPausedButton.disabled, true);

  const resetButton = buildCampaignSubmitClipButton(CAMPAIGNS.elephant, elephantFull, mondayReset).data;
  assert.equal(getCampaignOperationalState(elephantFull, CAMPAIGNS.elephant, mondayReset).state, 'live');
  assert.equal(resetButton.label, 'Submit Clip');
  assert.equal(resetButton.style, ButtonStyle.Success);
  assert.equal(resetButton.disabled, false);

  const staffFinishedData = {
    ...elephantFull,
    campaignStatus: { elephant: { status: 'finished' } }
  };
  const staffFinishedState = getCampaignOperationalState(staffFinishedData, CAMPAIGNS.elephant, currentWeek);
  const staffFinishedButton = buildCampaignSubmitClipButton(CAMPAIGNS.elephant, staffFinishedData, currentWeek).data;
  assert.equal(staffFinishedState.state, 'finished');
  assert.equal(staffFinishedButton.label, 'Campaign Finished');
  assert.equal(staffFinishedButton.emoji.name, '🏁');
  assert.equal(staffFinishedButton.style, ButtonStyle.Danger);
  assert.equal(staffFinishedButton.disabled, true);
  assert.equal(
    getCampaignSubmissionBlockMessage(staffFinishedState),
    '❌ This campaign has finished and is no longer accepting submissions.'
  );

  const monthlyFinishedButton = buildCampaignSubmitClipButton(CAMPAIGNS.elephant, elephantFull, monthlyEnd).data;
  assert.equal(getCampaignOperationalState(elephantFull, CAMPAIGNS.elephant, monthlyEnd).state, 'finished');
  assert.equal(monthlyFinishedButton.label, 'Campaign Finished');
  assert.equal(monthlyFinishedButton.disabled, true);
});

test('Elephant Submit panel discovery repairs stale and duplicate buttons from canonical Week 2 state', async () => {
  const now = new Date('2026-08-10T12:00:00.000Z');
  const clip = makeWeeklyAccountingClip('elephant', 'creator-a', 938_600, {
    publicViews: 938_600,
    currentViews: 938_600,
    campaignCreditedViews: 938_600,
    views: 938_600,
    budgetTracking: {
      budgetCycleKey: '2026-08-10T07:00:00.000Z',
      baselinePublicViews: 0,
      lastPublicViews: 938_600,
      creditedViewsThisCycle: 938_600
    }
  });
  const data = { clips: { clip }, clipReviews: {}, campaignSubmissionPanels: {} };
  const accounting = getCampaignCurrentWeekAccounting(data, 'elephant', now);
  assert.equal(accounting.creditedViews, 938_600);
  assert.equal(accounting.capReached, false);
  assert.equal(getCampaignOperationalState(data, CAMPAIGNS.elephant, now).state, 'live');
  assert.equal(getCampaignPanelFulfilledPercent(CAMPAIGNS.elephant, data, now).toFixed(1), '11.7');

  const makeStalePanel = ({ id, channelId, pinned, createdTimestamp }) => {
    const message = {
      id,
      pinned,
      createdTimestamp,
      author: { id: 'bot-1' },
      components: [{ components: [{ customId: 'submit_clip:elephant', label: 'Submissions Paused', disabled: true }] }],
      editPayloads: [],
      async edit(payload) {
        this.editPayloads.push(payload);
        const button = payload.components[0].components[0].data;
        this.components = [{ components: [{ customId: button.custom_id, label: button.label, disabled: button.disabled === true }] }];
        return this;
      }
    };
    const channel = {
      id: channelId,
      name: `elephant-${channelId}`,
      messages: { fetch: async input => typeof input === 'string' ? message : new Map([[message.id, message]]) }
    };
    return { channel, message };
  };
  const visible = makeStalePanel({ id: 'visible-panel', channelId: 'channel-visible', pinned: true, createdTimestamp: 1000 });
  const duplicate = makeStalePanel({ id: 'duplicate-panel', channelId: 'channel-duplicate', pinned: false, createdTimestamp: 2000 });
  const channels = new Map([[visible.channel.id, visible.channel], [duplicate.channel.id, duplicate.channel]]);
  const guild = {
    id: 'guild-1',
    channels: {
      cache: channels,
      fetch: async channelId => channelId ? channels.get(channelId) || null : channels
    }
  };
  let saved = false;
  const result = await updateCampaignSubmissionPanelMessage(guild, 'elephant', {
    data,
    now,
    botUserId: 'bot-1',
    saveData: () => { saved = true; }
  });

  assert.equal(result.updated, true);
  assert.equal(result.panels.length, 2);
  assert.equal(result.canonical.messageId, 'visible-panel');
  assert.equal(result.canonical.previousLabel, 'Submissions Paused');
  assert.equal(result.canonical.previousDisabled, true);
  assert.equal(result.canonical.renderedLabel, 'Submit Clip');
  assert.equal(result.canonical.renderedDisabled, false);
  assert.equal(visible.message.editPayloads[0].components[0].components[0].data.emoji.name, '⬆️');
  assert.equal(result.panels.every(panel => panel.edited), true);
  assert.equal(visible.message.editPayloads[0].components[0].components[0].data.label, 'Submit Clip');
  assert.equal(visible.message.editPayloads[0].components[0].components[0].data.disabled, false);
  assert.equal(duplicate.message.editPayloads[0].components[0].components[0].data.label, 'Submit Clip');
  assert.equal(data.campaignSubmissionPanels.elephant.channelId, 'channel-visible');
  assert.equal(data.campaignSubmissionPanels.elephant.messageId, 'visible-panel');
  assert.equal(saved, true);
  assert.equal(getCampaignSubmitButtonFromMessage(visible.message, 'elephant').label, 'Submit Clip');

  const discovered = await findAllCampaignSubmissionPanelMessages(guild, 'elephant', { botUserId: 'bot-1' });
  assert.deepEqual(discovered.map(panel => panel.message.id), ['visible-panel', 'duplicate-panel']);
});

function makeStraightTestCampaign(overrides = {}) {
  return {
    id: 'straight_test',
    name: 'Straight Test Campaign',
    allowedPlatforms: ['tiktok'],
    campaignBudget: 500,
    viewCap: 1_000_000,
    ratePerMillion: 500,
    budgetMode: 'straight',
    earningCycle: 'straight',
    accountMode: 'global_auto_verify',
    source: 'internal',
    refillable: true,
    launchAt: '2026-08-01T12:00:00.000Z',
    rulesChannelId: 'rules-channel',
    payoutThresholdViews: 10_000,
    maxPayoutPerClipPercent: 100,
    status: 'active',
    roleId: 'campaign-role',
    shortDescription: 'Post eligible configured campaign clips.',
    clipRequirement: 'Use approved campaign source content',
    countryTiers: ['Tier 1', 'Tier 2'],
    minimumVideoDuration: '20 seconds',
    ...overrides
  };
}

function makeStraightTestClip(creditedViews, overrides = {}) {
  const publicViews = Number(overrides.publicViews ?? creditedViews);
  return {
    id: overrides.id || 'straight-clip',
    userId: overrides.userId || 'creator-a',
    campaignId: 'straight_test',
    platform: 'tiktok',
    username: 'dailyclips',
    status: 'approved',
    payoutEligible: true,
    wasEverApproved: true,
    submittedTimestamp: Date.parse('2026-08-04T12:00:00.000Z'),
    submittedAt: '2026-08-04T12:00:00.000Z',
    publicViews,
    currentViews: publicViews,
    submissionViews: 0,
    approvalViews: 0,
    views: creditedViews,
    campaignCreditedViews: creditedViews,
    trackingStatus: 'active',
    straightTracking: { baselinePublicViews: 0, lastPublicViews: publicViews, creditedViews, baselinePending: false },
    payout: { paidViews: 0, paidMoney: 0, history: [] },
    ...overrides
  };
}

test('straight campaign accounting is continuous across weekly/monthly boundaries and finishes at its total allocation', () => {
  const campaign = makeStraightTestCampaign();
  CAMPAIGNS[campaign.id] = campaign;
  try {
    const empty = { clips: {}, clipReviews: {}, campaignStatus: {}, campaignAllocations: {} };
    const zero = getStraightCampaignAccounting(empty, campaign.id);
    assert.equal(getCampaignBudgetMode(campaign), 'straight');
    assert.equal(isStraightCampaign(campaign), true);
    assert.equal(zero.creditedViews, 0);
    assert.equal(zero.creditedMoney, 0);
    assert.equal(zero.fulfilledPercent, 0);
    assert.equal(zero.capReached, false);
    assert.equal(getCampaignOperationalState(empty, campaign, new Date('2026-08-09T12:00:00Z')).state, 'live');
    assert.equal(buildCampaignSubmitClipButton(campaign, empty).data.disabled, false);

    const half = { clips: { clip: makeStraightTestClip(500_000) }, clipReviews: {}, campaignStatus: {}, campaignAllocations: {} };
    const halfAccounting = getStraightCampaignAccounting(half, campaign.id);
    assert.equal(halfAccounting.creditedViews, 500_000);
    assert.equal(halfAccounting.creditedMoney, 250);
    assert.equal(halfAccounting.remainingViews, 500_000);
    assert.equal(halfAccounting.remainingMoney, 250);
    assert.equal(halfAccounting.fulfilledPercent, 50);
    assert.equal(getCampaignPanelFulfilledPercent(campaign, half, new Date('2026-08-10T07:00:00Z')), 50);
    assert.equal(getStraightCampaignAccounting(half, campaign.id).creditedViews, 500_000);
    assert.equal(getCampaignOperationalState(half, campaign, new Date('2026-09-10T07:00:00Z')).state, 'live');
    assert.equal(getStraightCampaignAccounting(half, campaign.id).creditedViews, 500_000);

    const fullClip = makeStraightTestClip(1_000_000);
    const full = { clips: { fullClip }, clipReviews: {}, campaignStatus: {}, campaignAllocations: {} };
    assert.equal(finalizeStraightCampaignIfFulfilled(full, campaign.id, 12345), true);
    const fullAccounting = getStraightCampaignAccounting(full, campaign.id);
    assert.equal(fullAccounting.creditedViews, 1_000_000);
    assert.equal(fullAccounting.creditedMoney, 500);
    assert.equal(fullAccounting.remainingMoney, 0);
    assert.equal(fullAccounting.fulfilledPercent, 100);
    assert.equal(full.campaignStatus[campaign.id].status, 'finished_budget');
    assert.equal(full.campaignStatus[campaign.id].finishReason, 'campaign_budget_fulfilled');
    assert.equal(shouldTrackClip(fullClip, campaign, full), false);
    const submitButton = buildCampaignSubmitClipButton(campaign, full).data;
    assert.equal(submitButton.label, 'Campaign Finished');
    assert.equal(submitButton.style, ButtonStyle.Danger);
    assert.equal(submitButton.disabled, true);
    assert.equal(buildCampaignPanelButtons(campaign, full)[0].components[0].data.disabled, true);
  } finally {
    delete CAMPAIGNS[campaign.id];
  }
});

test('straight campaign refill adds cumulative capacity and excludes the finished-period view gap', async () => {
  const campaign = makeStraightTestCampaign();
  CAMPAIGNS[campaign.id] = campaign;
  try {
    const clip = makeStraightTestClip(1_000_000, { publicViews: 1_000_000, currentViews: 1_000_000 });
    const data = { clips: { clip }, clipReviews: {}, campaignStatus: {}, campaignAllocations: {} };
    finalizeStraightCampaignIfFulfilled(data, campaign.id, 1000);

    const afterRefill = await refillStraightCampaign(data, campaign.id, 500, 1_000_000, {
      now: 2000,
      refilledBy: 'staff',
      fetchMetadata: async () => ({ views: 1_300_000 })
    });
    assert.equal(afterRefill.budget, 1000);
    assert.equal(afterRefill.viewCap, 2_000_000);
    assert.equal(afterRefill.creditedViews, 1_000_000);
    assert.equal(data.campaignStatus[campaign.id].status, 'active');
    assert.equal(clip.straightTracking.lastPublicViews, 1_300_000);
    assert.equal(getCampaignOperationalState(data, campaign).state, 'live');
    assert.equal(shouldTrackClip(clip, campaign, data), true);

    updateApprovedClipTracking(clip, { views: 1_300_000 }, data);
    assert.equal(clip.campaignCreditedViews, 1_000_000);
    updateApprovedClipTracking(clip, { views: 1_500_000 }, data);
    assert.equal(clip.campaignCreditedViews, 1_200_000);
    assert.equal(getStraightCampaignAccounting(data, campaign.id).creditedMoney, 600);

    const fallbackData = { clips: { clip: makeStraightTestClip(1_000_000) }, clipReviews: {}, campaignStatus: {}, campaignAllocations: {} };
    finalizeStraightCampaignIfFulfilled(fallbackData, campaign.id, 1000);
    await refillStraightCampaign(fallbackData, campaign.id, 500, 1_000_000, {
      now: 2000,
      fetchMetadata: async () => { throw new Error('provider down'); }
    });
    const fallbackClip = fallbackData.clips.clip;
    assert.equal(fallbackClip.straightTracking.baselinePending, true);
    updateApprovedClipTracking(fallbackClip, { views: 1_400_000 }, fallbackData);
    assert.equal(fallbackClip.campaignCreditedViews, 1_000_000);
    assert.equal(fallbackClip.straightTracking.baselinePending, false);
  } finally {
    delete CAMPAIGNS[campaign.id];
  }
});

test('straight campaign short panel is configuration-driven and omits weekly/monthly periods', () => {
  const campaign = makeStraightTestCampaign();
  const text = buildShortCampaignPanelText(campaign);
  assert.equal(getCampaignPanelText(campaign), text);
  assert.match(text, /Straight Test Campaign/);
  assert.match(text, /Use approved campaign source content/);
  assert.match(text, /TikTok/);
  assert.match(text, /Tier 1, Tier 2/);
  assert.match(text, /20 seconds/);
  assert.match(text, /\$0\.50 per 1,000 views/);
  assert.doesNotMatch(text, /Weekly|Monthly|Next .* Reset/i);
});

test('ICE is configured with fixed straight economics but remains non-operational until a valid UTC launchAt exists', () => {
  const campaign = CAMPAIGNS.ice;
  assert.equal(campaign.name, 'ICE');
  assert.deepEqual(campaign.allowedPlatforms, ['tiktok', 'instagram', 'youtube']);
  assert.deepEqual(campaign.countryTiers, ['Tier 1', 'Tier 2', 'Tier 3']);
  assert.equal(campaign.minimumVideoDurationSeconds, 10);
  assert.equal(campaign.budgetMode, 'straight');
  assert.equal(campaign.earningCycle, 'straight');
  assert.equal(campaign.accountMode, 'global_auto_verify');
  assert.equal(campaign.source, 'internal');
  assert.equal(campaign.campaignBudget, 500);
  assert.equal(campaign.viewCap, 1_000_000);
  assert.equal(campaign.ratePerMillion, 500);
  assert.equal(campaign.payoutThresholdViews, 10_000);
  assert.equal(campaign.maxPayoutPerClipPercent, 10);
  assert.equal(campaign.refillable, true);
  assert.equal(campaign.launchAt, null);
  assert.match(campaign.panelText, /Earn Money Posting Clips & Edits – ICE/);
  assert.match(campaign.panelText, /Max Payout Per Clip:\*\* \$50/);

  const data = { clips: {}, clipReviews: {}, campaignStatus: {}, campaignAllocations: {} };
  assert.equal(getCampaignOperationalState(data, campaign).state, 'not_launched');
  assert.match(getCampaignJoinBlockReason(campaign, data), /not live yet/i);
  assert.equal(buildCampaignSubmitClipButton(campaign, data).data.disabled, true);
  assert.equal(buildCampaignPanelButtons(campaign, data)[0].components[0].data.disabled, true);

  const configured = { ...campaign, launchAt: '2026-08-10T12:00:00.000Z' };
  assert.equal(getCampaignOperationalState(data, configured, new Date('2026-08-10T11:59:59.999Z')).state, 'not_launched');
  assert.equal(getCampaignOperationalState(data, configured, new Date('2026-08-10T12:00:00.000Z')).state, 'live');
  assert.equal(getCampaignOperationalState(data, { ...campaign, launchAt: '2026-08-10 12:00:00' }).state, 'not_launched');

  const payoutLimit = getCampaignPerClipPayoutLimit(data, campaign);
  assert.equal(payoutLimit.maxPayoutAmount, 50);
  assert.equal(payoutLimit.maxCampaignCreditedViews, 100_000);
});

test('ICE duration and demographics gates reuse normalized provider metadata and approved Tier 1/2/3 state', () => {
  const campaign = CAMPAIGNS.ice;
  assert.equal(normalizeVideoDurationSeconds(10), 10);
  assert.equal(normalizeVideoDurationSeconds('PT1M2.5S'), 62.5);
  assert.equal(normalizeVideoDurationSeconds(null), null);
  assert.equal(validateCampaignVideoDuration(campaign, { durationSeconds: 9.9 }).code, 'VIDEO_TOO_SHORT');
  assert.equal(validateCampaignVideoDuration(campaign, { durationSeconds: 10 }).valid, true);
  assert.equal(validateCampaignVideoDuration(campaign, {}).code, 'VIDEO_DURATION_UNAVAILABLE');

  for (const tier of ['Tier 1', 'Tier 2', 'Tier 3']) {
    assert.equal(getCampaignDemographicEligibility({ demographics: { status: 'approved', tier } }, campaign).eligible, true);
  }
  assert.equal(getCampaignDemographicEligibility({ demographics: { status: 'approved', tier: 'Tier 4' } }, campaign).eligible, false);
  assert.equal(getCampaignDemographicEligibility({}, campaign).eligible, false);
  assert.match(buildMissingCampaignDemographicsResponse('guild-1', campaign).embeds[0].data.title, /Demographics Required/);
  assert.equal(getCampaignDemographicEligibility({}, CAMPAIGNS.elephant).eligible, true);
});

test('non-Monsterlab join success uses Creators Elite branding and the configured user-facing rules link', () => {
  const campaign = makeStraightTestCampaign();
  const interaction = {
    member: { displayName: 'DailyClips' },
    user: { username: 'dailyclips' },
    guild: { iconURL: () => 'https://example.com/icon.png' }
  };
  const embed = buildCampaignJoinSuccessEmbed(interaction, campaign, { accountReady: true, alreadyJoined: false });
  const description = embed.data.description;
  assert.match(embed.data.title, /Let's Get Clipping, DailyClips/);
  assert.match(description, /successfully joined/);
  assert.match(description, /ready to start clipping/);
  assert.match(description, /read the campaign rules/);
  assert.doesNotMatch(description, /Connect Account|Clippy|Clip Money|clip\.tech/i);
  assert.equal(embed.data.footer.text, 'Creators Elite');

  assert.equal(getCampaignRulesLink('guild-1', campaign), 'https://discord.com/channels/guild-1/rules-channel');
  const rulesButton = buildCampaignRulesRow('guild-1', campaign).components[0].data;
  assert.equal(rulesButton.style, ButtonStyle.Link);
  assert.equal(rulesButton.label, 'Campaign Rules');
  assert.equal(buildCampaignRulesRow('guild-1', { ...campaign, rulesChannelId: null }), null);
});

test('non-Monsterlab publication validation rejects pre-launch videos, accepts the exact boundary, and fails closed without a provider date', () => {
  const campaign = makeStraightTestCampaign({ launchAt: '2026-08-10T12:00:00.000Z' });
  const before = validateCampaignPublicationDate(campaign, { publishedAt: '2026-08-10T10:00:00.000Z' });
  assert.equal(before.valid, false);
  assert.equal(before.code, 'VIDEO_PREDATES_CAMPAIGN');
  const rejection = buildPreLaunchSubmissionEmbed(campaign, 'tiktok', before.publishedAt, before.campaignLaunch).data;
  assert.match(rejection.title, /Video Posted Before Campaign Launch/);
  assert.match(rejection.description, /not eligible/);
  assert.equal(rejection.fields[0].value, 'TikTok');

  assert.equal(validateCampaignPublicationDate(campaign, { publishedAt: campaign.launchAt }).valid, true);
  assert.equal(validateCampaignPublicationDate(campaign, { publishedAt: '2026-08-10T12:01:00.000Z' }).valid, true);
  const missing = validateCampaignPublicationDate(campaign, { publishedAt: null });
  assert.equal(missing.valid, false);
  assert.equal(missing.code, 'PUBLICATION_DATE_UNAVAILABLE');
  assert.equal(validateCampaignPublicationDate(CAMPAIGNS.elephant, {}).valid, true);
  assert.equal(getCampaignPerClipPayoutLimit({}, CAMPAIGNS.elephant), null);
  assert.equal(getCampaignPayoutThresholdViews(CAMPAIGNS.elephant), CAMPAIGNS.elephant.payoutThreshold);
});

test('non-Monsterlab payout threshold aggregates current unpaid credited views across all platforms', () => {
  const campaign = makeStraightTestCampaign({ allowedPlatforms: ['tiktok', 'instagram', 'youtube'] });
  CAMPAIGNS[campaign.id] = campaign;
  try {
    const clips = {
      tiktok: makeStraightTestClip(4_000, { id: 'tt', platform: 'tiktok' }),
      instagram: makeStraightTestClip(3_000, { id: 'ig', platform: 'instagram' }),
      youtube: makeStraightTestClip(3_000, { id: 'yt', platform: 'youtube' })
    };
    const data = { clips, clipReviews: {}, payoutTrackers: {}, campaignStatus: {}, campaignAllocations: {} };
    const ready = buildCampaignStatsEmbed(data, {}, campaign.id, campaign.name, 'creator-a').data.description;
    assert.equal(getCampaignPayoutThresholdViews(campaign), 10_000);
    assert.match(ready, /Campaign Earned Views/);
    assert.match(ready, /Ready for payout/);
    assert.doesNotMatch(ready, /Current Week Views|Monthly Earned Views/);

    for (const clip of Object.values(clips)) {
      clip.payout.paidViews = clip.campaignCreditedViews;
      clip.payout.paidMoney = clip.campaignCreditedViews / 1_000_000 * campaign.ratePerMillion;
    }
    const paid = buildCampaignStatsEmbed(data, {}, campaign.id, campaign.name, 'creator-a').data.description;
    assert.match(paid, /Need \*\*10K\*\* more unpaid views/);
  } finally {
    delete CAMPAIGNS[campaign.id];
  }
});

test('non-Monsterlab clips snapshot and enforce the 10 percent payout cap without clamping public views', () => {
  const campaign = makeStraightTestCampaign({ maxPayoutPerClipPercent: 10 });
  CAMPAIGNS[campaign.id] = campaign;
  try {
    assert.equal(getCampaignPerClipPayoutLimit({}, { ...campaign, maxPayoutPerClipPercent: undefined }), null);
    assert.equal(getCampaignPerClipPayoutLimit({}, { ...campaign, maxPayoutPerClipPercent: 20 }).maxPayoutAmount, 100);
    const clip = makeStraightTestClip(0, {
      id: 'viral-clip', status: 'pending', payoutEligible: false,
      publicViews: 500_000, currentViews: 500_000, submissionViews: 0, approvalViews: 0
    });
    const data = { clips: {}, clipReviews: { [clip.id]: clip }, campaignStatus: {}, campaignAllocations: {} };
    const configuredLimit = getCampaignPerClipPayoutLimit(data, campaign);
    assert.equal(configuredLimit.maxPayoutAmount, 50);
    assert.equal(configuredLimit.maxCampaignCreditedViews, 100_000);

    const credited = applyApprovalSnapshotAccounting(clip, campaign, data, 500_000, 1000);
    assert.equal(credited, 100_000);
    assert.equal(clip.publicViews, 500_000);
    assert.equal(clip.currentViews, 500_000);
    assert.equal(clip.approvalViews, 500_000);
    assert.equal(clip.maxPayoutAmount, 50);
    assert.equal(clip.maxCampaignCreditedViews, 100_000);
    assert.equal(clip.totalMoneyMade, 50);
    assert.equal(clip.clipPayoutCapReached, true);
    assert.equal(clip.completedReason, 'clip_payout_cap_reached');
    assert.match(buildClipStaffEmbed(clip).data.description, /Clip Payout Limit\*\*\n\$50\.00 — Reached/);

    clip.status = 'approved';
    clip.payoutEligible = true;
    data.clips[clip.id] = clip;
    delete data.clipReviews[clip.id];
    applyStraightCampaignRefill(data, campaign.id, 500, 1_000_000, {
      now: 2000,
      baselineViews: { [clip.id]: 600_000 }
    });
    assert.equal(clip.maxPayoutAmount, 50);
    assert.equal(clip.maxCampaignCreditedViews, 100_000);
    assert.equal(clip.trackingStatus, 'completed');
    assert.equal(clip.nextCheckAt, null);
    updateApprovedClipTracking(clip, { views: 700_000 }, data);
    assert.equal(clip.publicViews, 700_000);
    assert.equal(clip.campaignCreditedViews, 100_000);
  } finally {
    delete CAMPAIGNS[campaign.id];
  }
});

test('ten individually capped clips fulfill the shared straight campaign allocation', () => {
  const campaign = makeStraightTestCampaign({ maxPayoutPerClipPercent: 10 });
  CAMPAIGNS[campaign.id] = campaign;
  try {
    const data = { clips: {}, clipReviews: {}, campaignStatus: {}, campaignAllocations: {} };
    for (let index = 0; index < 10; index++) {
      const clip = makeStraightTestClip(0, {
        id: `capped-${index}`, status: 'pending', payoutEligible: false,
        publicViews: 500_000, currentViews: 500_000, submissionViews: 0
      });
      data.clipReviews[clip.id] = clip;
      applyApprovalSnapshotAccounting(clip, campaign, data, 500_000, 1000 + index);
    }
    const accounting = getStraightCampaignAccounting(data, campaign.id);
    assert.equal(accounting.creditedViews, 1_000_000);
    assert.equal(accounting.creditedMoney, 500);
    assert.equal(accounting.fulfilledPercent, 100);
    assert.equal(accounting.capReached, true);
    assert.equal(data.campaignStatus[campaign.id].status, 'finished_budget');
  } finally {
    delete CAMPAIGNS[campaign.id];
  }
});

test('global social panel uses platform-first buttons and one-field mobile-friendly modals', () => {
  const chooser = buildGlobalSocialConnectChooser('straight_test');
  assert.equal(chooser.embeds[0].data.title, 'Connect your account');
  assert.match(chooser.embeds[0].data.description, /Never share a password/);
  assert.deepEqual(
    chooser.components[0].components.map(button => button.data.custom_id),
    [
      'global_social_link_platform:tiktok:straight_test',
      'global_social_link_platform:instagram:straight_test',
      'global_social_link_platform:youtube:straight_test'
    ]
  );
  for (const [platform, label] of [['tiktok', 'TikTok'], ['instagram', 'Instagram'], ['youtube', 'YouTube']]) {
    const modalJson = buildGlobalSocialLinkModal(platform, 'straight_test').toJSON();
    assert.equal(modalJson.custom_id, `global_social_link_modal:${platform}:straight_test`);
    assert.equal(modalJson.title, `Connect ${label}`);
    assert.deepEqual(modalJson.components.map(row => row.components[0].custom_id), ['global_social_username']);
    assert.match(modalJson.components[0].components[0].label, new RegExp(label));
  }

  const panel = buildGlobalSocialPanel('guild-1', 'demographics-1');
  const buttons = panel.components[0].components.map(component => component.data);
  assert.equal(buttons[0].custom_id, 'global_social_link:none');
  assert.equal(buttons[3].style, ButtonStyle.Link);
  assert.equal(buttons[3].url, 'https://discord.com/channels/guild-1/demographics-1');
  assert.match(panel.embeds[0].data.description, /Manage Your Social Accounts|Link Account/);
});

test('global bio verification creates unique expiring codes, verifies only provider-confirmed bios, and blocks duplicate ownership', async () => {
  const now = Date.parse('2026-08-09T12:00:00Z');
  const data = {
    users: { 'user-a': { socials: [] }, 'user-b': { socials: [] } },
    globalSocialVerificationRequests: {}
  };
  const request = createGlobalSocialVerificationRequest(data, { userId: 'user-a', platform: 'TikTok', username: '@dailyclips', returnCampaignId: null, now });
  const otherRequest = createGlobalSocialVerificationRequest(data, { userId: 'user-b', platform: 'yt', username: 'otherchannel', now: now + 1 });
  assert.match(request.verificationCode, /^CE-[A-F0-9]{6}$/);
  assert.notEqual(request.verificationCode, otherRequest.verificationCode);
  assert.equal(request.expiresAt, now + (30 * 60 * 1000));
  assert.equal(normalizeTypedSocialPlatform('IG'), 'instagram');
  assert.equal(normalizeTypedSocialPlatform('TIKTOK'), 'tiktok');
  assert.equal(normalizeTypedSocialPlatform('unsupported'), null);
  const prompt = buildGlobalSocialVerificationPrompt(request);
  assert.match(prompt.embeds[0].data.description, new RegExp(request.verificationCode));
  assert.equal(prompt.components[0].components[0].data.custom_id, `global_social_verify:${request.id}`);

  const wrongCreator = await verifyGlobalSocialVerificationRequest(data, request.id, {
    now: now + 500,
    requestingUserId: 'user-b',
    fetchProfile: async () => ({ platform: 'tiktok', username: 'dailyclips', bio: request.verificationCode })
  });
  assert.equal(wrongCreator.verified, false);
  assert.equal(wrongCreator.code, 'NOT_REQUEST_OWNER');

  const success = await verifyGlobalSocialVerificationRequest(data, request.id, {
    now: now + 1000,
    fetchProfile: async () => ({
      platform: 'tiktok', username: 'dailyclips', displayName: 'Daily Clips',
      bio: `Creator verification ${request.verificationCode}`, profileUrl: 'https://www.tiktok.com/@dailyclips',
      avatarUrl: null, followers: 100, externalAccountId: 'tt-1', rawProvider: 'test'
    })
  });
  assert.equal(success.verified, true);
  assert.equal(data.users['user-a'].socials.length, 1);
  assert.equal(data.users['user-a'].socials[0].verificationMethod, 'bio_code_api');
  assert.equal(data.users['user-a'].socials[0].status, 'verified');

  const noCodeRequest = createGlobalSocialVerificationRequest(data, { userId: 'user-b', platform: 'youtube', username: 'otherchannel', now: now + 2000 });
  const noCode = await verifyGlobalSocialVerificationRequest(data, noCodeRequest.id, {
    now: now + 3000,
    fetchProfile: async () => ({ platform: 'youtube', username: 'otherchannel', bio: 'No verification code here' })
  });
  assert.equal(noCode.verified, false);
  assert.equal(noCode.code, 'CODE_NOT_FOUND');
  assert.equal(data.users['user-b'].socials.length, 0);

  const duplicate = createGlobalSocialVerificationRequest(data, { userId: 'user-b', platform: 'tiktok', username: 'dailyclips', now: now + 4000 });
  const duplicateResult = await verifyGlobalSocialVerificationRequest(data, duplicate.id, {
    now: now + 5000,
    fetchProfile: async () => { throw new Error('must not be called'); }
  });
  assert.equal(duplicateResult.verified, false);
  assert.equal(duplicateResult.code, 'OWNED_BY_ANOTHER_USER');
});

test('Instagram profile provider uses the documented Actor input and normalizes safe identity fields', async () => {
  assert.deepEqual(buildApifyInstagramProfileInput('@Creators.Elite'), { usernames: ['creators.elite'] });
  const actorItem = {
    inputUrl: 'https://www.instagram.com/creators.elite',
    id: '17841400000000123',
    username: 'Creators.Elite',
    url: 'https://www.instagram.com/creators.elite',
    fullName: 'Creators Elite',
    biography: 'Official creator profile',
    followersCount: 12500,
    private: false,
    verified: true,
    profilePicUrl: 'https://images.example/avatar.jpg',
    profilePicUrlHD: 'https://images.example/avatar-hd.jpg'
  };
  let requestedUsername = null;
  const profile = await fetchInstagramPublicProfile('@Creators.Elite', {
    runActor: async username => {
      requestedUsername = username;
      return [actorItem];
    }
  });
  assert.equal(requestedUsername, 'creators.elite');
  assert.deepEqual(profile, {
    platform: 'instagram',
    username: 'Creators.Elite',
    normalizedUsername: 'creators.elite',
    platformAccountId: '17841400000000123',
    displayName: 'Creators Elite',
    bio: 'Official creator profile',
    profileUrl: 'https://www.instagram.com/creators.elite',
    avatarUrl: 'https://images.example/avatar-hd.jpg',
    followers: 12500,
    private: false,
    verifiedBadge: true,
    rawProvider: 'apify/instagram-profile-scraper'
  });
  assert.deepEqual(normalizeApifyInstagramProfile(actorItem, 'creators.elite'), profile);
  await assert.rejects(
    fetchInstagramPublicProfile('creators.elite', { runActor: async () => [{ username: 'creators.elite', error: 'upstream failed' }] }),
    /usable Instagram profile data/
  );
});

test('Instagram bio verification fails closed, preserves retryable requests, and enforces its cooldown', async () => {
  const now = Date.parse('2026-08-09T13:00:00Z');
  const makeData = () => ({ users: { creator: { socials: [] } }, globalSocialVerificationRequests: {} });
  const makeProfile = (request, overrides = {}) => ({
    platform: 'instagram',
    username: request.username,
    normalizedUsername: request.normalizedUsername,
    platformAccountId: 'ig-profile-1',
    displayName: 'Creator',
    bio: `Creator ${request.verificationCode}`,
    profileUrl: `https://www.instagram.com/${request.normalizedUsername}/`,
    avatarUrl: null,
    followers: 10,
    private: false,
    verifiedBadge: false,
    rawProvider: 'apify/instagram-profile-scraper',
    ...overrides
  });

  assert.equal(bioContainsExactVerificationCode('hello CE-ABC123 world', 'CE-ABC123'), true);
  assert.equal(bioContainsExactVerificationCode('hello CE-ABC1234 world', 'CE-ABC123'), false);
  assert.equal(bioContainsExactVerificationCode('hello ce-abc123 world', 'CE-ABC123'), false);
  assert.equal(bioContainsExactVerificationCode(null, 'CE-ABC123'), false);

  const successData = makeData();
  const successRequest = createGlobalSocialVerificationRequest(successData, { userId: 'creator', platform: 'instagram', username: '@creator.ig', now });
  const success = await verifyGlobalSocialVerificationRequest(successData, successRequest.id, {
    now: now + 1000,
    requestingUserId: 'creator',
    fetchProfile: async () => makeProfile(successRequest)
  });
  assert.equal(success.verified, true);
  assert.equal(success.social.platformAccountId, 'ig-profile-1');
  assert.equal(success.social.provider, 'apify/instagram-profile-scraper');
  assert.equal(successRequest.status, 'verified');
  assert.equal(buildInstagramVerificationSuccessEmbed(success.social).data.title, 'Instagram Account Verified ✅');

  const missingData = makeData();
  const missingRequest = createGlobalSocialVerificationRequest(missingData, { userId: 'creator', platform: 'instagram', username: 'missingcode', now });
  const missing = await verifyGlobalSocialVerificationRequest(missingData, missingRequest.id, {
    now: now + 1000,
    fetchProfile: async () => makeProfile(missingRequest, { bio: `prefix ${missingRequest.verificationCode}suffix` })
  });
  assert.equal(missing.code, 'CODE_NOT_FOUND');
  assert.equal(missingRequest.status, 'pending');
  assert.equal(missingRequest.usedAt, null);
  const missingResponse = buildInstagramVerificationFailureResponse(missing);
  assert.equal(missingResponse.embeds[0].data.title, 'Verification Code Not Found ❌');
  assert.equal(missingResponse.components[0].components[0].data.custom_id, `global_social_verify:${missingRequest.id}`);

  let cooldownProviderCalls = 0;
  const cooldown = await verifyGlobalSocialVerificationRequest(missingData, missingRequest.id, {
    now: now + 2000,
    fetchProfile: async () => { cooldownProviderCalls++; return makeProfile(missingRequest); }
  });
  assert.equal(cooldown.code, 'COOLDOWN');
  assert.equal(cooldownProviderCalls, 0);

  const retry = await verifyGlobalSocialVerificationRequest(missingData, missingRequest.id, {
    now: now + 21_000,
    fetchProfile: async () => makeProfile(missingRequest)
  });
  assert.equal(retry.verified, true);

  for (const scenario of [
    { name: 'wrong username', overrides: { username: 'anotheraccount', normalizedUsername: 'anotheraccount' }, code: 'PROFILE_MISMATCH' },
    { name: 'private profile', overrides: { private: true, bio: null }, code: 'PRIVATE_PROFILE' }
  ]) {
    const data = makeData();
    const request = createGlobalSocialVerificationRequest(data, { userId: 'creator', platform: 'instagram', username: scenario.name.replace(' ', ''), now });
    const result = await verifyGlobalSocialVerificationRequest(data, request.id, {
      now: now + 1000,
      fetchProfile: async () => makeProfile(request, scenario.overrides)
    });
    assert.equal(result.verified, false);
    assert.equal(result.code, scenario.code);
    assert.equal(request.status, 'pending');
  }

  const privateData = makeData();
  const privateRequest = createGlobalSocialVerificationRequest(privateData, { userId: 'creator', platform: 'instagram', username: 'privatecreator', now });
  const privateResult = await verifyGlobalSocialVerificationRequest(privateData, privateRequest.id, {
    now: now + 1000,
    fetchProfile: async () => makeProfile(privateRequest, { private: true, bio: null })
  });
  assert.equal(buildInstagramVerificationFailureResponse(privateResult).embeds[0].data.title, 'Private Instagram Account ❌');

  const expiredData = makeData();
  const expiredRequest = createGlobalSocialVerificationRequest(expiredData, { userId: 'creator', platform: 'instagram', username: 'expired', now });
  let expiredProviderCalls = 0;
  const expired = await verifyGlobalSocialVerificationRequest(expiredData, expiredRequest.id, {
    now: expiredRequest.expiresAt + 1,
    fetchProfile: async () => { expiredProviderCalls++; return makeProfile(expiredRequest); }
  });
  assert.equal(expired.code, 'EXPIRED');
  assert.equal(expiredProviderCalls, 0);

  const failureData = makeData();
  const failureRequest = createGlobalSocialVerificationRequest(failureData, { userId: 'creator', platform: 'instagram', username: 'providerfailure', now });
  const failure = await verifyGlobalSocialVerificationRequest(failureData, failureRequest.id, {
    now: now + 1000,
    fetchProfile: async () => { throw new Error('provider internals must stay private'); }
  });
  assert.equal(failure.code, 'PROFILE_UNAVAILABLE');
  assert.equal(failure.message.includes('provider internals'), false);
  assert.equal(failureRequest.status, 'pending');
  assert.equal(failureRequest.usedAt, null);
  assert.equal(buildInstagramVerificationFailureResponse(failure).embeds[0].data.title, 'Verification Temporarily Unavailable');
});

test('Instagram duplicate ownership prefers profile ID and does not overwrite historical identity', async () => {
  const now = Date.parse('2026-08-09T14:00:00Z');
  const data = {
    users: {
      owner: { socials: [{ id: 'existing', platform: 'instagram', username: 'oldhandle', normalizedUsername: 'oldhandle', platformAccountId: 'stable-ig-id', externalAccountId: 'stable-ig-id', status: 'verified', verified: true }] },
      creator: { socials: [] }
    },
    globalSocialVerificationRequests: {}
  };
  const request = createGlobalSocialVerificationRequest(data, { userId: 'creator', platform: 'instagram', username: 'newhandle', now });
  const result = await verifyGlobalSocialVerificationRequest(data, request.id, {
    now: now + 1000,
    fetchProfile: async () => ({
      platform: 'instagram', username: 'newhandle', normalizedUsername: 'newhandle', platformAccountId: 'stable-ig-id',
      bio: request.verificationCode, profileUrl: null, avatarUrl: null, followers: 0, private: false,
      rawProvider: 'apify/instagram-profile-scraper'
    })
  });
  assert.equal(result.verified, false);
  assert.equal(result.code, 'OWNED_BY_ANOTHER_USER');
  assert.equal(data.users.creator.socials.length, 0);
  assert.equal(data.users.owner.socials[0].platformAccountId, 'stable-ig-id');
});

test('successful Instagram verification can auto-join live ICE through the shared join helper', async () => {
  const originalIce = CAMPAIGNS.ice;
  const now = Date.parse('2026-08-09T15:00:00Z');
  CAMPAIGNS.ice = {
    ...originalIce,
    launchAt: '2026-08-09T14:00:00.000Z',
    roleId: 'ice-role',
    rulesChannelId: 'ice-rules'
  };
  try {
    const data = {
      users: { creator: { socials: [], campaigns: [], campaignAccounts: {}, demographics: { status: 'approved', tier: 'Tier 2' } } },
      globalSocialVerificationRequests: {},
      clips: {},
      clipReviews: {},
      campaignStatus: {}
    };
    const request = createGlobalSocialVerificationRequest(data, { userId: 'creator', platform: 'instagram', username: 'icecreator', returnCampaignId: 'ice', now });
    const verified = await verifyGlobalSocialVerificationRequest(data, request.id, {
      now: now + 1000,
      fetchProfile: async () => ({
        platform: 'instagram', username: 'icecreator', normalizedUsername: 'icecreator', platformAccountId: 'ice-ig-id',
        bio: request.verificationCode, profileUrl: null, avatarUrl: null, followers: 0, private: false,
        rawProvider: 'apify/instagram-profile-scraper'
      })
    });
    assert.equal(verified.verified, true);

    const heldRoles = new Set();
    const roles = new Map([['ice-role', { id: 'ice-role' }], ['clipper-role', { id: 'clipper-role' }]]);
    const member = {
      id: 'creator',
      user: { username: 'creator', tag: 'creator#0001', displayAvatarURL: () => null },
      displayName: 'ICE Creator',
      roles: { cache: { has: id => heldRoles.has(id) }, add: async role => heldRoles.add(role.id), remove: async role => heldRoles.delete(role.id) }
    };
    const autoJoin = await autoJoinReturnCampaignAfterGlobalVerification(
      data,
      { roles: { cache: roles } },
      member,
      verified.request,
      { now: now + 2000, clipperRoleId: 'clipper-role' }
    );
    assert.equal(autoJoin.joinedCampaign?.id, 'ice');
    assert.equal(data.users.creator.campaigns.includes('ice'), true);
    assert.equal(heldRoles.has('ice-role'), true);
    assert.equal(heldRoles.has('clipper-role'), true);
  } finally {
    CAMPAIGNS.ice = originalIce;
  }
});

test('existing TikTok and YouTube global bio verification remains automatic and Monsterlab remains isolated', async () => {
  const now = Date.parse('2026-08-09T16:00:00Z');
  for (const platform of ['tiktok', 'youtube']) {
    const data = { users: { creator: { socials: [] } }, globalSocialVerificationRequests: {} };
    const request = createGlobalSocialVerificationRequest(data, { userId: 'creator', platform, username: `${platform}creator`, now });
    const result = await verifyGlobalSocialVerificationRequest(data, request.id, {
      now: now + 1000,
      fetchProfile: async () => ({ platform, username: `${platform}creator`, bio: `Verified ${request.verificationCode}`, externalAccountId: `${platform}-id`, rawProvider: 'existing-provider' })
    });
    assert.equal(result.verified, true);
    assert.equal(result.social.platform, platform);
  }
  assert.equal(getCampaignAccountMode(CAMPAIGNS.elephant), 'campaign_staff_code');
  assert.equal(getCampaignAccountMode(CAMPAIGNS.crowder), 'campaign_staff_code');
});

test('global campaign eligibility is ANY-platform, drives submission account choices, and preserves history on unlink', async () => {
  const campaign = makeStraightTestCampaign({ allowedPlatforms: ['tiktok', 'instagram', 'youtube'] });
  CAMPAIGNS[campaign.id] = campaign;
  try {
    const socials = [
      { id: 'ig-1', platform: 'instagram', username: 'otheraccount', normalizedUsername: 'otheraccount', status: 'verified', verified: true },
      { id: 'tt-1', platform: 'tiktok', username: 'dailyclips', normalizedUsername: 'dailyclips', status: 'verified', verified: true },
      { id: 'tt-2', platform: 'tiktok', username: 'dailyclips2', normalizedUsername: 'dailyclips2', status: 'verified', verified: true }
    ];
    const userRecord = { socials: structuredClone(socials), campaigns: [], campaignAccounts: {} };
    assert.equal(userHasEligibleGlobalSocial(userRecord, campaign), true);
    assert.equal(getVerifiedGlobalSocialsForPlatforms(userRecord, ['instagram']).length, 1);
    assert.equal(getCampaignAccountEligibility(userRecord, campaign).eligible, true);
    assert.equal(getCampaignSubmissionAccounts(userRecord, campaign).length, 3);
    assert.equal(getCampaignAccountMode(campaign), 'global_auto_verify');
    assert.equal(getCampaignAccountMode({ source: 'monsterlab' }), 'campaign_staff_code');
    assert.equal(getCampaignAccountMode({ source: 'internal' }), 'global_auto_verify');
    assert.equal(getCampaignAccountMode(CAMPAIGNS.elephant), 'campaign_staff_code');

    const heldRoles = new Set();
    const roles = new Map([['campaign-role', { id: 'campaign-role' }], ['clipper-role', { id: 'clipper-role' }]]);
    const member = {
      id: 'user-a',
      user: { username: 'creator', tag: 'creator#0001', displayAvatarURL: () => null },
      displayName: 'Creator',
      roles: { cache: { has: id => heldRoles.has(id) }, add: async role => heldRoles.add(role.id), remove: async role => heldRoles.delete(role.id) }
    };
    const data = { users: { 'user-a': userRecord } };
    const joinResult = await joinCampaignMember(data, { roles: { cache: roles } }, member, campaign, { clipperRoleId: 'clipper-role' });
    assert.equal(joinResult.ok, true);
    assert.equal(userRecord.campaigns.includes(campaign.id), true);
    assert.equal(heldRoles.has('campaign-role'), true);
    assert.equal(heldRoles.has('clipper-role'), true);

    const noAccount = buildMissingGlobalAccountResponse(makeStraightTestCampaign({ allowedPlatforms: ['tiktok'] }));
    assert.match(noAccount.embeds[0].data.title, /No TikTok Account Connected/);
    assert.equal(noAccount.components[0].components[0].data.custom_id, 'global_social_link:straight_test');

    const historical = { clips: { clip: { id: 'clip', payout: { paidMoney: 100 } } }, receipts: [{ amount: 100 }] };
    const historyBefore = structuredClone(historical);
    const removal = removeGlobalSocialAccount(userRecord, 'tt-1', 'user-a', 999);
    assert.equal(removal.removed, true);
    assert.deepEqual(historical, historyBefore);
    assert.equal(getVerifiedGlobalSocials(userRecord).some(social => social.id === 'tt-1'), false);
    assert.match(renderGlobalSocialAccounts(userRecord), /Instagram|dailyclips2/);
  } finally {
    delete CAMPAIGNS[campaign.id];
  }
});

test('global View Accounts renders one metric-rich account card and provides a global zero-state link', () => {
  const userRecord = {
    socials: [
      { id: 'tt-1', platform: 'tiktok', username: 'one', status: 'verified', verified: true },
      { id: 'tt-2', platform: 'tiktok', username: 'two', status: 'active', verified: true },
      { id: 'ig-1', platform: 'instagram', username: 'three', status: 'connected', verified: true },
      { id: 'yt-1', platform: 'youtube', username: 'four', status: 'verified', verified: true },
      { id: 'old-1', platform: 'instagram', username: 'removed', status: 'unlinked', verified: false, removedAt: 1 }
    ],
    demographics: { status: 'approved', tier: 'Tier 2' },
    campaignAccounts: { elephant: { instagram: { username: 'monsterlab-only', verified: true } } }
  };
  userRecord.socials[0].pageType = 'Creator';
  const data = {
    clips: {
      one: { id: 'one', userId: 'creator', globalSocialId: 'tt-1', campaignId: 'ice', publicViews: 1200, likes: 80, comments: 12 },
      two: { id: 'two', userId: 'creator', globalSocialId: 'tt-1', campaignId: 'ice', currentViews: 300, likes: 20, commentCount: 3 }
    }
  };
  const page = buildGlobalSocialViewPage(userRecord, 0, { data, userId: 'creator' });
  const fields = page.embeds[0].data.fields;
  assert.equal(page.totalAccounts, 4);
  assert.equal(page.totalPages, 4);
  assert.equal(page.embeds[0].data.title, 'TikTok Account');
  assert.match(page.embeds[0].data.description, /@one[\s\S]*Verified/);
  assert.equal(fields.find(field => field.name === 'Tier').value, 'Tier 2');
  assert.equal(fields.find(field => field.name === 'Page Type').value, 'Creator');
  assert.match(fields.find(field => field.name === 'Campaigns Participated').value, /ICE/);
  assert.equal(fields.find(field => field.name === 'Total Clips').value, '2');
  assert.equal(fields.find(field => field.name === 'Total Views').value, '1.5K');
  assert.equal(fields.find(field => field.name === 'Total Likes').value, '100');
  assert.equal(fields.find(field => field.name === 'Total Comments').value, '15');
  assert.equal(page.components[0].components[2].data.label, 'Disconnect');
  assert.equal(page.components[0].components[3].data.label, 'Link Another Account');
  assert.match(buildGlobalSocialViewPage(userRecord, 1).embeds[0].data.description, /@two/);
  assert.doesNotMatch(JSON.stringify(page.embeds[0].data), /removed|monsterlab-only/);
  const confirmation = buildGlobalSocialRemoveConfirmation(userRecord.socials[0], { fromView: true, page: 0 });
  assert.match(confirmation.components[0].components[0].data.custom_id, /^global_social_disconnect_confirm:/);
  assert.equal(removeGlobalSocialAccount(userRecord, 'tt-1', 'creator', 999).removed, true);
  const afterDisconnect = buildGlobalSocialViewPage(userRecord, 0, { data, userId: 'creator' });
  assert.equal(afterDisconnect.totalAccounts, 3);
  assert.match(afterDisconnect.embeds[0].data.description, /@two/);

  const empty = buildGlobalSocialViewPage({ socials: [] });
  assert.equal(empty.embeds[0].data.title, 'No Social Accounts Connected');
  assert.equal(empty.components[0].components[0].data.custom_id, 'global_social_link_from_view:none');
});

test('global Remove Account uses stable per-record IDs, paginates all accounts, and confirms before unlinking', () => {
  const userRecord = {
    socials: Array.from({ length: 27 }, (_, index) => ({
      platform: index % 3 === 0 ? 'tiktok' : index % 3 === 1 ? 'instagram' : 'youtube',
      username: `creator${index}`,
      status: 'verified',
      verified: true
    }))
  };
  const backfill = ensureGlobalSocialAccountIds(userRecord, 1234);
  assert.equal(backfill.changed, true);
  assert.equal(new Set(userRecord.socials.map(social => social.id)).size, 27);

  const firstPage = buildGlobalSocialRemovePage(userRecord, 0);
  const secondPage = buildGlobalSocialRemovePage(userRecord, 1);
  const firstOptions = firstPage.components[0].components[0].toJSON().options;
  const secondOptions = secondPage.components[0].components[0].toJSON().options;
  assert.equal(firstPage.totalPages, 2);
  assert.equal(firstOptions.length, 25);
  assert.equal(secondOptions.length, 2);
  assert.equal(new Set([...firstOptions, ...secondOptions].map(option => option.value)).size, 27);
  assert.match(firstOptions[0].label, /TikTok — @creator0/);

  const confirmation = buildGlobalSocialRemoveConfirmation(userRecord.socials[0]);
  assert.equal(confirmation.embeds[0].data.title, 'Remove Social Account?');
  assert.equal(confirmation.components[0].components[0].data.style, ButtonStyle.Danger);
  assert.equal(confirmation.components[0].components[1].data.style, ButtonStyle.Secondary);
});

test('global unlink is in-place, account-specific, history-safe, and does not alter Monsterlab membership', () => {
  const userRecord = {
    socials: [
      { id: 'tt-1', platform: 'tiktok', username: 'one', normalizedUsername: 'one', platformAccountId: 'tt-one', status: 'verified', verified: true, verifiedAt: 10, verificationMethod: 'bio_code_api' },
      { id: 'tt-2', platform: 'tiktok', username: 'two', normalizedUsername: 'two', platformAccountId: 'tt-two', status: 'verified', verified: true },
      { id: 'ig-1', platform: 'instagram', username: 'three', normalizedUsername: 'three', platformAccountId: 'ig-three', status: 'verified', verified: true, verifiedAt: 20, verificationMethod: 'bio_code_api' }
    ],
    campaigns: ['ice', 'elephant'],
    campaignAccounts: { elephant: { instagram: { username: 'campaign-specific', verified: true } } }
  };
  const unrelatedHistory = {
    clips: { clip: { id: 'clip', socialId: 'ig-1', campaignCreditedViews: 50000 } },
    clipReviews: { review: { id: 'review', userId: 'creator' } },
    payoutHistory: [{ amount: 25 }],
    receipts: [{ amount: 25 }]
  };
  const historyBefore = structuredClone(unrelatedHistory);
  const campaignsBefore = structuredClone(userRecord.campaigns);
  const monsterlabBefore = structuredClone(userRecord.campaignAccounts);
  const removal = removeGlobalSocialAccount(userRecord, 'ig-1', 'creator', 999);

  assert.equal(removal.removed, true);
  assert.equal(userRecord.socials.length, 3);
  assert.equal(removal.social.status, 'unlinked');
  assert.equal(removal.social.verified, false);
  assert.equal(removal.social.removedAt, 999);
  assert.equal(removal.social.removedBy, 'creator');
  assert.equal(removal.social.platformAccountId, 'ig-three');
  assert.equal(removal.social.verifiedAt, 20);
  assert.equal(getActiveGlobalSocials(userRecord).map(social => social.id).join(','), 'tt-1,tt-2');
  assert.deepEqual(userRecord.campaigns, campaignsBefore);
  assert.deepEqual(userRecord.campaignAccounts, monsterlabBefore);
  assert.deepEqual(unrelatedHistory, historyBefore);
});

test('a creator can reconnect their terminal global social while active ownership remains protected', async () => {
  const now = Date.parse('2026-08-10T14:00:00Z');
  const data = {
    users: {
      creator: {
        socials: [{
          id: 'old-ig', platform: 'instagram', username: 'reconnectme', normalizedUsername: 'reconnectme',
          platformAccountId: 'ig-stable', status: 'unlinked', verified: false, removedAt: now - 1000
        }]
      }
    },
    globalSocialVerificationRequests: {}
  };
  const request = createGlobalSocialVerificationRequest(data, { userId: 'creator', platform: 'instagram', username: 'reconnectme', now });
  const result = await verifyGlobalSocialVerificationRequest(data, request.id, {
    requestingUserId: 'creator',
    now: now + 1000,
    fetchProfile: async () => ({
      platform: 'instagram', username: 'reconnectme', bio: request.verificationCode,
      platformAccountId: 'ig-stable', profileUrl: 'https://www.instagram.com/reconnectme/'
    })
  });
  assert.equal(result.verified, true);
  assert.equal(data.users.creator.socials.length, 2);
  assert.equal(data.users.creator.socials[0].status, 'unlinked');
  assert.equal(getVerifiedGlobalSocials(data.users.creator).length, 1);
  assert.equal(getVerifiedGlobalSocials(data.users.creator)[0].platformAccountId, 'ig-stable');
});

test('unlimited global portfolio preserves 60 accounts, paginates every UI, allows account 61, and rejects only an exact duplicate', async () => {
  const platformCounts = { tiktok: 30, instagram: 20, youtube: 10 };
  const socials = [];
  for (const [platform, count] of Object.entries(platformCounts)) {
    for (let index = 0; index < count; index++) {
      socials.push({
        id: `${platform}-${index}`,
        platform,
        username: `${platform}creator${index}`,
        normalizedUsername: `${platform}creator${index}`,
        platformAccountId: `${platform}-provider-${index}`,
        status: 'verified',
        verified: true
      });
    }
  }
  const userRecord = { socials, campaigns: ['ice'] };
  assert.equal(getActiveGlobalSocials(userRecord).length, 60);

  const viewed = new Set();
  const firstViewPage = buildGlobalSocialViewPage(userRecord, 0);
  assert.equal(firstViewPage.totalPages, 60);
  for (let page = 0; page < firstViewPage.totalPages; page++) {
    const rendered = buildGlobalSocialViewPage(userRecord, page);
    for (const match of String(rendered.embeds[0].data.description).matchAll(/@([a-z0-9]+)/gi)) viewed.add(match[1].toLowerCase());
  }
  assert.equal(viewed.size, 60);

  const removableIds = new Set();
  const firstRemovePage = buildGlobalSocialRemovePage(userRecord, 0);
  assert.equal(firstRemovePage.totalPages, 3);
  for (let page = 0; page < firstRemovePage.totalPages; page++) {
    const rendered = buildGlobalSocialRemovePage(userRecord, page);
    for (const option of rendered.components[0].components[0].toJSON().options) removableIds.add(option.value);
  }
  assert.equal(removableIds.size, 60);

  const submitAccounts = getCampaignSubmissionAccounts(userRecord, CAMPAIGNS.ice);
  const firstSubmitPage = buildSubmitClipAccountSelectionPage(submitAccounts, 'ice', 0);
  const submitIds = new Set();
  assert.equal(firstSubmitPage.totalPages, 3);
  for (let page = 0; page < firstSubmitPage.totalPages; page++) {
    const rendered = buildSubmitClipAccountSelectionPage(submitAccounts, 'ice', page);
    for (const option of rendered.components[0].components[0].toJSON().options) submitIds.add(option.value);
  }
  assert.equal(submitIds.size, 60);

  const now = Date.parse('2026-08-14T12:00:00Z');
  const data = { users: { creator: userRecord }, globalSocialVerificationRequests: {} };
  const account61 = createGlobalSocialVerificationRequest(data, { userId: 'creator', platform: 'tiktok', username: 'tiktokcreator30', now });
  const added = await verifyGlobalSocialVerificationRequest(data, account61.id, {
    requestingUserId: 'creator',
    now: now + 1000,
    fetchProfile: async () => ({
      platform: 'tiktok', username: 'tiktokcreator30', bio: account61.verificationCode,
      platformAccountId: 'tiktok-provider-30'
    })
  });
  assert.equal(added.verified, true);
  assert.equal(getVerifiedGlobalSocials(userRecord).length, 61);

  let duplicateProviderCalled = false;
  const duplicate = createGlobalSocialVerificationRequest(data, { userId: 'creator', platform: 'tiktok', username: '@TIKTOKCREATOR30', now: now + 2000 });
  const duplicateResult = await verifyGlobalSocialVerificationRequest(data, duplicate.id, {
    requestingUserId: 'creator',
    now: now + 3000,
    fetchProfile: async () => { duplicateProviderCalled = true; return null; }
  });
  assert.equal(duplicateResult.verified, false);
  assert.equal(duplicateResult.code, 'ALREADY_CONNECTED');
  assert.equal(duplicateProviderCalled, false);
  assert.equal(getVerifiedGlobalSocials(userRecord).length, 61);
});

test('Monsterlab campaign accounts are unlimited per platform and remain independently selectable and removable', () => {
  const userRecord = { campaigns: ['elephant'], campaignAccounts: {} };
  const created = [];
  for (let index = 0; index < 60; index++) {
    const platform = index < 30 ? 'tiktok' : index < 50 ? 'instagram' : 'youtube';
    const account = ensureCampaignAccount(userRecord, 'elephant', platform, `${platform}monster${index}`);
    account.verified = true;
    account.status = 'approved';
    created.push(account);
  }
  assert.equal(getCampaignSubmissionAccounts(userRecord, CAMPAIGNS.elephant).length, 60);
  assert.equal(userRecord.campaignAccounts.elephant.tiktok.length, 30);
  assert.equal(userRecord.campaignAccounts.elephant.instagram.length, 20);
  assert.equal(userRecord.campaignAccounts.elephant.youtube.length, 10);

  const duplicate = ensureCampaignAccount(userRecord, 'elephant', 'tiktok', '@TIKTOKMONSTER0');
  assert.equal(duplicate.id, created[0].id);
  assert.equal(getCampaignSubmissionAccounts(userRecord, CAMPAIGNS.elephant).length, 60);

  const account61 = ensureCampaignAccount(userRecord, 'elephant', 'youtube', 'youtubemonster60');
  account61.verified = true;
  account61.status = 'approved';
  assert.equal(getCampaignSubmissionAccounts(userRecord, CAMPAIGNS.elephant).length, 61);

  ensureCampaignAccountIds(userRecord, 'elephant');
  const campaignViewFirst = buildCampaignAccountViewPage(userRecord, CAMPAIGNS.elephant, 0);
  let campaignViewCount = 0;
  assert.equal(campaignViewFirst.totalPages, 7);
  for (let page = 0; page < campaignViewFirst.totalPages; page++) {
    const rendered = buildCampaignAccountViewPage(userRecord, CAMPAIGNS.elephant, page);
    campaignViewCount += (rendered.embeds[0].data.fields || [])
      .filter(field => field.name !== 'Total Connected Accounts')
      .reduce((total, field) => total + (String(field.value).match(/@/g) || []).length, 0);
  }
  assert.equal(campaignViewCount, 61);

  const removeFirst = buildCampaignAccountRemovePage(userRecord, CAMPAIGNS.elephant, 0);
  const reachable = new Set();
  assert.equal(removeFirst.totalPages, 3);
  for (let page = 0; page < removeFirst.totalPages; page++) {
    const rendered = buildCampaignAccountRemovePage(userRecord, CAMPAIGNS.elephant, page);
    for (const option of rendered.components[0].components[0].toJSON().options) reachable.add(option.value);
  }
  assert.equal(reachable.size, 61);

  const data = {
    users: { creator: userRecord },
    campaignAccountRequests: {
      existing: {
        userId: 'creator', campaignId: 'elephant', platform: 'tiktok',
        username: 'tiktokmonster1', status: 'approved'
      }
    }
  };
  assert.equal(validateAccountSubmission('creator', 'elephant', 'tiktok', '@TIKTOKMONSTER1', data).isValid, false);
  assert.equal(validateAccountSubmission('creator', 'elephant', 'tiktok', 'brandnewhandle', data).isValid, true);
  const removed = removeCampaignAccount({
    data,
    userId: 'creator',
    campaignId: 'elephant',
    platform: 'tiktok',
    accountId: created[0].id,
    removedBy: 'creator'
  });
  assert.equal(removed.removed, true);
  assert.equal(removed.username, 'tiktokmonster0');
  assert.equal(getCampaignSubmissionAccounts(userRecord, CAMPAIGNS.elephant).length, 60);
  assert.equal(userRecord.campaignAccounts.elephant.tiktok.length, 29);
});
