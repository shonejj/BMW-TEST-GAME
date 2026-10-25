import cinzel400 from '@fontsource/cinzel/files/cinzel-latin-400-normal.woff2?url';
import cinzel700 from '@fontsource/cinzel/files/cinzel-latin-700-normal.woff2?url';

/** Registers the bundled display font (inlined in the build, so it works offline). */
export function loadFonts() {
  if (!('FontFace' in window)) return;
  const faces = [
    new FontFace('Cinzel', `url(${cinzel400})`, { weight: '400' }),
    new FontFace('Cinzel', `url(${cinzel700})`, { weight: '700' }),
  ];
  for (const f of faces) {
    f.load().then((loaded) => document.fonts.add(loaded)).catch(() => {});
  }
}
