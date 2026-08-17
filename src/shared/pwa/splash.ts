/**
 * iOS launch screens.
 *
 * ## Why this list exists at all
 *
 * Android generates a splash from the manifest — name, `background_color` and any icon
 * of 512px or more, all of which are already there. iOS ignores the manifest for this
 * entirely. Without an `apple-touch-startup-image` matching the exact device, an
 * installed app opens on a blank white rectangle for as long as the app takes to boot,
 * which on a phone in a queue reads as a broken app rather than a loading one.
 *
 * Safari picks the image by matching **all** of device width, device height, pixel
 * ratio and orientation. A near-miss is not used — it is skipped, and the device falls
 * back to white. So this is a list of exact hardware, and a new phone needs a new row.
 *
 * ## Portrait and landscape both, even though the app is portrait-primary
 *
 * The manifest asks for `portrait-primary`, but iPads ignore orientation locks and a
 * phone launched from a landscape home screen still wants a landscape image. Omitting
 * them costs one white flash per iPad user.
 *
 * ## One dark set, not two
 *
 * Safari does honour `prefers-color-scheme` in the media attribute, but the app forces
 * dark (`defaultTheme="dark"`, `enableSystem={false}`), so a light launch screen would
 * flash white and then hand over to a dark app. One set that matches where it lands.
 */

export interface SplashDevice {
  /** CSS pixels, as Safari reports them. Always the portrait figures. */
  width: number;
  height: number;
  ratio: number;
  /** Only for the generator's log and the comment in the markup. */
  label: string;
}

export const SPLASH_DEVICES: SplashDevice[] = [
  { width: 320, height: 568, ratio: 2, label: 'iPhone SE (1st gen), 5s' },
  { width: 375, height: 667, ratio: 2, label: 'iPhone SE (2nd/3rd gen), 8, 7, 6s' },
  { width: 375, height: 812, ratio: 3, label: 'iPhone X, XS, 11 Pro, 12 mini, 13 mini' },
  { width: 390, height: 844, ratio: 3, label: 'iPhone 12, 12 Pro, 13, 13 Pro, 14' },
  { width: 393, height: 852, ratio: 3, label: 'iPhone 14 Pro, 15, 15 Pro, 16' },
  { width: 402, height: 874, ratio: 3, label: 'iPhone 16 Pro' },
  { width: 414, height: 736, ratio: 3, label: 'iPhone 8 Plus, 7 Plus, 6s Plus' },
  { width: 414, height: 896, ratio: 2, label: 'iPhone XR, 11' },
  { width: 414, height: 896, ratio: 3, label: 'iPhone XS Max, 11 Pro Max' },
  { width: 428, height: 926, ratio: 3, label: 'iPhone 12/13 Pro Max, 14 Plus' },
  { width: 430, height: 932, ratio: 3, label: 'iPhone 14 Pro Max, 15 Plus/Pro Max, 16 Plus' },
  { width: 440, height: 956, ratio: 3, label: 'iPhone 16 Pro Max' },
  { width: 744, height: 1133, ratio: 2, label: 'iPad mini (6th gen)' },
  { width: 768, height: 1024, ratio: 2, label: 'iPad 9.7", iPad mini 5' },
  { width: 810, height: 1080, ratio: 2, label: 'iPad 10.2"' },
  { width: 820, height: 1180, ratio: 2, label: 'iPad Air 10.9"' },
  { width: 834, height: 1112, ratio: 2, label: 'iPad Pro 10.5"' },
  { width: 834, height: 1194, ratio: 2, label: 'iPad Pro 11"' },
  { width: 1024, height: 1366, ratio: 2, label: 'iPad Pro 12.9"' },
];

export type Orientation = 'portrait' | 'landscape';

/** The image's own pixel size — the CSS box times the pixel ratio, swapped in landscape. */
export function splashPixels(device: SplashDevice, orientation: Orientation) {
  const long = device.height * device.ratio;
  const short = device.width * device.ratio;
  return orientation === 'portrait'
    ? { width: short, height: long }
    : { width: long, height: short };
}

export function splashFile(device: SplashDevice, orientation: Orientation): string {
  const { width, height } = splashPixels(device, orientation);
  return `/splash/apple-splash-${width}x${height}.png`;
}

/**
 * The media query Safari matches against.
 *
 * `device-width` and `device-height` stay the portrait figures in both orientations —
 * they describe the hardware, not the current rotation. Swapping them for landscape is
 * the usual mistake, and it produces links that never match anything.
 */
export function splashMedia(device: SplashDevice, orientation: Orientation): string {
  return [
    `(device-width: ${device.width}px)`,
    `(device-height: ${device.height}px)`,
    `(-webkit-device-pixel-ratio: ${device.ratio})`,
    `(orientation: ${orientation})`,
  ].join(' and ');
}

/** Every link the document needs, portrait and landscape for each device. */
export function splashLinks(): Array<{ href: string; media: string; key: string }> {
  const links: Array<{ href: string; media: string; key: string }> = [];
  for (const device of SPLASH_DEVICES) {
    for (const orientation of ['portrait', 'landscape'] as const) {
      links.push({
        href: splashFile(device, orientation),
        media: splashMedia(device, orientation),
        key: `${device.width}x${device.height}@${device.ratio}-${orientation}`,
      });
    }
  }
  return links;
}
