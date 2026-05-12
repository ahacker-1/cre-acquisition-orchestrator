#!/usr/bin/env node

const { readFileSync } = require('fs');
const { join } = require('path');

const root = process.cwd();
const guidePath = join(root, 'config', 'operator-guides.json');
const guide = JSON.parse(readFileSync(guidePath, 'utf8'));

const allowedStatuses = new Set(['blocked', 'missing', 'ready', 'in_review', 'complete', 'waived']);
const requiredSections = ['intake', 'underwriting', 'due-diligence', 'financing', 'legal', 'closing', 'package'];
const allowedActions = new Set(['open_tab', 'edit_details', 'launch_workflow', 'upload_documents', 'review_package']);
const allowedPriorities = new Set(['critical', 'important', 'optional']);

function fail(message) {
  console.error(`[operator-guides] ${message}`);
  process.exit(1);
}

if (!guide || typeof guide !== 'object') fail('Guide config must be a JSON object.');
if (!Array.isArray(guide.sections)) fail('Guide config must define sections[].');

const sectionsBySlug = new Map(guide.sections.map((section) => [section.phaseSlug, section]));
for (const slug of requiredSections) {
  if (!sectionsBySlug.has(slug)) fail(`Missing required guide section: ${slug}.`);
}

let checklistCount = 0;
let launchActionCount = 0;

for (const section of guide.sections) {
  if (typeof section.phaseKey !== 'string' || section.phaseKey.length === 0) {
    fail(`Section ${section.phaseSlug || '<unknown>'} is missing phaseKey.`);
  }
  if (typeof section.phaseSlug !== 'string' || section.phaseSlug.length === 0) {
    fail(`Section ${section.phaseKey || '<unknown>'} is missing phaseSlug.`);
  }
  if (typeof section.label !== 'string' || section.label.length === 0) {
    fail(`Section ${section.phaseSlug} is missing label.`);
  }
  if (!Array.isArray(section.checklist) || section.checklist.length === 0) {
    fail(`Section ${section.phaseSlug} must define at least one checklist item.`);
  }

  const ids = new Set();
  for (const item of section.checklist) {
    checklistCount += 1;
    if (typeof item.id !== 'string' || item.id.length === 0) fail(`Section ${section.phaseSlug} has checklist item without id.`);
    if (ids.has(item.id)) fail(`Section ${section.phaseSlug} has duplicate checklist item id: ${item.id}.`);
    ids.add(item.id);
    if (typeof item.label !== 'string' || item.label.length === 0) fail(`Checklist item ${item.id} is missing label.`);
    if (!allowedPriorities.has(item.priority)) fail(`Checklist item ${item.id} has invalid priority: ${item.priority}.`);
    if (typeof item.whyItMatters !== 'string' || item.whyItMatters.length < 20) fail(`Checklist item ${item.id} needs stronger whyItMatters copy.`);
    if (typeof item.evidenceRequired !== 'string' || item.evidenceRequired.length < 10) fail(`Checklist item ${item.id} needs evidenceRequired copy.`);
    if (!item.recommendedAction || !allowedActions.has(item.recommendedAction.type)) {
      fail(`Checklist item ${item.id} has invalid recommendedAction.`);
    }
    if (item.recommendedAction.type === 'launch_workflow') {
      launchActionCount += 1;
      if (typeof item.recommendedAction.workflowId !== 'string' || item.recommendedAction.workflowId.length === 0) {
        fail(`Launch checklist item ${item.id} must name workflowId.`);
      }
    }
    if (item.status && !allowedStatuses.has(item.status)) fail(`Checklist item ${item.id} has invalid status seed: ${item.status}.`);
  }
}

if (checklistCount < 15) fail('Guide should provide at least 15 checklist items across acquisition phases.');
if (launchActionCount < 4) fail('Guide should map at least four checklist items to launchable workflows.');

console.log(`[operator-guides] ${guide.sections.length} sections and ${checklistCount} checklist items validated.`);
