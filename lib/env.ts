function read(name: string) {
  return process.env[name]?.trim();
}

export function getPublicSupabaseEnv() {
  // NEXT_PUBLIC variables must be referenced statically so Next.js can inline
  // them into the browser bundle during the production build.
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();

  if (!url || !publishableKey) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY are required.");
  }

  return { url, publishableKey };
}

export function getSupabaseSecretKey() {
  const key = read("SUPABASE_SECRET_KEY") ?? read("SUPABASE_SERVICE_ROLE_KEY");
  if (!key) throw new Error("SUPABASE_SECRET_KEY is required on the server.");
  return key;
}

export function requireServerEnv(name: string) {
  const value = read(name);
  if (!value) throw new Error(`${name} is required on the server.`);
  return value;
}

export function getAppUrl(request?: Request) {
  const configured = read("NEXT_PUBLIC_APP_URL");
  if (configured) return configured.replace(/\/$/, "");
  if (request) return new URL(request.url).origin;
  return "http://localhost:3000";
}
