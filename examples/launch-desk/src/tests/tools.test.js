import { describe, expect, it } from 'vitest';
import { checkLaunchReadiness, draftChannelCopy, extractTasksFromBrief, findMissingDetails, generateOwnerChecklist, normalizeLaunchInput } from '../tools/launchTools.mjs';

describe('Launch Desk tools', () => {
  it('extracts relevant launch tasks from a developer/API brief', () => {
    const input = normalizeLaunchInput({
      productBrief: 'Launch a new developer API beta with migration guides and examples for platform teams.',
      audience: 'Developer platform teams at enterprise customers',
      launchDate: '2026-07-15',
      constraints: 'Security review required before beta.',
      assets: 'API docs, demo app, screenshots, and FAQ are available.',
    });
    const tasks = extractTasksFromBrief(input);
    expect(tasks.some((task) => task.task.includes('API docs'))).toBe(true);
    expect(tasks.some((task) => task.task.includes('security'))).toBe(true);
  });

  it('flags missing critical launch details', () => {
    const missing = findMissingDetails(normalizeLaunchInput({ productBrief: 'Tiny idea' }));
    expect(missing.map((item) => item.key)).toEqual(['audience', 'launchDate']);
  });

  it('creates readiness, checklist, and copy outputs', () => {
    const input = normalizeLaunchInput({
      productBrief: 'Launch a workflow automation feature that helps admins approve engineering release requests with policy controls and audit logs.',
      audience: 'Engineering operations admins at mid-market SaaS companies',
      launchDate: '2026-08-03',
      assets: 'Docs, screenshots, demo recording, FAQ, and support macros.',
    });
    const tasks = extractTasksFromBrief(input);
    expect(checkLaunchReadiness(input, tasks).score).toBeGreaterThan(60);
    expect(generateOwnerChecklist(tasks, input)[0]).toHaveProperty('owner');
    expect(draftChannelCopy(input)).toHaveLength(5);
  });
});
