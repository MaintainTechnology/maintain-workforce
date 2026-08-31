#!/usr/bin/env node
// Maintain administrator access is assigned only through this audited runbook step.
// The role lives in Clerk publicMetadata, which cannot be changed by the user.
//
//   node scripts/grant-maintain-admin.mjs someone@maintainworkforce.com.au \
//     --by ops@maintainworkforce.com.au

import { createClerkClient } from "@clerk/backend";
import { createClient } from "@supabase/supabase-js";

function usage() {
  console.error(
    "Usage: node scripts/grant-maintain-admin.mjs <email> --by <operator email>",
  );
}

function messageFrom(error) {
  if (error instanceof Error) return error.message;
  if (typeof error === "object" && error !== null && "message" in error) {
    return String(error.message);
  }
  return String(error);
}

async function findUserByEmail(clerk, email) {
  const wanted = email.trim().toLowerCase();
  const { data } = await clerk.users.getUserList({
    emailAddress: [wanted],
    limit: 1,
  });
  return data[0] ?? null;
}

async function main() {
  const [, , targetArgument, ...rest] = process.argv;
  const byIndex = rest.indexOf("--by");
  const operatorArgument = byIndex >= 0 ? rest[byIndex + 1] : undefined;

  if (
    !targetArgument?.trim() ||
    !operatorArgument?.trim() ||
    byIndex < 0 ||
    rest.length !== 2
  ) {
    usage();
    process.exitCode = 1;
    return;
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const clerkSecretKey = process.env.CLERK_SECRET_KEY;
  if (!url || !serviceKey || !clerkSecretKey) {
    console.error(
      "CLERK_SECRET_KEY, NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set.",
    );
    process.exitCode = 1;
    return;
  }

  const targetEmail = targetArgument.trim().toLowerCase();
  const operatorEmail = operatorArgument.trim().toLowerCase();
  const clerk = createClerkClient({ secretKey: clerkSecretKey });
  const supabase = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const target = await findUserByEmail(clerk, targetEmail);
  if (!target) {
    throw new Error(
      `No Clerk user has the email ${targetEmail}. The user must register before being granted access.`,
    );
  }

  const operator = await findUserByEmail(clerk, operatorEmail);
  if (!operator) {
    throw new Error(
      `No Clerk user has the operator email ${operatorEmail}; refusing to record an unattributable grant.`,
    );
  }

  const previousPublicMetadata = structuredClone(target.publicMetadata ?? {});
  const nextPublicMetadata = {
    ...previousPublicMetadata,
    role: "maintain_admin",
  };

  await clerk.users.updateUserMetadata(target.id, {
    publicMetadata: { role: "maintain_admin" },
  });

  let auditFailure;
  try {
    const { error } = await supabase.from("audit_event").insert({
      actor_user_id: operator.id,
      actor_is_system: false,
      action: "user.maintain_admin_granted",
      entity_type: "user",
      entity_id: target.id,
      before_data: {
        email: targetEmail,
        public_metadata: previousPublicMetadata,
      },
      after_data: {
        email: targetEmail,
        public_metadata: nextPublicMetadata,
        granted_by: operatorEmail,
      },
    });
    auditFailure = error ?? undefined;
  } catch (error) {
    auditFailure = error;
  }

  if (auditFailure) {
    let rollbackFailure;
    try {
      await clerk.users.replaceUserMetadata(target.id, {
        publicMetadata: previousPublicMetadata,
      });
    } catch (error) {
      rollbackFailure = error;
    }

    console.error(`Audit write failed: ${messageFrom(auditFailure)}`);
    if (rollbackFailure) {
      console.error(
        `CRITICAL: restoring the previous Clerk publicMetadata also failed: ${messageFrom(rollbackFailure)}`,
      );
      console.error(
        `The role state for ${targetEmail} is uncertain and requires immediate manual review.`,
      );
    } else {
      console.error(
        `The exact previous Clerk publicMetadata for ${targetEmail} was restored; no unaudited grant remains.`,
      );
    }

    process.exitCode = 1;
    return;
  }

  console.log(
    `maintain_admin granted to ${targetEmail} (${target.id}), attributed to ${operatorEmail} (${operator.id}).`,
  );
}

try {
  await main();
} catch (error) {
  console.error(messageFrom(error));
  process.exitCode = 1;
}
