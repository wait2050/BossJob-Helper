// Mock implementation of cookie and set-cookie-parser for client-only bundle
export function parse() {
  return {};
}

export function serialize() {
  return "";
}

export function parseString() {
  return [];
}

export function splitCookiesString() {
  return [];
}
