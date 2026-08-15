import "server-only";

import Stripe from "stripe";

import { serverEnv } from "./env";

let instance: Stripe | undefined;

export function getStripe() {
  instance ??= new Stripe(serverEnv.stripeKey(), {
    apiVersion: "2026-07-29.dahlia",
    appInfo: { name: "LayerTalk", version: "0.1.0", url: serverEnv.appUrl() },
  });
  return instance;
}

export function randomIntegrationIdentifier() {
  const alphabet = "abcdefghijklmnopqrstuvwxyz";
  const suffix = Array.from(crypto.getRandomValues(new Uint8Array(8)), (value) => alphabet[value % alphabet.length]).join("");
  return `layertalk_event_pass_${suffix}`;
}
