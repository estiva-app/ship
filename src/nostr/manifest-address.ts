/**
 * The address of the manifest this build recommends. Ship publishes a
 * kind:31989 pointing here on the user's behalf, which is how a consumer picks
 * this manifest over any other claiming the same kinds.
 *
 * `npm run manifest` reads this and never writes it: it publishes only with the
 * key of this pubkey, and refuses any other. Moving to a new key is a deliberate
 * change by hand, in one PR, and dangles every kind:31989 pointing here.
 */
export const MANIFEST_ADDRESS = '31990:88ac6aae1a874652ef05e2deba8c8a9526cda0c78e6b7d98b815cd0b5a710d13:estiva-ship'
