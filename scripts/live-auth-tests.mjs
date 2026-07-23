import { createClient } from "@supabase/supabase-js";

const [existingEmail, inviteEmail] = process.argv.slice(2);
if (!existingEmail || !inviteEmail) {
  throw new Error("Usage: node scripts/live-auth-tests.mjs <existing-email> <invite-email>");
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const secretKey = process.env.SUPABASE_SECRET_KEY;
if (!supabaseUrl || !publishableKey || !secretKey) {
  throw new Error("Supabase environment is incomplete.");
}

const admin = createClient(supabaseUrl, secretKey, {
  auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
});

function publicClient() {
  return createClient(supabaseUrl, publishableKey, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
}

async function findUser(email) {
  const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (error) throw error;
  return data.users.find((user) => user.email?.toLowerCase() === email.toLowerCase()) ?? null;
}

async function waitForProfile(userId) {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const [{ data: profile }, { data: role }] = await Promise.all([
      admin.from("profiles").select("id,is_active").eq("id", userId).maybeSingle(),
      admin.from("app_roles").select("role").eq("user_id", userId).maybeSingle(),
    ]);
    if (profile && role) return { profile, role };
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error("Profile or role trigger did not complete.");
}

async function verifyMagicLink(email) {
  const { data: link, error: linkError } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email,
    options: { redirectTo: "http://localhost:3000/auth/confirm?next=/app" },
  });
  if (linkError || !link.properties?.hashed_token) {
    throw linkError ?? new Error("Supabase did not return a hashed token.");
  }

  const browser = publicClient();
  const { data: verified, error: verifyError } = await browser.auth.verifyOtp({
    token_hash: link.properties.hashed_token,
    type: "magiclink",
  });
  if (verifyError || !verified.user || !verified.session) {
    throw verifyError ?? new Error("Magic-link verification did not return a session.");
  }

  const [{ data: profile, error: profileError }, { data: role, error: roleError }] =
    await Promise.all([
      browser.from("profiles").select("id,is_active").eq("id", verified.user.id).single(),
      browser.from("app_roles").select("role").eq("user_id", verified.user.id).single(),
    ]);
  if (profileError || roleError || !profile || !role) {
    throw profileError ?? roleError ?? new Error("RLS self-read failed.");
  }

  await browser.auth.signOut({ scope: "local" });
  return { userId: verified.user.id, active: profile.is_active, role: role.role };
}

async function testExistingAccount(email) {
  const user = await findUser(email);
  if (!user) throw new Error(`Expected existing user ${email} was not found.`);

  const mailClient = publicClient();
  const { error: mailError } = await mailClient.auth.signInWithOtp({
    email,
    options: {
      shouldCreateUser: false,
      emailRedirectTo: "http://localhost:3000/auth/confirm?next=/app",
    },
  });
  if (mailError) throw mailError;

  const auth = await verifyMagicLink(email);
  return {
    name: "existing-account-auth",
    email,
    emailDispatched: true,
    sessionVerified: true,
    rlsSelfRead: true,
    active: auth.active,
    role: auth.role,
  };
}

async function testInviteAccount(email) {
  let user = await findUser(email);
  let inviteDispatched = false;
  if (!user) {
    const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
      data: { display_name: "Christian Weiss" },
      redirectTo: "http://localhost:3000/auth/confirm?next=/set-password",
    });
    if (error || !data.user) throw error ?? new Error("Invite did not create a user.");
    user = data.user;
    inviteDispatched = true;
  } else {
    const mailClient = publicClient();
    const { error } = await mailClient.auth.signInWithOtp({
      email,
      options: {
        shouldCreateUser: false,
        emailRedirectTo: "http://localhost:3000/auth/confirm?next=/app",
      },
    });
    if (error) throw error;
    inviteDispatched = true;
  }

  await waitForProfile(user.id);
  const auth = await verifyMagicLink(email);
  return {
    name: "invite-account-auth",
    email,
    emailDispatched: inviteDispatched,
    sessionVerified: true,
    rlsSelfRead: true,
    active: auth.active,
    role: auth.role,
  };
}

const results = [];
results.push(await testExistingAccount(existingEmail));
results.push(await testInviteAccount(inviteEmail));
console.log(JSON.stringify({ passed: results.length, results }, null, 2));
