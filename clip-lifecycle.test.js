const test = require('node:test');
const assert = require('node:assert/strict');

const {
  applyCampaignMembership,
  applyApprovalSnapshotAccounting,
  applyTrackedMetadata,
  assignCampaignJoinRoles,
  buildCampaignAccountApprovedEmbed,
  buildCampaignAccountRejectedEmbed,
  buildCampaignConnectAccountRow,
  buildCampaignJoinSuccessEmbed,
  buildCampaignPanelButtons,
  buildCampaignStatsEmbed,
  buildCampaignStatusEmbed,
  buildClipStaffEmbed,
  buildClipStaffButtons,
  CAMPAIGNS,
  finalizeOutOfRunClips,
  getCampaignConnectAccountLink,
  getCampaignJoinBlockReason,
  getCampaignPanelFulfilledPercent,
  getCampaignCurrentRunAccounting,
  getCampaignCurrentWeekAccounting,
  getVerifiedCampaignPlatforms,
  getUserCurrentRunAccounting,
  getUserCurrentWeekAccounting,
  getWeeklyAccountingAudit,
  getInitialSubmissionViewState,
  initializeClipTrackingFields,
  repairApprovalSnapshotInvariants,
  repairAugustFirstWeekLegacyWeeklyAccounting,
  ensureCampaignAccount,
  removeCampaignAccount,
  shouldTrackClip,
  updateApprovedClipTracking,
  validateAccountSubmission
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
  assert.equal(shouldTrackClip(target, CAMPAIGNS.crowder, data), false);
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
  const description = buildCampaignStatusEmbed(CAMPAIGNS.elephant, data).data.description;

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

  const fulfilledButton = buildCampaignPanelButtons(CAMPAIGNS.elephant, elephantFull)[0].components[2];
  assert.equal(fulfilledButton.data.label, 'Fulfilled: 100.0%');
  assert.equal(fulfilledButton.data.disabled, true);
});
