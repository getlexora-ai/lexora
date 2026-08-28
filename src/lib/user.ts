// The app has no authentication — it runs as a single shared workspace.
// Every contract, clause, version, and chat message is owned by this sentinel
// user id. Override it with DEMO_USER_ID in the environment if you need a
// specific value (it must be a valid UUID).
export const DEMO_USER_ID =
  process.env.DEMO_USER_ID ?? "00000000-0000-0000-0000-000000000000";
