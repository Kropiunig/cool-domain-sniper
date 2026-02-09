const TLD_PRICES = {
  '.com': 12,
  '.net': 12,
  '.org': 12,
  '.dev': 12,
  '.app': 14,
  '.io': 35,
  '.co': 25,
  '.ai': 80,
  '.sh': 25,
  '.xyz': 2,
  '.cool': 25,
  '.lol': 25,
  '.me': 10,
  '.cc': 12,
  '.tv': 30,
  '.gg': 20,
  '.so': 25,
  '.to': 35,
  '.is': 60,
  '.it': 15,
  '.in': 10,
  '.us': 10,
  '.uk': 8,
  '.de': 8,
  '.at': 15,
  '.eu': 8,
  '.tech': 5,
  '.site': 3,
  '.online': 3,
  '.fun': 3,
  '.wtf': 25,
  '.ninja': 20,
  '.codes': 45,
  '.run': 20,
  '.cloud': 12,
  '.page': 12,
  '.life': 5,
  '.world': 5,
  '.zone': 25,
  '.build': 50,
};

export function getPrice(tld) {
  return TLD_PRICES[tld] ?? null;
}

export function formatPrice(tld) {
  const price = getPrice(tld);
  return price != null ? `~$${price}/yr` : 'price unknown';
}

export function isAffordable(tld, maxPrice) {
  const price = getPrice(tld);
  return price != null && price <= maxPrice;
}

export { TLD_PRICES };
