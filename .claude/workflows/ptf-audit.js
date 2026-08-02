
export const meta = {
  name: 'ptf-audit',
  description: 'Audit complet du projet PTF — recharge/retrait UTXO + correctness de toute la base de code',
  phases: [
    { title: 'Lecture', detail: 'Lire tous les fichiers source critiques' },
    { title: 'Audit', detail: 'Analyse indépendante par dimension (UTXO, sécurité, cohérence, logique)' },
    { title: 'Vérification', detail: 'Vérification adversariale de chaque finding' },
  ],
}

const FINDING_SCHEMA = {
  type: 'object',
  properties: {
    findings: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          severity:  { type: 'string', enum: ['critical', 'high', 'medium', 'low', 'info'] },
          category:  { type: 'string' },
          file:      { type: 'string' },
          line:      { type: 'number' },
          title:     { type: 'string' },
          description: { type: 'string' },
          fix:       { type: 'string' },
        },
        required: ['severity', 'category', 'file', 'title', 'description', 'fix'],
      },
    },
  },
  required: ['findings'],
}

const VERDICT_SCHEMA = {
  type: 'object',
  properties: {
    confirmed: { type: 'boolean' },
    rationale: { type: 'string' },
  },
  required: ['confirmed', 'rationale'],
}

// ── Phase 1: Read all critical files ─────────────────────────────────────────
phase('Lecture')

const [
  utxoService,
  escrowVault,
  creditToken,
  prismaSchema,
  walletResolver,
  taskService,
  punishmentService,
  creditLedger,
  walletCLI,
  apiCLI,
  graphqlSchema,
  container,
] = await parallel([
  () => agent('Read the file /home/virus-one/Documents/PTF_project/backend/src/services/utxo.service.ts and return its FULL content verbatim.', { label: 'read:utxo.service' }),
  () => agent('Read the file /home/virus-one/Documents/PTF_project/contracts/evm/EscrowVault.sol and return its FULL content verbatim.', { label: 'read:EscrowVault.sol' }),
  () => agent('Read the file /home/virus-one/Documents/PTF_project/contracts/evm/CreditToken.sol and return its FULL content verbatim.', { label: 'read:CreditToken.sol' }),
  () => agent('Read the file /home/virus-one/Documents/PTF_project/backend/prisma/schema.prisma and return its FULL content verbatim.', { label: 'read:schema.prisma' }),
  () => agent('Read the file /home/virus-one/Documents/PTF_project/backend/src/graphql/resolvers/wallet.resolver.ts and return its FULL content verbatim.', { label: 'read:wallet.resolver' }),
  () => agent('Read the file /home/virus-one/Documents/PTF_project/backend/src/services/task.service.ts and return its FULL content verbatim.', { label: 'read:task.service' }),
  () => agent('Read the file /home/virus-one/Documents/PTF_project/backend/src/services/punishment.service.ts and return its FULL content verbatim.', { label: 'read:punishment.service' }),
  () => agent('Read the file /home/virus-one/Documents/PTF_project/backend/src/services/creditLedger.service.ts and return its FULL content verbatim.', { label: 'read:creditLedger.service' }),
  () => agent('Read the file /home/virus-one/Documents/PTF_project/cli/src/commands/wallet.ts and return its FULL content verbatim.', { label: 'read:wallet.ts CLI' }),
  () => agent('Read the file /home/virus-one/Documents/PTF_project/cli/src/utils/api.ts and return its FULL content verbatim.', { label: 'read:api.ts CLI' }),
  () => agent('Read the file /home/virus-one/Documents/PTF_project/backend/src/graphql/schema.graphql and return its FULL content verbatim.', { label: 'read:schema.graphql' }),
  () => agent('Read the file /home/virus-one/Documents/PTF_project/backend/src/container.ts and return its FULL content verbatim.', { label: 'read:container.ts' }),
])

// ── Phase 2: Independent audit by dimension ───────────────────────────────────
phase('Audit')

const DIMENSIONS = [
  {
    key: 'utxo-deposit-missing',
    prompt: `You are a senior blockchain engineer auditing the PTF project (a decentralized task platform with Bitcoin-style UTXO credit system).

Your dimension: **UTXO deposit flow — completeness and correctness**.

The system must work in BOTH directions:
1. DEPOSIT (recharge): user sends USDC → PTF backend mints a UTXO with PTF EIP-712 signature → user has spendable credits
2. WITHDRAWAL: user selects UTXOs → proves origin → burns PTF tokens → receives USDC

Analyze these files and find ALL gaps, bugs, or missing pieces in the deposit flow:

=== utxo.service.ts ===
${utxoService}

=== EscrowVault.sol ===
${escrowVault}

=== wallet.resolver.ts ===
${walletResolver}

=== schema.graphql ===
${graphqlSchema}

=== wallet.ts CLI ===
${walletCLI}

=== api.ts CLI ===
${apiCLI}

Focus on:
- Is there a GraphQL mutation for deposit?
- Is there a depositUSDC() or equivalent in EscrowVault?
- When a deposit arrives on-chain, who mints the UTXO?
- Is there an on-chain event listener / webhook to trigger UTXO minting?
- Does CLI deposit command call UTXOService.mint()?
- Is deposit reflected in the UTXO balance?
- Is the Chainlink CurrencyConverter hooked into the deposit flow?
- Are deposit UTXOs signed by PTF (proving the deposit is legitimate)?

Return findings as JSON matching this schema exactly:
{ "findings": [ { "severity": "critical|high|medium|low|info", "category": "string", "file": "string", "line": 0, "title": "string", "description": "string", "fix": "string" } ] }`,
  },
  {
    key: 'utxo-security',
    prompt: `You are a smart contract security auditor (Certik/Trail of Bits level) auditing the PTF UTXO system.

Your dimension: **Security — double-spend, replay attacks, signature forgery, arithmetic**.

=== EscrowVault.sol ===
${escrowVault}

=== CreditToken.sol ===
${creditToken}

=== utxo.service.ts ===
${utxoService}

Focus on:
- Double-spend: can a UTXO be spent twice? (on-chain and off-chain separately?)
- Replay attack: can a withdrawal proof be replayed after the nonce increments?
- Signature forgery: can a user forge a UTXO EIP-712 signature?
- Reentrancy: any CEI violations in EscrowVault?
- Integer overflow/underflow: any unsafe arithmetic?
- Access control: are operator-only functions properly guarded?
- The chain is hardcoded as "polygon" in UTXO_TYPEHASH verification — is this a bug?
- withdrawNonces: is the nonce incremented BEFORE the external call?
- Can spentUTXOs be bypassed?
- Is the owner's signature verification correct (using ownerSignature vs ptfSignature)?

Return findings as JSON: { "findings": [...] }`,
  },
  {
    key: 'data-consistency',
    prompt: `You are a senior backend engineer auditing the PTF project for data consistency issues.

Your dimension: **Data consistency — DB vs on-chain, missing fields, broken references**.

=== schema.prisma ===
${prismaSchema}

=== utxo.service.ts ===
${utxoService}

=== creditLedger.service.ts ===
${creditLedger}

=== task.service.ts ===
${taskService}

=== punishment.service.ts ===
${punishmentService}

=== container.ts ===
${container}

Focus on:
- When a task reward is paid, does UTXOService.mint() get called? (look at task.service.ts)
- When a punishment is applied, does UTXOService.spend() get called?
- Is CreditEvent.utxoId linked to the actual CreditUTXO record?
- Are CreditTransaction.inputIds and outputIds backed by real CreditUTXO rows?
- Is the UTXO status ("unspent"/"spent"/"locked") consistent between DB and on-chain (spentUTXOs mapping)?
- Can a UTXO be "unspent" in DB but "spent" on-chain (or vice versa)?
- Is there a mechanism to reconcile DB state with on-chain state after a crash?
- Does getBalance() in UTXOService match what getBalance() in CreditLedgerService returns?
- Is the soft-lock in UTXOService (status="locked") consistent with WalletService.softLock()?
- Missing: who calls UTXOService.mint() when a deposit is confirmed on-chain?

Return findings as JSON: { "findings": [...] }`,
  },
  {
    key: 'business-logic',
    prompt: `You are a senior product engineer auditing the PTF project for business logic correctness.

Your dimension: **Business logic — rules enforcement, edge cases, punishment flow**.

=== task.service.ts ===
${taskService}

=== punishment.service.ts ===
${punishmentService}

=== wallet.resolver.ts ===
${walletResolver}

=== utxo.service.ts ===
${utxoService}

=== schema.graphql ===
${graphqlSchema}

Focus on:
- Withdrawal minimum 1.0 PTF: is it enforced both in resolver and CLI?
- Soft-lock 10 PTF on claim: TaskService calls WalletService.softLock() AND UTXOService.lock() — are they in sync or duplicate?
- Punishment: PunishmentService calls creditLedger.record() but does it call UTXOService.spend()?
- Task reward: when a task is validated, who mints the UTXO reward? (TaskService has no UTXOService reference)
- Coin-selection FIFO: is it correct to always use oldest UTXOs first? What if locked UTXOs exist?
- Change UTXO: the change signature = keccak256(proofHash || changeId) — is this distinguishable from a PTF-issued signature? Could it be mistaken for a valid PTF sig?
- withdrawCredits mutation uses ctx.user.userId as ownerAddress — is userId an Ethereum address or a cuid()?
- What happens if spend() is called but the on-chain burn tx fails after DB state is mutated?
- Is the proofHash computed the same way on-chain (EscrowVault) and off-chain (UTXOService)?

Return findings as JSON: { "findings": [...] }`,
  },
  {
    key: 'cli-completeness',
    prompt: `You are a senior CLI engineer auditing the PTF wallet commands for completeness and correctness.

Your dimension: **CLI wallet commands — deposit, withdrawal, UTXO display, UX gaps**.

=== wallet.ts CLI ===
${walletCLI}

=== api.ts CLI ===
${apiCLI}

Focus on:
- Does "ptf wallet deposit" create a UTXO? Or just show payment instructions?
- Is there a "ptf wallet verify-utxo <id>" command mentioned in help text but not implemented?
- Does "ptf wallet history" show UTXO-based movements or just the CreditEvent ledger?
- Are the mock offline responses for deposit/withdrawal consistent with the UTXO model?
- Is there a command to list UTXOs (ptf wallet utxos)?
- Does the withdraw command call the GraphQL withdrawCredits mutation or the old flow?
- Is there error handling when UTXOs are insufficient for a withdrawal?
- Are the mock UTXOs in offline mode realistic (correct sourceType, amounts)?

Return findings as JSON: { "findings": [...] }`,
  },
]

const auditResults = await pipeline(
  DIMENSIONS,
  (d) => agent(d.prompt, { label: `audit:${d.key}`, phase: 'Audit', schema: FINDING_SCHEMA }),
  (result, dim) => parallel(
    (result?.findings ?? []).map(f => () =>
      agent(
        `You are a skeptical senior engineer. Try to REFUTE this finding from a PTF project audit.
Default to refuted=true if you are uncertain.

Finding:
- Severity: ${f.severity}
- Title: ${f.title}
- File: ${f.file}
- Description: ${f.description}
- Proposed fix: ${f.fix}

Context files available mentally: utxo.service.ts, EscrowVault.sol, task.service.ts, punishment.service.ts, wallet.resolver.ts, schema.prisma, wallet.ts CLI

Is this finding real and correct? Answer with confirmed=true only if you are confident the bug/gap exists.`,
        { label: `verify:${f.title?.slice(0, 40)}`, phase: 'Vérification', schema: VERDICT_SCHEMA }
      ).then(v => ({ ...f, dimension: dim.key, verdict: v }))
    )
  )
)

// Flatten, filter confirmed findings, deduplicate by title
const allFindings = auditResults.flat().flat().filter(Boolean)
const confirmed = allFindings.filter(f => f.verdict?.confirmed)

// Sort by severity
const SEVERITY_ORDER = { critical: 0, high: 1, medium: 2, low: 3, info: 4 }
confirmed.sort((a, b) => (SEVERITY_ORDER[a.severity] ?? 5) - (SEVERITY_ORDER[b.severity] ?? 5))

return {
  total: allFindings.length,
  confirmed: confirmed.length,
  findings: confirmed,
}
