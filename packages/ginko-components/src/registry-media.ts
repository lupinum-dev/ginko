// Registry entries of the media components, spread into `components` by `registry.ts`. Pure data, no Vue.
// A Markdown image is the plain `img` tag: it has no entry here, the Vue side overrides its renderer.
import { f } from '@lupinum/ginko'
import { defineComponents } from '@lupinum/ginko/internal'

export const mediaComponents = defineComponents({
  figure: {
    kind: 'block',
    label: { de: 'Abbildung', en: 'Figure' },
    describe: {
      de: 'Ein Bild mit Bildunterschrift. Ein Klick vergrößert das Bild.',
      en: 'An image with a caption. A click enlarges the image.',
    },
    props: {
      src: f.image({ de: 'Bild', en: 'Image' }),
      alt: f.text({ de: 'Bildbeschreibung', en: 'Image description' }, { max: 200, hint: { de: 'Für Screenreader und wenn das Bild nicht lädt.', en: 'For screen readers, and shown when the image does not load.' } }),
      caption: f.text({ de: 'Bildunterschrift', en: 'Caption' }, { optional: true, max: 300 }),
      width: f.number({ de: 'Breite in Pixeln', en: 'Width in pixels' }, { min: 1, max: 10000, step: 1, optional: true }),
      height: f.number({ de: 'Höhe in Pixeln', en: 'Height in pixels' }, { min: 1, max: 10000, step: 1, optional: true }),
      bleed: f.boolean({ de: 'Breiter als der Text', en: 'Wider than the text' }, { optional: true }),
      aspect: f.choice({ de: 'Seitenverhältnis', en: 'Aspect ratio' }, [
        { value: 'auto', label: { de: 'Original', en: 'Original' } }, { value: 'video', label: '16:9' }, { value: 'wide', label: '2:1' },
        { value: 'square', label: { de: 'Quadrat', en: 'Square' } }, { value: 'portrait', label: { de: 'Hochformat', en: 'Portrait' } },
      ], { optional: true, default: 'auto' }),
      fit: f.choice({ de: 'Zuschnitt', en: 'Crop' }, [
        { value: 'cover', label: { de: 'Füllend', en: 'Fill' } }, { value: 'contain', label: { de: 'Eingepasst', en: 'Fit' } },
      ], { optional: true, default: 'cover' }),
      placement: f.choice({ de: 'Platz', en: 'Position' }, [
        { value: 'inline', label: { de: 'Im Text', en: 'In the text' } }, { value: 'start', label: { de: 'Links', en: 'Left' } },
        { value: 'end', label: { de: 'Rechts', en: 'Right' } },
      ], { optional: true, default: 'inline' }),
      frame: f.choice({ de: 'Rahmen', en: 'Frame' }, [
        { value: 'default', label: { de: 'Mit Rahmen', en: 'With frame' } }, { value: 'none', label: { de: 'Ohne', en: 'None' } },
      ], { optional: true, default: 'default' }),
      focus: f.choice({ de: 'Bildausschnitt', en: 'Image focus' }, [
        { value: 'center', label: { de: 'Mitte', en: 'Middle' } }, { value: 'top', label: { de: 'Oben', en: 'Top' } },
        { value: 'bottom', label: { de: 'Unten', en: 'Bottom' } }, { value: 'left', label: { de: 'Links', en: 'Left' } },
        { value: 'right', label: { de: 'Rechts', en: 'Right' } },
      ], { optional: true, default: 'center' }),
      zoom: f.boolean({ de: 'Vergrößern per Klick', en: 'Enlarge on click' }, { optional: true, default: true }),
    },
    editor: { group: { de: 'Medien', en: 'Media' }, example: '::figure{src="/favicon.svg" alt="Das Ginko-Blatt" caption="Das Zeichen von Ginko" aspect="square" fit="contain"}\n::' },
  },
  video: {
    kind: 'block',
    label: { de: 'Video', en: 'Video' },
    describe: {
      de: 'Ein YouTube-, Vimeo- oder Video-Link. Von YouTube oder Vimeo wird erst nach einem Klick auf „Abspielen“ etwas geladen.',
      en: 'A YouTube, Vimeo or video link. Nothing is loaded from YouTube or Vimeo until a click on “Play”.',
    },
    props: {
      src: f.text({ de: 'Video-Adresse', en: 'Video address' }, { max: 500, hint: { de: 'Link von YouTube oder Vimeo, oder eine .mp4/.webm-Datei.', en: 'A YouTube or Vimeo link, or an .mp4/.webm file.' } }),
      title: f.text({ de: 'Titel', en: 'Title' }, { max: 120, hint: { de: 'Beschreibt das Video für Screenreader und die Abspielen-Taste.', en: 'Describes the video for screen readers and the play button.' } }),
      poster: f.image({ de: 'Vorschaubild', en: 'Preview image' }, { optional: true, hint: { de: 'Ohne Vorschaubild sehen Besucher eine graue Fläche. Wir laden keines von YouTube.', en: 'Without a preview image, visitors see a grey area. We never load one from YouTube.' } }),
      start: f.number({ de: 'Start in Sekunden', en: 'Start in seconds' }, { min: 0, max: 86400, step: 1, optional: true }),
    },
    editor: { group: { de: 'Medien', en: 'Media' }, example: '::video{src="https://www.youtube.com/watch?v=M7lc1UVf-VE" title="Beispielvideo des YouTube-Players" start="30"}\n::' },
  },
  embedded: {
    kind: 'block',
    label: { de: 'Einbettung', en: 'Embed' },
    describe: {
      de: 'Eine Karte, Musik oder ein Terminbuchungs-Widget von einem bekannten Anbieter (Google Maps, OpenStreetMap, Spotify, Calendly). Erst nach einem Klick auf „Inhalt laden“ wird etwas vom Anbieter geladen.',
      en: 'A map, music or booking widget from a known provider (Google Maps, OpenStreetMap, Spotify, Calendly). Nothing is loaded from the provider until a click on “Load content”.',
    },
    props: {
      src: f.text({ de: 'Adresse', en: 'Address' }, { format: 'url', max: 2000, hint: { de: 'Google Maps: „Teilen → Karte einbetten“, dort die Adresse aus dem Code (src). OpenStreetMap: „Teilen → HTML“. Spotify und Calendly: der normale Link. Andere Adressen werden nur als Link gezeigt.', en: 'Google Maps: “Share → Embed a map”, then the address from the code (src). OpenStreetMap: “Share → HTML”. Spotify and Calendly: the normal link. Other addresses show only as a link.' } }),
      title: f.text({ de: 'Titel', en: 'Title' }, { max: 120, hint: { de: 'Beschreibt den Inhalt für Screenreader und die Taste „Inhalt laden“.', en: 'Describes the content for screen readers and the “Load content” button.' } }),
      poster: f.image({ de: 'Vorschaubild', en: 'Preview image' }, { optional: true, hint: { de: 'Ohne Vorschaubild sehen Besucher eine graue Fläche. Wir laden keines vom Anbieter.', en: 'Without a preview image, visitors see a grey area. We never load one from the provider.' } }),
    },
    editor: { group: { de: 'Medien', en: 'Media' }, example: '::embedded{src="https://www.openstreetmap.org/export/embed.html?bbox=13.35%2C52.50%2C13.45%2C52.54&layer=mapnik" title="Karte von Berlin-Mitte"}\n::' },
  },
})
