/**
 * limits.js — where the plan stops being a list and starts being a rule.
 *
 * A pricing page that says "10 documents" and then lets you make a hundred is
 * decoration. This module is what makes the number true, and it is deliberately
 * small: one place that knows the signed-in plan, and one check that the
 * storage layer calls before creating a document.
 *
 * Why a module variable rather than a React hook: `createDocument` is called
 * from pages, from the upload screen and from the dashboard's drop target, and
 * it is not a component. AuthContext pushes the tier in here whenever the
 * signed-in user changes, so every one of those paths gets the same answer.
 */
import { db } from '../storage/db';
import { limitsFor } from './plans';

let currentTier = 'BASIC';

/** Called by AuthContext when someone signs in, out, or changes plan. */
export function setCurrentTier(tier) {
  currentTier = tier ?? 'BASIC';
}

export const getCurrentTier = () => currentTier;

/** How many documents this plan allows, and how many there are. */
export async function documentAllowance() {
  const allowed = limitsFor(currentTier).documents;
  const used = await db.documents.count();
  return { used, allowed, left: allowed === Infinity ? Infinity : Math.max(0, allowed - used) };
}

/**
 * Throws when the plan has no room left. The message is written to be shown
 * to the reader as-is: it says what the limit is and what to do about it.
 */
export async function assertCanCreateDocument() {
  const { used, allowed } = await documentAllowance();
  if (allowed === Infinity || used < allowed) return;
  const error = new Error(
    `The Basic plan keeps ${allowed} documents. Delete one you have finished with, or see the plans for more room.`,
  );
  error.code = 'plan_limit';
  throw error;
}

/** How many automatic versions of a document this plan keeps. */
export const autoVersionsKept = () => limitsFor(currentTier).autoVersions;
