/* Receipt signatures with Ed25519.
 *
 * Each kendra's billing device has its own key pair. The device signs every bill; the patient page
 * checks the signature with the kendra's public key, so a receipt can be verified on any phone,
 * even one that has never seen this kendra's data, and a forged or edited receipt fails.
 *
 * In the prototype the private keys are derived from a published demo seed so the site can sign
 * in the browser. In a real rollout the private key stays on the kendra's device and only the
 * public keys below would ship to patients. */
import { ed25519 } from '@noble/curves/ed25519.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, hexToBytes, utf8ToBytes } from '@noble/hashes/utils.js';
import { KENDRAS } from './master';

export interface ReceiptFields { bill: string; kendra: string; batch: string; qty: number; price: number; date: string }

const demoSecret = (kendra: string) => sha256(utf8ToBytes(`aushadhitrack demo device key ${kendra}`));
export const PUBLIC_KEYS: Record<string, string> = Object.fromEntries(KENDRAS.map(k => [k.id, bytesToHex(ed25519.getPublicKey(demoSecret(k.id)))]));

export const receiptPayload = (r: ReceiptFields) => `b=${r.bill}&k=${r.kendra}&bt=${r.batch}&q=${r.qty}&p=${r.price}&d=${r.date}`;

const toB64url = (b: Uint8Array) => btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const fromB64url = (s: string) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));

export function signReceipt(r: ReceiptFields): string {
  return toB64url(ed25519.sign(utf8ToBytes(receiptPayload(r)), demoSecret(r.kendra)));
}

export function verifyReceipt(r: ReceiptFields, signature: string): boolean {
  const pub = PUBLIC_KEYS[r.kendra];
  if (!pub) return false;
  try {
    return ed25519.verify(fromB64url(signature), utf8ToBytes(receiptPayload(r)), hexToBytes(pub));
  } catch {
    return false;
  }
}
