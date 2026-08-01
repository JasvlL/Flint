/**
 * Validates if a given string is a valid HTTP or HTTPS URL.
 *
 * @param url - The string to validate.
 * @returns `true` if the string is a valid `http` or `https` URL, `false` otherwise.
 */
export function isValidUrl(url: string): boolean {
  if (typeof url !== 'string' || !url.trim()) {
    return false;
  }

  try {
    const parsedUrl = new URL(url);
    return parsedUrl.protocol === 'http:' || parsedUrl.protocol === 'https:';
  } catch {
    return false;
  }
}
