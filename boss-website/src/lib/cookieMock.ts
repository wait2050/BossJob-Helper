// Mock implementation of cookie and set-cookie-parser for client-only bundle
function mockParse() {
  return {};
}

mockParse.parse = mockParse;
mockParse.serialize = function serialize() {
  return "";
};
mockParse.parseString = function parseString() {
  return [];
};
mockParse.splitCookiesString = function splitCookiesString() {
  return [];
};

export const parse = mockParse.parse;
export const serialize = mockParse.serialize;
export const parseString = mockParse.parseString;
export const splitCookiesString = mockParse.splitCookiesString;

export default mockParse;
