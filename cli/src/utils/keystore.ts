/**
 * Keystore PTF — gestion locale du keypair secp256k1.
 *
 * Le keypair est généré entièrement côté client. La clé privée ne quitte jamais
 * la machine. Le keystore est chiffré avec AES-256-GCM dérivé du mot de passe
 * (PBKDF2, 600 000 itérations) et stocké dans ~/.ptf/keystore/<adresse>.json.
 *
 * Format compatible Web3 Secret Storage V3 (Ethereum).
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import { randomBytes, createCipheriv, createDecipheriv, pbkdf2Sync, createHash } from "crypto";
import { ethers } from "ethers";

// ── Paths ──────────────────────────────────────────────────────────────────────

function keystoreDir(): string {
  return join(homedir(), ".ptf", "keystore");
}

function keystorePath(address: string): string {
  return join(keystoreDir(), `${address.toLowerCase()}.json`);
}

// ── Keystore format ───────────────────────────────────────────────────────────

export interface PtfKeystore {
  version: 3;
  address: string;           // lowercase, no 0x prefix
  crypto: {
    cipher:     "aes-256-gcm";
    ciphertext: string;      // hex
    cipherparams: { iv: string; authTag: string };
    kdf:        "pbkdf2";
    kdfparams: {
      dklen:  number;
      salt:   string;        // hex
      c:      number;
      prf:    "hmac-sha256";
    };
  };
  ptf: {
    publicKey: string;       // compressed secp256k1, hex
    createdAt: string;       // ISO
  };
}

// ── Crypto ────────────────────────────────────────────────────────────────────

const PBKDF2_ITERATIONS = 600_000;
const PBKDF2_KEYLEN     = 32;

function deriveKey(password: string, salt: Buffer): Buffer {
  return pbkdf2Sync(password, salt, PBKDF2_ITERATIONS, PBKDF2_KEYLEN, "sha256");
}

function encryptKey(privateKeyHex: string, password: string): PtfKeystore["crypto"] {
  const salt      = randomBytes(32);
  const iv        = randomBytes(12);
  const aesKey    = deriveKey(password, salt);
  const cipher    = createCipheriv("aes-256-gcm", aesKey, iv);
  const plaintext = Buffer.from(privateKeyHex, "hex");
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const authTag   = cipher.getAuthTag();

  return {
    cipher:       "aes-256-gcm",
    ciphertext:   ciphertext.toString("hex"),
    cipherparams: { iv: iv.toString("hex"), authTag: authTag.toString("hex") },
    kdf:          "pbkdf2",
    kdfparams:    { dklen: PBKDF2_KEYLEN, salt: salt.toString("hex"), c: PBKDF2_ITERATIONS, prf: "hmac-sha256" },
  };
}

function decryptKey(crypto: PtfKeystore["crypto"], password: string): string {
  const salt    = Buffer.from(crypto.kdfparams.salt, "hex");
  const iv      = Buffer.from(crypto.cipherparams.iv, "hex");
  const authTag = Buffer.from(crypto.cipherparams.authTag, "hex");
  const aesKey  = deriveKey(password, salt);

  const decipher = createDecipheriv("aes-256-gcm", aesKey, iv);
  decipher.setAuthTag(authTag);

  const ciphertext = Buffer.from(crypto.ciphertext, "hex");
  try {
    const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return plaintext.toString("hex");
  } catch {
    throw new Error("Mot de passe incorrect ou keystore corrompu.");
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

export interface CreatedWallet {
  address:    string;   // "0x..." checksummed
  publicKey:  string;   // compressed hex
  mnemonic:   string;   // 12 words BIP-39
  keystorePath: string;
}

/**
 * Génère un nouveau keypair PTF depuis une seed phrase BIP-39.
 * Chiffre la clé privée avec le mot de passe et sauvegarde le keystore.
 * Retourne la seed phrase — à afficher UNE SEULE FOIS à l'utilisateur.
 */
export function createWallet(password: string): CreatedWallet {
  if (password.length < 8) {
    throw new Error("Le mot de passe doit contenir au moins 8 caractères.");
  }

  const wallet    = ethers.Wallet.createRandom();
  const mnemonic  = wallet.mnemonic!.phrase;
  const address   = wallet.address;
  const publicKey = wallet.signingKey.compressedPublicKey;

  const privKeyHex = wallet.privateKey.startsWith("0x")
    ? wallet.privateKey.slice(2)
    : wallet.privateKey;

  const cryptoData = encryptKey(privKeyHex, password);

  const keystore: PtfKeystore = {
    version:  3,
    address:  address.toLowerCase().replace("0x", ""),
    crypto:   cryptoData,
    ptf: {
      publicKey:  publicKey,
      createdAt:  new Date().toISOString(),
    },
  };

  const dir = keystoreDir();
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

  const path = keystorePath(address);
  writeFileSync(path, JSON.stringify(keystore, null, 2), { mode: 0o600 });

  return { address, publicKey, mnemonic, keystorePath: path };
}

/**
 * Restaure un wallet depuis une seed phrase BIP-39.
 * Utile si le keystore est perdu — recrée le fichier chiffré localement.
 */
export function restoreWallet(mnemonic: string, password: string): CreatedWallet {
  if (password.length < 8) {
    throw new Error("Le mot de passe doit contenir au moins 8 caractères.");
  }

  let wallet: ethers.HDNodeWallet;
  try {
    wallet = ethers.Wallet.fromPhrase(mnemonic.trim());
  } catch {
    throw new Error("Seed phrase invalide. Vérifiez les 12 mots.");
  }

  const address   = wallet.address;
  const publicKey = wallet.signingKey.compressedPublicKey;
  const privKeyHex = wallet.privateKey.startsWith("0x")
    ? wallet.privateKey.slice(2)
    : wallet.privateKey;

  const cryptoData = encryptKey(privKeyHex, password);

  const keystore: PtfKeystore = {
    version:  3,
    address:  address.toLowerCase().replace("0x", ""),
    crypto:   cryptoData,
    ptf: {
      publicKey:  publicKey,
      createdAt:  new Date().toISOString(),
    },
  };

  const dir = keystoreDir();
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

  const path = keystorePath(address);
  writeFileSync(path, JSON.stringify(keystore, null, 2), { mode: 0o600 });

  return { address, publicKey, mnemonic: mnemonic.trim(), keystorePath: path };
}

/**
 * Déchiffre un keystore et retourne la clé privée en mémoire.
 * La clé privée ne doit être gardée en mémoire que le temps de signer.
 */
export function unlockWallet(address: string, password: string): { privateKey: string; publicKey: string } {
  const path = keystorePath(address);

  if (!existsSync(path)) {
    throw new Error(
      `Keystore introuvable pour l'adresse ${address}.\n` +
      `Créez un wallet : ptf wallet create\n` +
      `Ou restaurez depuis votre seed phrase : ptf wallet restore`
    );
  }

  const keystore: PtfKeystore = JSON.parse(readFileSync(path, "utf-8"));
  const privateKeyHex = decryptKey(keystore.crypto, password);

  return {
    privateKey: "0x" + privateKeyHex,
    publicKey:  keystore.ptf.publicKey,
  };
}

/**
 * Signe un nonce (challenge) avec la clé privée pour le challenge-response.
 * Utilisé par `ptf auth login` pour prouver la possession du keypair sans
 * jamais envoyer la clé privée au service tier.
 */
export function signChallenge(privateKey: string, nonce: string): string {
  const wallet = new ethers.Wallet(privateKey);
  // personal_sign : "\x19Ethereum Signed Message:\n" + len + message
  // Même standard que MetaMask — le backend vérifie avec ethers.verifyMessage()
  return wallet.signMessageSync(nonce);
}

/**
 * Retourne la liste des adresses PTF présentes dans le keystore local.
 */
export function listLocalWallets(): string[] {
  const dir = keystoreDir();
  if (!existsSync(dir)) return [];

  return readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => {
      const name = f.replace(".json", "");
      return name.startsWith("0x") ? name : "0x" + name;
    });
}

/**
 * Retourne le chemin du keystore pour une adresse donnée.
 */
export function getKeystorePath(address: string): string {
  return keystorePath(address);
}

/**
 * Vérifie si un keystore existe localement pour une adresse.
 */
export function hasKeystore(address: string): boolean {
  return existsSync(keystorePath(address));
}

/**
 * Dérive l'adresse PTF depuis une clé publique (sans keystore).
 * Utile pour vérifier une adresse avant un dépôt.
 */
export function addressFromPublicKey(publicKeyHex: string): string {
  const pub = ethers.getBytes(publicKeyHex);
  const uncompressed = pub.length === 33
    ? ethers.SigningKey.computePublicKey(publicKeyHex, false).slice(2)  // remove 04 prefix
    : Buffer.from(pub.slice(1)).toString("hex");
  const hash = createHash("sha3-256").update(Buffer.from(uncompressed, "hex")).digest("hex");
  // Ethereum-style: take last 20 bytes of keccak256(pubkey)
  return ethers.getAddress("0x" + ethers.keccak256("0x" + uncompressed).slice(-40));
}
